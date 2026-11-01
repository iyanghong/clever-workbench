// 由 scripts/generate-tools.mjs 生成，请勿手动修改。
import { lazy, type ComponentType } from 'react';
import { ArchiveIcon, BracketsCurlyIcon, ClockIcon, GitDiffIcon, TableIcon, TextTIcon, type Icon } from '@phosphor-icons/react';
import { toolCatalog, type ToolId, type ToolPageProps } from '../../tool-types';
const configDiffPage = lazy(() => import('../../../tools/config-diff/renderer/index.tsx'));
const dataFormatPage = lazy(() => import('../../../tools/data-format/renderer/index.tsx'));
const tableDataPage = lazy(() => import('../../../tools/table-data/renderer/index.tsx'));
const textTransformPage = lazy(() => import('../../../tools/text-transform/renderer/index.tsx'));
const timeCronPage = lazy(() => import('../../../tools/time-cron/renderer/index.tsx'));
const zipTextPage = lazy(() => import('../../../tools/zip-text/renderer/index.tsx'));
const views: Record<ToolId, { Icon: Icon; Page: ComponentType<ToolPageProps> }> = {
  'config-diff': { Icon: GitDiffIcon, Page: configDiffPage },
  'data-format': { Icon: BracketsCurlyIcon, Page: dataFormatPage },
  'table-data': { Icon: TableIcon, Page: tableDataPage },
  'text-transform': { Icon: TextTIcon, Page: textTransformPage },
  'time-cron': { Icon: ClockIcon, Page: timeCronPage },
  'zip-text': { Icon: ArchiveIcon, Page: zipTextPage },
};
export const registeredTools = toolCatalog.map((tool) => ({ ...tool, ...views[tool.id] }));
export function findTool(id: string) {
  return registeredTools.find((tool) => tool.id === id);
}
