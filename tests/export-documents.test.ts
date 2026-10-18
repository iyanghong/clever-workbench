import { expect, test } from 'vitest';
import yauzl from 'yauzl';
import { renderDocx, renderHtml } from '../electron/export-documents';

async function entries(bytes: Buffer) {
  return new Promise<Map<string, Buffer>>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true }, (error, zip) => {
      if (error || !zip) return reject(error);
      const result = new Map<string, Buffer>();
      zip.on('error', reject);
      zip.on('end', () => resolve(result));
      zip.on('entry', (entry: yauzl.Entry) =>
        zip.openReadStream(entry, (error, stream) => {
          if (error || !stream) return reject(error);
          const chunks: Buffer[] = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => {
            result.set(entry.fileName, Buffer.concat(chunks));
            zip.readEntry();
          });
        }),
      );
      zip.readEntry();
    });
  });
}

test('Word 保留中文、实体、表格、代码和内嵌图片；打印 HTML 不执行原始 HTML 或请求外网图片', async () => {
  const src = `workbench-asset://image/${'a'.repeat(64)}.png`;
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgqPr/HwAEcAJ5Qhlc0gAAAABJRU5ErkJggg==',
    'base64',
  );
  const images = new Map([[src, { bytes, width: 1, height: 1 }]]);
  const markdown = `# 系统说明\n\n中文 **重点**、实体 &copy; &amp; 和 [平台](https://example.test)。\n\n## 配置\n\n| 信息 | 内容 |\n| --- | --- |\n| 内存 | 32G<br>可扩容 |\n\n- 第一项\n- [x] 完成项\n\n> 排障记录\n\n\`\`\`text\nsecret|<&>\n\`\`\`\n\n![现场](${src})\n\n<script>alert('不可执行')</script>\n\n![远程图](https://example.test/track.png)\n\n[危险地址](javascript:alert(1))`;
  const docx = await entries(await renderDocx(markdown, images));
  const xml = docx.get('word/document.xml')!.toString();
  expect(xml).toContain('系统说明');
  expect(xml).toContain('©');
  expect(xml).toContain('32G');
  expect(xml).toContain('<w:tbl>');
  expect(xml).toContain('secret|&lt;&amp;&gt;');
  expect(xml).not.toContain('[x]');
  expect([...docx.keys()].some((name) => name.startsWith('word/media/'))).toBe(true);
  expect(docx.get('word/_rels/document.xml.rels')!.toString()).not.toContain('javascript:');
  const html = renderHtml(markdown, images);
  expect(html).toContain('data:image/png;base64,');
  expect(html).toContain('&lt;script&gt;');
  expect(html).not.toContain('<script>');
  expect(html).not.toMatch(/src=["']https:/);
  expect(html).not.toMatch(/href=["']javascript:/);
  expect(html).not.toContain('workbench-asset:');
});
