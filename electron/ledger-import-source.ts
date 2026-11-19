import type { ImportSource } from '../src/ledger-import-types';
import { ledgerColumnAliases } from '../src/ledger-columns';

export type ImportBlock = { location: string; rows: string[][]; headingId?: string };
export type ParsedLedgerFile = {
  filename: string;
  sources: ImportSource[];
  blocks: ImportBlock[];
  warnings: string[];
};

export function importTableRows(file: ParsedLedgerFile) {
  const aliases: Record<string, string> = {
    ...ledgerColumnAliases,
    环境: 'environment',
    适用环境: 'environment',
    部署环境: 'environment',
    连接名称: 'connectionName',
    地址名称: 'addressName',
    账号用途: 'accountName',
    账号角色: 'accountName',
    代码仓库: 'repository',
    运行方式: 'mode',
    部署方式: 'field:部署方式',
    节点数量: 'count',
  };
  const sources = new Map(file.sources.map((source) => [source.id, source]));
  const hyperlinks = new Map(
    file.sources
      .filter((source) => source.origin === 'hyperlink')
      .map((source) => [source.parentId, source]),
  );
  const result = new Map<string, Map<string, ImportSource>>();
  for (const block of file.blocks) {
    const scores = block.rows
      .slice(0, 10)
      .map(
        (row) =>
          row.filter((id) => aliases[sources.get(id)?.text.trim().toLowerCase() ?? '']).length,
      );
    const maximum = Math.max(0, ...scores);
    if (maximum < 2) continue;
    const header = scores.indexOf(maximum);
    const keys = block.rows[header].map(
      (id) => aliases[sources.get(id)?.text.trim().toLowerCase() ?? ''],
    );
    for (const row of block.rows.slice(header + 1)) {
      const values = new Map<string, ImportSource>();
      keys.forEach((key, index) => {
        const source = sources.get(row[index]);
        if (key && source && keys.filter((item) => item === key).length === 1)
          values.set(
            key,
            ['address', 'repository'].includes(key)
              ? (hyperlinks.get(source.id) ?? source)
              : source,
          );
      });
      for (const id of row)
        if (id) {
          result.set(id, values);
          const link = hyperlinks.get(id);
          if (link) result.set(link.id, values);
        }
    }
  }
  return result;
}

export function importSourceField(rows: Map<string, Map<string, ImportSource>>, id: string) {
  return [...(rows.get(id) ?? [])].find(([, source]) => source.id === id)?.[0];
}

export function publicImportSources(
  file: ParsedLedgerFile,
  selected?: ReadonlySet<string>,
): ImportSource[] {
  const secrets = file.sources
    .filter((source) => source.hidden)
    .map((source) => source.text)
    .filter(Boolean);
  const rows = importTableRows(file);
  return file.sources
    .filter((source) => !selected || selected.has(source.id))
    .map((source) => {
      const field = importSourceField(rows, source.id);
      // A public username may equal its password; classify by source rather than equal values.
      const ordinary =
        Boolean(field && !['notes', 'password'].includes(field)) ||
        /^(?:用户名|账号|username)\s*[：:]/i.test(source.text) ||
        source.text.includes('〔密码来源 ');
      return {
        ...source,
        text: source.hidden
          ? source.hidden === 'password'
            ? '〔密码已隐藏〕'
            : '〔此项含本次不支持的秘密内容〕'
          : ordinary
            ? source.text
            : secrets.reduce(
                (value, secret) =>
                  secret.length >= 4 || value === secret
                    ? value.split(secret).join('〔敏感值已隐藏〕')
                    : value,
                source.text,
              ),
      };
    });
}

/** Only file-derived context is eligible for remote extraction. Keep secret references local. */
export function remoteImportFile(file: ParsedLedgerFile): ParsedLedgerFile {
  const secrets = [
    ...new Set(file.sources.filter((s) => s.hidden && s.text).map((s) => s.text)),
  ].sort((a, b) => b.length - a.length);
  const mask = (value: string) =>
    secrets.reduce((text, secret) => text.split(secret).join('〔隐藏〕'), value);
  return {
    ...file,
    warnings: [],
    filename: mask(file.filename),
    blocks: file.blocks.map((block) => ({ ...block, location: mask(block.location) })),
    sources: file.sources.map((s) => ({
      ...s,
      location: mask(s.location),
      text: s.hidden ? '' : mask(s.text),
    })),
  };
}
