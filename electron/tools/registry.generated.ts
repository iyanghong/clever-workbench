// 由 scripts/generate-tools.mjs 生成，请勿手动修改。
import path from 'node:path';
import type { Store } from '../store';
import { Controller as zipTextController } from '../../tools/zip-text/main/controller.ts';
export function createToolEntries(store: Store, directory: string) {
  return {
    'zip-text': new zipTextController(store, path.join(directory, 'tools', 'zip-text', 'worker.cjs')),
  };
}
