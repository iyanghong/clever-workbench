import type { ComponentType } from 'react';
import {
  TrayIcon,
  ChartBarHorizontalIcon,
  ArchiveIcon,
  TrashIcon,
  GearSixIcon,
  StackIcon,
  type Icon,
} from '@phosphor-icons/react';
import { TaskWorkspace, type TaskView } from '../features/tasks/TaskWorkspace';
import { LedgerPage } from '../features/ledger/LedgerPage';

export type Route = { module: string; project?: string; objectId?: string };
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
};

function TaskModule({ route, navigate, registerFlush }: ModuleProps) {
  return (
    <TaskWorkspace
      initialView={route.module as TaskView}
      initialProject={route.project}
      initialTaskId={route.objectId}
      registerFlush={registerFlush}
      onNavigate={(module, project) => navigate({ module, project })}
    />
  );
}

export const modules: WorkbenchModule[] = [
  { id: 'ledger', title: '台账', icon: StackIcon, section: 'workspace', Page: LedgerPage },
  {
    id: 'tasks',
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
