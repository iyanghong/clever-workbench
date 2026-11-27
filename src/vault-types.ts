export type SecretKind = 'password' | 'token' | 'privateKey';
export const defaultVaultIdleMinutes = 15;
export const vaultIdleOptions = [5, defaultVaultIdleMinutes, 30, 60, 240, 480] as const;
export type VaultIdleMinutes = (typeof vaultIdleOptions)[number];
export function isVaultIdleMinutes(value: unknown): value is VaultIdleMinutes {
  return vaultIdleOptions.some((minutes) => minutes === value);
}

export type VaultStatus = {
  initialized: boolean;
  unlocked: boolean;
  mode?: 'system' | 'password' | 'unconfigured';
  backupConfigured?: boolean;
};
export const secretLabels: Record<SecretKind, string> = {
  password: '密码',
  token: 'Token',
  privateKey: '私钥',
};
export type AccountCopyTarget = {
  environmentId?: string | null;
  resourceId?: string | null;
  accessId?: string | null;
  name?: string;
};
export type ResourceCopyTarget = {
  systemId?: string;
  environmentId?: string | null;
  name?: string;
};
export type AccessCopyTarget = ResourceCopyTarget;
