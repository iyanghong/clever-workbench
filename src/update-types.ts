export interface UpdateAsset {
  name: string;
  url: string;
  size: number;
}
export interface UpdateRelease {
  version: string;
  publishedAt: string;
  notes: string;
  pageUrl: string;
  zip: UpdateAsset;
  checksums: UpdateAsset;
}
export type UpdateStatus =
  | 'idle'
  | 'unsupported'
  | 'checking'
  | 'up-to-date'
  | 'no-release'
  | 'incompatible'
  | 'available'
  | 'error';
export interface UpdateSnapshot {
  status: UpdateStatus;
  currentVersion: string;
  release?: UpdateRelease;
  message?: string;
  checkedAt?: string;
  retryAt?: string;
}
