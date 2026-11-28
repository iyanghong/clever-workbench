import { execFile } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { MacUnlockMode } from '../src/vault-types';
type Enrollment = Exclude<MacUnlockMode, 'off'>;

export interface MacUnlockDevice {
  available(): Promise<boolean>;
  seal(binding: string, material: Buffer, signal: AbortSignal): Promise<Buffer>;
  open(binding: string, envelope: Buffer, signal: AbortSignal, mode: Enrollment): Promise<Buffer>;
}

export const maxMacUnlockEnvelope = 16_384;
export const macUnlockFallback =
  'Mac 系统验证未完成。可输入工作台主密码，或重新启用 Mac 系统解锁。';

// This file sits beside the database, outside the database and attachment backup formats.
export function macUnlockFile(
  directory: string,
  protectionId: string,
  mode: Enrollment = 'system',
) {
  if (!/^[a-f0-9-]{36}$/.test(protectionId)) throw new Error('主密码保护标识无效。');
  return path.join(
    directory,
    `${mode === 'system' ? 'mac-unlock' : 'touch-id'}-${protectionId}.sealed`,
  );
}

export function savedMacUnlockMode(directory: string, protectionId: string): MacUnlockMode {
  if (fs.existsSync(macUnlockFile(directory, protectionId))) return 'system';
  return fs.existsSync(macUnlockFile(directory, protectionId, 'touchID')) ? 'touchID' : 'off';
}

export function readMacUnlockEnvelope(filename: string): Buffer {
  let fd: number | undefined;
  try {
    fd = fs.openSync(
      filename,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK,
    );
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size < 1 || stat.size > maxMacUnlockEnvelope) throw Error();
    const data = Buffer.alloc(stat.size);
    if (fs.readSync(fd, data, 0, data.length, 0) !== data.length) throw Error();
    return data;
  } catch {
    throw new Error(macUnlockFallback);
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

export function macUnlockDevice(executable: string): MacUnlockDevice {
  function run(args: string[], input?: Buffer, signal?: AbortSignal): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const child = execFile(
        executable,
        args,
        {
          encoding: 'buffer',
          maxBuffer: maxMacUnlockEnvelope,
          timeout: 90_000,
          signal,
        },
        (error, stdout) => {
          if (!error) return resolve(stdout);
          stdout?.fill(0);
          const message =
            signal?.aborted || error.code === 2
              ? '已取消 Mac 系统验证，可输入工作台主密码。'
              : error.code === 3
                ? '这台 Mac 当前无法使用系统验证，请输入工作台主密码。'
                : macUnlockFallback;
          reject(new Error(message));
        },
      );
      // The helper can exit before reading its pipe, for example when the screen locks.
      child.stdin?.on('error', () => {});
      child.stdin?.end(input);
    });
  }
  return {
    available: async () => (await run(['available'])).equals(Buffer.from([1])),
    seal: (binding, material, signal) => run(['seal', binding], material, signal),
    open: (binding, envelope, signal, mode) =>
      run([mode === 'touchID' ? 'open-touch-id' : 'open', binding], envelope, signal),
  };
}
