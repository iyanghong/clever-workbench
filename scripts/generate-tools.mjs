import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const projectRoot = path.resolve(import.meta.dirname, '..');

async function exists(filename) {
  return fs
    .stat(filename)
    .then((stat) => stat.isFile())
    .catch(() => false);
}

function text(value, field, directory, optional = false) {
  if (optional && value === undefined) return null;
  if (typeof value !== 'string' || !value.trim())
    throw new Error(`${directory}/manifest.ts 的 ${field} 必须是非空字符串。`);
  return value;
}

export async function discoverTools(root = projectRoot) {
  const directory = path.join(root, 'tools');
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const tools = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const toolDirectory = path.join(directory, entry.name);
    const relativeDirectory = path.relative(root, toolDirectory).split(path.sep).join('/');
    const manifestPath = path.join(toolDirectory, 'manifest.ts');
    if (!(await exists(manifestPath)))
      throw new Error(`${relativeDirectory} 缺少 manifest.ts。`);
    const { manifest } = await import(pathToFileURL(manifestPath).href);
    if (!manifest || typeof manifest !== 'object')
      throw new Error(`${relativeDirectory}/manifest.ts 必须导出 manifest。`);
    const id = text(manifest.id, 'id', relativeDirectory);
    if (id !== entry.name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id))
      throw new Error(`${relativeDirectory}/manifest.ts 的 id 必须与目录名一致，并使用小写连字符格式。`);
    const renderer = path.join(toolDirectory, 'renderer', 'index.tsx');
    const contract = path.join(toolDirectory, 'contract.ts');
    const controller = path.join(toolDirectory, 'main', 'controller.ts');
    const worker = path.join(toolDirectory, 'main', 'worker.ts');
    const preferences = path.join(toolDirectory, 'main', 'preferences.ts');
    if (!(await exists(renderer)))
      throw new Error(`${relativeDirectory} 缺少 renderer/index.tsx。`);
    if (!(await exists(contract))) throw new Error(`${relativeDirectory} 缺少 contract.ts。`);
    const hasController = await exists(controller);
    if ((await exists(worker)) && !hasController)
      throw new Error(`${relativeDirectory} 的 worker 必须配套 main/controller.ts。`);
    if ((await exists(preferences)) && !hasController)
      throw new Error(`${relativeDirectory} 的偏好校验必须配套 main/controller.ts。`);
    const icon = text(manifest.icon, 'icon', relativeDirectory);
    if (!/^[A-Za-z_$][\w$]*$/.test(icon))
      throw new Error(`${relativeDirectory}/manifest.ts 的 icon 必须是有效的图标导出名称。`);
    const guidance = text(manifest.guidance, 'guidance', relativeDirectory, true);
    if (guidance && !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(guidance))
      throw new Error(`${relativeDirectory}/manifest.ts 的 guidance 必须使用小写连字符格式。`);
    tools.push({
      id,
      title: text(manifest.title, 'title', relativeDirectory),
      description: text(manifest.description, 'description', relativeDirectory),
      icon,
      guidance,
      directory: toolDirectory,
      renderer,
      contract,
      controller: hasController ? controller : null,
      worker: (await exists(worker)) ? worker : null,
      preferences: (await exists(preferences)) ? preferences : null,
    });
  }
  const unique = (field) => {
    const seen = new Map();
    for (const tool of tools) {
      const value = tool[field];
      if (!value) continue;
      if (seen.has(value))
        throw new Error(`工具 ${seen.get(value)} 与 ${tool.id} 的 ${field} 重复：${value}。`);
      seen.set(value, tool.id);
    }
  };
  unique('id');
  unique('guidance');
  return tools;
}

function importer(from, target) {
  const value = path.relative(path.dirname(from), target).split(path.sep).join('/');
  return value.startsWith('.') ? value : `./${value}`;
}

function identifier(id) {
  return id.replace(/-([a-z0-9])/g, (_, character) => character.toUpperCase());
}

async function writeGenerated(filename, content) {
  const source = `// 由 scripts/generate-tools.mjs 生成，请勿手动修改。\n${content}`;
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const current = await fs.readFile(filename, 'utf8').catch(() => null);
  if (current !== source) await fs.writeFile(filename, source);
}

export async function generateToolRegistries(root = projectRoot) {
  const tools = await discoverTools(root);
  const catalogFile = path.join(root, 'src', 'tool-registry.generated.ts');
  const rendererFile = path.join(root, 'src', 'features', 'tools', 'registry.generated.tsx');
  const mainFile = path.join(root, 'electron', 'tools', 'registry.generated.ts');
  const preferencesFile = path.join(root, 'electron', 'tools', 'preferences.generated.ts');

  const contracts = tools.filter((tool) => tool.controller);
  const contractImports = contracts.flatMap((tool) => {
    const name = identifier(tool.id);
    return [
      `import type { State as ${name}State } from '${importer(catalogFile, tool.contract)}';`,
      `import type { Command as ${name}Command } from '${importer(catalogFile, tool.contract)}';`,
    ];
  });
  const catalog = tools.map(
    (tool) => `  {
    id: ${JSON.stringify(tool.id)},
    title: ${JSON.stringify(tool.title)},
    description: ${JSON.stringify(tool.description)},
    guidance: ${JSON.stringify(tool.guidance)},
  },`,
  );
  await writeGenerated(
    catalogFile,
    `${contractImports.join('\n')}${contractImports.length ? '\n' : ''}export const toolCatalog = [
${catalog.join('\n')}
] as const;
export interface ToolStates {
${contracts.map((tool) => `  '${tool.id}': ${identifier(tool.id)}State;`).join('\n')}
}
export interface ToolCommands {
${contracts.map((tool) => `  '${tool.id}': ${identifier(tool.id)}Command;`).join('\n')}
}
`,
  );

  const icons = [...new Set(tools.map((tool) => tool.icon))].sort();
  const rendererImports = tools.map((tool) => {
    const name = identifier(tool.id);
    return `const ${name}Page = lazy(() => import('${importer(rendererFile, tool.renderer)}'));`;
  });
  await writeGenerated(
    rendererFile,
    `import { lazy, type ComponentType } from 'react';
${icons.length ? `import { ${icons.join(', ')}, type Icon } from '@phosphor-icons/react';` : "import type { Icon } from '@phosphor-icons/react';"}
import { toolCatalog, type ToolId, type ToolPageProps } from '../../tool-types';
${rendererImports.join('\n')}
const views: Record<ToolId, { Icon: Icon; Page: ComponentType<ToolPageProps> }> = {
${tools.map((tool) => `  '${tool.id}': { Icon: ${tool.icon}, Page: ${identifier(tool.id)}Page },`).join('\n')}
};
export const registeredTools = toolCatalog.map((tool) => ({ ...tool, ...views[tool.id] }));
export function findTool(id: string) {
  return registeredTools.find((tool) => tool.id === id);
}
`,
  );

  const mainImports = tools
    .filter((tool) => tool.controller)
    .map(
      (tool) =>
        `import { Controller as ${identifier(tool.id)}Controller } from '${importer(mainFile, tool.controller)}';`,
    );
  await writeGenerated(
    mainFile,
    `import path from 'node:path';
import type { Store } from '../store';
${mainImports.join('\n')}
export function createToolEntries(store: Store, directory: string) {
  return {
${contracts
  .map((tool) => {
    const args = tool.worker
      ? `store, path.join(directory, 'tools', '${tool.id}', 'worker.cjs')`
      : 'store';
    return `    '${tool.id}': new ${identifier(tool.id)}Controller(${args}),`;
  })
  .join('\n')}
  };
}
`,
  );

  const preferenceTools = tools.filter((tool) => tool.preferences);
  await writeGenerated(
    preferencesFile,
    `${preferenceTools
    .map(
      (tool) =>
        `import { validatePreferences as validate${identifier(tool.id)}Preferences } from '${importer(preferencesFile, tool.preferences)}';`,
    )
    .join('\n')}
export function validateToolPreferences(key: string, value: unknown) {
${preferenceTools.map((tool) => `  validate${identifier(tool.id)}Preferences(key, value);`).join('\n')}
}
`,
  );
  return tools;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateToolRegistries();
}
