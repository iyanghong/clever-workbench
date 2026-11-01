export type TableDirection = 'csv-json' | 'json-csv';
export type Delimiter = ',' | '\t' | ';';

export function detectDelimiter(input: string): Delimiter {
  const counts: Record<Delimiter, number> = { ',': 0, '\t': 0, ';': 0 };
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') index++;
      else quoted = !quoted;
    } else if (!quoted && ['\n', '\r'].includes(character)) break;
    else if (!quoted && character in counts) counts[character as Delimiter]++;
  }
  return (Object.entries(counts) as [Delimiter, number][]).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(input: string, delimiter: Delimiter = detectDelimiter(input)) {
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false;
  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        field += '"';
        index++;
      } else if (character === '"') quoted = false;
      else field += character;
    } else if (character === '"' && !field) quoted = true;
    else if (character === delimiter) {
      row.push(field);
      field = '';
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && input[index + 1] === '\n') index++;
      row.push(field);
      if (row.length > 1 || row[0]) rows.push(row);
      row = [];
      field = '';
    } else field += character;
  }
  if (quoted) throw new Error('CSV 存在未闭合的引号。');
  row.push(field);
  if (row.length > 1 || row[0] || !rows.length) rows.push(row);
  const columns = Math.max(...rows.map((cells) => cells.length));
  if (rows.some((cells) => cells.length !== columns))
    throw new Error('CSV 各行列数不一致，请检查分隔符或引号。');
  return rows;
}

function escapeCell(value: unknown, delimiter: Delimiter) {
  if (value === null || value === undefined) return '';
  const text =
    typeof value === 'object' ? JSON.stringify(value) : String(value as string | number | boolean);
  return text.includes('"') || text.includes(delimiter) || /[\r\n]/.test(text)
    ? `"${text.replaceAll('"', '""')}"`
    : text;
}

export function convertTable(
  input: string,
  direction: TableDirection,
  delimiter: Delimiter | 'auto' = 'auto',
  hasHeader = true,
) {
  const actualDelimiter = delimiter === 'auto' ? detectDelimiter(input) : delimiter;
  if (direction === 'csv-json') {
    const rows = parseCsv(input, actualDelimiter);
    let data: unknown[];
    if (hasHeader) {
      if (!rows.length) throw new Error('CSV 缺少表头。');
      const headers = rows[0].map((header, index) => header.trim() || `column_${index + 1}`);
      if (new Set(headers).size !== headers.length) throw new Error('CSV 表头存在重复字段。');
      data = rows
        .slice(1)
        .map((row) => Object.fromEntries(headers.map((header, i) => [header, row[i]])));
    } else data = rows;
    return {
      text: JSON.stringify(data, null, 2),
      rows: hasHeader ? Math.max(0, rows.length - 1) : rows.length,
      columns: rows[0]?.length ?? 0,
    };
  }
  const value = JSON.parse(input) as unknown;
  if (!Array.isArray(value)) throw new Error('JSON 顶层必须是数组。');
  if (!value.length) return { text: '', rows: 0, columns: 0 };
  let rows: unknown[][];
  const arrayRows = value.every((row) => Array.isArray(row));
  if (arrayRows) rows = value as unknown[][];
  else if (value.every((row) => row && typeof row === 'object' && !Array.isArray(row))) {
    const headers = [...new Set(value.flatMap((row) => Object.keys(row as object)))];
    rows = [
      headers,
      ...value.map((row) => headers.map((header) => (row as Record<string, unknown>)[header])),
    ];
  } else throw new Error('JSON 数组应统一使用对象或数组作为每一行。');
  const columns = Math.max(...rows.map((row) => row.length));
  if (rows.some((row) => row.length !== columns)) throw new Error('JSON 各行字段数不一致。');
  return {
    text: rows
      .map((row) => row.map((cell) => escapeCell(cell, actualDelimiter)).join(actualDelimiter))
      .join('\n'),
    rows: arrayRows ? rows.length : Math.max(0, rows.length - 1),
    columns,
  };
}
