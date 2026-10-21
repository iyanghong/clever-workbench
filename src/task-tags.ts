export const taskTagColors = {
  red: '红色',
  orange: '橙色',
  yellow: '黄色',
  green: '绿色',
  blue: '蓝色',
  purple: '紫色',
  gray: '灰色',
} as const;
export type TaskTagColor = keyof typeof taskTagColors;
export type TaskTag = { id: string; name: string; color: TaskTagColor };
export type TaskTagCommand =
  | { type: 'task-tag.save'; id?: string; name: string; color: TaskTagColor }
  | { type: 'task-tag.delete'; id: string };

export function validateTagIds(value: unknown): asserts value is string[] | undefined {
  if (value === undefined) return;
  if (
    !Array.isArray(value) ||
    value.length > 1000 ||
    value.some((id) => typeof id !== 'string' || !id || id.length > 1000)
  )
    throw new Error('任务标签无效。');
}
