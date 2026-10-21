import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadGuidanceCatalog } from '../src/guidance/catalog';
import { compareGuidanceVersions, isGuidanceVersion } from '../src/guidance/versions';
import type { GuidanceDeviceState, GuidanceSource } from '../src/guidance/types';

/** Device-only state deliberately lives outside Store/data and its portable backups. */
export class GuidanceDevice {
  private state: GuidanceDeviceState = {
    firstVersion: null,
    lastStartedVersion: null,
    shownThrough: null,
    persisted: true,
  };
  private queue = Promise.resolve();
  private constructor(private directory: string) {}
  static async open(directory: string) {
    const device = new GuidanceDevice(directory);
    try {
      const raw = await fs.readFile(path.join(directory, 'state.json'), 'utf8');
      if (raw.length > 4096) throw Error('oversized');
      const value = JSON.parse(raw);
      if (
        value.schemaVersion !== 1 ||
        !isGuidanceVersion(value.firstVersion) ||
        !isGuidanceVersion(value.lastStartedVersion) ||
        (value.shownThrough !== null && !isGuidanceVersion(value.shownThrough))
      )
        throw Error('invalid');
      device.state = {
        firstVersion: value.firstVersion,
        lastStartedVersion: value.lastStartedVersion,
        shownThrough: value.shownThrough,
        persisted: true,
      };
    } catch (cause) {
      if ((cause as NodeJS.ErrnoException).code !== 'ENOENT')
        device.state = {
          ...device.state,
          persisted: false,
          warning: '本机指引提示记录无法读取，将按首次启用处理；不会回放全部历史。',
        };
    }
    return device;
  }
  observe(version: string) {
    return this.change(version, false);
  }
  acknowledge(version: string) {
    return this.change(version, true);
  }
  whenIdle() {
    return this.queue;
  }
  private change(version: string, shown: boolean): Promise<GuidanceDeviceState> {
    if (!isGuidanceVersion(version)) return Promise.reject(Error('指引版本无效。'));
    const operation = this.queue.then(async () => {
      const previous = this.state;
      const next = {
        ...previous,
        firstVersion: previous.firstVersion ?? version,
        lastStartedVersion: version,
        shownThrough:
          shown &&
          (!previous.shownThrough || compareGuidanceVersions(version, previous.shownThrough) > 0)
            ? version
            : previous.shownThrough,
      };
      if (
        next.firstVersion === previous.firstVersion &&
        next.lastStartedVersion === previous.lastStartedVersion &&
        next.shownThrough === previous.shownThrough
      )
        return { ...previous };
      // Keep the session fact even when persistence fails, without claiming durable success.
      this.state = next;
      const temp = path.join(this.directory, `.state-${randomUUID()}.tmp`);
      try {
        await fs.mkdir(this.directory, { recursive: true });
        const handle = await fs.open(temp, 'wx', 0o600);
        try {
          await handle.writeFile(
            JSON.stringify({
              schemaVersion: 1,
              firstVersion: next.firstVersion,
              lastStartedVersion: next.lastStartedVersion,
              shownThrough: next.shownThrough,
            }),
          );
          await handle.sync();
        } finally {
          await handle.close();
        }
        await fs.rename(temp, path.join(this.directory, 'state.json'));
        this.state = { ...next, persisted: true };
      } catch {
        await fs.rm(temp, { force: true }).catch(() => {});
        this.state = {
          ...next,
          persisted: false,
          warning:
            '无法保存本机指引提示记录。本次运行不会重复提示，重启后可能再次显示；可在设置中手动查阅。',
        };
      }
      return { ...this.state };
    });
    this.queue = operation.then(
      () => {},
      () => {},
    );
    return operation;
  }
}

export async function readBundledGuidance(directory: string) {
  const sources: GuidanceSource[] = [];
  async function visit(relative: string) {
    const entries = await fs
      .readdir(path.join(directory, relative), { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      const file = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (entry.isFile() && entry.name.endsWith('.json')) {
        const text = await fs.readFile(path.join(directory, file), 'utf8').catch(() => '');
        sources.push({ file, text });
      }
    }
  }
  await visit('');
  return loadGuidanceCatalog(sources);
}
