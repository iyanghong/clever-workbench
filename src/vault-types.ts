export type SecretKind = 'password' | 'token' | 'privateKey';
export type VaultStatus = { initialized: boolean; unlocked: boolean };
export const secretLabels: Record<SecretKind, string> = {
  password: '密码',
  token: 'Token',
  privateKey: '私钥',
};
