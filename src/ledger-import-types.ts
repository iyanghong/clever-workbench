export const ledgerImportKinds = {
  server: '服务器',
  database: '数据库',
  redis: 'Redis',
  other: '其他资源',
  access: '访问入口',
  service: '服务',
  node: '部署节点',
  account: '账号',
  job: '运行作业',
  backup: '备份策略',
} as const;
export type LedgerImportKind = keyof typeof ledgerImportKinds;
export const ledgerImportFieldKinds: readonly LedgerImportKind[] = [
  'server',
  'database',
  'redis',
  'other',
  'node',
  'job',
  'backup',
];
export type ImportReference = { candidate: string } | { existing: string };
export type ImportAccount = {
  id: string;
  name: string;
  username: string;
  notes: string;
  passwordRef: string | null;
};
export type ImportConnection = {
  id: string;
  label: string;
  address: string;
  port: string;
  role: string;
  server: ImportReference | null;
};
export type ImportCandidate = {
  advice?: ImportAdvice;
  update?: { targetId: string; fields: string[]; environmentOverride?: boolean };
  observed?: string[];
  id: string;
  kind: LedgerImportKind;
  name: string;
  sourceIds: string[];
  environmentNames: string[];
  environmentIds: string[] | null;
  tags: string[];
  address: string;
  port: string;
  notes: string;
  repository: string;
  fields: Record<string, string>;
  accounts: ImportAccount[];
  addresses: { id: string; label: string; url: string }[];
  connections: ImportConnection[];
  service: ImportReference | null;
  server: ImportReference | null;
  owner: ImportReference | null;
  username: string;
  passwordRef: string | null;
  frequency: string;
  status: 'active' | 'inactive' | 'unverified';
  mode: 'fixed' | 'scheduled';
  count: string;
  selected: boolean;
  reviewed: boolean;
  confirmDuplicate: boolean;
  warnings: string[];
};
export type ImportSource = {
  id: string;
  parentId?: string;
  origin?: 'hyperlink';
  location: string;
  text: string;
  hidden?: 'password' | 'unsupported';
};
export type LedgerImportState = {
  id: string;
  systemId: string;
  kind: LedgerImportKind | 'all';
  filename: string;
  phase: 'parsing' | 'ready' | 'analyzing' | 'review' | 'failed' | 'cancelled' | 'complete';
  progress: { completed: number; total: number; message: string };
  analysisLabel?: string;
  sourceCount: number;
  passwordSources: { id: string; location: string }[];
  unmatchedSourceIds: string[];
  candidates: ImportCandidate[];
  warnings: string[];
  error: string | null;
  created: number;
  updated?: number;
};
export const localImportModels = ['qwen3:4b', 'qwen3:8b'] as const;
export type LocalImportModel = string;
export function validLocalModel(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 120 &&
    /^(?:[a-z0-9][a-z0-9_-]*\/)?[a-z0-9][a-z0-9._-]*:[a-z0-9][a-z0-9._-]*$/i.test(value) &&
    !/(?:-|:)cloud(?:$|[-.])/i.test(value)
  );
}
export type RemoteServiceDraft = { name: string; endpoint: string; model: string; apiKey?: string };
export type ModelSettings = {
  warning?: string;
  localModel: string;
  verified: Record<string, string>;
  service: null | {
    name: string;
    endpoint: string;
    model: string;
    revision: string;
    hasKey: boolean;
  };
};
export type RemoteFilePermission = { fileId: string; serviceRevision: string; allow: true };

export type OllamaState = {
  installer?: { phase: 'download' | 'verify'; received: number; total: number };
  phase: 'missing' | 'stopped' | 'starting' | 'ready' | 'downloading' | 'failed';
  version: string | null;
  models: { name: LocalImportModel; size: number; digest?: string }[];
  download: { model: LocalImportModel; completed: number; total: number; message: string } | null;
  error: string | null;
};
export type LocalLedgerImportSnapshot = { runtime: OllamaState; job: LedgerImportState | null };
export type LedgerImportCommit = {
  id: string;
  candidates: ImportCandidate[];
  passwordEdits: Record<string, string>;
};
export interface LocalLedgerImportAPI {
  state(): Promise<LocalLedgerImportSnapshot>;
  sources(id: string, sourceIds: string[]): Promise<ImportSource[]>;
  settings(): Promise<ModelSettings>;
  installOllama(): Promise<void>;
  detectOllama(): Promise<OllamaState>;
  selectModel(model: string): Promise<ModelSettings>;
  testService(draft: RemoteServiceDraft, stage: 'connect' | 'extract'): Promise<void>;
  saveService(draft: RemoteServiceDraft): Promise<ModelSettings>;
  removeService(): Promise<ModelSettings>;
  analyzeRemote(permission: RemoteFilePermission): Promise<LocalLedgerImportSnapshot>;
  startOllama(): Promise<LocalLedgerImportSnapshot>;
  downloadModel(model: LocalImportModel): Promise<LocalLedgerImportSnapshot>;
  cancelDownload(): Promise<LocalLedgerImportSnapshot>;
  chooseFile(input: {
    systemId: string;
    kind: LedgerImportKind | 'all';
  }): Promise<LocalLedgerImportSnapshot | null>;
  analyze(input: { id: string; model: LocalImportModel }): Promise<LocalLedgerImportSnapshot>;
  cancel(id: string): Promise<LocalLedgerImportSnapshot>;
  discard(id: string): Promise<void>;
  commit(input: LedgerImportCommit): Promise<import('./types').MutationResult>;
  onChanged(handler: () => void): () => void;
}

export type ImportAdvice = {
  location: string;
  section: string;
  environmentIds: string[];
  environmentReason: string;
  peerIds: string[];
  modelPeerId?: string;
  modelTargetId?: string;
  existingIds: string[];
  action: 'new' | 'skip' | 'update' | 'append';
  targetId?: string;
  fields: string[];
  evidence: string;
};
