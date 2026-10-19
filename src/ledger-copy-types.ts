export type LedgerCopyKind = 'resource' | 'access' | 'service' | 'node' | 'operation';
export type LedgerCopyRef = { kind: LedgerCopyKind; id: string };
export type LedgerCopySelection = {
  systemId: string;
  environment: string;
  objects: LedgerCopyRef[];
};
export type LedgerCopyRequest = LedgerCopySelection & {
  accountIds: string[];
  includePasswords: boolean;
};
export type LedgerCopyCandidate = {
  id: string;
  name: string;
  username: string;
  ownerId: string;
  ownerName: string;
  hasPassword: boolean;
};
export type LedgerCopyPreview = {
  titles: string[];
  environment: string;
  accounts: LedgerCopyCandidate[];
};
