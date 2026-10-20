import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { PreparedUpdate } from './update-install';

export interface InstallationTransaction {
  historyId?: string;
  id: string;
  createdAt: string;
  currentVersion: string;
  targetVersion: string;
  target: string;
  backup: string;
  stageDirectory: string;
  userDataDirectory: string;
}

export async function resolveUpdateTarget(executable: string) {
  const target = path.resolve(executable, '../../..');
  if (target.includes('/AppTranslocation/'))
    throw Error(
      'macOS 正在从只读隔离位置运行此应用。请退出应用，通过 Finder 将正式安装包中的应用拖到“应用程序”，替换现有副本后重新打开，再检查更新。',
    );
  if (!target.endsWith('.app'))
    throw Error('当前运行位置不是完整的 macOS 应用，请通过 Finder 安装到“应用程序”后重新打开。');
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.uid !== process.getuid?.())
    throw Error('当前应用位置或所有权不允许自动更新，请手动安装。');
  try {
    await fs.access(path.dirname(target), fs.constants.W_OK);
  } catch (error) {
    if (['EACCES', 'EPERM', 'EROFS'].includes((error as NodeJS.ErrnoException).code ?? ''))
      throw Error(
        '当前应用所在目录不可写。请退出应用，通过 Finder 安装到可写目录后重新打开；不要直接从磁盘映像中运行。',
      );
    throw error;
  }
  return target;
}

export async function launchUpdateHelper(options: {
  beforeLaunch?: (directory: string, transaction: InstallationTransaction) => Promise<void>;
  historyId?: string;
  prepared: PreparedUpdate;
  backup: string;
  executable: string;
  currentVersion: string;
  userDataDirectory: string;
  transactionsDirectory: string;
  helperSource: string;
}) {
  const { prepared } = options;
  const target = await resolveUpdateTarget(options.executable);
  if (!(await fs.stat(options.backup)).isFile()) throw Error('完整备份不存在，安装已停止。');
  const id = randomUUID();
  await fs.mkdir(options.transactionsDirectory, { recursive: true, mode: 0o700 });
  const directory = path.join(options.transactionsDirectory, id);
  await fs.mkdir(directory, { mode: 0o700 });
  const transaction: InstallationTransaction = {
    historyId: options.historyId,
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
  await fs.writeFile(
    path.join(directory, 'RECOVERY.txt'),
    [
      'Clever Workbench 更新恢复指引',
      '如果新应用未能打开，请查看 helper-status 和 helper.log。系统安全拦截应按 macOS 提示处理；不要关闭 Gatekeeper 或移除隔离属性。',
      `当前应用：${target}`,
      `保留的旧应用：${target}.previous`,
      '旧应用和本次下载目录仅在新版健康启动确认前保留；确认成功后自动清理，完整加密备份和本目录日志继续保留。',
      `完整加密备份：${options.backup}`,
      `更新版本：${options.currentVersion} → ${prepared.version}`,
      '先保留现有资料。新版本可能已经迁移数据库；不要直接用旧应用打开新数据。需要恢复时，由你明确选择兼容版本和备份，使用备份生成时的主密码。',
      '更新助手不会自动回退或覆盖数据库。可从 https://github.com/iyanghong/clever-workbench/releases 下载历史安装包。',
      '',
    ].join('\n'),
    { mode: 0o600 },
  );
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
  // Complete every fallible history write before the detached helper can become
  // armed. Once it is ready, the caller must only proceed to exit.
  await options.beforeLaunch?.(directory, transaction);
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
