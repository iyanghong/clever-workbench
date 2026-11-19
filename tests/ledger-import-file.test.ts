import { afterEach, expect, test } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import ExcelJS from 'exceljs';
import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  ExternalHyperlink,
  TextRun,
} from 'docx';
import { ZipFile } from 'yazl';
import { parseLedgerFile, publicImportSources } from '../electron/ledger-import-file';
import { importTableRows } from '../electron/ledger-import-source';

const directories: string[] = [];
async function filename(name: string) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cwb-import-file-'));
  directories.push(root);
  return path.join(root, name);
}
afterEach(async () => {
  for (const directory of directories.splice(0))
    await fs.rm(directory, { recursive: true, force: true });
});

test('xlsx keeps worksheets, formatted usernames, cached formula values and passwords outside public sources', async () => {
  const file = await filename('交接.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('生产数据库');
  sheet.addRow(['名称', '地址', '端口', '用户名', '密码']);
  sheet.addRow([
    '业务数据库',
    '192.0.2.10',
    { formula: '5400+32', result: 5432 },
    123,
    'synthetic-p@ss;2026',
  ]);
  sheet.getCell('D2').numFmt = '000000';
  const hidden = workbook.addWorksheet('历史', { state: 'hidden' });
  hidden.addRow(['不应参与分析']);
  await workbook.xlsx.writeFile(file);
  const parsed = await parseLedgerFile(file);
  expect(parsed.blocks).toHaveLength(1);
  expect(parsed.sources.find((item) => item.location === '生产数据库!D2')?.text).toBe('000123');
  expect(parsed.sources.find((item) => item.location === '生产数据库!C2')?.text).toBe('5432');
  expect(parsed.sources.find((item) => item.location === '生产数据库!E2')?.hidden).toBe('password');
  expect(publicImportSources(parsed).find((item) => item.location === '生产数据库!E1')?.text).toBe(
    '密码',
  );
  expect(JSON.stringify(publicImportSources(parsed))).not.toContain('synthetic-p@ss;2026');
  expect(parsed.warnings.join(' ')).toContain('缓存');
  expect(parsed.warnings.join(' ')).toContain('隐藏');
});

test('csv preserves leading zeros and quoted multiline fields, and excludes unsupported secrets', async () => {
  const file = await filename('账号.csv');
  await fs.writeFile(
    file,
    '\uFEFF名称,用户名,密码,备注,Token\r\n业务库,000123,"fixture,!",“说明”,fixture-token\r\n只读库,reader,,"第一行\n第二行",\r\n',
  );
  const parsed = await parseLedgerFile(file);
  expect(parsed.sources.some((item) => item.text === '000123')).toBe(true);
  expect(parsed.sources.some((item) => item.text === '第一行\n第二行')).toBe(true);
  expect(JSON.stringify(publicImportSources(parsed))).not.toContain('fixture,!');
  expect(JSON.stringify(publicImportSources(parsed))).not.toContain('fixture-token');
  expect(parsed.warnings.join(' ')).toContain('Token');
});

test('credentials embedded in connection URLs are excluded from ordinary source previews', async () => {
  const file = await filename('连接.csv');
  await fs.writeFile(
    file,
    '名称,地址,备注\n示例数据库,postgres://operator:synthetic-embedded@192.0.2.20/orders,synthetic-embedded\n',
  );
  const parsed = await parseLedgerFile(file);
  expect(JSON.stringify(publicImportSources(parsed))).not.toContain('synthetic-embedded');
  expect(parsed.warnings.join(' ')).toContain('不导入');
});

test('password query parameters are not ordinary access addresses', async () => {
  const file = await filename('地址查询参数.csv');
  await fs.writeFile(
    file,
    '名称,地址\n示例入口,https://example.invalid/login?password=fixture-query-secret\n',
  );
  const parsed = await parseLedgerFile(file);
  expect(JSON.stringify(publicImportSources(parsed))).not.toContain('fixture-query-secret');
});

test('xlsx preserves hyperlink targets separately from display labels without opening them', async () => {
  const file = await filename('超链接.xlsx');
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('入口');
  sheet.addRow(['名称', '地址']);
  sheet.addRow([
    '示例控制台',
    { text: '打开控制台', hyperlink: 'https://console.example.invalid' },
  ]);
  await workbook.xlsx.writeFile(file);
  const parsed = await parseLedgerFile(file);
  expect(parsed.sources.some((source) => source.text === '打开控制台')).toBe(true);
  expect(parsed.sources.some((source) => source.text === 'https://console.example.invalid')).toBe(
    true,
  );
  const label = parsed.sources.find((source) => source.text === '打开控制台')!;
  expect(importTableRows(parsed).get(label.id)?.get('address')?.text).toBe(
    'https://console.example.invalid',
  );
});

test('docx hyperlink relationships are treated as local metadata rather than fetched resources', async () => {
  const file = await filename('超链接.docx');
  await fs.writeFile(
    file,
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [
                  new TextRun('访问入口：示例控制台；地址：'),
                  new ExternalHyperlink({
                    children: [new TextRun('打开控制台')],
                    link: 'https://console.example.invalid',
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    ),
  );
  const parsed = await parseLedgerFile(file);
  expect(parsed.sources.some((source) => source.text.includes('示例控制台'))).toBe(true);
  expect(parsed.sources.some((source) => source.text === 'https://console.example.invalid')).toBe(
    true,
  );
});

test('private key blocks spanning Word paragraphs stay excluded through the closing marker', async () => {
  const file = await filename('含私钥.docx');
  await fs.writeFile(
    file,
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph('-----BEGIN OPENSSH PRIVATE KEY-----'),
              new Paragraph('synthetic-private-material-base64'),
              new Paragraph('-----END OPENSSH PRIVATE KEY-----'),
              new Paragraph('正常资料：示例服务器 192.0.2.10'),
            ],
          },
        ],
      }),
    ),
  );
  const parsed = await parseLedgerFile(file);
  const preview = JSON.stringify(publicImportSources(parsed));
  expect(preview).not.toContain('synthetic-private-material-base64');
  expect(preview).toContain('正常资料');
});

test('ordinary usernames are preserved when their text equals a separately classified password', async () => {
  const csv = await filename('相同用户名密码.csv');
  await fs.writeFile(csv, '名称,用户名,密码\n示例服务器,shared-login,shared-login\n');
  const table = publicImportSources(await parseLedgerFile(csv));
  expect(table.find((source) => source.location.endsWith('B2'))?.text).toBe('shared-login');
  expect(table.find((source) => source.location.endsWith('C2'))?.text).toBe('〔密码已隐藏〕');
  const word = await filename('同值账号.docx');
  await fs.writeFile(
    word,
    await Packer.toBuffer(
      new Document({
        sections: [{ children: [new Paragraph('用户名：shared-login；密码：“shared-login”。')] }],
      }),
    ),
  );
  const paragraph = publicImportSources(await parseLedgerFile(word)).find(
    (source) => source.location === '第 1 段',
  )!.text;
  expect(paragraph).toContain('用户名：shared-login');
  expect(paragraph).not.toContain('密码：“shared-login”');
});

test('docx keeps paragraphs and table cells and extracts explicit quoted passwords without model rewriting', async () => {
  const file = await filename('维护手册.docx');
  const row = (values: string[]) =>
    new TableRow({
      children: values.map((value) => new TableCell({ children: [new Paragraph(value)] })),
    });
  await fs.writeFile(
    file,
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph('生产环境：数据库运行在 192.0.2.20，密码：“synthetic p@ss!”。'),
              new Table({
                rows: [
                  row(['名称', '用户名', '密码']),
                  row(['管理入口', 'admin', 'table-fixture-secret']),
                ],
              }),
            ],
          },
        ],
      }),
    ),
  );
  const parsed = await parseLedgerFile(file);
  expect(parsed.blocks).toHaveLength(2);
  expect(parsed.sources.some((item) => item.text === '管理入口')).toBe(true);
  expect(
    parsed.sources.filter((item) => item.hidden === 'password').map((item) => item.text),
  ).toEqual(expect.arrayContaining(['synthetic p@ss!', 'table-fixture-secret']));
  expect(JSON.stringify(publicImportSources(parsed))).not.toContain('synthetic p@ss!');
  expect(JSON.stringify(publicImportSources(parsed))).not.toContain('table-fixture-secret');
});

test('untrusted docx entity declarations are rejected before parsing', async () => {
  const file = await filename('无效.docx');
  const zip = new ZipFile();
  zip.addBuffer(
    Buffer.from(
      '<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///etc/passwd">]><w:document><w:body><w:p>&leak;</w:p></w:body></w:document>',
    ),
    'word/document.xml',
  );
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error', reject);
  });
  zip.end();
  await fs.writeFile(file, await finished);
  await expect(parseLedgerFile(file)).rejects.toThrow('实体');
  await expect(parseLedgerFile(await filename('旧版.xls'))).rejects.toThrow('.xlsx');
});

test('Word address lists keep each row, section, original address and matching password when names repeat', async () => {
  const filename1 = await filename('地址清单.docx');
  const row = (cells: string[]) =>
    new TableRow({
      children: cells.map((value) => new TableCell({ children: [new Paragraph(value)] })),
    });
  const children = ['测试环境', '生产环境'].flatMap((section, i) => [
    new Paragraph(section + '：'),
    new Table({
      rows: [
        row(['账号', '系统名称', i ? '地址' : '访问地址', '密码']),
        row([
          '000123',
          '示例门户',
          i ? 'https://two.example.invalid' : 'one.example.invalid/path',
          'fake-secret-' + i,
        ]),
        row(['ops', '样例服务器', '192.0.2.8:22', 'fake-host-' + i]),
      ],
    }),
  ]);
  children.push(new Paragraph('运行作业：合成作业'));
  await fs.writeFile(filename1, await Packer.toBuffer(new Document({ sections: [{ children }] })));
  const parsed = await parseLedgerFile(filename1);
  const { extractLedgerCandidates } = await import('../electron/ledger-import-model');
  const runtime = {
    chat: async (...args: Parameters<import('../electron/local-ollama').LocalOllama['chat']>) => {
      const body = JSON.parse(args[1][1].content);
      expect(JSON.stringify(body)).not.toContain('fake-secret-');
      if (body.rows) {
        expect(JSON.stringify(body)).not.toContain('000123');
        return {
          content: JSON.stringify(
            Object.fromEntries(
              body.rows.map((r: any) => [
                r.id,
                r.scheme === 'https' ? 'other' : r.name === '样例服务器' ? 'server' : 'access',
              ]),
            ),
          ),
          seconds: 0,
          inputTokens: 0,
          outputTokens: 0,
        };
      }
      const job = parsed.sources.find((s) => s.text.includes('合成作业'))!;
      return {
        content: JSON.stringify({
          candidates: [{ key: 'job1', kind: 'job', name: { source: job.id, value: '合成作业' } }],
        }),
        seconds: 0,
        inputTokens: 0,
        outputTokens: 0,
      };
    },
  };
  const extract = (scope: 'all' | 'access') =>
    extractLedgerCandidates(
      runtime,
      'qwen3:8b',
      parsed,
      scope,
      '合成系统',
      new AbortController().signal,
    );
  const all = (await extract('all')).candidates;
  expect(all.map((c) => c.kind).sort()).toEqual(['access', 'access', 'job', 'server', 'server']);
  const filtered = (await extract('access')).candidates;
  expect(
    filtered.map((c) => [
      c.name,
      c.addresses[0]?.url,
      c.accounts[0]?.username,
      parsed.sources.find((s) => s.id === c.accounts[0]?.passwordRef)?.text,
      c.environmentNames,
      c.environmentIds,
    ]),
  ).toEqual([
    ['示例门户', 'http://one.example.invalid/path', '000123', 'fake-secret-0', ['测试环境'], null],
    ['示例门户', 'https://two.example.invalid', '000123', 'fake-secret-1', ['生产环境'], null],
  ]);
  expect(all.find((c) => c.kind === 'server')).toMatchObject({ address: '192.0.2.8', port: '22' });
  const onlyDirectory = { ...parsed, blocks: parsed.blocks.slice(0, -1) };
  const title = { id: 'title', location: '封面', text: '常用地址' };
  const version = { id: 'version', location: '封面', text: '版本：V1.0.2' };
  const date = { id: 'date', location: '封面', text: '时间：2026-11-19' };
  const cover = [title, version, date];
  const calls: number[] = [];
  const compact = {
    chat: async (...args: Parameters<typeof runtime.chat>) => {
      const body = JSON.parse(args[1][1].content);
      calls.push(body.rows?.length ?? 0);
      return runtime.chat(...args);
    },
  };
  await extractLedgerCandidates(
    compact,
    'qwen3:8b',
    {
      ...onlyDirectory,
      filename: '测试常用地址.docx',
      sources: [...cover, ...parsed.sources],
      blocks: [
        ...cover.map((s) => ({ location: s.location, rows: [[s.id]] })),
        ...onlyDirectory.blocks,
      ],
    },
    'all',
    '合成系统',
    new AbortController().signal,
  );
  expect(calls).toEqual([4]);
});
