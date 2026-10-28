const pending = new Set<Promise<unknown>>();
function draft() {
  return document.querySelector<HTMLFormElement>(
    'dialog[open] form[data-new-record][data-dirty="true"]',
  );
}
export function closeNewRecord(close: () => void) {
  const form = draft();
  if (!form) return close();
  form.dispatchEvent(new CustomEvent('record-discard', { bubbles: true, detail: close }));
}
export async function saveNewRecord<T>(save: () => Promise<T>): Promise<T> {
  const form = draft();
  const promise = save();
  pending.add(promise);
  try {
    const result = await promise;
    if (form) form.dataset.dirty = 'false';
    return result;
  } finally {
    pending.delete(promise);
  }
}
export async function requireSavedRecord() {
  await Promise.all([...pending]);
  const form = draft();
  if (form) {
    if (form.getAttribute('aria-busy') === 'true')
      throw new Error('正在保存新增资料，请完成当前操作后重试。');
    form.dispatchEvent(new CustomEvent('record-discard', { bubbles: true }));
    throw new Error('新增资料尚未提交，请先保存或明确放弃，再重试。');
  }
}
