export type DiffMode = 'text' | 'json' | 'env';
export type DiffRow = {
  type: 'same' | 'added' | 'removed';
  left: number | null;
  right: number | null;
  text: string;
};
export type DiffResult = {
  rows: DiffRow[];
  added: number;
  removed: number;
  same: number;
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[\n${value.map((item) => stableJson(item)).join(',\n')}\n]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return `{\n${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',\n')}\n}`;
  }
  return JSON.stringify(value);
}

function normalizeJson(input: string) {
  const value = JSON.parse(input) as unknown;
  return JSON.stringify(JSON.parse(stableJson(value)), null, 2);
}

function normalizeEnv(input: string) {
  const values = new Map<string, string>();
  for (const [index, original] of input.split(/\r?\n/).entries()) {
    const line = original.trim();
    if (!line || line.startsWith('#')) continue;
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*(.*)$/.exec(line);
    if (!match) throw new Error(`.env 第 ${index + 1} 行无法识别，应为 KEY=value。`);
    values.set(match[1], match[2].trim());
  }
  return [...values.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
}

function lines(input: string, mode: DiffMode, ignoreWhitespace: boolean) {
  const normalized =
    mode === 'json' ? normalizeJson(input) : mode === 'env' ? normalizeEnv(input) : input;
  const result = normalized.split(/\r?\n/);
  return ignoreWhitespace && mode === 'text'
    ? result.map((line) => line.trim().replace(/\s+/g, ' '))
    : result;
}

export function compareConfigurations(
  leftInput: string,
  rightInput: string,
  mode: DiffMode,
  ignoreWhitespace = false,
): DiffResult {
  const left = lines(leftInput, mode, ignoreWhitespace);
  const right = lines(rightInput, mode, ignoreWhitespace);
  if (left.length > 1500 || right.length > 1500)
    throw new Error('单次最多对比 1500 行，请先缩小配置范围。');
  const width = right.length + 1;
  const lcs = new Uint32Array((left.length + 1) * width);
  for (let i = left.length - 1; i >= 0; i--)
    for (let j = right.length - 1; j >= 0; j--)
      lcs[i * width + j] =
        left[i] === right[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
  const rows: DiffRow[] = [];
  let i = 0,
    j = 0;
  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      rows.push({ type: 'same', left: ++i, right: ++j, text: left[i - 1] });
    } else if (
      j < right.length &&
      (i === left.length || lcs[i * width + j + 1] >= lcs[(i + 1) * width + j])
    ) {
      rows.push({ type: 'added', left: null, right: ++j, text: right[j - 1] });
    } else {
      rows.push({ type: 'removed', left: ++i, right: null, text: left[i - 1] });
    }
  }
  return {
    rows,
    added: rows.filter((row) => row.type === 'added').length,
    removed: rows.filter((row) => row.type === 'removed').length,
    same: rows.filter((row) => row.type === 'same').length,
  };
}
