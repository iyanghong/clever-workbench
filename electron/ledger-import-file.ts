import fs from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import ExcelJS from 'exceljs';
import * as yauzl from 'yauzl';
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import type { ImportSource } from '../src/ledger-import-types';
import type { ParsedLedgerFile } from './ledger-import-source';
export { publicImportSources, type ParsedLedgerFile } from './ledger-import-source';

const maxFile = 20 * 1024 ** 2;
const maxExpanded = 64 * 1024 ** 2;
const maxCells = 50_000;
const passwordLabel = /^(?:密码|口令|password|passwd|pwd)(?:[（(].*[）)])?$/i;
const unsupportedLabel =
  /^(?:(?:访问|认证|API|access|auth)[ _-]?)?(?:token|私钥|private[ _-]?key|令牌|密钥|api[_-]?key|access[_-]?key|secret[_-]?key)$/i;
const fieldLabel =
  /^(?:名称|系统|服务器|资源|账号|用户名|用户|密码|口令|地址|IP|环境|端口|用途|角色|备注|说明|url|name|username|password|address|port|environment)$/i;

async function inspectOffice(buffer: Buffer, document: boolean) {
  const zip = await new Promise<yauzl.ZipFile>((resolve, reject) => {
    yauzl.fromBuffer(buffer, { lazyEntries: true, validateEntrySizes: true }, (error, value) => {
      if (error || !value) reject(new Error('Office 文件不是有效的 ZIP 文档，请重新另存。'));
      else resolve(value);
    });
  });
  return new Promise<{ xml: string; relationships: string }>((resolve, reject) => {
    let count = 0,
      expanded = 0,
      xml = '',
      relationships = '';
    const names = new Set<string>();
    const fail = (error: unknown) => {
      zip.close();
      reject(error instanceof Error ? error : new Error('Office 文件无法读取。'));
    };
    zip.on('error', () => fail(new Error('Office 文件内容损坏，请重新另存。')));
    zip.on('entry', (entry: yauzl.Entry) => {
      if (
        ++count > 2000 ||
        entry.uncompressedSize > maxExpanded ||
        path.posix.isAbsolute(entry.fileName) ||
        entry.fileName.includes('\\') ||
        entry.fileName.split('/').includes('..') ||
        names.has(entry.fileName) ||
        entry.generalPurposeBitFlag & 1
      ) {
        fail(new Error('Office 文件包含不支持的加密、路径或过多内容。'));
        return;
      }
      names.add(entry.fileName);
      if (entry.fileName.endsWith('/')) {
        zip.readEntry();
        return;
      }
      zip.openReadStream(entry, (error, stream) => {
        if (error || !stream) {
          fail(new Error('Office 文件内容无法解压。'));
          return;
        }
        const parts: Buffer[] = [];
        stream.on('data', (part: Buffer) => {
          expanded += part.length;
          if (expanded > maxExpanded) {
            stream.destroy();
            fail(new Error('文档解压后超过 64 MB，请拆分文件后重试。'));
          } else if (
            document &&
            ['word/document.xml', 'word/_rels/document.xml.rels'].includes(entry.fileName)
          )
            parts.push(part);
        });
        stream.on('error', () => fail(new Error('Office 文件解压校验失败。')));
        stream.on('end', () => {
          if (parts.length) {
            const value = Buffer.concat(parts).toString('utf8');
            if (entry.fileName === 'word/document.xml') xml = value;
            else relationships = value;
          }
          zip.readEntry();
        });
      });
    });
    zip.on('end', () => {
      if (document && !xml) reject(new Error('文件不含 Word 正文，请选择 .docx 文档。'));
      else resolve({ xml, relationships });
    });
    zip.readEntry();
  });
}

export async function parseLedgerFile(filename: string): Promise<ParsedLedgerFile> {
  const extension = path.extname(filename).toLowerCase();
  if (!['.xlsx', '.docx', '.csv'].includes(extension))
    throw new Error('请选择 .xlsx、.docx 或 .csv 文件。');
  const handle = await fs.open(filename, 'r');
  let buffer: Buffer;
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxFile) throw new Error('请选择 20 MB 以内的普通文件。');
    buffer = Buffer.alloc(stat.size + 1);
    let offset = 0;
    while (offset < buffer.length) {
      const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset);
      if (!bytesRead) break;
      offset += bytesRead;
    }
    if (offset > stat.size) throw new Error('文件在读取时发生变化，请重新选择。');
    buffer = buffer.subarray(0, offset);
  } finally {
    await handle.close();
  }
  const file: ParsedLedgerFile = {
    filename: path.basename(filename),
    sources: [],
    blocks: [],
    warnings: [],
  };
  const add = (text: string, location: string) => {
    if (file.sources.length >= maxCells || text.length > 12_000)
      throw new Error('文档内容过多或单项过长，请拆分后重试。');
    const id = `s${file.sources.length + 1}`;
    file.sources.push({ id, location, text });
    return id;
  };
  const addLink = (target: string, parentId: string, location: string) => {
    add(target, `${location}（超链接）`);
    Object.assign(file.sources.at(-1)!, { parentId, origin: 'hyperlink' });
  };
  if (extension === '.docx') {
    const { xml, relationships } = await inspectOffice(buffer, true);
    if (
      [xml, relationships].some(
        (value) =>
          value && (/<!DOCTYPE|<!ENTITY/i.test(value) || XMLValidator.validate(value) !== true),
      )
    )
      throw new Error('Word XML 格式无效或包含不支持的实体声明。');
    const relations = relationships
      ? (new XMLParser({
          ignoreAttributes: false,
          attributeNamePrefix: '',
          isArray: (name) => name === 'Relationship',
        }).parse(relationships).Relationships?.Relationship ?? [])
      : [];
    const links = new Map<string, string>(
      relations
        .filter(
          (relation: any) =>
            typeof relation.Target === 'string' &&
            typeof relation.Type === 'string' &&
            relation.Type.endsWith('/hyperlink'),
        )
        .map((relation: any) => [relation.Id, relation.Target]),
    );
    const document = new XMLParser({
      preserveOrder: true,
      ignoreAttributes: false,
      parseTagValue: false,
      trimValues: false,
    }).parse(xml);
    const children = (nodes: any[], tag: string): any[] =>
      nodes.flatMap((node) => node[`w:${tag}`] ?? []);
    const text = (nodes: any[]): string =>
      nodes
        .map((node) => {
          if (node['w:tab']) return '\t';
          if (node['w:br'] || node['w:cr']) return '\n';
          if (node['#text'] !== undefined) return String(node['#text']);
          return Object.entries(node)
            .filter(([key]) => key !== ':@')
            .map(([, value]) => (Array.isArray(value) ? text(value) : ''))
            .join('');
        })
        .join('');
    const addWord = (nodes: any[], location: string) => {
      const id = add(text(nodes).trim(), location);
      const visit = (items: any[]) => {
        for (const item of items) {
          const target = item['w:hyperlink'] && links.get(item[':@']?.['@_r:id']);
          if (target) addLink(target, id, location);
          for (const [key, value] of Object.entries(item))
            if (key !== ':@' && Array.isArray(value)) visit(value);
        }
      };
      visit(nodes);
      return id;
    };
    const body = children(children(document, 'document'), 'body');
    let paragraph = 0,
      table = 0;
    let headingId: string | undefined;
    for (const node of body) {
      if (node['w:p']) {
        const value = text(node['w:p']);
        if (value.trim()) {
          const location = `第 ${++paragraph} 段`;
          const id = addWord(node['w:p'], location);
          file.blocks.push({ location, rows: [[id]] });
          headingId = value.trim().length <= 80 && /[：:]$/.test(value.trim()) ? id : undefined;
        }
      } else if (node['w:tbl']) {
        const location = `表格 ${++table}`;
        const rows = node['w:tbl']
          .filter((item: any) => item['w:tr'])
          .map((row: any, r: number) =>
            row['w:tr']
              .filter((item: any) => item['w:tc'])
              .map((cell: any, c: number) =>
                addWord(
                  cell['w:tc']
                    .filter((item: any) => item['w:p'])
                    .flatMap((item: any, index: number) => [
                      ...(index ? [{ '#text': '\n' }] : []),
                      ...item['w:p'],
                    ]),
                  `${location}，第 ${r + 1} 行第 ${c + 1} 列`,
                ),
              ),
          );
        if (rows.length) file.blocks.push({ location, rows, headingId });
        headingId = undefined;
      }
    }
    if (/<w:(?:drawing|object|pict)\b/.test(xml))
      file.warnings.push('Word 中的图片、扫描内容及嵌入对象未识别，请检查是否包含台账。');
    if (/<w:(?:vMerge|gridSpan)\b/.test(xml))
      file.warnings.push('Word 表格包含合并单元格，请结合来源核对行列及归属。');
  } else {
    const workbook = new ExcelJS.Workbook();
    if (extension === '.xlsx') {
      await inspectOffice(buffer, false);
      try {
        await workbook.xlsx.load(buffer as never);
      } catch {
        throw new Error('Excel 文件无法解析，可能已加密或损坏，请另存为 .xlsx 后重试。');
      }
    } else {
      let value: string;
      try {
        value = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
      } catch {
        value = new TextDecoder('gb18030', { fatal: true }).decode(buffer);
        file.warnings.push('CSV 已按 GB18030 编码读取，请核对中文内容。');
      }
      const first = value.replace(/^\uFEFF/, '').split(/\r?\n/, 1)[0];
      const delimiter = first.includes('\t')
        ? '\t'
        : first.split(';').length > first.split(',').length
          ? ';'
          : ',';
      try {
        await workbook.csv.read(Readable.from([value]), {
          map: (item) => item,
          parserOptions: { delimiter },
        });
      } catch {
        throw new Error('CSV 引号或行列格式无效，请重新另存。');
      }
    }
    let formula = false,
      merges = false,
      hidden = false;
    for (const sheet of workbook.worksheets) {
      if (sheet.rowCount > 10_000 || sheet.columnCount > 200)
        throw new Error('工作表超过 10000 行或 200 列，请拆分后重试。');
      if (sheet.state !== 'visible') {
        hidden = true;
        continue;
      }
      merges ||= Object.keys(sheet.model.merges ?? {}).length > 0;
      const rows: string[][] = [];
      sheet.eachRow((row) => {
        const cells: string[] = [];
        let hasText = false;
        row.eachCell({ includeEmpty: true }, (cell, column) => {
          const value = cell.value;
          let content = cell.text;
          if (
            value &&
            typeof value === 'object' &&
            ('formula' in value || 'sharedFormula' in value)
          ) {
            formula = true;
            content = value.result === undefined ? '' : String(value.result);
          } else if (typeof value === 'number' && /^0+$/.test(cell.numFmt)) {
            content = String(value).padStart(cell.numFmt.length, '0');
          }
          hasText ||= Boolean(content.trim());
          cells[column - 1] = add(content, `${sheet.name}!${cell.address}`);
          if (value && typeof value === 'object' && 'hyperlink' in value && value.hyperlink)
            addLink(value.hyperlink, cells[column - 1], `${sheet.name}!${cell.address}`);
        });
        if (hasText) rows.push(cells);
      });
      if (rows.length) file.blocks.push({ location: sheet.name, rows });
    }
    if (formula)
      file.warnings.push(
        '公式仅读取文件内缓存值，不重算或连接外部工作簿；缺少缓存的内容需人工补充。',
      );
    if (merges) file.warnings.push('工作表包含合并单元格，保留可读值，请核对表头与适用范围。');
    if (hidden)
      file.warnings.push('隐藏工作表未纳入分析，请在源文件中确认是否需要显示后重新导入。');
  }
  if (!file.sources.some((source) => source.text.trim()))
    throw new Error('文件中没有可读取的文字或表格；图片和扫描件暂不支持。');
  const byId = new Map(file.sources.map((source) => [source.id, source]));
  const mark = (id: string | undefined, hidden: ImportSource['hidden']) => {
    const item = id ? byId.get(id) : undefined;
    if (item?.text) item.hidden = hidden;
  };
  for (const block of file.blocks) {
    for (let r = 0; r < block.rows.length; r++) {
      const row = block.rows[r];
      row.forEach((id, column) => {
        const label =
          byId
            .get(id)
            ?.text.trim()
            .replace(/[：:]$/, '') ?? '';
        const hidden = passwordLabel.test(label)
          ? 'password'
          : unsupportedLabel.test(label)
            ? 'unsupported'
            : null;
        if (!hidden) return;
        if (
          column === 0 &&
          row.length === 2 &&
          !fieldLabel.test(byId.get(row[1])?.text.trim() ?? '')
        ) {
          mark(row[1], hidden);
          return;
        }
        if (r === 0 || r === 1)
          for (const next of block.rows.slice(r + 1)) mark(next[column], hidden);
      });
    }
  }
  let privateKey = false;
  for (const source of [...file.sources]) {
    if (/-----BEGIN [^-]*PRIVATE KEY-----/.test(source.text)) privateKey = true;
    if (privateKey) {
      source.hidden = 'unsupported';
      if (/-----END [^-]*PRIVATE KEY-----/.test(source.text)) privateKey = false;
      continue;
    }
    if (source.hidden) continue;
    const pattern =
      /(?:密码|口令|password|passwd|pwd)\s*[：:]\s*(?:[“"]([^”"\r\n]+)[”"]|([^\s，；;,\r\n]+))/gi;
    const replacements: [string, string][] = [];
    for (const match of source.text.matchAll(pattern)) {
      const secret = match[1] ?? match[2];
      const id = add(secret, `${source.location}（密码）`);
      file.sources.at(-1)!.parentId = source.id;
      byId.set(id, file.sources.at(-1)!);
      mark(id, 'password');
      replacements.push([match[0], match[0].replace(secret, `〔密码来源 ${id}〕`)]);
    }
    if (replacements.length) {
      let value = source.text;
      for (const [secret, replacement] of replacements)
        value = value.split(secret).join(replacement);
      source.text = value;
    }
    const unsupported = [
      ...source.text.matchAll(
        /(?:token|api[_-]?key|私钥|令牌|密钥)\s*[：:=]\s*(?:[“"]([^”"\r\n]+)[”"]|([^\s，；;,\r\n]+))/gi,
      ),
      ...source.text.matchAll(/[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:([^\s@]+)@/gi),
      ...source.text.matchAll(
        /[?&](?:password|passwd|pwd|token|access_token|refresh_token|api_key|secret)=([^&#\s]+)/gi,
      ),
    ];
    if (unsupported.length) {
      source.hidden = 'unsupported';
      for (const match of unsupported) {
        const id = add(match[1] ?? match[2], `${source.location}（不支持的凭据）`);
        file.sources.at(-1)!.parentId = source.id;
        byId.set(id, file.sources.at(-1)!);
        mark(id, 'unsupported');
      }
    }
  }
  if (file.sources.some((source) => source.hidden === 'unsupported'))
    file.warnings.push('发现 Token、私钥、密钥或地址内嵌凭据；本次不导入，且不会写入普通备注。');
  if (privateKey)
    file.warnings.push('私钥块缺少结束标记，其后内容未参与识别，请修正原文件后重试。');
  return file;
}
