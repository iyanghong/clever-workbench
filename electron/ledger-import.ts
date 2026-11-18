import { adviseImport, targetRevision } from './ledger-import-advice';
import { importTargets } from '../src/ledger-import-matches';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import type { Vault } from './vault';
import { publicImportSources, type ParsedLedgerFile } from './ledger-import-source';
import { extractLedgerCandidates } from './ledger-import-model';
import { LocalOllama } from './local-ollama';
import {
  ledgerImportKinds,
  localImportModels,
  type LedgerImportCommit,
  type LedgerImportKind,
  type LedgerImportState,
  type LocalImportModel,
  type LocalLedgerImportSnapshot,
} from '../src/ledger-import-types';

export class LocalLedgerImports {
  readonly runtime: LocalOllama;
  private job: LedgerImportState | null = null;
  private parsed: ParsedLedgerFile | null = null;
  private generation: string | null = null;
  private analysis: AbortController | null = null;
  private parser: Worker | null = null;
  private committing = false;
  private targetRevisions = new Map<string, string>();
  constructor(
    private store: Store,
    private vault: Vault,
    private workerFile: string,
    modelDirectory: string,
    private changed: () => void = () => {},
  ) {
    this.runtime = new LocalOllama(modelDirectory, changed);
  }
  get busy() {
    return Boolean(this.parser || this.analysis || this.runtime.downloading);
  }
  get pending() {
    return Boolean(this.job && !['complete', 'cancelled'].includes(this.job.phase));
  }
  snapshot(): LocalLedgerImportSnapshot {
    if (this.generation && this.generation !== this.store.generation) this.clear();
    return structuredClone({ runtime: this.runtime.snapshot(), job: this.job });
  }
  private current(id: unknown) {
    if (
      typeof id !== 'string' ||
      !this.job ||
      this.job.id !== id ||
      this.generation !== this.store.generation
    )
      throw new Error('导入会话已结束或资料已切换，请重新选择文件。');
    this.store.ledger.system(this.job.systemId);
    return this.job;
  }
  sources(id: unknown, sourceIds: unknown) {
    this.current(id);
    if (
      !Array.isArray(sourceIds) ||
      sourceIds.length > 50 ||
      sourceIds.some((item) => typeof item !== 'string' || item.length > 100)
    )
      throw new Error('每次最多核对 50 个来源。');
    if (!this.parsed) return [];
    const selected = new Set(sourceIds);
    return publicImportSources(this.parsed, selected).map((source) => ({
      ...source,
      text: source.text.slice(0, 1500),
    }));
  }
  choose(filename: string, input: { systemId: string; kind: LedgerImportKind | 'all' }) {
    if (
      !input ||
      typeof input.systemId !== 'string' ||
      (input.kind !== 'all' && !Object.hasOwn(ledgerImportKinds, input.kind))
    )
      throw new Error('请选择目标系统和分析类型。');
    this.store.ledger.system(input.systemId);
    if (this.pending) throw new Error('请先完成或明确放弃上次导入，再选择新文件。');
    this.clear();
    this.generation = this.store.generation;
    const id = randomUUID();
    this.job = {
      id,
      systemId: input.systemId,
      kind: input.kind,
      filename: path.basename(filename),
      phase: 'parsing',
      progress: { completed: 0, total: 1, message: '正在本地解析文件' },
      sourceCount: 0,
      passwordSources: [],
      unmatchedSourceIds: [],
      candidates: [],
      warnings: [],
      error: null,
      created: 0,
    };
    this.changed();
    void this.parse(filename, id);
    return this.snapshot();
  }
  private async parse(filename: string, id: string) {
    try {
      const parsed = await new Promise<ParsedLedgerFile>((resolve, reject) => {
        const worker = new Worker(this.workerFile, {
          workerData: { filename },
          resourceLimits: { maxOldGenerationSizeMb: 256, maxYoungGenerationSizeMb: 64 },
        });
        this.parser = worker;
        let received = false;
        const timer = setTimeout(() => {
          void worker.terminate();
          reject(new Error('文件解析超时，请拆分后重试。'));
        }, 60_000);
        worker.once('message', (message) => {
          received = true;
          clearTimeout(timer);
          if (this.parser === worker) this.parser = null;
          void worker.terminate();
          if (message.error) reject(new Error(message.error));
          else resolve(message.result);
        });
        worker.once('error', () => {
          clearTimeout(timer);
          reject(new Error('文件解析进程失败，请缩小文件后重试。'));
        });
        worker.once('exit', () => {
          clearTimeout(timer);
          if (this.parser === worker) this.parser = null;
          if (!received) reject(new Error('文件解析已取消或进程已退出。'));
        });
      });
      const job = this.current(id);
      if (job.phase === 'cancelled') return;
      this.parsed = parsed;
      Object.assign(job, {
        phase: 'ready',
        sourceCount: parsed.sources.length,
        passwordSources: parsed.sources
          .filter((source) => source.hidden === 'password')
          .map(({ id, location }) => ({ id, location })),
        warnings: parsed.warnings,
        progress: { completed: 1, total: 1, message: '解析完成，可以开始本地分析' },
      });
      this.changed();
    } catch (error) {
      this.fail(id, error);
    }
  }
  analyze(input: { id: string; model: LocalImportModel }) {
    const job = this.current(input?.id);
    if (
      !localImportModels.includes(input.model) ||
      !this.parsed ||
      !['ready', 'failed', 'review'].includes(job.phase) ||
      this.busy
    )
      throw new Error('请先解析文件、准备模型，并等待当前操作完成。');
    if (job.phase === 'review') throw new Error('请先完成或放弃当前校对结果，再重新分析。');
    const controller = new AbortController();
    this.analysis = controller;
    Object.assign(job, {
      phase: 'analyzing',
      error: null,
      progress: { completed: 0, total: 1, message: '正在本机分析，内容不会转用云模型' },
    });
    const file = this.parsed;
    this.changed();
    void extractLedgerCandidates(
      this.runtime,
      input.model,
      file,
      job.kind,
      this.store.ledger.system(job.systemId).name,
      controller.signal,
      (completed, total, activity) => {
        if (
          this.job?.id !== input.id ||
          this.generation !== this.store.generation ||
          controller.signal.aborted
        )
          return;
        this.job.progress = {
          completed,
          total,
          message:
            completed === total
              ? '正在整理校对结果'
              : `${activity}（第 ${completed + 1}／${total} 组）`,
        };
        this.changed();
      },
    )
      .then(async (result) => {
        this.current(input.id);
        if (controller.signal.aborted) return;
        const snapshot = this.store.snapshot();
        const targets = importTargets(snapshot, job.systemId);
        const revisions = new Map(targets.map((t) => [t.id, targetRevision(t)]));
        await adviseImport(
          this.runtime,
          input.model,
          file,
          result.candidates,
          targets,
          snapshot.environments.filter((e) => e.systemId === job.systemId),
          controller.signal,
          (i, total) => {
            if (!controller.signal.aborted) {
              job.progress = {
                completed: i,
                total,
                message: `本地模型正在核对环境、重复项和替换字段（${i + 1}／${total}）`,
              };
              this.changed();
            }
          },
          this.store.ledger.system(job.systemId).name,
        );
        if (controller.signal.aborted) return;
        const current = this.current(input.id);
        this.targetRevisions = revisions;
        const used = new Set(result.candidates.flatMap((candidate) => candidate.sourceIds));
        const unmatched = file.sources
          .filter((source) => source.text.trim() && !used.has(source.id))
          .map((source) => source.id);
        Object.assign(current, {
          phase: 'review',
          candidates: result.candidates,
          warnings: [...file.warnings, ...result.warnings],
          unmatchedSourceIds: unmatched,
          progress: {
            completed: 1,
            total: 1,
            message: `已识别 ${result.candidates.length} 条候选，请核对后保存`,
          },
        });
        this.changed();
      })
      .catch((error) => this.fail(input.id, error))
      .finally(() => {
        if (this.analysis === controller) this.analysis = null;
      });
    return this.snapshot();
  }
  commit(input: LedgerImportCommit) {
    this.committing = true;
    try {
      this.vault.touch();
      return this.commitCurrent(input);
    } finally {
      this.committing = false;
    }
  }
  private commitCurrent(input: LedgerImportCommit) {
    const job = this.current(input?.id);
    if (this.busy || job.phase !== 'review' || !this.parsed)
      throw new Error('请先完成本地分析和候选校对。');
    let size = 0;
    try {
      size = Buffer.byteLength(JSON.stringify(input));
    } catch {
      throw new Error('导入资料格式无效。');
    }
    if (size > 4 * 1024 ** 2) throw new Error('本次校对内容超过 4 MB，请减少所选资料后重试。');
    if (
      !Array.isArray(input.candidates) ||
      input.candidates.length > 1000 ||
      input.candidates.some(
        (item) => !item || !job.candidates.some((original) => original.id === item.id),
      )
    )
      throw new Error('候选不属于本次导入，请重新分析。');
    if (
      !input.passwordEdits ||
      typeof input.passwordEdits !== 'object' ||
      Array.isArray(input.passwordEdits) ||
      Object.keys(input.passwordEdits).length > 1000
    )
      throw new Error('密码修改格式无效。');
    const source = new Map(this.parsed.sources.map((item) => [item.id, item]));
    const passwords: Record<string, string> = {};
    const take = (account: { id: string; passwordRef: string | null }) => {
      if (Object.hasOwn(input.passwordEdits, account.id)) {
        const value = input.passwordEdits[account.id];
        if (typeof value !== 'string' || value.length > 256_000)
          throw new Error('密码修改内容无效或过长。');
        passwords[account.id] = value;
      } else if (account.passwordRef) {
        const value = source.get(account.passwordRef);
        if (!value || value.hidden !== 'password')
          throw new Error('密码来源已失效，请重新选择文件或手动输入。');
        passwords[account.id] = value.text;
      }
    };
    for (const candidate of input.candidates.filter((item) => item.selected && !item.update)) {
      if (!Array.isArray(candidate.accounts)) throw new Error('账号资料格式无效。');
      if (candidate.kind === 'account') take(candidate);
      candidate.accounts.forEach(take);
    }
    try {
      const result = this.vault.captureImport({
        id: job.id,
        systemId: job.systemId,
        kind: job.kind,
        candidates: input.candidates.filter((candidate) => candidate.selected),
        passwords,
        targetRevisions: this.targetRevisions,
        sensitiveValues: this.parsed.sources.filter((item) => item.hidden).map((item) => item.text),
      });
      this.parsed = null;
      Object.assign(job, {
        phase: 'complete',
        candidates: [],
        sourceCount: 0,
        passwordSources: [],
        unmatchedSourceIds: [],
        created: input.candidates.filter((item) => item.selected && !item.update).length,
        updated: input.candidates.filter((item) => item.selected && item.update).length,
        progress: { completed: 1, total: 1, message: '所选台账已保存' },
        error: null,
      });
      this.changed();
      return result;
    } finally {
      for (const key of Object.keys(passwords)) passwords[key] = '';
    }
  }
  cancel(id: unknown) {
    const job = this.current(id);
    this.analysis?.abort();
    this.analysis = null;
    void this.parser?.terminate();
    this.parser = null;
    this.parsed = null;
    Object.assign(job, {
      phase: 'cancelled',
      candidates: [],
      sourceCount: 0,
      passwordSources: [],
      unmatchedSourceIds: [],
      error: null,
      progress: { completed: 0, total: 1, message: '分析已取消，未写入台账' },
    });
    this.changed();
    return this.snapshot();
  }
  discard(id: unknown) {
    this.current(id);
    this.clear();
    this.changed();
  }
  onVaultLocked() {
    if ((this.committing || this.parsed?.sources.some((source) => source.hidden)) && this.job)
      this.cancel(this.job.id);
  }
  private fail(id: string, error: unknown) {
    if (!this.job || this.job.id !== id || this.job.phase === 'cancelled') return;
    if (this.generation !== this.store.generation) {
      this.clear();
      this.changed();
      return;
    }
    this.job.phase = 'failed';
    this.job.error = error instanceof Error ? error.message : '本地分析失败，请重试。';
    this.changed();
  }
  clear() {
    this.targetRevisions.clear();
    this.analysis?.abort();
    this.analysis = null;
    void this.parser?.terminate();
    this.parser = null;
    this.parsed = null;
    this.job = null;
    this.generation = null;
  }
  dispose() {
    this.clear();
    this.runtime.stop();
  }
}
