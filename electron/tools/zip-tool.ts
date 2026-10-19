import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import type { Store } from '../store';
import {
  defaultZipSettings,
  type ZipCommand,
  type ZipSettings,
  type ZipState,
  type TextPart,
  type GitCommit,
  type GitPreview,
} from '../../src/tool-types';
import { collectionStatus } from './clipboard-parts';
import { runToolWorker } from './runner';
import type { ZipWork } from './zip-worker';
import { validateZipSettings } from './zip-validation';

export class ZipTextTool {
  private temporary: string | null = null;
  private files = new Map<string, string>();
  private failedParts = new Set<string>();
  private state: ZipState = {
    busy: false,
    operation: '',
    progress: null,
    error: '',
    notice: '',
    output: '',
    settings: { ...defaultZipSettings },
    parts: [],
    partsReady: false,
    partsDescription: '',
    branches: [],
    branch: '',
    commits: [],
    preview: null,
  };
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private store: Store,
    private workerPath: string,
  ) {}
  get busy() {
    return this.state.busy;
  }
  snapshot(): ZipState {
    const settings = this.store.get('zipTextSettings', defaultZipSettings);
    validateZipSettings(settings);
    const { ready, description } = collectionStatus(this.state.parts);
    return structuredClone({
      ...this.state,
      settings,
      parts: this.state.parts.map((part) => ({
        ...part,
        ...(this.failedParts.has(part.id) ? { error: '替换失败，请重新替换或移除。' } : {}),
      })),
      partsReady: ready && !this.failedParts.size,
      partsDescription: this.failedParts.size
        ? '分片替换失败，请重新替换或移除该分片后再还原。'
        : description,
    });
  }
  private save(settings: ZipSettings) {
    validateZipSettings(settings);
    const current = this.store.get('zipTextSettings', defaultZipSettings);
    if (
      current.source === settings.source &&
      current.outputDir === settings.outputDir &&
      current.partSizeMB === settings.partSizeMB
    )
      return;
    this.store.set('zipTextSettings', {
      source: settings.source,
      outputDir: settings.outputDir,
      partSizeMB: settings.partSizeMB,
    });
    this.store.markChanged();
  }
  private async cache() {
    if (!this.temporary) {
      this.temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-ztxt-'));
      await fs.chmod(this.temporary, 0o700);
    }
    return this.temporary;
  }
  private start<T>(
    operation: string,
    work: () => Promise<ZipWork> | ZipWork,
    done: (value: T) => Promise<void> | void,
    failed?: () => void,
  ) {
    this.state.busy = true;
    this.state.operation = operation;
    this.state.error = '';
    this.state.progress = { phase: '正在准备', processed: 0, total: null };
    this.pending = (async () => {
      try {
        const result = await runToolWorker<T>(this.workerPath, await work(), (progress) => {
          this.state.progress = progress;
        });
        await done(result);
        this.state.progress = { phase: '处理完成', processed: 1, total: 1 };
      } catch (error) {
        failed?.();
        this.state.error = error instanceof Error ? error.message : String(error);
        this.state.progress = null;
      } finally {
        this.state.busy = false;
      }
    })();
  }
  command(input: unknown) {
    if (!input || typeof input !== 'object' || !('type' in input) || typeof input.type !== 'string')
      throw new Error('工具操作无效。');
    if (this.busy) throw new Error('当前工具仍在处理，请完成后再操作。');
    const command = input as ZipCommand;
    if (command.type !== 'settings') this.state.notice = '';
    const source = (value: unknown) => {
      if (
        typeof value !== 'string' ||
        !value.trim() ||
        value.length > 32768 ||
        value.includes('\0')
      )
        throw new Error('请选择有效的本地路径。');
      return value;
    };
    const commits = (value: unknown): string[] => {
      if (
        !Array.isArray(value) ||
        !value.length ||
        value.length > 100000 ||
        value.some((v) => typeof v !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(v))
      )
        throw new Error('请选择有效的 Git 提交。');
      return [...new Set(value)].sort();
    };
    switch (command.type) {
      case 'settings':
        this.save(command.value);
        break;
      case 'git.branches': {
        source(command.source);
        this.state.branches = [];
        this.state.commits = [];
        this.state.preview = null;
        this.start<{ branches: ZipState['branches']; branch: string }>(
          command.type,
          () => ({ type: 'branches', source: command.source }),
          (result) => {
            Object.assign(this.state, result);
          },
        );
        break;
      }
      case 'git.commits': {
        const f = command.filter;
        if (
          !f ||
          ['source', 'branch', 'author', 'start', 'end'].some(
            (key) => typeof f[key as keyof typeof f] !== 'string',
          ) ||
          ![0, 24, 48].includes(f.recentHours)
        )
          throw new Error('Git 筛选条件无效。');
        source(f.source);
        if (f.author.length > 1000 || f.branch.length > 4096) throw new Error('Git 筛选条件过长。');
        this.state.commits = [];
        this.start<GitCommit[]>(
          command.type,
          () => ({ type: 'commits', filter: f }),
          (result) => {
            this.state.commits = result;
            this.state.branch = f.branch;
          },
        );
        break;
      }
      case 'git.preview': {
        source(command.source);
        const selection = commits(command.commits);
        this.state.preview = null;
        this.start<GitPreview>(
          command.type,
          () => ({ type: 'preview', source: command.source, commits: selection }),
          (result) => {
            this.state.preview = result;
          },
        );
        break;
      }
      case 'pack':
      case 'restore':
      case 'paste.restore': {
        validateZipSettings(command.settings);
        if (
          typeof command.password !== 'string' ||
          !command.password.length ||
          command.password.length > 100000
        )
          throw new Error('密码不能为空或过长。');
        if (command.type !== 'paste.restore') source(command.settings.source);
        else if (!this.snapshot().partsReady || !command.settings.outputDir)
          throw new Error('请收齐有效分片并选择输出目录。');
        let preview: GitPreview | undefined;
        if (command.type === 'pack' && command.commits !== undefined) {
          const selection = commits(command.commits),
            current = this.state.preview;
          if (
            !current ||
            current.source !== command.settings.source ||
            JSON.stringify(current.commits) !== JSON.stringify(selection) ||
            !current.available.length
          )
            throw new Error('请先预览当前选择，并确认存在可打包文件。');
          preview = current;
        }
        this.save(command.settings);
        this.state.output = '';
        this.start<string>(
          command.type,
          async () =>
            command.type === 'paste.restore'
              ? {
                  type: 'paste',
                  parts: this.state.parts.map((part) => ({
                    ...part,
                    path: this.files.get(part.id)!,
                  })),
                  temporary: await this.cache(),
                  outputDir: command.settings.outputDir,
                  password: command.password,
                }
              : {
                  type: command.type,
                  settings: command.settings,
                  password: command.password,
                  ...(preview ? { preview } : {}),
                },
          async (output) => {
            this.state.output = output;
            if (command.type === 'paste.restore') await this.clearParts();
          },
        );
        break;
      }
      case 'paste.capture': {
        if (command.replaceId !== undefined && !this.files.has(command.replaceId))
          throw new Error('待替换的分片不存在。');
        const id = randomUUID();
        let filename = '';
        this.start<Omit<TextPart, 'id'>>(
          command.type,
          async () => {
            filename = path.join(await this.cache(), id);
            return { type: 'capture', target: filename };
          },
          async (part) => {
            const duplicate = this.state.parts.some(
              (existing) =>
                existing.id !== command.replaceId &&
                existing.identity === part.identity &&
                existing.count === part.count &&
                existing.index === part.index,
            );
            if (duplicate) {
              await fs.rm(filename, { force: true });
              this.state.notice = `第 ${part.index} / ${part.count} 片已存在，已自动跳过，保留原分片。`;
              return;
            }
            if (command.replaceId) {
              const old = this.files.get(command.replaceId)!;
              await fs.rm(old, { force: true });
              this.files.delete(command.replaceId);
              this.failedParts.delete(command.replaceId);
              this.state.parts = this.state.parts.filter((p) => p.id !== command.replaceId);
            }
            this.files.set(id, filename);
            this.state.parts.push({ ...part, id });
          },
          () => {
            if (command.replaceId) this.failedParts.add(command.replaceId);
          },
        );
        break;
      }
      case 'paste.remove': {
        const filename = this.files.get(command.id);
        if (!filename) throw new Error('分片不存在。');
        this.state.busy = true;
        this.pending = fs
          .rm(filename, { force: true })
          .then(() => {
            this.files.delete(command.id);
            this.failedParts.delete(command.id);
            this.state.parts = this.state.parts.filter((p) => p.id !== command.id);
            this.state.error = '';
          })
          .catch((error) => {
            this.state.error = String(error);
          })
          .finally(() => {
            this.state.busy = false;
          });
        break;
      }
      case 'paste.clear': {
        this.state.busy = true;
        this.pending = this.clearParts()
          .catch((error) => {
            this.state.error = String(error);
          })
          .finally(() => {
            this.state.busy = false;
          });
        break;
      }
      default:
        throw new Error('工具操作未登记。');
    }
    return this.snapshot();
  }
  private async clearParts() {
    for (const filename of this.files.values()) await fs.rm(filename, { force: true });
    this.files.clear();
    this.failedParts.clear();
    this.state.parts = [];
  }
  async whenIdle() {
    await this.pending;
  }
  async dispose() {
    if (this.busy) throw new Error('工具正在处理，请完成后再关闭。');
    if (this.temporary) await fs.rm(this.temporary, { recursive: true, force: true });
    this.temporary = null;
    this.files.clear();
    this.failedParts.clear();
    this.state.parts = [];
    this.state.notice = '';
    this.state.preview = null;
    this.state.commits = [];
    this.state.branches = [];
  }
}
