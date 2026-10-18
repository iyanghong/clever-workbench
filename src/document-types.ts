import type { JSONContent } from '@tiptap/react';
import type { ObjectContext } from './ledger-types';
export type DocumentSummary = ObjectContext & {
  id: string;
  title: string;
  projectId: string | null;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
};
export type DocumentRecord = DocumentSummary & { markdown: string; content: JSONContent };
export type DocumentEdit = ObjectContext & {
  title: string;
  projectId: string | null;
  markdown: string;
  content: JSONContent;
};
export type DocumentCommand =
  | { type: 'document.create'; context?: Partial<ObjectContext>; projectId?: string | null }
  | ({ type: 'document.edit'; id: string } & DocumentEdit)
  | { type: 'document.delete' | 'document.restore' | 'document.purge'; id: string };
