import { expect, test } from 'vitest';
import { loadMarkdown, writeMarkdown } from '../src/shared/markdown';

const image = `workbench-asset://image/${'a'.repeat(64)}.png`;
test('表格、代码语言、勾选状态及本地图片在源码往返后保留语义', () => {
  const source = `## 排障方案\n\n**原因**：连接池不足。\n\n| 环境 | 端口 |\n| --- | ---: |\n| 生产 | 6379 |\n| 测试 | 6380 |\n\n\`\`\`sql\nselect 1;\n\`\`\`\n\n- [x] 已定位\n- [ ] 待验证\n  - [ ] 检查日志\n\n![截图](${image})\n`;
  const loaded = loadMarkdown(source);
  expect(loaded.mode).toBe('rich');
  const result = writeMarkdown(loaded.content);
  for (const value of [
    '生产',
    '测试',
    '6379',
    '6380',
    '```sql',
    'select 1;',
    '[x] 已定位',
    '[ ] 待验证',
    '[ ] 检查日志',
    image,
  ])
    expect(result).toContain(value);
  const again = loadMarkdown(result);
  expect(again.mode).toBe('rich');
  expect(writeMarkdown(again.content)).toBe(result);
});

test('普通项与勾选项混合时不会把普通项改成未完成任务', () => {
  const source = '- 普通说明\n- [x] 已处理\n- 普通结论\n';
  const loaded = loadMarkdown(source);
  // A safe rich conversion or an explicit source fallback are both lossless outcomes.
  if (loaded.mode === 'source') expect(loaded.markdown).toBe(source);
  else {
    const output = writeMarkdown(loaded.content);
    expect(output).toContain('- 普通说明');
    expect(output).not.toContain('[ ] 普通');
    expect(output).toContain('[x] 已处理');
  }
});

test.each([
  '<details><summary>原始结构</summary>不可丢失</details>',
  '$$\nE = mc^2\n$$',
  `![外部图片](https://example.test/private.png)`,
  '[危险链接](javascript:alert(1))',
  '正文[^note]\n\n[^note]: 脚注内容',
])('不安全转换保留源码且不生成可执行或外部加载内容：%s', (source) => {
  const loaded = loadMarkdown(source);
  expect(loaded.mode).toBe('source');
  expect(loaded.markdown).toBe(source);
  expect(loaded.reason).toBeTruthy();
  expect(JSON.stringify(loaded.content)).not.toContain('javascript:');
});

test.each(
  [
    [
      {
        type: 'codeBlock',
        attrs: { language: 'sql' },
        content: [{ type: 'text', text: 'select 1;' }],
      },
    ],
    [
      { type: 'paragraph', content: [{ type: 'text', text: '第一段' }] },
      { type: 'paragraph', content: [{ type: 'text', text: '第二段' }] },
    ],
    [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: '第一行' },
          { type: 'hardBreak' },
          { type: 'text', text: '第二行' },
        ],
      },
    ],
  ].map((blocks) => ({ blocks })),
)('富文本表格中无法无损表示的块或换行被拒绝，不序列化成丢失格式的正文', ({ blocks }) => {
  const content = {
    type: 'doc',
    content: [
      {
        type: 'table',
        content: [{ type: 'tableRow', content: [{ type: 'tableCell', content: blocks }] }],
      },
    ],
  };
  expect(() => writeMarkdown(content)).toThrow('表格');
});
