import { expect, test, vi } from 'vitest';
import type { DesktopAPI } from '../src/types';

const electron = vi.hoisted(() => ({
  api: null as DesktopAPI | null,
  listeners: new Map<string, (...args: any[]) => void>(),
  send: vi.fn(),
}));
vi.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: (_name: string, api: DesktopAPI) => {
      electron.api = api;
    },
  },
  ipcRenderer: {
    invoke: vi.fn(async () => 'test-generation'),
    on: (channel: string, handler: (...args: any[]) => void) =>
      electron.listeners.set(channel, handler),
    removeListener: (channel: string) => electron.listeners.delete(channel),
    send: electron.send,
  },
}));
await import('../electron/preload');

test('页面刚启动尚未注册保存器时，关闭请求等待注册并得到实际保存结果', async () => {
  const incoming = electron.listeners.get('flush');
  expect(incoming).toBeDefined();
  incoming!({}, 'startup-close');
  expect(electron.send).not.toHaveBeenCalled();
  let saved = false;
  const unsubscribe = electron.api!.onFlush(async () => {
    saved = true;
  });
  await vi.waitFor(() =>
    expect(electron.send).toHaveBeenCalledWith('flushed', 'startup-close', null),
  );
  expect(saved).toBe(true);
  unsubscribe();
});
