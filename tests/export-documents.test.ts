import { expect, test } from 'vitest';
import yauzl from 'yauzl';
import { renderDocx, renderHtml } from '../electron/export-documents';
import { portableMarkdown, exportImageNames } from '../electron/export-markdown';
import { marked } from 'marked';
import { restorePdfLinks } from '../electron/export-pdf-links';

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

test('资料包链接按受控清单输出，正文中的其他本地链接仍不开放', async () => {
  const source = '文档/001-guide.md',
    target = '文档/001-guide.docx';
  const markdown = `[操作手册](${source}) [本机文件](file:///etc/passwd) [未知相对路径](../secret.txt)`;
  const links = new Map([[source, target]]);
  const html = renderHtml(markdown, new Map(), links);
  expect(html).toContain(`href="${target}"`);
  expect(html).not.toContain('href="file:');
  expect(html).not.toContain('href="../secret.txt');
  const word = await entries(await renderDocx(markdown, new Map(), links));
  const rels = word.get('word/_rels/document.xml.rels')!.toString();
  expect(rels).toContain(target);
  expect(rels).not.toContain('/etc/passwd');
  const placeholder = `https://workbench-export.invalid/${'x'.repeat(1024)}`;
  const bytes = Buffer.from(
    `%PDF-1.7\n/A <</Type /Action\n/S /URI\n/URI (${placeholder})>>\nendobj\nxref`,
    'latin1',
  );
  const patched = restorePdfLinks(bytes, new Map([[placeholder, '文档/001-操作手册.pdf']]));
  expect(patched.length).toBe(bytes.length);
  expect(patched.indexOf('xref')).toBe(bytes.indexOf('xref'));
  expect(patched.toString('latin1')).toContain('/S /GoToR');
  expect(() => restorePdfLinks(bytes, new Map([[placeholder, '../secret.pdf']]))).toThrow('路径');
  expect(() =>
    restorePdfLinks(Buffer.from('changed-output'), new Map([[placeholder, '文档/guide.pdf']])),
  ).toThrow('链接未生成');
});

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

test('Word 行内代码保留实体字面值，与 Markdown 和 PDF 一致', async () => {
  const markdown = '正文 &copy;，代码 `&copy;`、`&amp;` 和 `&lt;tag&gt;`。';
  const xml = (await entries(await renderDocx(markdown, new Map())))
    .get('word/document.xml')!
    .toString();
  expect(xml).toContain('&amp;copy;');
  expect(xml).toContain('&amp;amp;');
  expect(xml).toContain('&amp;lt;tag&amp;gt;');
});

test('便携 Markdown 保留代码、引用、嵌套清单和表格的阅读语义', () => {
  const markdown =
    '# 标题\n\n正文 **粗体**、*强调*、~~删除~~和 `&copy;`。\n\n> 引用\n>\n> 第二段\n\n3. 第三项\n4. 第四项\n   - 嵌套一\n   - 嵌套二\n\n- [x] 完成\n- [ ] 待办\n\n| A | B |\n| :--- | ---: |\n| a\\|b | `x\\|y` |\n\n```sh\nprintf "<tag> &copy;"\n```\n\n[平台][ref]\n\n[ref]: https://example.test "入口"';
  expect(marked.parse(portableMarkdown(markdown, '图片/'))).toBe(marked.parse(markdown));
  expect(exportImageNames('`![示例](workbench-asset://image/' + 'a'.repeat(64) + '.png)`')).toEqual(
    new Set(),
  );
});

test('零起点步骤与跨行链接标题保持原值，无法保留的 HTML 明确拒绝', async () => {
  const markdown = '0. 预检\n1. 执行\n\n[平台](https://example.test "第一行\n第二行")';
  expect(marked.parse(portableMarkdown(markdown, '图片/'))).toBe(marked.parse(markdown));
  const xml = (await entries(await renderDocx(markdown, new Map())))
    .get('word/document.xml')!
    .toString();
  expect(xml).toContain('>0. </w:t>');
  expect(() => portableMarkdown('<details><summary>说明</summary>内容</details>', '图片/')).toThrow(
    '原始 HTML',
  );
});

test('合并任务前补齐未闭合代码块，保留供 Word／PDF 处理的 HTML', () => {
  const first = portableMarkdown('```text\n尚未闭合', 'workbench-asset://image/', true);
  const combined = first + '\n\n### 下一项任务\n\n正文';
  expect(marked.parse(combined)).toContain('<h3>下一项任务</h3>');
  const html = '<details><summary>说明</summary>内容</details>';
  expect(portableMarkdown(html, 'workbench-asset://image/', true)).toContain(html);
  expect(() => portableMarkdown(html, '图片/')).toThrow('原始 HTML');
});
