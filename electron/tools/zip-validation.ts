import type { ZipSettings } from '../../src/tool-types';
export function validateZipSettings(value: unknown): asserts value is ZipSettings {
  const settings = value as ZipSettings | null;
  if (
    !settings ||
    typeof settings !== 'object' ||
    [settings.source, settings.outputDir].some(
      (v) => typeof v !== 'string' || v.length > 32768 || v.includes('\0'),
    ) ||
    !Number.isInteger(settings.partSizeMB) ||
    settings.partSizeMB < 1 ||
    settings.partSizeMB > 200
  )
    throw new Error('ZIP 文本归档设置无效。');
}
