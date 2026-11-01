export type JsonOperation = 'format' | 'minify' | 'sort' | 'query' | 'escape' | 'unescape';

function sortRecursively(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortRecursively);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, sortRecursively(item)]),
    );
  return value;
}

function queryPath(value: unknown, path: string) {
  const expression = path.trim() || '$';
  if (!expression.startsWith('$')) throw new Error('JSON 路径必须以 $ 开头。');
  const tokens: (string | number)[] = [];
  let index = 1;
  while (index < expression.length) {
    if (expression[index] === '.') {
      const start = ++index;
      while (index < expression.length && !['.', '['].includes(expression[index])) index++;
      const key = expression.slice(start, index);
      if (!key) throw new Error('JSON 路径包含空字段。');
      tokens.push(key);
    } else if (expression[index] === '[') {
      const end = expression.indexOf(']', index + 1);
      if (end < 0) throw new Error('JSON 路径缺少右中括号。');
      const content = expression.slice(index + 1, end);
      if (/^\d+$/.test(content)) tokens.push(Number(content));
      else if (/^"[^"]*"$/.test(content)) tokens.push(JSON.parse(content) as string);
      else throw new Error('路径下标只支持非负整数或双引号字段。');
      index = end + 1;
    } else throw new Error(`JSON 路径在位置 ${index + 1} 无法识别。`);
  }
  let current = value;
  for (const token of tokens) {
    if (current === null || typeof current !== 'object' || !(token in current))
      throw new Error(`路径中不存在 ${String(token)}。`);
    current = (current as Record<string | number, unknown>)[token];
  }
  return current;
}

export function processJson(input: string, operation: JsonOperation, path = '$', indent = 2) {
  if (operation === 'escape') return JSON.stringify(input);
  if (operation === 'unescape') {
    const value = JSON.parse(input) as unknown;
    if (typeof value !== 'string') throw new Error('取消转义的输入必须是 JSON 字符串。');
    return value;
  }
  const value = JSON.parse(input) as unknown;
  if (operation === 'format') return JSON.stringify(value, null, indent);
  if (operation === 'minify') return JSON.stringify(value);
  if (operation === 'sort') return JSON.stringify(sortRecursively(value), null, indent);
  return JSON.stringify(queryPath(value, path), null, indent);
}
