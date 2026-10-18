export type SecretKind = 'password' | 'token' | 'privateKey';
export type VaultStatus = { initialized: boolean; unlocked: boolean };
export const secretLabels: Record<SecretKind, string> = {
  password: '密码',
  token: 'Token',
  privateKey: '私钥',
};
export type AccountCopyTarget = {
  environmentId?: string;
  resourceId?: string | null;
  name?: string;
};
export type ResourceCopyTarget = { environmentId?: string; name?: string };
