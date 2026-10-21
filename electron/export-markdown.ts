import { Marked, marked, type Tokens } from 'marked';
import { decodeHTML } from 'entities';

function localImage(href: string) {
  const match = /^workbench-asset:\/\/image\/([a-f0-9]{64}\.(?:png|jpg|webp|gif))$/.exec(href);
  if (!match && href.startsWith('workbench-asset:')) throw new Error('正文图片引用无效。');
  return match?.[1];
}

export function exportImageNames(markdown: string) {
  const names = new Set<string>();
  marked.walkTokens(marked.lexer(markdown), (token) => {
    if (token.type === 'image') {
      const name = localImage(token.href);
      if (name) names.add(name);
    }
  });
  return names;
}

const plain = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/[\\`*_{}\[\]<>#|!]/g, '\\$&');
const titleSuffix = (title: string | null | undefined) =>
  title ? ` "${title.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : '';

// Render Markdown from parsed nodes so a password or code example can never be
// mistaken for an image destination. Reference images become portable inline images.
export function portableMarkdown(
  markdown: string,
  imagePath: string | ((name: string) => string),
  preserveHtml = false,
) {
  const parser = new Marked({ gfm: true, async: false });
  parser.use({
    renderer: {
      space: ({ raw }) => raw,
      def: () => '',
      code: ({ text, lang }) => {
        const fence = '`'.repeat(
          Math.max(3, ...[...text.matchAll(/`+/g)].map((m) => m[0].length + 1)),
        );
        return `${fence}${lang || ''}\n${text}\n${fence}\n\n`;
      },
      heading(token) {
        return `${'#'.repeat(token.depth)} ${this.parser.parseInline(token.tokens)}\n\n`;
      },
      paragraph({ tokens }) {
        return this.parser.parseInline(tokens) + '\n\n';
      },
      text(token) {
        return 'tokens' in token && token.tokens
          ? this.parser.parseInline(token.tokens)
          : token.raw;
      },
      strong({ tokens }) {
        return `**${this.parser.parseInline(tokens)}**`;
      },
      em({ tokens }) {
        return `*${this.parser.parseInline(tokens)}*`;
      },
      del({ tokens }) {
        return `~~${this.parser.parseInline(tokens)}~~`;
      },
      codespan: ({ raw }) => raw,
      br: () => '  \n',
      hr: () => '\n---\n\n',
      html: ({ text }) => {
        if (/^<br\s*\/?\s*>$/i.test(text.trim())) return '<br>';
        if (preserveHtml) return text;
        throw new Error(
          'Markdown 导出无法安全保留原始 HTML，请将其放入代码块，或仅选择 Word／PDF。',
        );
      },
      blockquote({ tokens }) {
        return (
          this.parser
            .parse(tokens)
            .trimEnd()
            .split('\n')
            .map((line) => `> ${line}`)
            .join('\n') + '\n\n'
        );
      },
      list(token) {
        return (
          token.items
            .map((item, i) => {
              const marker = token.ordered
                ? `${Number(token.start === '' ? 1 : token.start) + i}. `
                : '- ';
              const body = item.tokens
                .map((part) => this.parser.parse([part]) + (part.type === 'text' ? '\n' : ''))
                .join('')
                .trimEnd();
              return marker + body.replace(/\n/g, '\n' + ' '.repeat(marker.length));
            })
            .join(token.loose ? '\n\n' : '\n') + '\n\n'
        );
      },
      checkbox: ({ checked }) => (checked ? '[x] ' : '[ ] '),
      table(token) {
        const row = (cells: Tokens.TableCell[]) =>
          '| ' +
          cells
            .map((cell) => this.parser.parseInline(cell.tokens).replace(/\|/g, '\\|'))
            .join(' | ') +
          ' |\n';
        const align = token.align.map((value) =>
          value === 'left'
            ? ':---'
            : value === 'right'
              ? '---:'
              : value === 'center'
                ? ':---:'
                : '---',
        );
        return (
          row(token.header) +
          '| ' +
          align.join(' | ') +
          ' |\n' +
          token.rows.map(row).join('') +
          '\n'
        );
      },
      link({ href, title, tokens }) {
        const label = this.parser.parseInline(tokens);
        return `[${label}](<${href.replace(/</g, '%3C').replace(/>/g, '%3E')}>${titleSuffix(title)})`;
      },
      image({ href, title, text }) {
        const name = localImage(href);
        return name
          ? `![${plain(decodeHTML(text))}](${typeof imagePath === 'string' ? imagePath + name : imagePath(name)}${titleSuffix(title)})`
          : plain(`外部图片：${decodeHTML(text)} ${href}`);
      },
    },
  });
  return parser.parse(markdown) as string;
}
