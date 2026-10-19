import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PreparedUpdate } from './update-install';

export interface InstallationTransaction {
  id: string;
  createdAt: string;
  currentVersion: string;
  targetVersion: string;
  target: string;
  backup: string;
  stageDirectory: string;
  userDataDirectory: string;
}

export async function launchUpdateHelper(options: {
  prepared: PreparedUpdate;
  backup: string;
  executable: string;
  currentVersion: string;
  userDataDirectory: string;
  transactionsDirectory: string;
  helperSource: string;
}) {
  const { prepared } = options;
  const target = path.resolve(options.executable, '../../..');
  if (!target.endsWith('.app') || target.includes('/AppTranslocation/'))
    throw Error('请将应用安装到可写目录后再更新，不能直接更新磁盘映像中的应用。');
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw Error('当前应用位置或所有权不允许自动更新，请手动安装。');
  await fs.access(path.dirname(target), fs.constants.W_OK);
  if (!(await fs.stat(options.backup)).isFile()) throw Error('完整备份不存在，安装已停止。');
  const id = randomUUID();
  await fs.mkdir(options.transactionsDirectory, { recursive: true, mode: 0o700 });
  const directory = path.join(options.transactionsDirectory, id);
  await fs.mkdir(directory, { mode: 0o700 });
  const transaction: InstallationTransaction = {
    id,
    createdAt: new Date().toISOString(),
    currentVersion: options.currentVersion,
    targetVersion: prepared.version,
    target,
    backup: options.backup,
    stageDirectory: prepared.stageDirectory,
    userDataDirectory: options.userDataDirectory,
  };
  await fs.writeFile(path.join(directory, 'transaction.json'), JSON.stringify(transaction), {
    mode: 0o600,
  });
  // Shell helper only reads fixed-value files, never sources/evaluates transaction content.
  await fs.writeFile(path.join(directory, 'expected-version'), prepared.version, { mode: 0o600 });
  await fs.writeFile(path.join(directory, 'expected-app-id'), 'com.cleverworkbench.desktop', {
    mode: 0o600,
  });
  await fs.writeFile(path.join(directory, 'user-data-directory'), options.userDataDirectory, {
    mode: 0o600,
  });
  const helper = path.join(directory, 'helper.sh');
  await fs.copyFile(options.helperSource, helper, fs.constants.COPYFILE_EXCL);
  await fs.chmod(helper, 0o700);
  const child = spawn(
    '/bin/sh',
    [helper, String(process.pid), target, prepared.appPath, directory],
    {
      detached: true,
      stdio: 'ignore',
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    },
  );
  let exited = false;
  let launchError: Error | undefined;
  child.on('error', (error) => {
    launchError = error;
  });
  child.on('exit', () => {
    exited = true;
  });
  try {
    const deadline = Date.now() + 120_000;
    while (Date.now() < deadline) {
      const phase = await fs
        .readFile(path.join(directory, 'helper-status'), 'utf8')
        .catch(() => '');
      if (phase.trim() === 'waiting-for-exit') {
        child.unref();
        return directory;
      }
      if (launchError || exited || /^(failed|needs-attention):/.test(phase))
        throw Error(`更新助手未就绪，当前应用保持运行。详情：${directory}`);
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw Error(`更新助手准备超时，当前应用保持运行。详情：${directory}`);
  } catch (error) {
    child.kill('SIGTERM');
    throw error;
  }
}
