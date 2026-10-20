import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { repositoryFromOrigin, visibleText } from './release-tools/core.mjs';
import { git, localIdentity, runRelease } from './release-tools/local.mjs';
import { githubClient, gitCredential, systemProxy } from './release-tools/github.mjs';

const args = process.argv.slice(2);
if (args.includes('--help')) {
  console.log(
    '用法：node scripts/publish-release.mjs [--dry-run] [--version vX.Y.Z]\n默认交互预览并确认一次后发布；--dry-run 只读取远端，不提交、不推送、不触发发布。',
  );
} else {
  let terminal, logFile;
  try {
    if (process.platform !== 'darwin') throw Error('双击发布入口仅支持 macOS。');
    if (
      args.some(
        (arg, index) =>
          !['--dry-run', '--version'].includes(arg) && args[index - 1] !== '--version',
      )
    )
      throw Error('不支持的参数，请使用 --help 查看用法。');
    const requestedVersion = args.includes('--version')
      ? args[args.indexOf('--version') + 1]
      : undefined;
    if (args.includes('--version') && !requestedVersion)
      throw Error('--version 后必须填写 vX.Y.Z。');
    const [major, minor] = process.versions.node.split('.').map(Number);
    if (major < 24 || (major === 24 && minor < 15))
      throw Error('请先安装 Node.js 24.15 或更新版本（建议 Node.js 24 LTS）。');
    const directory = git(path.dirname(fileURLToPath(import.meta.url)), [
      'rev-parse',
      '--show-toplevel',
    ]);
    const origin = git(directory, ['remote', 'get-url', 'origin']);
    const repository = repositoryFromOrigin(origin);
    const identity = localIdentity(directory);
    const proxy = systemProxy(directory);
    const github = githubClient(repository, gitCredential(directory, repository), proxy);
    const logs = path.join(directory, 'release', 'publish-logs');
    await fs.mkdir(logs, { recursive: true, mode: 0o700 });
    logFile = path.join(
      logs,
      `${new Date().toISOString().replace(/[:.]/g, '-')}-${process.pid}.log`,
    );
    await fs.writeFile(logFile, '', { mode: 0o600 });
    const log = (message) => {
      const text = String(message).split('\n').map(visibleText).join('\n');
      console.log(text);
      // Append synchronously through a single queue so logs survive a terminal interruption.
      logQueue = logQueue.then(() =>
        fs.appendFile(logFile, `${new Date().toISOString()} ${text}\n`),
      );
    };
    let logQueue = Promise.resolve();
    terminal = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ask = (question) => {
      if (!process.stdin.isTTY) throw Error('实际发布需要终端交互确认；自动检查请使用 --dry-run。');
      return terminal.question(question);
    };
    log(`发布记录：${logFile}`);
    try {
      await runRelease({
        directory,
        origin,
        identity,
        github,
        ask,
        log,
        proxy,
        dryRun: args.includes('--dry-run'),
        requestedVersion,
      });
    } finally {
      await logQueue;
    }
  } catch (error) {
    const message = visibleText(error.message || '发布失败。');
    console.error(`\n发布未完成：${message}`);
    if (logFile) await fs.appendFile(logFile, `${new Date().toISOString()} 失败：${message}\n`);
    process.exitCode = 1;
  } finally {
    terminal?.close();
  }
}
