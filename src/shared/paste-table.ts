export type PastedTable = { rows: string[][]; warnings: string[] };
export function parseTsv(text: string): PastedTable {
  if (text.length > 2_000_000) throw new Error('表格过大，请分批粘贴。');
  const rows: string[][] = [],
    row: string[] = [];
  let cell = '',
    quoted = false;
  const endCell = () => {
    row.push(cell);
    cell = '';
  };
  const endRow = () => {
    endCell();
    if (row.some((v) => v.trim())) rows.push([...row]);
    row.length = 0;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' && (quoted || cell === '')) {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === '\t' && !quoted) endCell();
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
    } else cell += c;
  }
  if (cell || row.length) endRow();
  if (rows.length > 201 || rows.some((r) => r.length > 50))
    throw new Error('每次最多 200 条记录、50 列。');
  return {
    rows,
    warnings: [
      ...(quoted ? ['存在未闭合的引号，请校对单元格。'] : []),
      ...(new Set(rows.map((r) => r.length)).size > 1
        ? ['各行列数不同，请确认映射，没有自动补齐合并单元格。']
        : []),
    ],
  };
}
export function parseClipboardTable(plain: string, html: string): PastedTable {
  if (!html) return parseTsv(plain);
  if (html.length > 4_000_000) throw new Error('表格过大，请分批粘贴。');
  const document = new DOMParser().parseFromString(html, 'text/html'),
    tables = [...document.querySelectorAll('table')];
  if (!tables.length) return parseTsv(plain);
  if (tables.length > 1) throw new Error('请一次粘贴一张表格。');
  const cells = [...tables[0].querySelectorAll('td,th')];
  const warnings = cells.some(
    (c) => Number(c.getAttribute('rowspan') ?? 1) > 1 || Number(c.getAttribute('colspan') ?? 1) > 1,
  )
    ? ['包含合并单元格，请校对错位行或跳过；不会自动继承上行内容。']
    : [];
  const rows = [...tables[0].rows]
    .map((row) =>
      [...row.cells].map((cell) => {
        const copy = cell.cloneNode(true) as HTMLElement;
        copy.querySelectorAll('script,style').forEach((e) => e.remove());
        copy.querySelectorAll('br').forEach((e) => e.replaceWith('\n'));
        copy.querySelectorAll('p,div').forEach((e) => e.append('\n'));
        return (copy.textContent ?? '').trim();
      }),
    )
    .filter((r) => r.some((v) => v));
  if (rows.length > 201 || rows.some((r) => r.length > 50))
    throw new Error('每次最多 200 条记录、50 列。');
  if (new Set(rows.map((r) => r.length)).size > 1) warnings.push('各行列数不同，请校对字段映射。');
  return { rows, warnings };
}
