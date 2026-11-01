// 由 scripts/generate-tools.mjs 生成，请勿手动修改。
import { validatePreferences as validatezipTextPreferences } from '../../tools/zip-text/main/preferences.ts';
export function validateToolPreferences(key: string, value: unknown) {
  validatezipTextPreferences(key, value);
}
