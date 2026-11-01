import type { Store } from '../store';
import { createToolEntries } from './registry.generated';
export class Tools {
  private entries;
  constructor(store: Store, directory: string) {
    this.entries = createToolEntries(store, directory);
  }
  get(id: unknown) {
    if (typeof id !== 'string' || !Object.hasOwn(this.entries, id)) throw new Error('工具不存在。');
    return this.entries[id as keyof typeof this.entries];
  }
  get busy() {
    return Object.values(this.entries).some((tool) => tool.busy);
  }
  async dispose() {
    for (const tool of Object.values(this.entries)) await tool.dispose();
  }
}
