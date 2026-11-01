import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateToolRegistries } from '../scripts/generate-tools.mjs';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function fixture(id = 'sample-tool', guidance: string | null = 'sample-tool-guide') {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'workbench-tool-registry-'));
  roots.push(root);
  const directory = path.join(root, 'tools', id);
  await fs.mkdir(path.join(directory, 'renderer'), { recursive: true });
  await fs.mkdir(path.join(directory, 'main'), { recursive: true });
  await fs.writeFile(
    path.join(directory, 'manifest.ts'),
    `export const manifest = ${JSON.stringify({
      id,
      title: '示例工具',
      description: '验证自动登记。',
      icon: 'WrenchIcon',
      ...(guidance ? { guidance } : {}),
    })} as const;`,
  );
  await fs.writeFile(
    path.join(directory, 'contract.ts'),
    "export type State = { output: string }; export type Command = { type: 'run' };",
  );
  await fs.writeFile(
    path.join(directory, 'renderer', 'index.tsx'),
    'export default function ToolPage() { return null; }',
  );
  await fs.writeFile(
    path.join(directory, 'main', 'controller.ts'),
    'export class Controller {}',
  );
  await fs.writeFile(path.join(directory, 'main', 'worker.ts'), 'export {};');
  await fs.writeFile(
    path.join(directory, 'main', 'preferences.ts'),
    'export function validatePreferences() {}',
  );
  return root;
}

test('独立工具目录自动生成目录、页面、控制器、worker 和偏好注册', async () => {
  const root = await fixture();
  const tools = await generateToolRegistries(root);
  expect(tools).toHaveLength(1);
  expect(tools[0]).toMatchObject({ id: 'sample-tool', guidance: 'sample-tool-guide' });
  const catalog = await fs.readFile(path.join(root, 'src/tool-registry.generated.ts'), 'utf8');
  const renderer = await fs.readFile(
    path.join(root, 'src/features/tools/registry.generated.tsx'),
    'utf8',
  );
  const main = await fs.readFile(path.join(root, 'electron/tools/registry.generated.ts'), 'utf8');
  const preferences = await fs.readFile(
    path.join(root, 'electron/tools/preferences.generated.ts'),
    'utf8',
  );
  expect(catalog).toContain("'sample-tool': sampleToolState");
  expect(renderer).toContain("import('../../../tools/sample-tool/renderer/index.tsx')");
  expect(main).toContain("path.join(directory, 'tools', 'sample-tool', 'worker.cjs')");
  expect(preferences).toContain('validatesampleToolPreferences(key, value)');
});

test('缺少必需页面或指引冲突时明确拒绝登记', async () => {
  const root = await fixture();
  await fs.rm(path.join(root, 'tools/sample-tool/renderer/index.tsx'));
  await expect(generateToolRegistries(root)).rejects.toThrow('缺少 renderer/index.tsx');

  const other = await fixture('other-tool', 'shared-guide');
  await fs.writeFile(
    path.join(other, 'tools/other-tool/manifest.ts'),
    (await fs.readFile(path.join(other, 'tools/other-tool/manifest.ts'), 'utf8')).replace(
      'shared-guide',
      'other-guide',
    ),
  );
  const second = await fixture('second-tool', 'other-guide');
  for (const file of ['manifest.ts', 'contract.ts', 'renderer/index.tsx', 'main/controller.ts']) {
    const source = path.join(other, 'tools/other-tool', file);
    const target = path.join(second, 'tools/other-tool', file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.copyFile(source, target);
  }
  await expect(generateToolRegistries(second)).rejects.toThrow('guidance 重复');
});
