import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { UpdateHistoryEntry, UpdateSnapshot } from '../src/update-types';
import type { InstallationTransaction } from './update-launcher';

export class UpdateJournal {
  private entries: UpdateHistoryEntry[] = [];
  private active?: string;
  private lastState = '';
  private queue: Promise<void> = Promise.resolve();
  private constructor(
    readonly root: string,
    private now: () => number,
  ) {}
  static async open(root: string, now = Date.now) {
    await fs.mkdir(root, { recursive: true, mode: 0o700 });
    const journal = new UpdateJournal(root, now);
    try {
      const parsed = JSON.parse(await fs.readFile(path.join(root, 'history.json'), 'utf8'));
      if (Array.isArray(parsed))
        journal.entries = parsed
          .filter(
            (x) =>
              x &&
              typeof x.id === 'string' &&
              typeof x.currentVersion === 'string' &&
              typeof x.targetVersion === 'string' &&
              typeof x.phase === 'string' &&
              x.durations &&
              typeof x.durations === 'object',
          )
          .slice(0, 30);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        throw Error('更新历史无法读取，请保留更新目录并检查文件。');
    }
    return journal;
  }
  list() {
    return structuredClone(this.entries);
  }
  get activeId() {
    return this.active;
  }
  async flush() {
    await this.queue;
  }
  private save() {
    const snapshot = JSON.stringify(this.entries);
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        const tmp = path.join(this.root, `history-${randomUUID()}.next`);
        await fs.writeFile(tmp, snapshot, { mode: 0o600, flag: 'wx' });
        await fs.rename(tmp, path.join(this.root, 'history.json'));
      });
    return this.queue;
  }
  async observe(state: UpdateSnapshot) {
    if (this.lastState === state.status && !state.message) return false;
    this.lastState = state.status;
    if (!this.active && ['downloading', 'preparing'].includes(state.status)) {
      this.active = randomUUID();
      const at = this.now();
      this.entries.unshift({
        id: this.active,
        currentVersion: state.currentVersion,
        targetVersion: state.release?.version ?? '',
        createdAt: new Date(at).toISOString(),
        updatedAt: new Date(at).toISOString(),
        phase: state.status,
        phaseStartedAt: at,
        durations: {},
        outcome: 'in-progress',
      });
      this.entries = this.entries.slice(0, 30);
    }
    const entry = this.entries.find((e) => e.id === this.active);
    if (!entry) return false;
    const at = this.now();
    entry.durations[entry.phase] =
      (entry.durations[entry.phase] ?? 0) + Math.max(0, at - entry.phaseStartedAt);
    entry.phaseStartedAt = at;
    entry.phase = state.status;
    entry.updatedAt = new Date(at).toISOString();
    if (state.message)
      entry.message = state.message.replace(/https?:\/\/\S+/g, '[URL]').slice(0, 500);
    if (state.status === 'error' && state.release) {
      if (state.progress && Number.isSafeInteger(state.progress.received))
        entry.downloadedBytes = Math.max(0, state.progress.received);
      if (state.downloadAttempt && Number.isSafeInteger(state.downloadAttempt.current))
        entry.downloadAttempts = Math.max(0, state.downloadAttempt.current);
      if (
        state.downloadErrorCode &&
        /^(?:net::ERR_[A-Z0-9_]+|[A-Z0-9_]{1,64})$/.test(state.downloadErrorCode)
      )
        entry.downloadErrorCode = state.downloadErrorCode;
    }
    entry.outcome =
      state.status === 'success'
        ? 'success'
        : state.status === 'manual'
          ? 'manual'
          : state.status === 'available' && state.message === '已取消更新下载。'
            ? 'cancelled'
            : state.status === 'error' || (state.status === 'ready' && state.message)
              ? 'failed'
              : state.status === 'ready'
                ? 'ready'
                : 'in-progress';
    if (['failed', 'cancelled', 'success', 'manual'].includes(entry.outcome))
      this.active = undefined;
    await this.save();
    return true;
  }
  async attach(
    directory: string,
    transaction: {
      id: string;
      currentVersion: string;
      targetVersion: string;
      createdAt: string;
      backup: string;
      target: string;
      historyId?: string;
    },
  ) {
    let entry = this.entries.find(
      (e) => e.id === transaction.historyId || e.transactionDirectory === directory,
    );
    if (!entry) {
      entry = {
        id: transaction.historyId ?? transaction.id,
        currentVersion: transaction.currentVersion,
        targetVersion: transaction.targetVersion,
        createdAt: transaction.createdAt,
        updatedAt: transaction.createdAt,
        phase: 'installing',
        phaseStartedAt: this.now(),
        durations: {},
        outcome: 'in-progress',
      };
      this.entries.unshift(entry);
      this.entries = this.entries.slice(0, 30);
    }
    Object.assign(entry, {
      transactionDirectory: directory,
      backup: transaction.backup,
      previousApp: transaction.target + '.previous',
    });
    this.active = entry.id;
    await this.save();
  }
  recoveryPath(id: string, kind: 'backup' | 'logs' | 'previous') {
    const entry = this.entries.find((e) => e.id === id);
    return kind === 'backup'
      ? entry?.backup
      : kind === 'logs'
        ? entry?.transactionDirectory
        : kind === 'previous'
          ? entry?.previousApp
          : undefined;
  }
  async settleInterrupted() {
    for (const entry of this.entries) {
      if (entry.id !== this.active && ['in-progress', 'ready'].includes(entry.outcome)) {
        entry.outcome = 'manual';
        entry.message = '上次更新已中断，请查看记录后重新下载或按恢复指引处理。';
      }
    }
    await this.save();
  }
  async refreshCleanup() {
    let changed = false;
    for (const entry of this.entries) {
      if (entry.outcome !== 'success' || entry.cleanup || !entry.transactionDirectory) continue;
      const directory = entry.transactionDirectory;
      const id = path.basename(directory);
      if (
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id) ||
        directory !== path.join(this.root, 'transactions', id)
      )
        continue;
      try {
        const file = path.join(directory, 'cleanup.json');
        const stat = await fs.lstat(file);
        if (
          stat.isSymbolicLink() ||
          !stat.isFile() ||
          stat.size > 1024 ||
          stat.uid !== process.getuid?.() ||
          stat.mode & 0o022 ||
          (await fs.realpath(directory)) !==
            path.join(await fs.realpath(this.root), 'transactions', id)
        )
          continue;
        const result = JSON.parse(await fs.readFile(file, 'utf8'));
        if (
          typeof result.previousRemoved !== 'boolean' ||
          typeof result.retiredRemoved !== 'boolean' ||
          typeof result.stageRemoved !== 'boolean'
        )
          continue;
        entry.cleanup =
          result.previousRemoved && result.retiredRemoved && result.stageRemoved
            ? 'complete'
            : 'incomplete';
        if (result.previousRemoved && entry.previousApp) {
          const removedPath = entry.previousApp;
          for (const older of this.entries) {
            if (older.previousApp === removedPath && older.createdAt <= entry.createdAt)
              delete older.previousApp;
          }
        }
        changed = true;
      } catch {
        // The detached helper may still be cleaning up. Missing or untrusted
        // receipts never imply deletion or change the recorded health result.
      }
    }
    if (changed) await this.save();
    return changed;
  }
  async importHelperTimings(directory: string) {
    const entry = this.entries.find((e) => e.transactionDirectory === directory);
    if (!entry) return;
    const file = path.join(directory, 'phases.log');
    const stat = await fs.lstat(file).catch(() => undefined);
    if (!stat || stat.isSymbolicLink() || !stat.isFile() || stat.size > 65536) return;
    const rows = (await fs.readFile(file, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => line.match(/^(\d+)\|([a-z-]+(?::[a-z-]+)?)$/))
      .filter((row): row is RegExpMatchArray => !!row);
    for (let i = 0; i + 1 < rows.length; i++) {
      const ms = (Number(rows[i + 1][1]) - Number(rows[i][1])) * 1000;
      if (ms >= 0 && ms < 24 * 60 * 60 * 1000) entry.durations[`helper:${rows[i][2]}`] = ms;
    }
    await this.save();
  }
}

interface HealthOptions {
  version: string;
  target: string;
  userDataDirectory: string;
  now?: () => number;
  status?: (status: 'validating' | 'success' | 'manual', message: string) => void;
}
export class UpdateHealth {
  private transaction?: InstallationTransaction;
  private directory?: string;
  private nonce?: string;
  private database = false;
  private window = false;
  private ipc = false;
  private started = 0;
  private polling = false;
  private cleanupUntil = 0;
  constructor(
    private journal: UpdateJournal,
    private options: HealthOptions,
  ) {}
  get pending() {
    return !!this.transaction;
  }
  get challenge() {
    return this.nonce;
  }
  private now() {
    return (this.options.now ?? Date.now)();
  }
  async discover() {
    const base = path.join(this.journal.root, 'transactions');
    const names = await fs.readdir(base).catch(() => []);
    const candidates: { tx: InstallationTransaction; directory: string }[] = [];
    for (const id of names) {
      if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id)) continue;
      const directory = path.join(base, id);
      try {
        const stat = await fs.lstat(directory),
          file = path.join(directory, 'transaction.json'),
          info = await fs.lstat(file);
        if (
          stat.isSymbolicLink() ||
          !stat.isDirectory() ||
          stat.uid !== process.getuid?.() ||
          stat.mode & 0o022 ||
          info.isSymbolicLink() ||
          !info.isFile() ||
          info.size > 65536 ||
          info.uid !== stat.uid ||
          info.mode & 0o022
        )
          continue;
        if (
          (await fs.realpath(directory)) !==
          path.join(await fs.realpath(this.journal.root), 'transactions', id)
        )
          continue;
        const tx = JSON.parse(await fs.readFile(file, 'utf8')) as InstallationTransaction;
        if (
          tx.id !== id ||
          tx.userDataDirectory !== this.options.userDataDirectory ||
          (tx.target !== this.options.target &&
            !this.options.target.includes('/AppTranslocation/')) ||
          typeof tx.targetVersion !== 'string' ||
          typeof tx.currentVersion !== 'string' ||
          typeof tx.backup !== 'string' ||
          !path.isAbsolute(tx.backup) ||
          !Number.isFinite(Date.parse(tx.createdAt))
        )
          continue;
        try {
          const previous = JSON.parse(
            await fs.readFile(path.join(directory, 'health.json'), 'utf8'),
          );
          if (['success', 'manual'].includes(previous.outcome)) continue;
        } catch {}
        candidates.push({ tx, directory });
      } catch {
        /* Unknown or damaged files are not trusted as transactions. */
      }
    }
    candidates.sort((a, b) => Date.parse(b.tx.createdAt) - Date.parse(a.tx.createdAt));
    const latest = candidates[0];
    if (latest) {
      this.transaction = latest.tx;
      this.directory = latest.directory;
      this.nonce = randomUUID();
      this.started = this.now();
      await this.journal.attach(latest.directory, latest.tx);
      await this.journal.observe({ currentVersion: this.options.version, status: 'validating' });
      this.options.status?.('validating', '正在确认新版本、资料库和窗口状态。');
      if (this.options.target.includes('/AppTranslocation/'))
        await this.fail(
          '系统从隔离位置启动了新版，无法确认原位置更新成功。请按 macOS 提示将应用安装到可写目录并重新打开；保留备份和旧应用。',
        );
      else if (latest.tx.targetVersion !== this.options.version)
        await this.fail('运行版本与更新目标不一致，请查看恢复材料。');
      else if (this.now() - Date.parse(latest.tx.createdAt) > 10 * 60 * 1000)
        await this.fail('上次更新未及时完成启动确认，请检查恢复材料。');
    }
    await this.journal.settleInterrupted();
    await this.journal.refreshCleanup();
  }
  databaseReady() {
    this.database = true;
  }
  windowReady() {
    this.window = true;
  }
  async confirm(nonce: string) {
    if (this.nonce && nonce === this.nonce) {
      this.ipc = true;
      await this.poll();
    }
  }
  async fail(message: string) {
    if (!this.transaction) return;
    await this.finish('manual', message);
  }
  private async finish(outcome: 'success' | 'manual', message: string) {
    const directory = this.directory!;
    const document = {
      outcome,
      version: this.options.version,
      checkedAt: new Date(this.now()).toISOString(),
      message,
    };
    const temporary = path.join(directory, `health-${randomUUID()}.next`);
    await fs.writeFile(temporary, JSON.stringify(document), { mode: 0o600, flag: 'wx' });
    await fs.rename(temporary, path.join(directory, 'health.json'));
    await this.journal.importHelperTimings(directory);
    await this.journal.observe({ currentVersion: this.options.version, status: outcome, message });
    this.transaction = undefined;
    this.nonce = undefined;
    if (outcome === 'success') this.cleanupUntil = this.now() + 60000;
    this.options.status?.(outcome, message);
  }
  async poll() {
    if (!this.transaction && this.now() < this.cleanupUntil) return this.journal.refreshCleanup();
    if (!this.transaction || this.polling) return;
    this.polling = true;
    try {
      const phase = (
        await fs.readFile(path.join(this.directory!, 'helper-status'), 'utf8').catch(() => '')
      ).trim();
      if (/^(failed|needs-attention):/.test(phase)) {
        await this.fail(
          `安装助手未完成：${phase.slice(0, 120)}。保留旧应用和备份，请按恢复指引处理。`,
        );
        return;
      }
      if (this.now() - this.started > 60000) {
        await this.fail('新版启动健康确认超时。请保留备份及旧应用，检查日志或手动恢复。');
        return;
      }
      if (phase === 'awaiting-health' && this.database && this.window && this.ipc)
        await this.finish('success', '新版本、资料库、窗口与通信检查通过。');
    } finally {
      this.polling = false;
    }
  }
}
