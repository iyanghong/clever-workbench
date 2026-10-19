/** Shared metadata stays independent of React and the desktop runtime. */
export const toolCatalog = [
  {
    id: 'zip-text',
    title: 'ZIP 文本归档',
    description: '将文件加密为文本分片，或从分片还原文件。支持 Git 文件筛选。',
  },
] as const;
export type ToolId = (typeof toolCatalog)[number]['id'];
export type ToolProgress = {
  phase: string;
  processed: number;
  total: number | null;
  filename?: string;
};
export type ZipSettings = { source: string; outputDir: string; partSizeMB: number };
export const defaultZipSettings: ZipSettings = { source: '', outputDir: '', partSizeMB: 50 };
export type TextPart = {
  id: string;
  index: number;
  count: number;
  size: number;
  identity: string;
  preview: string;
  error?: string;
};
export type GitCommit = {
  sha: string;
  timestamp: number;
  author: string;
  email: string;
  subject: string;
};
export type GitFilter = {
  source: string;
  branch: string;
  author: string;
  start: string;
  end: string;
  recentHours: 0 | 24 | 48;
};
export type GitPreview = {
  source: string;
  commits: string[];
  available: string[];
  missing: string[];
  sizes: Record<string, number>;
  bytes: number;
};
export type ZipState = {
  busy: boolean;
  operation: string;
  progress: ToolProgress | null;
  error: string;
  output: string;
  settings: ZipSettings;
  parts: TextPart[];
  partsReady: boolean;
  partsDescription: string;
  branches: { label: string; ref: string }[];
  branch: string;
  commits: GitCommit[];
  preview: GitPreview | null;
};
export type ZipCommand =
  | { type: 'settings'; value: ZipSettings }
  | { type: 'pack'; settings: ZipSettings; password: string; commits?: string[] }
  | { type: 'restore'; settings: ZipSettings; password: string }
  | { type: 'paste.restore'; settings: ZipSettings; password: string }
  | { type: 'paste.capture'; replaceId?: string }
  | { type: 'paste.remove'; id: string }
  | { type: 'paste.clear' }
  | { type: 'git.branches'; source: string }
  | { type: 'git.commits'; filter: GitFilter }
  | { type: 'git.preview'; source: string; commits: string[] };
export interface ToolStates {
  'zip-text': ZipState;
}
export interface ToolCommands {
  'zip-text': ZipCommand;
}
export interface ToolsAPI {
  state<K extends ToolId>(id: K): Promise<ToolStates[K]>;
  command<K extends ToolId>(id: K, command: ToolCommands[K]): Promise<ToolStates[K]>;
  choosePath(kind: 'file' | 'directory' | 'output'): Promise<string | null>;
  openOutput(id: ToolId): Promise<void>;
}
