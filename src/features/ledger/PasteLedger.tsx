import { markNewRecordChanged } from '../../shared/new-record';
import { Button, Checkbox, Input, Select, ConfigProvider, Table } from 'antd';
import { serverConfigurationFields } from '../../ledger-types';
import {
  resourceTemplate,
  nodeFields,
  operationFields,
  connectionAddress,
} from '../../ledger-fields';
import { useEffect, useRef, useState } from 'react';
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
  ['mode', '运行方式'],
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
type Row = LedgerBatch['rows'][number];
type Entry = { id: string; row: Row; selected: boolean; confirmed: boolean; sourceIssue?: string };
function entry(row: Row = { name: '' }): Entry {
  return { id: crypto.randomUUID(), row, selected: true, confirmed: false };
}
function hasContent(row: Row) {
  return Object.entries(row).some(([key, value]) =>
    key === 'fields'
      ? Object.values(value ?? {}).some((v) => String(v).trim())
      : key === 'password'
        ? Boolean(value)
        : typeof value === 'string' && value.trim(),
  );
}
export function PasteLedger({
  snapshot,
  systemId,
  environmentId,
  initialKind,
  registerFlush,
  onClose,
  onSaved,
}: {
  snapshot: Snapshot;
  systemId: string;
  environmentId: string | null;
  initialKind: LedgerBatch['kind'];
  registerFlush: (save: () => Promise<void>) => () => void;
  onClose: () => void;
  onSaved: (s: Snapshot, id?: string) => void;
}) {
  const [kind, setKind] = useState(initialKind),
    [environment, setEnvironment] = useState(environmentId ?? ''),
    [owner, setOwner] = useState(''),
    [rows, setRows] = useState<Entry[]>(() => [entry()]),
    [extraFields, setExtraFields] = useState<string[]>([]),
    [newField, setNewField] = useState(''),
    [text, setText] = useState(''),
    [source, setSource] = useState<PastedTable | null>(null),
    [mode, setMode] = useState<'list' | 'card'>('list'),
    [header, setHeader] = useState(true),
    [mapping, setMapping] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false),
    [leaving, setLeaving] = useState(false),
    [result, setResult] = useState<{ count: number; skipped: number } | null>(null);
  const continueButton = useRef<HTMLButtonElement>(null),
    submitting = useRef<Promise<void> | null>(null),
    finished = useRef(false),
    token = useRef(crypto.randomUUID()),
    vault = useVault();
  const dirty = Boolean(source || text.trim() || rows.some((r) => hasContent(r.row)));
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  function focusExitChoice() {
    continueButton.current?.scrollIntoView({ block: 'center' });
    continueButton.current?.focus({ preventScroll: true });
  }
  useEffect(() => {
    if (leaving) focusExitChoice();
  }, [leaving]);
  useEffect(
    () =>
      registerFlush(async () => {
        await submitting.current;
        if (!finished.current && dirtyRef.current) {
          setLeaving(true);
          focusExitChoice();
          throw new Error('批量资料尚未提交，请确认新增或放弃后重试。');
        }
      }),
    [registerFlush],
  );
  function changeRows(next: Entry[]) {
    token.current = crypto.randomUUID();
    setRows(next.map((r) => ({ ...r, confirmed: false })));
  }
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
      setReviewed(false);
      setError('');
      setText('');
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
  const hasFields = ['server', 'database', 'redis', 'other', 'node', 'job', 'backup'].includes(
    kind,
  );
  const templateFields =
    kind === 'node'
      ? nodeFields
      : kind === 'job' || kind === 'backup'
        ? operationFields[kind]
        : ['server', 'database', 'redis', 'other'].includes(kind)
          ? resourceTemplate(kind as 'server' | 'database' | 'redis' | 'other')
          : [];
  const visibleFields = [
    ...new Set([
      ...(kind === 'server' ? serverConfigurationFields : []),
      ...templateFields,
      ...extraFields,
    ]),
  ];
  const supported = baseFields.filter(([key]) => allowed.includes(key));
  const columns: [string, string][] = [
    ...supported.map(([key, label]): [string, string] => [key, key === 'name' ? '名称' : label]),
    ...visibleFields.map((key): [string, string] => [`field:${key}`, key]),
  ];
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
            : mapping.some((k) => !k.startsWith('field:') && k !== 'ignore' && !allowed.includes(k))
              ? '当前类型不支持已映射的字段，请调整映射。'
              : '';
  function appendSource() {
    if (!shaped || mappingError || (source!.warnings.length && !reviewed)) return;
    const added = shaped.rows.map((cells) => {
      let row: Row = { name: '', fields: {} };
      mapping.forEach((key, i) => {
        const value = cells[i] ?? '';
        if (key.startsWith('field:')) row.fields = { ...row.fields, [key.slice(6)]: value };
        else if (key !== 'ignore') row = { ...row, [key]: value };
      });
      if (row.status)
        row.status =
          (
            { 在用: 'active', 停用: 'inactive', 待确认: 'unverified' } as Record<
              string,
              Row['status']
            >
          )[row.status] ?? row.status;
      if (row.mode)
        row.mode =
          (
            {
              固定: 'fixed',
              固定部署: 'fixed',
              按需: 'scheduled',
              按需调度: 'scheduled',
            } as Record<string, Row['mode']>
          )[row.mode] ?? row.mode;
      const repeated =
        mode === 'list' &&
        header &&
        cells.length === shaped.headers.length &&
        cells.every((v, i) => v.trim() === shaped.headers[i].trim());
      return { ...entry(row), sourceIssue: repeated ? '重复表头，请取消录入此行' : undefined };
    });
    changeRows([...rows.filter((r) => hasContent(r.row)), ...added]);
    setExtraFields([
      ...new Set([
        ...extraFields,
        ...mapping.filter((k) => k.startsWith('field:')).map((k) => k.slice(6)),
      ]),
    ]);
    setSource(null);
    setText('');
    setMapping([]);
    setError('');
  }
  const [ownerKind, ownerId] = owner.split(':');
  const existing =
    kind === 'account'
      ? snapshot.accounts.filter(
          (r) =>
            r.systemId === systemId &&
            (ownerKind === 'resource'
              ? r.resourceId === ownerId
              : ownerKind === 'access'
                ? r.accessId === ownerId
                : r.environmentId === ownerId && !r.resourceId && !r.accessId),
        )
      : kind === 'node'
        ? snapshot.deploymentNodes.filter(
            (r) => r.serviceId === ownerId && r.environmentId === environment,
          )
        : kind === 'access'
          ? snapshot.accessEntries.filter((r) => r.systemId === systemId)
          : kind === 'service'
            ? snapshot.services.filter((r) => r.systemId === systemId)
            : kind === 'job' || kind === 'backup'
              ? snapshot.operations.filter((r) => r.systemId === systemId && r.kind === kind)
              : snapshot.resources.filter((r) => r.systemId === systemId);
  const preview = rows.map((item, index) => {
    const row = item.row,
      blank = !hasContent(row);
    let issue =
      item.sourceIssue ||
      (!blank && !row.name.trim()
        ? '名称不能为空'
        : row.port && (!/^\d+$/.test(row.port) || Number(row.port) < 1 || Number(row.port) > 65535)
          ? '端口无效'
          : row.status && !['active', 'inactive', 'unverified'].includes(row.status)
            ? '状态需为在用、停用或待确认'
            : row.mode && !['fixed', 'scheduled'].includes(row.mode)
              ? '运行方式需为固定或按需'
              : '');
    if (kind === 'access' && row.address) {
      try {
        const url = new URL(row.address);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
          issue = '需要不带密码的 HTTP(S) 地址';
      } catch {
        issue = '地址格式无效';
      }
    }
    const duplicate =
      !blank &&
      (rows
        .slice(0, index)
        .some(
          (r) =>
            r.selected &&
            hasContent(r.row) &&
            (r.row.name.trim().toLowerCase() === row.name.trim().toLowerCase() ||
              (row.address && r.row.address === row.address) ||
              (kind === 'account' && row.username && r.row.username === row.username)),
        ) ||
        existing.some(
          (r) =>
            r.name.toLowerCase() === row.name.trim().toLowerCase() ||
            (row.address &&
              ('address' in r
                ? r.address === row.address ||
                  ('connections' in r ? (r.connections ?? []) : []).some(
                    (c) => connectionAddress(c, snapshot.resources) === row.address,
                  )
                : 'addresses' in r
                  ? r.addresses.some((a) => a.url === row.address)
                  : false)) ||
            (kind === 'account' && row.username && 'username' in r && r.username === row.username),
        ));
    return { ...item, blank, issue, duplicate };
  });
  const selected = preview.filter((r) => r.selected && !r.blank);
  const needsReview = selected.filter((r) => r.issue || (r.duplicate && !r.confirmed)).length;
  const valid =
    selected.length > 0 &&
    selected.length <= 200 &&
    !source &&
    !text.trim() &&
    !needsReview &&
    (!['account', 'node'].includes(kind) || owner) &&
    (kind !== 'node' || environment);
  function submit() {
    if (submitting.current || !valid) return;
    setBusy(true);
    setLeaving(false);
    setError('');
    submitting.current = (async () => {
      try {
        if (selected.some((r) => r.row.password) && !(await vault.ensureUnlocked())) return;
        const response = await window.desktop.captureLedgerBatch({
          token: token.current,
          systemId,
          environmentId: kind === 'account' ? null : environment || null,
          kind,
          ownerId,
          ownerKind: ownerKind as LedgerBatch['ownerKind'],
          rows: selected.map((r) => ({
            ...r.row,
            status: r.row.status || undefined,
            mode: r.row.mode || undefined,
            confirmDuplicate: r.confirmed,
          })),
        });
        finished.current = true;
        setResult({
          count: selected.length,
          skipped: preview.filter((r) => !r.blank && !r.selected).length,
        });
        setRows([]);
        setSource(null);
        setText('');
        onSaved(response.snapshot, response.createdId);
      } catch (e) {
        setError(String(e));
      } finally {
        submitting.current = null;
        setBusy(false);
      }
    })();
  }
  function close() {
    if (submitting.current) return;
    if (!finished.current && dirty) {
      setLeaving(true);
      if (leaving) focusExitChoice();
    } else onClose();
  }
  function edit(index: number, key: string, value: string) {
    changeRows(
      rows.map((item, i) =>
        i !== index
          ? item
          : {
              ...item,
              row: key.startsWith('field:')
                ? { ...item.row, fields: { ...item.row.fields, [key.slice(6)]: value } }
                : { ...item.row, [key]: value },
            },
      ),
    );
  }
  return (
    <Dialog
      title="批量录入 · 校对后新增"
      className="modal paste-ledger"
      description="直接填写多行，或粘贴表格后逐格修改；校对完成后统一新增。"
      closeDisabled={busy}
      error={error}
      onClose={close}
    >
      {leaving && (
        <div className="paste-leave-notice" role="alert">
          <p>这些资料尚未提交，离开将丢弃本次录入内容。</p>
          <Button
            htmlType="submit"
            type="default"
            ref={continueButton}
            className="secondary-button"
            disabled={busy}
            onClick={() => setLeaving(false)}
          >
            继续校对
          </Button>
          <Button
            htmlType="submit"
            type="text"
            className="text-button"
            disabled={busy}
            onClick={() => {
              finished.current = true;
              onClose();
            }}
          >
            放弃并离开
          </Button>
        </div>
      )}
      {result ? (
        <>
          <p role="status">
            已创建 {result.count} 条，跳过 {result.skipped} 条。
          </p>
          <Button htmlType="submit" type="primary" className="primary-button" onClick={onClose}>
            完成
          </Button>
        </>
      ) : (
        <>
          <ConfigProvider componentDisabled={busy}>
            <fieldset
              disabled={busy}
              onChange={() => {
                token.current = crypto.randomUUID();
              }}
            >
              <div className="paste-setup">
                <label>
                  条目类型
                  <Select
                    aria-label="批量条目类型"
                    value={kind}
                    disabled={dirty}
                    onChange={(e) => {
                      markNewRecordChanged();
                      setKind(e as LedgerBatch['kind']);
                      setOwner('');
                      setExtraFields([]);
                      setNewField('');
                    }}
                  >
                    {Object.entries(kinds).map(([key, label]) => (
                      <Select.Option data-value={String(key)} key={key} value={key}>
                        {label}
                      </Select.Option>
                    ))}
                  </Select>
                </label>
                {kind !== 'account' && (
                  <label>
                    环境
                    <Select
                      aria-label="批量环境"
                      value={environment}
                      onChange={(e) => {
                        markNewRecordChanged();
                        setEnvironment(e);
                        changeRows(rows);
                      }}
                    >
                      <Select.Option data-value={String('')} value="">
                        {kind === 'node' ? '请选择部署环境' : '系统通用'}
                      </Select.Option>
                      {snapshot.environments
                        .filter((e) => e.systemId === systemId)
                        .map((e) => (
                          <Select.Option data-value={String(e.id)} key={e.id} value={e.id}>
                            {e.name}
                          </Select.Option>
                        ))}
                    </Select>
                  </label>
                )}
                {['account', 'node'].includes(kind) && (
                  <label>
                    所属对象
                    <Select
                      aria-label="批量所属对象"
                      value={owner}
                      onChange={(e) => {
                        markNewRecordChanged();
                        setOwner(e);
                        changeRows(rows);
                      }}
                    >
                      <Select.Option data-value={String('')} value="">
                        请选择
                      </Select.Option>
                      {kind === 'node' ? (
                        snapshot.services
                          .filter((s) => s.systemId === systemId)
                          .map((s) => (
                            <Select.Option
                              data-value={String(`service:${s.id}`)}
                              key={s.id}
                              value={`service:${s.id}`}
                            >
                              {s.name}
                            </Select.Option>
                          ))
                      ) : (
                        <>
                          {snapshot.resources
                            .filter((r) => r.systemId === systemId)
                            .map((r) => (
                              <Select.Option
                                data-value={String(`resource:${r.id}`)}
                                key={r.id}
                                value={`resource:${r.id}`}
                              >
                                {r.name} · 资源
                              </Select.Option>
                            ))}
                          {snapshot.accessEntries
                            .filter((r) => r.systemId === systemId)
                            .map((r) => (
                              <Select.Option
                                data-value={String(`access:${r.id}`)}
                                key={r.id}
                                value={`access:${r.id}`}
                              >
                                {r.name} · 访问入口
                              </Select.Option>
                            ))}
                          {snapshot.environments
                            .filter((r) => r.systemId === systemId)
                            .map((r) => (
                              <Select.Option
                                data-value={String(`environment:${r.id}`)}
                                key={r.id}
                                value={`environment:${r.id}`}
                              >
                                {r.name} · 系统账号
                              </Select.Option>
                            ))}
                        </>
                      )}
                    </Select>
                  </label>
                )}
              </div>
              <p className="secondary-copy">
                {kind === 'account'
                  ? '账号的适用范围随所属对象。'
                  : '本批资料使用同一环境，更多适用环境与标签可在详情补充。'}{' '}
                有内容时需先清空条目和粘贴内容才能切换类型。
              </p>
              <div
                className="paste-preview batch-grid"
                tabIndex={0}
                role="region"
                aria-label="批量录入表格（可横向滚动）"
              >
                <Table
                  rowKey="id"
                  dataSource={preview}
                  pagination={false}
                  size="small"
                  scroll={{ x: 'max-content', y: 470 }}
                  columns={[
                    {
                      key: 'select',
                      title: '录入',
                      width: 70,
                      render: (
                        _value,
                        { id, row, selected: checked, confirmed, issue, duplicate, blank },
                        index,
                      ) => (
                        <>
                          <Checkbox
                            aria-label={`录入第 ${index + 1} 行`}
                            checked={checked}
                            onChange={(e) =>
                              changeRows(
                                rows.map((r, i) =>
                                  i === index ? { ...r, selected: e.target.checked } : r,
                                ),
                              )
                            }
                          />
                        </>
                      ),
                    },
                    ...columns.map(([key, label]) => ({
                      key,
                      title: label,
                      width: 220,
                      render: (
                        _value: unknown,
                        { row }: (typeof preview)[number],
                        index: number,
                      ) => {
                        const value = key.startsWith('field:')
                          ? (row.fields?.[key.slice(6)] ?? '')
                          : (row[key as (typeof baseFields)[number][0]] ?? '');
                        const name = `第 ${index + 1} 行${label}`;
                        return (
                          <>
                            {key === 'status' || key === 'mode' ? (
                              <Select
                                aria-label={name}
                                value={value}
                                onChange={(e) => {
                                  markNewRecordChanged();
                                  return edit(index, key, e);
                                }}
                              >
                                <Select.Option data-value={String('')} value="">
                                  {key === 'status' ? '待确认（默认）' : '固定（默认）'}
                                </Select.Option>
                                {(key === 'status'
                                  ? [
                                      ['active', '在用'],
                                      ['inactive', '停用'],
                                      ['unverified', '待确认'],
                                    ]
                                  : [
                                      ['fixed', '固定'],
                                      ['scheduled', '按需'],
                                    ]
                                ).map(([v, l]) => (
                                  <Select.Option data-value={String(v)} key={v} value={v}>
                                    {l}
                                  </Select.Option>
                                ))}
                                {value &&
                                  !(
                                    key === 'status'
                                      ? ['active', 'inactive', 'unverified']
                                      : ['fixed', 'scheduled']
                                  ).includes(value) && (
                                    <Select.Option data-value={String(value)} value={value}>
                                      {value}（请修正）
                                    </Select.Option>
                                  )}
                              </Select>
                            ) : ['name', 'port', 'username', 'password', 'accountName'].includes(
                                key,
                              ) ? (
                              <Input
                                aria-label={name}
                                type={key === 'password' ? 'password' : 'text'}
                                autoComplete="off"
                                value={value}
                                onChange={(e) => edit(index, key, e.target.value)}
                              />
                            ) : (
                              <Input.TextArea
                                aria-label={name}
                                rows={2}
                                value={value}
                                onChange={(e) => edit(index, key, e.target.value)}
                              />
                            )}
                          </>
                        );
                      },
                    })),
                    {
                      key: 'actions',
                      title: '校对与操作',
                      width: 240,
                      render: (
                        _value,
                        { id, row, selected: checked, confirmed, issue, duplicate, blank },
                        index,
                      ) => (
                        <div className="batch-row-actions">
                          {issue && <span className="error-text">{issue}</span>}
                          {blank && <span className="secondary-copy">空白行不提交</span>}
                          {duplicate && (
                            <Checkbox
                              checked={confirmed}
                              onChange={(e) =>
                                setRows(
                                  rows.map((r, i) =>
                                    i === index ? { ...r, confirmed: e.target.checked } : r,
                                  ),
                                )
                              }
                            >
                              疑似重复，仍新增独立记录
                            </Checkbox>
                          )}
                          <Button
                            htmlType="submit"
                            type="text"
                            className="text-button"
                            aria-label={`删除第 ${index + 1} 行`}
                            onClick={() => changeRows(rows.filter((r) => r.id !== id))}
                          >
                            删除行
                          </Button>
                        </div>
                      ),
                    },
                  ]}
                />
              </div>
              {!!needsReview && (
                <p role="status" className="secondary-copy">
                  {needsReview} 条资料待校对，请向右查看“校对与操作”列并修正或取消勾选。
                </p>
              )}
              <div className="batch-toolbar">
                <Button
                  htmlType="submit"
                  type="default"
                  className="secondary-button"
                  onClick={() => changeRows([...rows, entry()])}
                >
                  增加一行
                </Button>
                {hasFields && (
                  <>
                    <label>
                      附加字段
                      <Input
                        aria-label="新增附加字段名称"
                        placeholder="例如：CPU、内存、库名"
                        value={newField}
                        onChange={(e) => setNewField(e.target.value)}
                      />
                    </label>
                    <Button
                      htmlType="submit"
                      type="default"
                      className="secondary-button"
                      disabled={!newField.trim()}
                      onClick={() => {
                        const key = newField.trim();
                        if (/密码|口令|password|token|私钥/i.test(key)) {
                          setError('秘密内容请使用密码字段，不能存入普通附加字段。');
                          return;
                        }
                        if (key.length > 80 || extraFields.length >= 50) {
                          setError('附加字段名称最多 80 个字符，每次最多 50 个附加字段。');
                          return;
                        }
                        setExtraFields([...new Set([...extraFields, key])]);
                        setNewField('');
                        setError('');
                      }}
                    >
                      添加字段
                    </Button>
                  </>
                )}
              </div>
              {!source && (
                <label className="field-label paste-source">
                  从 Word／Excel 粘贴表格
                  <Input.TextArea
                    aria-label="粘贴表格"
                    rows={4}
                    value={text}
                    placeholder={
                      '在这里粘贴表格…\n支持清单和“字段／值”资料卡，映射后追加到上方表格。'
                    }
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
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  />
                </label>
              )}
              {text && (
                <Button
                  htmlType="submit"
                  type="default"
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
                </Button>
              )}
              {source && (
                <>
                  <div className="workspace-query">
                    <label>
                      预览方式
                      <Select
                        aria-label="表格预览方式"
                        value={mode}
                        onChange={(e) => {
                          markNewRecordChanged();
                          return load(source, e as 'list' | 'card');
                        }}
                      >
                        <Select.Option data-value={String('list')} value="list">
                          清单 · 一行一条
                        </Select.Option>
                        <Select.Option data-value={String('card')} value="card">
                          资料卡 · 字段／值合成一条
                        </Select.Option>
                      </Select>
                    </label>
                    {mode === 'list' && (
                      <Checkbox
                        checked={header}
                        onChange={(e) => load(source, mode, e.target.checked)}
                      >
                        首行为表头
                      </Checkbox>
                    )}
                  </div>
                  {source.warnings.map((w) => (
                    <p className="error-text" key={w}>
                      {w}
                    </p>
                  ))}
                  {!!source.warnings.length && (
                    <Checkbox checked={reviewed} onChange={(e) => setReviewed(e.target.checked)}>
                      已校对错位与合并单元格，跳过无法确认的行
                    </Checkbox>
                  )}
                  <div className="paste-mapping">
                    {shaped!.headers.map((h, i) => (
                      <label className="field-label" key={i}>
                        {h || `列 ${i + 1}`}
                        <Select
                          aria-label={`映射第 ${i + 1} 列`}
                          value={mapping[i] ?? 'unmapped'}
                          onChange={(e) => {
                            markNewRecordChanged();
                            return setMapping(mapping.map((v, j) => (i === j ? e : v)));
                          }}
                        >
                          <Select.Option data-value={String('unmapped')} value="unmapped">
                            选择字段
                          </Select.Option>
                          <Select.Option data-value={String('ignore')} value="ignore">
                            忽略此列
                          </Select.Option>
                          {supported.map(([key, label]) => (
                            <Select.Option data-value={String(key)} key={key} value={key}>
                              {label}
                            </Select.Option>
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
                                <Select.Option
                                  data-value={String(`field:${key}`)}
                                  key={key}
                                  value={`field:${key}`}
                                >
                                  附加字段 · {key}
                                </Select.Option>
                              ))}
                        </Select>
                      </label>
                    ))}
                  </div>
                  {mappingError && (
                    <p role="alert" className="error-text">
                      {mappingError}
                    </p>
                  )}
                  <div
                    className="paste-preview"
                    tabIndex={0}
                    role="region"
                    aria-label="待追加表格预览"
                  >
                    <Table<string[]>
                      dataSource={shaped!.rows}
                      rowKey={(_row, index) => String(index)}
                      size="small"
                      pagination={false}
                      scroll={{ x: 'max-content', y: 260 }}
                      columns={shaped!.headers.map((header, index) => ({
                        key: index,
                        title: header || `列 ${index + 1}`,
                        width: 220,
                        render: (_value, cells) => (
                          <span className="multiline">
                            {cells[index] &&
                            (mapping[index] === 'password' || /密码|口令|password/i.test(header))
                              ? '•••••• · 加密保存或忽略'
                              : cells[index]}
                          </span>
                        ),
                      }))}
                    />
                  </div>
                  <div className="batch-toolbar">
                    <Button
                      htmlType="submit"
                      type="default"
                      className="secondary-button"
                      disabled={
                        !!mappingError ||
                        !shaped!.rows.length ||
                        (!!source.warnings.length && !reviewed)
                      }
                      onClick={appendSource}
                    >
                      追加到录入表格（{shaped!.rows.length} 行）
                    </Button>
                    <Button
                      htmlType="submit"
                      type="text"
                      className="text-button"
                      onClick={() => {
                        setSource(null);
                        setMapping([]);
                      }}
                    >
                      放弃本次粘贴
                    </Button>
                  </div>
                </>
              )}
            </fieldset>
          </ConfigProvider>
          {selected.length > 200 && (
            <p role="alert" className="error-text">
              每批最多新增 200 条，请取消勾选多余的行。
            </p>
          )}
          {(source || text.trim()) && (
            <p className="secondary-copy">请先将粘贴内容追加到表格，或清除本次粘贴内容。</p>
          )}
          <div className="modal-actions">
            <span>
              {selected.length} 条待新增，{preview.filter((r) => !r.blank && !r.selected).length}{' '}
              条跳过
            </span>
            <Button
              htmlType="submit"
              type="default"
              className="secondary-button"
              disabled={busy}
              onClick={close}
            >
              取消
            </Button>
            <Button
              htmlType="submit"
              type="primary"
              className="primary-button"
              disabled={busy || !valid}
              onClick={submit}
            >
              {busy ? '正在保存…' : '确认新增'}
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
