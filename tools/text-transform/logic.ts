export type TextOperation =
  | 'trim'
  | 'remove-empty'
  | 'dedupe'
  | 'sort-asc'
  | 'sort-desc'
  | 'prefix-suffix'
  | 'columns'
  | 'regex-extract'
  | 'regex-replace'
  | 'join';
export type TextOptions = {
  prefix: string;
  suffix: string;
  delimiter: string;
  columns: string;
  pattern: string;
  flags: string;
  replacement: string;
  separator: string;
};
export const defaultTextOptions: TextOptions = {
  prefix: '',
  suffix: '',
  delimiter: ',',
  columns: '1',
  pattern: '',
  flags: 'g',
  replacement: '',
  separator: ', ',
};

export function transformText(input: string, operation: TextOperation, options: TextOptions) {
  const lines = input.split(/\r?\n/);
  let output: string;
  if (operation === 'trim') output = lines.map((line) => line.trim()).join('\n');
  else if (operation === 'remove-empty') output = lines.filter((line) => line.trim()).join('\n');
  else if (operation === 'dedupe') output = [...new Set(lines)].join('\n');
  else if (operation === 'sort-asc' || operation === 'sort-desc') {
    const sorted = [...lines].sort((a, b) => a.localeCompare(b, 'zh-CN', { numeric: true }));
    output = (operation === 'sort-desc' ? sorted.reverse() : sorted).join('\n');
  } else if (operation === 'prefix-suffix')
    output = lines.map((line) => `${options.prefix}${line}${options.suffix}`).join('\n');
  else if (operation === 'columns') {
    const indexes = options.columns.split(',').map((value) => {
      const index = Number(value.trim());
      if (!Number.isInteger(index) || index < 1) throw new Error('列号应为从 1 开始的整数。');
      return index - 1;
    });
    if (!indexes.length) throw new Error('请至少选择一列。');
    output = lines
      .map((line) => line.split(options.delimiter))
      .map((cells) => indexes.map((index) => cells[index] ?? '').join(options.delimiter))
      .join('\n');
  } else if (operation === 'regex-extract') {
    if (!options.pattern) throw new Error('请输入正则表达式。');
    const flags = options.flags.includes('g') ? options.flags : `${options.flags}g`;
    const expression = new RegExp(options.pattern, flags);
    output = Array.from(input.matchAll(expression), (match) => match[1] ?? match[0]).join('\n');
  } else if (operation === 'regex-replace') {
    if (!options.pattern) throw new Error('请输入正则表达式。');
    output = input.replace(new RegExp(options.pattern, options.flags), options.replacement);
  } else output = lines.join(options.separator);
  return {
    text: output,
    inputLines: lines.length,
    outputLines: output ? output.split(/\r?\n/).length : 0,
    inputCharacters: input.length,
    outputCharacters: output.length,
  };
}
