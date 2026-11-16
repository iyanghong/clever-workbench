import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(root, 'dist');
let html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
const script = html.match(/<script\b[^>]*src="([^"]+)"[^>]*><\/script>/);
const style = html.match(/<link\b[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
assert.ok(script && style, '没有找到 Vite 生成的脚本与样式');
const javascript = await fs.readFile(path.join(dist, script[1]), 'utf8');
const css = await fs.readFile(path.join(dist, style[1]), 'utf8');
html = html.replace(
  script[0],
  () => `<script type="module">${javascript.replaceAll('</script', '<\\/script')}</script>`,
);
html = html.replace(style[0], () => `<style>${css.replaceAll('</style', '<\\/style')}</style>`);
const icon = await fs.readFile(path.join(root, 'public/favicon.svg'), 'utf8');
html = html.replace(
  /href="[^"]*favicon\.svg"/,
  `href="data:image/svg+xml,${encodeURIComponent(icon)}"`,
);
assert.ok(!/<script\b[^>]*src=/.test(html), '单文件不应再依赖外部脚本');
assert.ok(!/<link\b[^>]*rel="stylesheet"/.test(html), '单文件不应再依赖外部样式');
const file = path.join(root, 'Clever-Workbench-AntD6-Demo.html');
await fs.writeFile(file, html);
console.log(
  `已生成离线单文件：${file}（${(Buffer.byteLength(html) / 1024 / 1024).toFixed(2)} MB）`,
);
