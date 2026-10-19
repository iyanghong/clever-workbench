import type { Vault } from './vault';
import type { SecretKind } from '../src/vault-types';
type Clipboard = {
  readText: () => Promise<string>;
  writeText: (value: string) => Promise<void>;
  clear: () => void;
};
export class SecretClipboard {
  private owned: string | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private generation = 0;
  private queue: Promise<void> = Promise.resolve();
  constructor(
    private vault: Vault,
    private clipboard: Clipboard,
  ) {}
  private enqueue(operation: () => Promise<void>) {
    const job = this.queue.catch(() => {}).then(operation);
    this.queue = job.catch(() => {});
    return job;
  }
  private stopTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }
  private async clearIf(value: string | null) {
    if (value !== null && (await this.clipboard.readText()) === value) this.clipboard.clear();
  }
  copy(accountId: string, kind: SecretKind) {
    return this.copyProtected(() => ({ value: this.vault.read(accountId, kind), sensitive: true }));
  }
  copyAccount(accountId: string) {
    return this.copyProtected(() => this.vault.accountText(accountId));
  }
  copyPrepared(read: () => { value: string; sensitive: boolean }) {
    return this.copyProtected(read, false);
  }
  private copyProtected(read: () => { value: string; sensitive: boolean }, expirePlain = true) {
    const generation = this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation) throw new Error('复制已取消，请重新解锁。');
      const { value, sensitive } = read();
      await this.clipboard.writeText(value);
      if (generation !== this.generation || (sensitive && !this.vault.status().unlocked)) {
        await this.clearIf(value);
        throw new Error('秘密已锁定，复制已取消。');
      }
      this.stopTimer();
      this.owned = sensitive || expirePlain ? value : null;
      if (sensitive || expirePlain) {
        this.timer = setTimeout(() => void this.clearOwned(), 30_000);
        this.timer.unref?.();
      }
    });
  }
  copyText(value: string) {
    this.generation++;
    this.stopTimer();
    this.owned = null;
    return this.enqueue(() => this.clipboard.writeText(value));
  }
  clearOwned() {
    this.generation++;
    this.stopTimer();
    return this.enqueue(async () => {
      const value = this.owned;
      this.owned = null;
      try {
        await this.clearIf(value);
      } catch {
        /* Desktop session may have ended. */
      }
    });
  }
}
