import type { SearchKind, SearchHit } from '../search-types';
import type { ComponentType } from 'react';
import {
  TrayIcon,
  NotePencilIcon,
  ChartBarHorizontalIcon,
  ArchiveIcon,
  TrashIcon,
  GearSixIcon,
  StackIcon,
  type Icon,
} from '@phosphor-icons/react';
import { TaskWorkspace, type TaskView } from '../features/tasks/TaskWorkspace';
import { DocumentsPage } from '../features/documents/DocumentsPage';
import { LedgerPage } from '../features/ledger/LedgerPage';

export type Route = { module: string; project?: string; objectId?: string; trash?: boolean };
export type ModuleProps = {
  route: Route;
  navigate: (route: Route) => Promise<void>;
  registerFlush: (save: () => Promise<void>) => () => void;
};
export type WorkbenchModule = {
  id: string;
  title: string;
  accessibleName?: string;
  icon: Icon;
  section: 'workspace' | 'utility';
  Page: ComponentType<ModuleProps>;
  searchKinds?: SearchKind[];
};

function TaskModule({ route, navigate, registerFlush }: ModuleProps) {
  return (
    <TaskWorkspace
      onOpenDocuments={(project, trash) => navigate({ module: 'documents', project, trash })}
      onOpenContext={(id) => navigate({ module: 'ledger', objectId: id })}
      initialView={route.module as TaskView}
      initialProject={route.project}
      initialTaskId={route.objectId}
      registerFlush={registerFlush}
      onNavigate={(module, project) => navigate({ module, project })}
    />
  );
}

export const modules: WorkbenchModule[] = [
  {
    id: 'documents',
    searchKinds: ['document'],
    title: '文档',
    icon: NotePencilIcon,
    section: 'workspace',
    Page: DocumentsPage,
  },
  {
    id: 'ledger',
    searchKinds: ['system', 'environment', 'service', 'resource', 'account'],
    title: '台账',
    icon: StackIcon,
    section: 'workspace',
    Page: LedgerPage,
  },
  {
    id: 'tasks',
    searchKinds: ['task'],
    title: '任务',
    accessibleName: '工作任务',
    icon: TrayIcon,
    section: 'workspace',
    Page: TaskModule,
  },
  {
    id: 'review',
    title: '工作回顾',
    icon: ChartBarHorizontalIcon,
    section: 'workspace',
    Page: TaskModule,
  },
  { id: 'archive', title: '归档项目', icon: ArchiveIcon, section: 'utility', Page: TaskModule },
  { id: 'trash', title: '回收站', icon: TrashIcon, section: 'utility', Page: TaskModule },
  { id: 'settings', title: '设置', icon: GearSixIcon, section: 'utility', Page: TaskModule },
];

export function routeForHit(hit: Pick<SearchHit, 'kind' | 'id'>): Route {
  const module = modules.find((item) => item.searchKinds?.includes(hit.kind));
  if (!module) throw new Error('此类对象尚未登记入口。');
  return { module: module.id, objectId: hit.id };
}
