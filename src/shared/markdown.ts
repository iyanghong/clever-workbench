import { getSchema, type JSONContent } from '@tiptap/core';
import { Marked } from 'marked';
import { MarkdownManager } from '@tiptap/markdown';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';

const lowlight = createLowlight(common);
export function markdownExtensions() {
  return [
    StarterKit.configure({
      codeBlock: false,
      underline: false,
      link: { openOnClick: false, autolink: true },
    }),
    Image.configure({ allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    CodeBlockLowlight.configure({ lowlight }),
    TableKit.configure({ table: { resizable: false } }),
  ];
}
const extensions = markdownExtensions();
const manager = new MarkdownManager({ extensions });
const schema = getSchema(extensions);
const standard = new Marked();
const empty = (): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph' }] });
const known = new Set([
  'checkbox',
  'space',
  'code',
  'heading',
  'table',
  'hr',
  'blockquote',
  'list',
  'list_item',
  'paragraph',
  'text',
  'escape',
  'strong',
  'em',
  'del',
  'codespan',
  'br',
  'link',
  'image',
]);
const localImage = /^workbench-asset:\/\/image\/[a-f0-9]{64}\.(png|jpg|webp|gif)$/;

export type MarkdownBody = {
  markdown: string;
  content: JSONContent;
  mode: 'rich' | 'source';
  reason?: string;
};
function safeTokens(value: unknown): boolean {
  if (!value || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every(safeTokens);
  const token = value as Record<string, unknown>;
  if (typeof token.type === 'string' && !known.has(token.type)) return false;
  if (token.type === 'image' && !localImage.test(String(token.href))) return false;
  if (token.type === 'link' && !/^https?:\/\//i.test(String(token.href))) return false;
  if (token.type === 'code' && /\s/.test(String(token.lang ?? ''))) return false;
  return Object.values(token).every(safeTokens);
}
// Compare rendered semantics, not Markdown punctuation. Nothing here is inserted into a DOM.
// Whitespace between block tags and tight/loose list wrappers can be normalized safely.
export function markdownMeaning(markdown: string) {
  return (standard.parse(markdown, { async: false }) as string)
    .replace(/\r\n/g, '\n')
    .replace(/>\s+</g, '><')
    .replace(/<li><p>/g, '<li>')
    .replace(/<\/p>(<\/li>|<[uo]l>)/g, '$1')
    .replace(/<\/ul><ul>/g, '')
    .trim();
}
export function writeMarkdown(content: JSONContent) {
  schema.nodeFromJSON(content).check();
  if (!supportsMarkdownTables(content))
    throw new Error('表格单元格仅支持单段文字和行内格式，请把代码块、列表和多段内容放在表格外。');
  return manager.serialize(content);
}
export function supportsMarkdownTables(content: JSONContent): boolean {
  if (content.type === 'tableCell' || content.type === 'tableHeader') {
    if ((content.attrs?.colspan ?? 1) !== 1 || (content.attrs?.rowspan ?? 1) !== 1) return false;
    if (content.content?.length !== 1 || content.content[0].type !== 'paragraph') return false;
    if (
      content.content[0].content?.some(
        (node) => node.type !== 'text' || /[\r\n]/.test(node.text ?? ''),
      )
    )
      return false;
  }
  return (content.content ?? []).every(supportsMarkdownTables);
}
export function loadMarkdown(markdown: string): MarkdownBody {
  const fallback = (reason: string): MarkdownBody => ({
    markdown,
    content: empty(),
    mode: 'source',
    reason,
  });
  const reason = markdownSourceReason(markdown);
  if (reason) return fallback(reason);
  try {
    const parsed = manager.parse(markdown);
    const content = parsed.content?.length ? parsed : empty();
    const serialized = writeMarkdown(content);
    if (markdownMeaning(markdown) !== markdownMeaning(serialized))
      return fallback('转换会改变部分内容，已保留源码；可以继续编辑原文。');
    return { markdown, content, mode: 'rich' };
  } catch {
    return fallback('暂时无法安全转换这段正文，已保留源码。');
  }
}

// IR accepts safe GFM, including inline images that the legacy JSON schema cannot represent.
export function markdownSourceReason(markdown: string): string | undefined {
  if (/(^|\n)\s*\$\$|\[\^[^\]]+\]/.test(markdown))
    return '这段正文含有暂不支持的公式或脚注，已保留源码。';
  try {
    if (!safeTokens(standard.lexer(markdown)))
      return '这段正文含有不支持的结构或外部图片，已保留源码。图片请先导入本地。';
  } catch {
    return '暂时无法安全转换这段正文，已保留源码。';
  }
}
