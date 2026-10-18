import type { ComponentType } from 'react';
import type { Icon } from '@phosphor-icons/react';
import type { ObjectContext } from '../ledger-types';
import type { Snapshot } from '../types';
import type { Route } from './modules';
export type CreationContext = Partial<ObjectContext> & { projectId?: string | null };
export type CreationProps = {
  snapshot: Snapshot;
  context: CreationContext;
  busy: boolean;
  execute: (operation: () => Promise<Route>) => Promise<void>;
  cancel: () => void;
};
export type QuickAction = {
  id: string;
  order?: number;
  title: string;
  description: string;
  icon: Icon;
} & (
  | { Form: ComponentType<CreationProps>; create?: never }
  | { create: (context: CreationContext, snapshot: Snapshot) => Promise<Route>; Form?: never }
);
