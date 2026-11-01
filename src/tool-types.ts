import type { ModuleProps } from './app/modules';
import { toolCatalog } from './tool-registry.generated.ts';
import type { ToolCommands, ToolStates } from './tool-registry.generated.ts';

export { toolCatalog };
export type { ToolCommands, ToolStates };
export type ToolId = (typeof toolCatalog)[number]['id'];
export type ToolBackendId = Extract<keyof ToolStates, ToolId>;
export type ToolPageProps = Pick<ModuleProps, 'registerFlush'>;
export type ToolProgress = {
  phase: string;
  processed: number;
  total: number | null;
  filename?: string;
};
export interface ToolsAPI {
  state<K extends ToolBackendId>(id: K): Promise<ToolStates[K]>;
  command<K extends ToolBackendId>(id: K, command: ToolCommands[K]): Promise<ToolStates[K]>;
  choosePath(kind: 'file' | 'directory' | 'output'): Promise<string | null>;
  openOutput(id: ToolBackendId): Promise<void>;
}
