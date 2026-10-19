import { useRef, useState } from 'react';
import type { Snapshot } from '../../types';
import type { LedgerBatch } from '../../ledger-workspace-types';
import { parseClipboardTable, parseTsv, type PastedTable } from '../../shared/paste-table';
import { Dialog } from '../../shared/Dialog';
import { useVault } from '../vault/VaultProvider';
const baseFields = [
  ['name', '名称／用途'],
  ['address', '地址／IP'],
  ['port', '端口'],
  ['notes', '说明'],
  ['username', '用户名'],
  ['password', '密码（加密）'],
  ['accountName', '账号角色'],
  ['repository', '代码仓库'],
  ['frequency', '频率'],
  ['status', '状态'],
  ['count', '节点数量'],
  ['mode', '部署方式'],
] as const;
const aliases: Record<string, string> = {
  名称: 'name',
  服务器名称: 'name',
  服务名称: 'name',
  应用名称: 'name',
  任务名称: 'name',
  角色: 'name',
  用途: 'field:用途',
  ip: 'address',
  地址: 'address',
  登录地址: 'address',
  端口: 'port',
  用户名: 'username',
  账号: 'username',
  密码: 'password',
  口令: 'password',
  备注: 'notes',
  说明: 'notes',
  仓库: 'repository',
  频率: 'frequency',
  周期: 'frequency',
  状态: 'status',
  cpu: 'field:CPU',
  内存: 'field:内存',
  硬盘: 'field:硬盘',
  操作系统: 'field:操作系统',
  类型: 'field:类型',
  版本: 'field:版本',
  实例: 'field:实例',
  库名: 'field:库名',
  主备: 'field:主备',
};
const kinds: Record<LedgerBatch['kind'], string> = {
  access: '访问入口',
  server: '服务器',
  database: '数据库',
  redis: 'Redis',
  other: '其他资源',
  service: '应用／服务',
  job: '运行作业',
  backup: '备份策略',
  account: '账号',
  node: '部署节点',
};
export function PasteLedger({
  snapshot,
  systemId,
  environmentId,
  onClose,
  onSaved,
}: {
  snapshot: Snapshot;
  systemId: string;
  environmentId: string | null;
  onClose: () => void;
  onSaved: (s: Snapshot, id?: string) => void;
}) {
  const [kind, setKind] = useState<LedgerBatch['kind']>('server'),
    [environment, setEnvironment] = useState(environmentId ?? ''),
    [owner, setOwner] = useState(''),
    [text, setText] = useState(''),
    [source, setSource] = useState<PastedTable | null>(null),
    [mode, setMode] = useState<'list' | 'card'>('list'),
    [header, setHeader] = useState(true),
    [mapping, setMapping] = useState<string[]>([]),
    [skip, setSkip] = useState<number[]>([]),
    [confirmed, setConfirmed] = useState<number[]>([]),
    [names, setNames] = useState<Record<number, string>>({}),
    [reviewed, setReviewed] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [leaving, setLeaving] = useState(false),
    [result, setResult] = useState<{ count: number; skipped: number } | null>(null);
  const token = useRef(crypto.randomUUID()),
    vault = useVault();
  function shape(data: PastedTable, layout = mode, hasHeader = header) {
    if (layout === 'card') {
      if (data.rows.some((r) => r.length !== 2))
        throw new Error('资料卡需要每行一个字段及对应值。');
      return { headers: data.rows.map((r) => r[0]), rows: [data.rows.map((r) => r[1])] };
    }
    return {
      headers: hasHeader
        ? (data.rows[0] ?? [])
        : Array.from(
            { length: Math.max(0, ...data.rows.map((r) => r.length)) },
            (_, i) => `列 ${i + 1}`,
          ),
      rows: hasHeader ? data.rows.slice(1) : data.rows,
    };
  }
  function load(data: PastedTable, layout = mode, hasHeader = header) {
    try {
      const value = shape(data, layout, hasHeader);
      setSource(data);
      setMode(layout);
      setHeader(hasHeader);
      setMapping(value.headers.map((h) => aliases[h.trim().toLowerCase()] ?? 'unmapped'));
      setSkip([]);
      setConfirmed([]);
      setNames({});
      setReviewed(false);
      setError('');
      setText('');
      token.current = crypto.randomUUID();
    } catch (e) {
      setError(String(e));
    }
  }
  const shaped = source ? shape(source) : null;
  const allowed =
    kind === 'service'
      ? ['name', 'repository', 'notes']
      : kind === 'job' || kind === 'backup'
        ? ['name', 'frequency', 'status', 'notes']
        : kind === 'node'
          ? ['name', 'address', 'port', 'notes', 'count', 'mode']
          : kind === 'account'
            ? ['name', 'username', 'password', 'notes']
            : kind === 'access'
              ? ['name', 'address', 'notes', 'username', 'password', 'accountName']
              : ['name', 'address', 'port', 'notes', 'username', 'password', 'accountName'];
  const hasFields = ['server', 'database', 'redis', 'other'].includes(kind);
  const supported = baseFields.filter(([key]) => allowed.includes(key));
  const mappingError = mapping.some(
    (key, i) =>
      /密码|口令|password/i.test(shaped?.headers[i] ?? '') &&
      !['password', 'ignore', 'unmapped'].includes(key),
  )
    ? '密码列只能加密保存或忽略。'
    : mapping.some((key) => key.startsWith('field:')) && !hasFields
      ? '此类型不支持附加字段，请明确选择字段或忽略。'
      : mapping.some((key) => key === 'unmapped')
        ? '请为每列选择字段或明确忽略。'
        : new Set(mapping.filter((k) => k !== 'ignore')).size !==
            mapping.filter((k) => k !== 'ignore').length
          ? '同一个字段不能映射两列。'
          : !mapping.includes('name')
            ? '需要映射名称／用途。'
            : mapping.some(
                  (k) =>
                    !k.startsWith('field:') &&
                    k !== 'ignore' &&
                    !supported.some(([key]) => key === k),
                )
              ? '当前类型不支持已映射的账号字段，请调整映射。'
              : '';
  const preview = (shaped?.rows ?? []).map((cells, index) => {
    const row: Record<string, any> = { fields: {} };
    mapping.forEach((key, column) => {
      const value = cells[column] ?? '';
      if (key.startsWith('field:')) row.fields[key.slice(6)] = value;
      else if (key !== 'ignore' && key !== 'unmapped') row[key] = value;
    });
    row.name = names[index] ?? row.name ?? '';
    if (row.status)
      row.status =
        ({ 在用: 'active', 停用: 'inactive', 待确认: 'unverified' } as Record<string, string>)[
          row.status
        ] ?? row.status;
    if (row.mode)
      row.mode =
        (
          { 固定: 'fixed', 固定部署: 'fixed', 按需: 'scheduled', 按需调度: 'scheduled' } as Record<
            string,
            string
          >
        )[row.mode] ?? row.mode;
    let issue = !row.name.trim()
      ? '名称不能为空'
      : row.port && (!/^\d+$/.test(row.port) || Number(row.port) < 1 || Number(row.port) > 65535)
        ? '端口无效'
        : row.status && !['active', 'inactive', 'unverified'].includes(row.status)
          ? '状态需为在用、停用或待确认'
          : '';
    if (kind === 'access' && row.address) {
      try {
        const url = new URL(row.address);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          issue = '需要不带密码的 HTTP(S) 地址';
      } catch {
        issue = '地址格式无效';
      }
    }
    const existing =
      kind === 'access'
        ? snapshot.accessEntries.filter((r) => r.systemId === systemId)
        : kind === 'account'
          ? snapshot.accounts.filter((r) => r.systemId === systemId)
          : kind === 'service'
            ? snapshot.services.filter((r) => r.systemId === systemId)
            : kind === 'job' || kind === 'backup'
              ? snapshot.operations.filter((r) => r.systemId === systemId)
              : kind === 'node'
                ? snapshot.deploymentNodes.filter((r) => r.serviceId === owner)
                : snapshot.resources.filter((r) => r.systemId === systemId);
    const duplicate =
      shaped!.rows
        .slice(0, index)
        .some(
          (earlier, i) =>
            !skip.includes(i) &&
            ((names[i] ?? earlier[mapping.indexOf('name')] ?? '').trim().toLowerCase() ===
              row.name.trim().toLowerCase() ||
              (row.address && earlier[mapping.indexOf('address')] === row.address) ||
              (kind === 'account' &&
                row.username &&
                earlier[mapping.indexOf('username')] === row.username)),
        ) ||
      existing.some(
        (r) =>
          r.name.toLowerCase() === row.name.trim().toLowerCase() ||
          (row.address &&
            ('address' in r
              ? r.address === row.address
              : 'addresses' in r
                ? r.addresses.some((a) => a.url === row.address)
                : false)) ||
          (kind === 'account' && row.username && 'username' in r && r.username === row.username),
      );
    if (
      mode === 'list' &&
      header &&
      cells.length === shaped!.headers.length &&
      cells.every((value, i) => value.trim() === shaped!.headers[i].trim())
    )
      issue = '重复表头，请取消录入此行';
    return { row: row as LedgerBatch['rows'][number], issue, duplicate, index };
  });
  const selected = preview.filter((r) => !skip.includes(r.index));
  const valid =
    source &&
    selected.length > 0 &&
    !mappingError &&
    (!source.warnings.length || reviewed) &&
    selected.every((r) => !r.issue && (!r.duplicate || confirmed.includes(r.index))) &&
    (!['account', 'node'].includes(kind) || owner) &&
    (kind !== 'node' || environment);
  async function submit() {
    if (busy || !valid) return;
    setBusy(true);
    setError('');
    try {
      if (selected.some((r) => r.row.password) && !(await vault.ensureUnlocked())) return;
      const [ownerKind, ownerId] = owner.split(':');
      const response = await window.desktop.captureLedgerBatch({
        token: token.current,
        systemId,
        environmentId: environment || null,
        kind,
        ownerId,
        ownerKind: ownerKind as LedgerBatch['ownerKind'],
        rows: selected.map((r) => ({ ...r.row, confirmDuplicate: confirmed.includes(r.index) })),
      });
      onSaved(response.snapshot, response.createdId);
      setResult({ count: selected.length, skipped: skip.length });
      setSource(null);
      setText('');
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  function close() {
    if (busy) return;
    if (!result && (source || text.trim())) setLeaving(true);
    else onClose();
  }
  return (
    <Dialog
      title="粘贴表格 · 校对后新增"
      className="modal paste-ledger"
      error={error}
      onClose={close}
    >
      {leaving && (
        <div role="alert">
          <p>这些资料尚未提交，离开将丢弃本次粘贴内容。</p>
          <button onClick={() => setLeaving(false)}>继续校对</button>
          <button onClick={onClose}>放弃并离开</button>
        </div>
      )}
      {result ? (
        <>
          <p role="status">
            已创建 {result.count} 条，跳过 {result.skipped} 条。
          </p>
          <button className="primary-button" onClick={onClose}>
            完成
          </button>
        </>
      ) : (
        <>
          <fieldset
            disabled={busy}
            onChange={() => {
              token.current = crypto.randomUUID();
            }}
          >
            <div className="workspace-query">
              <label>
                条目类型
                <select
                  aria-label="批量条目类型"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as LedgerBatch['kind']);
                    setOwner('');
                    setConfirmed([]);
                    token.current = crypto.randomUUID();
                  }}
                >
                  {Object.entries(kinds).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                环境
                <select
                  aria-label="批量环境"
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value)}
                >
                  <option value="">系统通用</option>
                  {snapshot.environments
                    .filter((e) => e.systemId === systemId)
                    .map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                </select>
              </label>
              {['account', 'node'].includes(kind) && (
                <label>
                  所属对象
                  <select
                    aria-label="批量所属对象"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                  >
                    <option value="">请选择</option>
                    {kind === 'node' ? (
                      snapshot.services
                        .filter((s) => s.systemId === systemId)
                        .map((s) => (
                          <option key={s.id} value={`service:${s.id}`}>
                            {s.name}
                          </option>
                        ))
                    ) : (
                      <>
                        {snapshot.resources
                          .filter((r) => r.systemId === systemId)
                          .map((r) => (
                            <option key={r.id} value={`resource:${r.id}`}>
                              {r.name}
                            </option>
                          ))}
                        {snapshot.accessEntries
                          .filter((r) => r.systemId === systemId)
                          .map((r) => (
                            <option key={r.id} value={`access:${r.id}`}>
                              {r.name}
                            </option>
                          ))}
                        {snapshot.environments
                          .filter((r) => r.systemId === systemId)
                          .map((r) => (
                            <option key={r.id} value={`environment:${r.id}`}>
                              {r.name} · 系统账号
                            </option>
                          ))}
                      </>
                    )}
                  </select>
                </label>
              )}
            </div>
            <label className="field-label">
              从 Word／Excel 复制后粘贴
              <textarea
                aria-label="粘贴表格"
                rows={3}
                value={text}
                placeholder="粘贴清单，或字段／值资料卡"
                onChange={(e) => setText(e.target.value)}
                onPaste={(e) => {
                  try {
                    e.preventDefault();
                    load(
                      parseClipboardTable(
                        e.clipboardData.getData('text/plain'),
                        e.clipboardData.getData('text/html'),
                      ),
                    );
                  } catch (error) {
                    setError(String(error));
                  }
                }}
              />
            </label>
            {text && (
              <button
                className="secondary-button"
                onClick={() => {
                  try {
                    load(parseTsv(text));
                  } catch (e) {
                    setError(String(e));
                  }
                }}
              >
                读取文本
              </button>
            )}
            {source && (
              <>
                <div className="workspace-query">
                  <label>
                    预览方式
                    <select
                      aria-label="表格预览方式"
                      value={mode}
                      onChange={(e) => load(source, e.target.value as 'list' | 'card')}
                    >
                      <option value="list">清单 · 一行一条</option>
                      <option value="card">资料卡 · 字段／值合成一条</option>
                    </select>
                  </label>
                  {mode === 'list' && (
                    <label>
                      <input
                        type="checkbox"
                        checked={header}
                        onChange={(e) => load(source, mode, e.target.checked)}
                      />
                      首行为表头
                    </label>
                  )}
                </div>
                {source.warnings.map((w) => (
                  <p className="error-text" key={w}>
                    {w}
                  </p>
                ))}
                {!!source.warnings.length && (
                  <label>
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    已校对错位与合并单元格，跳过无法确认的行
                  </label>
                )}
                <div className="paste-mapping">
                  {shaped!.headers.map((h, i) => (
                    <label className="field-label" key={i}>
                      {h || `列 ${i + 1}`}
                      <select
                        aria-label={`映射第 ${i + 1} 列`}
                        value={mapping[i] ?? 'unmapped'}
                        onChange={(e) => {
                          const next = [...mapping];
                          next[i] = e.target.value;
                          setMapping(next);
                          setConfirmed([]);
                          token.current = crypto.randomUUID();
                        }}
                      >
                        <option value="unmapped">选择字段</option>
                        <option value="ignore">忽略此列</option>
                        {supported.map(([key, label]) => (
                          <option key={key} value={key}>
                            {label}
                          </option>
                        ))}
                        {hasFields &&
                          [
                            '操作系统',
                            'CPU',
                            '内存',
                            '硬盘',
                            '用途',
                            '类型',
                            '版本',
                            '实例',
                            '库名',
                            '主备',
                            '目录',
                            '配置',
                            '日志',
                            h,
                          ]
                            .filter((v, i, a) => v && a.indexOf(v) === i)
                            .map((key) => (
                              <option key={key} value={`field:${key}`}>
                                附加字段 · {key}
                              </option>
                            ))}
                      </select>
                    </label>
                  ))}
                </div>
                {mappingError && (
                  <p role="alert" className="error-text">
                    {mappingError}
                  </p>
                )}
                <div className="paste-preview">
                  <table>
                    <thead>
                      <tr>
                        <th>录入</th>
                        <th>名称（可区分重名）</th>
                        <th>地址／用户名</th>
                        <th>密码</th>
                        <th>校对</th>
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map(({ row, issue, duplicate, index }) => (
                        <tr key={index}>
                          <td>
                            <input
                              type="checkbox"
                              aria-label={`录入第 ${index + 1} 行`}
                              checked={!skip.includes(index)}
                              onChange={(e) =>
                                setSkip(
                                  e.target.checked
                                    ? skip.filter((i) => i !== index)
                                    : [...skip, index],
                                )
                              }
                            />
                          </td>
                          <td>
                            <input
                              aria-label={`第 ${index + 1} 行名称`}
                              value={row.name}
                              onChange={(e) => setNames({ ...names, [index]: e.target.value })}
                            />
                          </td>
                          <td className="multiline">
                            {row.address || row.username || row.frequency || '—'}
                          </td>
                          <td>{row.password ? '•••••• · 加密保存' : '—'}</td>
                          <td>
                            {issue && <span className="error-text">{issue}</span>}
                            {duplicate && (
                              <label>
                                <input
                                  type="checkbox"
                                  checked={confirmed.includes(index)}
                                  onChange={(e) =>
                                    setConfirmed(
                                      e.target.checked
                                        ? [...confirmed, index]
                                        : confirmed.filter((i) => i !== index),
                                    )
                                  }
                                />
                                疑似重复，仍新增独立记录
                              </label>
                            )}
                            <details>
                              <summary>完整映射</summary>
                              {Object.entries(row)
                                .filter(([k]) => !['password', 'fields'].includes(k))
                                .map(([k, v]) => (
                                  <p className="multiline" key={k}>
                                    {k}：{String(v)}
                                  </p>
                                ))}
                              {Object.entries(row.fields ?? {}).map(([k, v]) => (
                                <p className="multiline" key={k}>
                                  {k}：{v}
                                </p>
                              ))}
                            </details>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </fieldset>
          <div className="modal-actions">
            <span>
              {selected.length} 条待新增，{skip.length} 条跳过
            </span>
            <button className="secondary-button" disabled={busy} onClick={close}>
              取消
            </button>
            <button
              className="primary-button"
              disabled={busy || !valid}
              onClick={() => void submit()}
            >
              确认新增
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
