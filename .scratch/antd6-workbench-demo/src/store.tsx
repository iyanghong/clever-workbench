import { createContext, useContext, type Dispatch, type SetStateAction } from 'react';
import type { DemoData } from './data';

export type DemoContextValue = {
  data: DemoData;
  setData: Dispatch<SetStateAction<DemoData>>;
  parts: string[];
  go: (path: string) => void;
  create: (kind: string, system?: string) => void;
  help: (topic?: string) => void;
  copy: (value: string) => Promise<void>;
  locked: boolean;
  setLocked: (value: boolean) => void;
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
};
export type Preferences = {
  theme: 'light' | 'dark' | 'system';
  compact: boolean;
  contrast: boolean;
  reduceMotion: boolean;
  reduceTransparency: boolean;
};
export const DemoContext = createContext<DemoContextValue | null>(null);
export const useDemo = () => {
  const value = useContext(DemoContext);
  if (!value) throw Error('DemoContext 未就绪');
  return value;
};
