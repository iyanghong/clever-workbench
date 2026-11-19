import type { ImportCandidate } from './ledger-import-types';

// The URL parser accepts bare words and repairs malformed schemes. Only prefix a recognizable host.
export function completeImportUrl(input: string): string {
  const value = input.trim();
  if (!value || /[\\\r\n\t]/.test(value) || /^[a-z][\w+.-]*:\/\//i.test(value)) return value;
  const bare = value.replace(/^\/\//, '');
  const authority = bare.split(/[/?#]/, 1)[0];
  const host = /^(\[[\da-f:.]+\]|[\p{L}\d_-]+(?:\.[\p{L}\d_-]+)*\.?)(?::(\d{1,5}))?$/iu.exec(
    authority,
  );
  if (
    !host ||
    /^(?:https?|javascript|vbscript|data|file|blob|mailto|tel|ftp|sftp|ssh|wss?|about|urn):/i.test(
      bare,
    )
  )
    return value;
  if (
    !host[1].includes('.') &&
    !host[1].startsWith('[') &&
    host[1].toLowerCase() !== 'localhost' &&
    !host[2] &&
    authority === bare &&
    bare === value
  )
    return value;
  const url = 'http://' + bare;
  return URL.canParse(url) ? url : value;
}

export function completeCandidateUrls(row: ImportCandidate): ImportCandidate {
  if (row.kind !== 'access') return row;
  return { ...row, addresses: row.addresses.map((a) => ({ ...a, url: completeImportUrl(a.url) })) };
}

export function importUrlProblem(value: string): string | null {
  const text = completeImportUrl(value);
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
      return '地址仅支持 HTTP(S)，账号密码请放在秘密字段中。';
    if (/^https?:\/\/[^/\\\s]/i.test(text) && !/[\\\r\n\t]/.test(text)) return null;
  } catch {
    /* Incomplete address. */
  }
  return '请填写完整的 HTTP(S) 地址。';
}
