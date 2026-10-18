import type { SecretKind } from './vault-types';
export type SearchKind =
  'system' | 'environment' | 'service' | 'resource' | 'account' | 'task' | 'document';
export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  context: string;
  summary: string;
  username?: string;
  secretKinds?: SecretKind[];
};
export const searchKindLabels: Record<SearchKind, string> = {
  system: '系统',
  environment: '环境',
  service: '服务',
  resource: '资源',
  account: '账号',
  task: '任务',
  document: '文档',
};
