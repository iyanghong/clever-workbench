import type { ToolProgress } from '../../src/tool-types';

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
export type State = {
  busy: boolean;
  operation: string;
  progress: ToolProgress | null;
  error: string;
  notice: string;
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
export type Command =
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
export type ZipState = State;
export type ZipCommand = Command;
