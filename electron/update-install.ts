import type { UpdateSnapshot } from '../src/update-types';

export interface PreparedUpdate {
  appPath: string;
  version: string;
  stageDirectory: string;
}
interface InstallationOptions {
  prepared(): PreparedUpdate | undefined;
  preflight?(): Promise<void>;
  status(value: { status: UpdateSnapshot['status']; message?: string }): void;
  eligible(): void;
  flush(): Promise<void>;
  freeze(value: boolean): void;
  idle(): Promise<void>;
  backup(): Promise<string>;
  launch(prepared: PreparedUpdate, backup: string): Promise<void>;
  quit(): void;
}
// Public install operation, with application lifecycle and OS execution at its boundaries.
export class UpdateInstallation {
  private pending?: Promise<void>;
  constructor(private options: InstallationOptions) {}
  get busy() {
    return !!this.pending;
  }
  install(): Promise<void> {
    if (this.pending) return this.pending;
    this.pending = this.run().finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private async run() {
    const prepared = this.options.prepared();
    if (!prepared) throw Error('请先下载并校验更新。');
    try {
      await this.options.preflight?.();
      this.options.eligible();
      this.options.status({ status: 'preparing' });
      // Let already-started imports/protection operations settle while writable,
      // then ask the renderer to persist their final state.
      await this.options.idle();
      await this.options.flush();
      this.options.eligible();
      this.options.freeze(true);
      await this.options.idle();
      const backup = await this.options.backup();
      await this.options.launch(prepared, backup);
      this.options.status({ status: 'installing' });
      this.options.quit();
    } catch (error) {
      this.options.freeze(false);
      this.options.status({
        status: 'ready',
        message: error instanceof Error ? error.message : '更新准备失败。',
      });
      throw error;
    }
  }
}
