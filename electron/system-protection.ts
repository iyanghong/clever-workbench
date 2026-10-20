import { randomUUID } from 'node:crypto';
import { decode } from './vault-crypto';

export type SystemKeyStore = {
  available(): boolean;
  encrypt(value: string): Buffer;
  decrypt(value: Buffer): string;
};
export type SystemProtection = { version: 1; id: string; key: string };

export function validateSystemProtection(value: unknown): asserts value is SystemProtection {
  const config = value as SystemProtection;
  if (
    !config ||
    config.version !== 1 ||
    typeof config.id !== 'string' ||
    !/^[a-f0-9-]{36}$/.test(config.id)
  )
    throw new Error('系统保护材料无效，请从完整备份恢复。');
  decode(config.key, 4096);
}

function available(system?: SystemKeyStore): asserts system is SystemKeyStore {
  if (!system?.available()) throw new Error('系统加密暂时不可用，请检查钥匙串或系统账户后重试。');
}
export function protectSystemKey(key: Buffer, system?: SystemKeyStore): SystemProtection {
  available(system);
  if (key.length !== 32) throw new Error('资料密钥无效。');
  return {
    version: 1,
    id: randomUUID(),
    key: system.encrypt(key.toString('base64')).toString('base64'),
  };
}
export function recoverSystemKey(config: SystemProtection, system?: SystemKeyStore) {
  available(system);
  validateSystemProtection(config);
  try {
    return decode(system.decrypt(decode(config.key, 4096)), 32, 32);
  } catch {
    throw new Error('无法使用当前系统账户解开凭据，请检查钥匙串或从完整备份恢复。');
  }
}
