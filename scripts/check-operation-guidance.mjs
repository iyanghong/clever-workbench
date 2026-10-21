import fs from 'node:fs/promises';
import path from 'node:path';
import { inspectOperationGuidance, formatOperationGuidance } from './release-tools/guidance.mjs';

// Content diagnostics are advisory; invocation, I/O and program failures are not swallowed.
const args = process.argv.slice(2);
const options = { directory: process.cwd() };
for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === '--github') options.github = true;
  else if (['--directory', '--output', '--source', '--release-tag'].includes(arg)) {
    const value = args[++i];
    if (!value || value.startsWith('--')) throw Error(`${arg} 缺少参数。`);
    options[arg.slice(2)] = value;
  } else throw Error(`未知参数：${arg}`);
}
if (!(await fs.stat(options.directory)).isDirectory())
  throw Error('检查来源必须是已检出的源码目录。');
const report = await inspectOperationGuidance(path.resolve(options.directory), {
  sourceSha: options.source,
  releaseTag: options['release-tag'],
});
const text = formatOperationGuidance(report);
// Prevent repository text from being interpreted as workflow commands or terminal controls.
const plain = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ')
    .replace(/^::/gm, ' ::');
console.log(plain(text));
if (options.output) {
  await fs.mkdir(path.dirname(options.output), { recursive: true });
  await fs.writeFile(options.output, JSON.stringify(report, null, 2) + '\n');
}
if (options.github) {
  const escape = (value) =>
    String(value)
      .replaceAll('%', '%25')
      .replaceAll('\r', '%0D')
      .replaceAll('\n', '%0A')
      .replaceAll(':', '%3A')
      .replaceAll(',', '%2C');
  for (const warning of report.warnings)
    console.log(
      `::warning file=${escape(warning.file)},title=${escape(`操作指引 ${warning.code}`)}::${escape(`${warning.field}：${warning.message} 修正建议：${warning.suggestion}`)}`,
    );
  if (process.env.GITHUB_STEP_SUMMARY) {
    const html = text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    await fs.appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `<h2>操作指引检查</h2>\n<pre>${html}</pre>\n`,
    );
  }
}
