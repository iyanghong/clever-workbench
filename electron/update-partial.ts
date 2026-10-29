import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

const lifetime = 24 * 60 * 60 * 1000;
const partialName = /^partial-v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

interface Identity {
  version: string;
  name: string;
  size: number;
  sha256: string;
  assetId: number | null;
}

interface Manifest extends Identity {
  schema: 1;
  createdAt: number;
}

function owned(stat: import('node:fs').Stats, directory: boolean) {
  return (
    (directory ? stat.isDirectory() : stat.isFile()) &&
    !stat.isSymbolicLink() &&
    stat.uid === process.getuid?.() &&
    !(stat.mode & 0o022)
  );
}

async function inspect(directory: string) {
  const stat = await fs.lstat(directory);
  if (!owned(stat, true)) throw Error('更新暂存目录不安全，请检查目录权限。');
  const names = await fs.readdir(directory);
  if (names.some((name) => !['manifest.json', 'update.zip', 'Clever Workbench.app'].includes(name)))
    throw Error('更新暂存目录含有未知文件，请检查后重试。');
  return names;
}

async function removeOwned(directory: string) {
  await inspect(directory);
  await fs.rm(directory, { recursive: true });
}

export async function prunePartials(root: string, version?: string, now = Date.now()) {
  let stat: import('node:fs').Stats;
  try {
    stat = await fs.lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return;
    throw error;
  }
  if (!owned(stat, true)) throw Error('更新根目录不安全，请检查目录权限。');
  for (const entry of await fs.readdir(root, { withFileTypes: true })) {
    if (!partialName.test(entry.name) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const directory = path.join(root, entry.name);
    let expired = false;
    try {
      const manifestPath = path.join(directory, 'manifest.json');
      const manifestStat = await fs.lstat(manifestPath);
      if (!owned(manifestStat, false) || manifestStat.size > 2048) continue;
      const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as Manifest;
      expired =
        !Number.isFinite(manifest.createdAt) ||
        now < manifest.createdAt ||
        now - manifest.createdAt > lifetime;
    } catch {
      /* Untrusted or incomplete directories are left untouched. */
    }
    if ((version && entry.name !== `partial-v${version}`) || expired)
      await removeOwned(directory).catch(() => {
        // Do not delete unknown files or follow links in another directory.
      });
  }
}

export async function openPartial(root: string, identity: Identity, now = Date.now()) {
  if (
    !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(identity.version) ||
    !/^Clever-Workbench-\d+\.\d+\.\d+-arm64\.zip$/.test(identity.name) ||
    !Number.isSafeInteger(identity.size) ||
    identity.size < 1 ||
    identity.size > 1024 ** 3 ||
    !/^[a-f0-9]{64}$/.test(identity.sha256)
  )
    throw Error('更新暂存目标无效。');
  await fs.mkdir(root, { recursive: true, mode: 0o700 });
  if (!owned(await fs.lstat(root), true)) throw Error('更新根目录不安全，请检查目录权限。');
  const current = `partial-v${identity.version}`;
  await prunePartials(root, identity.version, now);
  const directory = path.join(root, current);
  const manifestPath = path.join(directory, 'manifest.json');
  const filename = path.join(directory, 'update.zip');
  let existing = false;
  let names: string[] = [];
  try {
    names = await inspect(directory);
    existing = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (existing) {
    let manifest: Manifest | undefined;
    try {
      const stat = await fs.lstat(manifestPath);
      if (!owned(stat, false) || stat.size > 2048) throw Error('unsafe manifest');
      manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
    } catch {
      /* Only known, owned files in this deterministic directory may be reset. */
    }
    if (
      !manifest ||
      manifest.schema !== 1 ||
      Object.keys(identity).some(
        (key) => manifest?.[key as keyof Identity] !== identity[key as keyof Identity],
      ) ||
      !Number.isFinite(manifest.createdAt) ||
      now < manifest.createdAt ||
      now - manifest.createdAt > lifetime ||
      !names.includes('update.zip') ||
      names.includes('Clever Workbench.app')
    ) {
      await removeOwned(directory);
      existing = false;
    }
  }
  if (!existing) {
    await fs.mkdir(directory, { mode: 0o700 });
    await fs.writeFile(manifestPath, JSON.stringify({ schema: 1, ...identity, createdAt: now }), {
      flag: 'wx',
      mode: 0o600,
    });
    const file = await fs.open(
      filename,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      0o600,
    );
    await file.close();
  }
  const fileStat = await fs.lstat(filename);
  if (!owned(fileStat, false) || fileStat.size > identity.size)
    throw Error('更新暂存文件不安全，请检查后重试。');
  return { directory, filename, received: fileStat.size };
}

export async function resetPartial(filename: string) {
  const file = await fs.open(filename, constants.O_WRONLY | constants.O_NOFOLLOW);
  try {
    if (!owned(await file.stat(), false)) throw Error('更新暂存文件不安全。');
    await file.truncate(0);
  } finally {
    await file.close();
  }
}

export async function appendPartial(filename: string, bytes: Uint8Array) {
  const file = await fs.open(
    filename,
    constants.O_WRONLY | constants.O_APPEND | constants.O_NOFOLLOW,
  );
  try {
    if (!owned(await file.stat(), false)) throw Error('更新暂存文件不安全。');
    await file.writeFile(bytes);
  } finally {
    await file.close();
  }
}

export async function digestPartial(filename: string) {
  const file = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    if (!owned(await file.stat(), false)) throw Error('更新暂存文件不安全。');
    const hash = createHash('sha256');
    for await (const chunk of file.createReadStream({ autoClose: false })) hash.update(chunk);
    return hash.digest('hex');
  } finally {
    await file.close();
  }
}

export async function discardPartial(directory: string) {
  await removeOwned(directory);
}
