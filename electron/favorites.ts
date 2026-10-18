import type { Favorite } from '../src/home-types';
export function validateFavorites(value: unknown): asserts value is Favorite[] {
  if (!Array.isArray(value) || value.length > 100) throw new Error('常用对象最多支持 100 项。');
  const keys = new Set<string>();
  for (const item of value) {
    if (
      !item ||
      typeof item !== 'object' ||
      !['system', 'account'].includes(item.kind) ||
      typeof item.id !== 'string' ||
      item.id.length > 100
    )
      throw new Error('常用对象格式无效。');
    const key = `${item.kind}:${item.id}`;
    if (keys.has(key)) throw new Error('常用对象重复。');
    keys.add(key);
  }
}
