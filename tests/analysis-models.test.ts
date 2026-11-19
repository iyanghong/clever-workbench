import { test, expect } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { AnalysisModelSettings, compatibleChat } from '../electron/analysis-model-settings';
import { fetchInstaller, prepareOllamaInstaller } from '../electron/ollama-installer';
import { remoteImportFile } from '../electron/ledger-import-source';
import { validLocalModel } from '../src/ledger-import-types';

test('外发文件在普通来源、分组和位置中也遮盖已识别的秘密，原始本机引用保持可用', () => {
  const file = {
    filename: 'key-secret.csv',
    warnings: [],
    blocks: [{ location: 'key-secret', rows: [['s1', 's2']] }],
    sources: [
      { id: 's1', text: 'key-secret', location: '第一行', hidden: 'password' as const },
      { id: 's2', text: '备注 key-secret', location: '分组 key-secret' },
    ],
  };
  const remote = remoteImportFile(file);
  expect(JSON.stringify(remote)).not.toContain('key-secret');
  expect(remote.sources[0].hidden).toBe('password');
  expect(file.sources[0].text).toBe('key-secret');
});
test('自定义标签仅允许本地模型名称', () => {
  expect(validLocalModel('team/ledger-model:q4_K_M')).toBe(true);
  for (const model of [
    'qwen:cloud',
    'qwen:8b-cloud',
    'https://models.invalid/model',
    '../remote:v1',
  ])
    expect(validLocalModel(model)).toBe(false);
});
test('连接测试不依赖结构化输出，传输拒绝重定向且错误不会回显远端数据', async () => {
  const calls: RequestInit[] = [];
  const runtime = compatibleChat('https://example.invalid/v1', 'key', async (_url, init) => {
    calls.push(init!);
    return new Response('remote-secret-error', { status: 400 });
  });
  await expect(runtime.chat('model', [], null, new AbortController().signal)).rejects.toThrow(
    'HTTP 400',
  );
  expect(calls[0]).toMatchObject({ redirect: 'error', credentials: 'omit' });
  expect(JSON.parse(String(calls[0].body))).not.toHaveProperty('response_format');
});
test('损坏的设备配置应在本机提示并关闭远端入口', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-invalid-settings-'));
  try {
    const file = path.join(d, 'model.json');
    await fs.writeFile(file, 'broken');
    const store = new AnalysisModelSettings(
      file,
      {
        isEncryptionAvailable: () => false,
        encryptString: () => Buffer.alloc(0),
        decryptString: () => '',
      },
      fetch,
    );
    expect(store.state()).toMatchObject({
      service: null,
      localModel: 'qwen3:8b',
      warning: expect.any(String),
    });
    expect(() => store.forFile('previous')).toThrow();
  } finally {
    await fs.rm(d, { recursive: true, force: true });
  }
});
test.skipIf(process.platform !== 'darwin' || parseInt(os.release()) < 23)(
  '官方安装包被截断时拒绝打开并清理本次临时文件',
  async () => {
    const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-installer-test-'));
    try {
      await expect(
        prepareOllamaInstaller(
          async () => new Response('truncated'),
          d,
          () => {},
        ),
      ).rejects.toThrow('校验失败');
      expect(await fs.readdir(d)).toEqual([]);
    } finally {
      await fs.rm(d, { recursive: true, force: true });
    }
  },
);

test('同长度的错误官方镜像也必须通过 SHA-256 校验', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-hash-test-'));
  try {
    await expect(
      fetchInstaller(
        async () => new Response('bad'),
        path.join(d, 'sample.dmg'),
        { url: 'https://example.invalid/release', size: 3, sha256: '0'.repeat(64) },
        () => {},
      ),
    ).rejects.toThrow('校验失败');
  } finally {
    await fs.rm(d, { recursive: true, force: true });
  }
});
