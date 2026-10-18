import { Marked, marked, type Token, type Tokens } from 'marked';
import { decodeHTML } from 'entities';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  ExternalHyperlink,
  ImageRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  WidthType,
  TableLayoutType,
  BorderStyle,
  VerticalAlign,
  type IRunOptions,
  type IParagraphOptions,
  type ParagraphChild,
} from 'docx';

export type ExportImage = { bytes: Buffer; width: number; height: number };
export type ExportImages = Map<string, ExportImage>;
const xml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function safeLink(href: string) {
  try {
    return ['https:', 'http:', 'mailto:'].includes(new URL(href).protocol);
  } catch {
    return false;
  }
}
function imageFor(href: string, images: ExportImages) {
  const image = images.get(href);
  if (href.startsWith('workbench-asset:') && !image) throw new Error('正文引用的图片无法导出。');
  return image;
}
function tableWidths(table: Tokens.Table, total: number) {
  const rows = [table.header, ...table.rows];
  const weights =
    table.header.length === 2 && table.header[0].text === '信息' && table.header[1].text === '内容'
      ? [25, 75]
      : table.header.map((_, i) =>
          Math.min(60, Math.max(8, ...rows.map((row) => Array.from(row[i]?.text ?? '').length))),
        );
  const sum = weights.reduce((a, b) => a + b, 0);
  const widths = weights.map((weight) => Math.floor((total * weight) / sum));
  widths[widths.length - 1] += total - widths.reduce((a, b) => a + b, 0);
  return widths;
}

export function renderHtml(markdown: string, images: ExportImages) {
  const parser = new Marked({ gfm: true, async: false });
  parser.use({
    renderer: {
      html({ text }) {
        return /^<br\s*\/?\s*>$/i.test(text.trim()) ? '<br>' : xml(text);
      },
      image({ href, text }) {
        const image = imageFor(href, images);
        return image
          ? `<img src="data:image/png;base64,${image.bytes.toString('base64')}" alt="${xml(decodeHTML(text))}">`
          : `<span>外部图片：${xml(decodeHTML(text))} ${xml(href)}</span>`;
      },
      link({ href, tokens }) {
        const label = this.parser.parseInline(tokens);
        return safeLink(href) ? `<a href="${xml(href)}">${label}</a>` : label;
      },
      table(token) {
        const columns = tableWidths(token, 100)
          .map((width) => `<col style="width:${width}%">`)
          .join('');
        const row = (cells: Tokens.TableCell[], heading: boolean) =>
          `<tr>${cells
            .map((cell) => {
              const tag = heading ? 'th' : 'td';
              return `<${tag}${cell.align ? ` style="text-align:${cell.align}"` : ''}>${this.parser.parseInline(cell.tokens)}</${tag}>`;
            })
            .join('')}</tr>`;
        return `<table><colgroup>${columns}</colgroup><thead>${row(token.header, true)}</thead><tbody>${token.rows.map((cells) => row(cells, false)).join('')}</tbody></table>`;
      },
    },
  });
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'"><style>
    @page { size: Letter; margin: .8in; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, 'Microsoft YaHei', 'Noto Sans CJK SC', sans-serif; font-size: 11pt; line-height: 1.55; color: #000; overflow-wrap: anywhere; }
    h1,h2,h3,h4,h5,h6 { color: #000; break-after: avoid; line-height: 1.3; }
    h1 { font-size: 23pt; margin: 0 0 20pt; } h2 { font-size: 16pt; margin: 22pt 0 10pt; } h3 { font-size: 13pt; margin: 16pt 0 8pt; }
    p { margin: 0 0 9pt; } a { color: #1455a0; } blockquote { margin: 10pt 0 10pt 18pt; font-style: italic; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10pt; margin: 10pt 0 14pt; }
    th,td { border: 1px solid #d9d9d9; padding: 7pt 9pt; vertical-align: middle; overflow-wrap: anywhere; }
    th { background: #eaf0f8; color: #000; text-align: left; } thead { display: table-header-group; }
    tr { break-inside: avoid; } td p { margin: 0; }
    pre { font: 9.5pt/1.45 'SFMono-Regular', Consolas, monospace; white-space: pre-wrap; overflow-wrap: anywhere; background: #f5f5f5; padding: 10pt; }
    code { font-family: 'SFMono-Regular', Consolas, monospace; } img { display: block; max-width: 100%; max-height: 7.5in; object-fit: contain; margin: 12pt auto; break-inside: avoid; }
    li { margin-bottom: 5pt; } hr { border: 0; border-top: 1px solid #d9d9d9; margin: 14pt 0; }
  </style></head><body>${parser.parse(markdown)}</body></html>`;
}

export async function renderDocx(markdown: string, images: ExportImages) {
  const width = 9936;
  const textRun = (text: string, style: IRunOptions = {}) => new TextRun({ ...style, text });
  function inline(tokens: Token[] = [], style: IRunOptions = {}, maxWidth = 660): ParagraphChild[] {
    return tokens.flatMap((token): ParagraphChild[] => {
      switch (token.type) {
        case 'checkbox':
          return [];
        case 'strong':
          return inline(token.tokens, { ...style, bold: true }, maxWidth);
        case 'em':
          return inline(token.tokens, { ...style, italics: true }, maxWidth);
        case 'del':
          return inline(token.tokens, { ...style, strike: true }, maxWidth);
        case 'codespan':
          return [textRun(token.text, { ...style, font: 'Consolas' })];
        case 'br':
          return [new TextRun({ break: 1 })];
        case 'html':
          return /^<br\s*\/?\s*>$/i.test(token.text.trim())
            ? [new TextRun({ break: 1 })]
            : [textRun(token.text, style)];
        case 'link': {
          const children = inline(token.tokens, style, maxWidth);
          return safeLink(token.href)
            ? [new ExternalHyperlink({ link: token.href, children })]
            : children;
        }
        case 'image': {
          const image = imageFor(token.href, images);
          if (!image) return [textRun(`外部图片：${decodeHTML(token.text)} ${token.href}`, style)];
          const scale = Math.min(1, maxWidth / image.width, 700 / image.height);
          return [
            new ImageRun({
              type: 'png',
              data: image.bytes,
              transformation: {
                width: Math.max(1, Math.round(image.width * scale)),
                height: Math.max(1, Math.round(image.height * scale)),
              },
              altText: {
                name: decodeHTML(token.text),
                title: decodeHTML(token.text),
                description: decodeHTML(token.text),
              },
            }),
          ];
        }
        case 'text':
          return token.tokens
            ? inline(token.tokens, style, maxWidth)
            : [textRun(decodeHTML(token.text), style)];
        case 'escape':
          return [textRun(token.text, style)];
        default:
          return [textRun(decodeHTML('text' in token ? String(token.text) : token.raw), style)];
      }
    });
  }
  function blocks(tokens: Token[] = [], depth = 0, leader = ''): (Paragraph | Table)[] {
    const result: (Paragraph | Table)[] = [];
    const paragraph = (children: ParagraphChild[], options: IParagraphOptions = {}) => {
      result.push(
        new Paragraph({
          children: [...(leader ? [textRun(leader)] : []), ...children],
          spacing: { after: 130, line: 300 },
          wordWrap: true,
          widowControl: true,
          indent: { left: depth * 360, hanging: leader ? 240 : 0 },
          ...options,
        }),
      );
      leader = '';
    };
    for (const token of tokens) {
      switch (token.type) {
        case 'space':
        case 'def':
        case 'checkbox':
          break;
        case 'heading': {
          const headings = [
            HeadingLevel.TITLE,
            HeadingLevel.HEADING_1,
            HeadingLevel.HEADING_2,
            HeadingLevel.HEADING_3,
            HeadingLevel.HEADING_4,
            HeadingLevel.HEADING_5,
          ];
          paragraph(inline(token.tokens), {
            heading: headings[Math.min(token.depth, 6) - 1],
            keepNext: true,
            spacing: { before: token.depth === 1 ? 0 : 220, after: 150 },
          });
          break;
        }
        case 'paragraph':
        case 'text':
          paragraph(token.tokens ? inline(token.tokens) : [textRun(decodeHTML(token.text))]);
          break;
        case 'code':
          for (const line of token.text.split('\n'))
            paragraph([textRun(line || ' ', { font: 'Consolas', size: 19 })], {
              spacing: { after: 0, line: 260 },
            });
          paragraph([], { spacing: { after: 100 } });
          break;
        case 'blockquote':
          result.push(...blocks(token.tokens, depth + 1));
          break;
        case 'list': {
          const list = token as Tokens.List;
          list.items.forEach((item, index) => {
            const marker = item.task
              ? item.checked
                ? '☑ '
                : '☐ '
              : list.ordered
                ? `${Number(list.start === '' ? 1 : list.start) + index}. `
                : '• ';
            result.push(...blocks(item.tokens, depth + 1, marker));
          });
          break;
        }
        case 'table': {
          const table = token as Tokens.Table;
          const rows = [table.header, ...table.rows];
          const columns = tableWidths(table, width);
          const border = { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' };
          result.push(
            new Table({
              width: { size: width, type: WidthType.DXA },
              columnWidths: columns,
              layout: TableLayoutType.FIXED,
              borders: {
                top: border,
                bottom: border,
                left: border,
                right: border,
                insideHorizontal: border,
                insideVertical: border,
              },
              rows: rows.map(
                (row, index) =>
                  new TableRow({
                    tableHeader: index === 0,
                    children: row.map(
                      (cell, column) =>
                        new TableCell({
                          width: { size: columns[column], type: WidthType.DXA },
                          margins: { top: 100, bottom: 100, left: 120, right: 120 },
                          verticalAlign: VerticalAlign.CENTER,
                          shading: index === 0 ? { fill: 'EAF0F8' } : undefined,
                          children: [
                            new Paragraph({
                              children: inline(
                                cell.tokens,
                                { size: 20, bold: index === 0, color: '000000' },
                                columns[column] / 15 - 16,
                              ),
                              wordWrap: true,
                              spacing: { after: 0, line: 260 },
                            }),
                          ],
                        }),
                    ),
                  }),
              ),
            }),
          );
          paragraph([], { spacing: { after: 100 } });
          break;
        }
        case 'html':
          paragraph([textRun(token.text)]);
          break;
        case 'hr':
          paragraph([], {
            border: { bottom: { color: 'D9D9D9', style: BorderStyle.SINGLE, size: 4 } },
          });
          break;
        default:
          paragraph([textRun(token.raw)]);
      }
    }
    return result;
  }
  const document = new Document({
    creator: 'Clever Workbench',
    styles: {
      default: {
        document: {
          run: {
            font: { ascii: 'Calibri', hAnsi: 'Calibri', eastAsia: '宋体' },
            size: 22,
            color: '000000',
          },
          paragraph: { spacing: { after: 130, line: 300 } },
        },
        title: {
          run: { size: 44, bold: true, color: '000000' },
          paragraph: { spacing: { before: 0, after: 240 } },
        },
        heading1: { run: { size: 32, bold: true, color: '000000' } },
        heading2: { run: { size: 27, bold: true, color: '000000' } },
        heading3: { run: { size: 24, bold: true, color: '000000' } },
        heading4: { run: { size: 22, bold: true, color: '000000' } },
        heading5: { run: { size: 22, bold: true, color: '000000' } },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: 12240, height: 15840 },
            margin: { top: 1152, bottom: 1152, left: 1152, right: 1152 },
          },
        },
        children: blocks(marked.lexer(markdown)),
      },
    ],
  });
  return Packer.toBuffer(document);
}
