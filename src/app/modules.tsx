import type { CreationContext, QuickAction } from './actions';
import { HomePage } from '../features/home/HomePage';
import { QuickTask } from '../features/tasks/QuickTask';
import {
  QuickSystem,
  QuickEnvironment,
  QuickService,
  QuickResource,
  QuickAccount,
} from '../features/ledger/QuickRecord';
import type { SearchKind, SearchHit } from '../search-types';
import { lazy, type ComponentType } from 'react';
import {
  TrayIcon,
  SquaresFourIcon,
  GlobeIcon,
  DatabaseIcon,
  UserCircleIcon,
  GitBranchIcon,
  NotePencilIcon,
  ChartBarHorizontalIcon,
  ArchiveIcon,
  TrashIcon,
  GearSixIcon,
  StackIcon,
  type Icon,
} from '@phosphor-icons/react';
import type { TaskView } from '../features/tasks/TaskWorkspace';
const TaskWorkspace = lazy(() =>
  import('../features/tasks/TaskWorkspace').then((module) => ({ default: module.TaskWorkspace })),
);
const DocumentsPage = lazy(() =>
  import('../features/documents/DocumentsPage').then((module) => ({
    default: module.DocumentsPage,
  })),
);
const LedgerPage = lazy(() =>
  import('../features/ledger/LedgerPage').then((module) => ({ default: module.LedgerPage })),
);
const SettingsPage = lazy(() =>
  import('../features/settings/SettingsPage').then((module) => ({ default: module.SettingsPage })),
);

export type Route = { module: string; project?: string; objectId?: string; trash?: boolean };
export type ModuleProps = {
  route: Route;
  navigate: (route: Route) => Promise<void>;
  /** Publish once the current context is known; this also enables global creation. */
  setContext: (context: CreationContext) => void;
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
  actions?: QuickAction[];
};

function TaskModule({ route, navigate, registerFlush, setContext }: ModuleProps) {
  return (
    <TaskWorkspace
      setContext={setContext}
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
  { id: 'home', title: '工作台', icon: SquaresFourIcon, section: 'workspace', Page: HomePage },
  {
    id: 'ledger',
    title: '台账',
    icon: StackIcon,
    section: 'workspace',
    Page: LedgerPage,
    searchKinds: ['system', 'environment', 'service', 'resource', 'account'],
    actions: [
      {
        id: 'new-system',
        order: 20,
        title: '新系统',
        description: '先记名称，其他资料随时补',
        icon: StackIcon,
        Form: QuickSystem,
      },
      {
        id: 'new-environment',
        order: 50,
        title: '新环境',
        description: '开发、测试、生产等环境',
        icon: GlobeIcon,
        Form: QuickEnvironment,
      },
      {
        id: 'new-resource',
        order: 40,
        title: '新资源',
        description: 'Redis、服务器与其他设施',
        icon: DatabaseIcon,
        Form: QuickResource,
      },
      {
        id: 'new-account',
        order: 30,
        title: '新账号',
        description: '按用途或角色快速记录',
        icon: UserCircleIcon,
        Form: QuickAccount,
      },
      {
        id: 'new-service',
        order: 60,
        title: '新服务',
        description: '公共仓库和各环境部署',
        icon: GitBranchIcon,
        Form: QuickService,
      },
    ],
  },
  {
    id: 'tasks',
    title: '任务',
    accessibleName: '工作任务',
    icon: TrayIcon,
    section: 'workspace',
    Page: TaskModule,
    searchKinds: ['task'],
    actions: [
      {
        id: 'new-task',
        order: 0,
        title: '新任务',
        description: '标题即可，内容稍后补',
        icon: TrayIcon,
        Form: QuickTask,
      },
    ],
  },
  {
    id: 'documents',
    title: '文档',
    icon: NotePencilIcon,
    section: 'workspace',
    Page: DocumentsPage,
    searchKinds: ['document'],
    actions: [
      {
        id: 'new-document',
        order: 10,
        title: '新文档',
        description: '直接开始记录问题与方案',
        icon: NotePencilIcon,
        create: async (context) => {
          const { projectId, ...owner } = context;
          const result = await window.desktop.mutate({
            type: 'document.create',
            context: owner,
            projectId,
          });
          return { module: 'documents', objectId: result.createdId };
        },
      },
    ],
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
  { id: 'settings', title: '设置', icon: GearSixIcon, section: 'utility', Page: SettingsPage },
];

export function routeForHit(hit: Pick<SearchHit, 'kind' | 'id'>): Route {
  const module = modules.find((item) => item.searchKinds?.includes(hit.kind));
  if (!module) throw new Error('此类对象尚未登记入口。');
  return { module: module.id, objectId: hit.id };
}
