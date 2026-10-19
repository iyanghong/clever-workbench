import { lazy, type ComponentType } from 'react';
import { ArchiveIcon, type Icon } from '@phosphor-icons/react';
import { toolCatalog, type ToolId } from '../../tool-types';
import type { ModuleProps } from '../../app/modules';
export type ToolPageProps = Pick<ModuleProps, 'registerFlush'>;
const views: Record<ToolId, { Icon: Icon; Page: ComponentType<ToolPageProps> }> = {
  'zip-text': {
    Icon: ArchiveIcon,
    Page: lazy(() => import('./ZipTextPage').then((module) => ({ default: module.ZipTextPage }))),
  },
};
export const registeredTools = toolCatalog.map((tool) => ({ ...tool, ...views[tool.id] }));
export function findTool(id: string) {
  return registeredTools.find((tool) => tool.id === id);
}
