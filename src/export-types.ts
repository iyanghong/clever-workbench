import type { SecretKind } from './vault-types';

export type ExportFormat = 'markdown' | 'docx' | 'pdf';
export const exportFormatLabels: Record<ExportFormat, string> = {
  markdown: 'Markdown',
  docx: 'Word',
  pdf: 'PDF',
};
export type SystemExportOptions = {
  systemId: string;
  formats: ExportFormat[];
  secretKinds: SecretKind[];
};
export type SystemExportResult = { path: string; files: number };
