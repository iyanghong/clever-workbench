import { completeImportUrl, importUrlProblem } from '../src/ledger-import-url';
import { expect, test } from 'vitest';
import { normalizeImportCandidates } from '../electron/ledger-import-model';
import type { ParsedLedgerFile } from '../electron/ledger-import-source';

const file: ParsedLedgerFile = {
  filename: '合成.csv',
  warnings: [],
  blocks: [],
  sources: [
    { id: 's1', location: '表!A2', text: '业务数据库' },
    { id: 's2', location: '表!B2', text: 'orders_app' },
    { id: 's3', location: '表!C2', text: 'fixture-db-password', hidden: 'password' },
    { id: 's4', location: '表!C3', text: 'wrong-row-password', hidden: 'password' },
    { id: 's5', location: '表!D2', text: 'fixture-token', hidden: 'unsupported' },
  ],
};
const raw = () => ({
  key: 'db1',
  kind: 'database',
  name: { source: 's1', value: '业务数据库' },
  accounts: [{ username: { source: 's2', value: 'orders_app' }, passwordSource: 's3' }],
});

test('model values must be literal source substrings and cannot move secrets into ordinary fields', () => {
  const data = raw();
  const result = normalizeImportCandidates(
    {
      candidates: [
        {
          ...data,
          name: { source: 's1', value: '臆测名称' },
          notes: { source: 's3', value: 'fixture-db-password' },
          fields: [
            {
              label: { source: 's1', value: '业务' },
              value: { source: 's5', value: 'fixture-token' },
            },
          ],
        },
      ],
    },
    file,
    'all',
    'c1_',
  );
  expect(result.candidates[0].name).toBe('');
  expect(result.candidates[0].notes).toBe('');
  expect(result.candidates[0].fields).toEqual({});
  expect(result.candidates[0].warnings).not.toHaveLength(0);
  expect(JSON.stringify(result)).not.toContain('fixture-db-password');
  expect(JSON.stringify(result)).not.toContain('fixture-token');
});

test('passwords keep references and mismatched source rows require manual correction', () => {
  const good = normalizeImportCandidates({ candidates: [raw()] }, file, 'all', 'c1_').candidates[0];
  expect(good.accounts[0].passwordRef).toBe('s3');
  const wrong = raw();
  wrong.accounts[0].passwordSource = 's4';
  const bad = normalizeImportCandidates({ candidates: [wrong] }, file, 'all', 'c1_').candidates[0];
  expect(bad.accounts[0].passwordRef).toBeNull();
  expect(bad.warnings.join(' ')).toContain('对应关系');
});

test('type filters do not create excluded parents, and invalid arrays never silently truncate', () => {
  const result = normalizeImportCandidates(
    {
      candidates: [
        raw(),
        { key: 'server1', kind: 'server', name: { source: 's1', value: '业务数据库' } },
      ],
    },
    file,
    'database',
    'c1_',
  );
  expect(result.candidates).toHaveLength(1);
  expect(result.warnings[0]).toContain('其他类型');
  expect(() =>
    normalizeImportCandidates({ candidates: [raw(), raw()] }, file, 'all', 'c1_'),
  ).toThrow('重复');
  expect(() =>
    normalizeImportCandidates(
      {
        candidates: [{ ...raw(), accounts: Array.from({ length: 101 }, () => raw().accounts[0]) }],
      },
      file,
      'all',
      'c1_',
    ),
  ).toThrow('过多');
});

test('unambiguous existing column aliases preserve names and addresses when a model chooses the wrong cell', () => {
  const table: ParsedLedgerFile = {
    filename: '服务器.xlsx',
    warnings: [],
    blocks: [
      { location: '服务器', rows: [['title'], ['h1', 'h2', 'h3'], ['ip', 'environment', 'name']] },
    ],
    sources: [
      { id: 'title', location: '服务器!A1', text: '任意排版的交接资料' },
      { id: 'h1', location: '服务器!A2', text: 'IP' },
      { id: 'h2', location: '服务器!B2', text: '环境' },
      { id: 'h3', location: '服务器!C2', text: '服务器名称' },
      { id: 'ip', location: '服务器!A3', text: '192.0.2.11' },
      { id: 'environment', location: '服务器!B3', text: '生产' },
      { id: 'name', location: '服务器!C3', text: '应用节点' },
    ],
  };
  const normalized = normalizeImportCandidates(
    {
      candidates: [{ key: 'server1', kind: 'server', name: { source: 'ip', value: '192.0.2.11' } }],
    },
    table,
    'all',
    'c1_',
  ).candidates[0];
  expect(normalized.name).toBe('应用节点');
  expect(normalized.address).toBe('192.0.2.11');
  expect(normalized.environmentNames).toEqual(['生产']);
  expect(normalized.environmentIds).toBeNull();
});

test('an operation reference uses the explicit target kind rather than a mistaken service field', () => {
  const candidates = normalizeImportCandidates(
    {
      candidates: [
        raw(),
        {
          key: 'backup1',
          kind: 'backup',
          name: { source: 's1', value: '业务数据库' },
          serviceKey: 'db1',
        },
      ],
    },
    file,
    'all',
    'c1_',
  ).candidates;
  expect(candidates[1].service).toBeNull();
  expect(candidates[1].owner).toEqual({ candidate: candidates[0].id });
});

test('访问地址补 HTTP 时保留端口、路径、参数、片段和显式 HTTPS', () => {
  for (const [raw, expected] of [
    [
      ' 192.0.2.15:8080/a/login.html?next=%2Fdocs#start ',
      'http://192.0.2.15:8080/a/login.html?next=%2Fdocs#start',
    ],
    ['portal.example.invalid', 'http://portal.example.invalid'],
    ['intranet:9090/login', 'http://intranet:9090/login'],
    ['localhost', 'http://localhost'],
    ['//[2001:db8::1]:8081/path', 'http://[2001:db8::1]:8081/path'],
    ['HTTPS://portal.example.invalid/a', 'HTTPS://portal.example.invalid/a'],
  ]) {
    expect(completeImportUrl(raw)).toBe(expected);
    expect(completeImportUrl(expected)).toBe(expected);
    expect(importUrlProblem(raw)).toBeNull();
  }
  for (const raw of [
    '',
    '/relative',
    '../login',
    'ftp://host/login',
    'javascript:alert(1)',
    'data:text/plain,hello',
    'http:/wrong',
    'portal.example.invalid:99999',
    'user:pw@host/path',
    'https://user:pw@host/path',
  ]) {
    expect(completeImportUrl(raw)).toBe(raw);
    expect(importUrlProblem(raw)).toBeTruthy();
  }
});
