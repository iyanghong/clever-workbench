import {
  Alert,
  Button,
  Checkbox,
  Collapse,
  Empty,
  Input,
  Progress,
  Select,
  Spin,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { useEffect, useRef, useState, useMemo } from 'react';
import { Dialog } from '../../shared/Dialog';
import { useVault } from '../vault/VaultProvider';
import type { Snapshot } from '../../types';
import {
  ledgerImportKinds,
  ledgerImportFieldKinds,
  localImportModels,
  type ImportCandidate,
  type ImportReference,
  type ImportSource,
  type LedgerImportKind,
  type LocalImportModel,
  type LocalLedgerImportSnapshot,
} from '../../ledger-import-types';
import { importTargets, importChanges, matchScore } from '../../ledger-import-matches';
import { importCandidateProblems } from '../../ledger-import-review';
import './ledger-file-import.css';

const api = () => window.desktop.localLedgerImport;
const resourceKinds = ['server', 'database', 'redis', 'other', 'access'];
const newId = (parent: string) => `${parent}:${crypto.randomUUID()}`;
const referenceValue = (value: ImportReference | null) =>
  value
    ? 'candidate' in value
      ? `candidate:${value.candidate}`
      : `existing:${value.existing}`
    : '';
const parseReference = (value: string): ImportReference | null =>
  !value
    ? null
    : value.startsWith('candidate:')
      ? { candidate: value.slice(10) }
      : { existing: value.slice(9) };

export function LedgerFileImport({
  snapshot,
  systemId,
  registerFlush,
  onClose,
  onSaved,
}: {
  snapshot: Snapshot;
  systemId: string;
  registerFlush: (save: () => Promise<void>) => () => void;
  onClose: () => void;
  onSaved: (snapshot: Snapshot) => void;
}) {
  const vault = useVault();
  const [state, setState] = useState<LocalLedgerImportSnapshot | null>(null);
  const [kind, setKind] = useState<LedgerImportKind | 'all'>('all');
  const [model, setModel] = useState<LocalImportModel>('qwen3:8b');
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [passwordEdits, setPasswordEdits] = useState<Record<string, string>>({});
  const [selectedId, setSelectedId] = useState('');
  const [tab, setTab] = useState('all');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [sources, setSources] = useState<ImportSource[]>([]);
  const [unmatchedSources, setUnmatchedSources] = useState<ImportSource[]>([]);
  const [sourcePage, setSourcePage] = useState(0);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [fieldName, setFieldName] = useState('');
  const [fieldValue, setFieldValue] = useState('');
  const draftId = useRef('');
  const inFlight = useRef<Promise<void> | null>(null);
  const lockRevision = useRef(0);
  const continueButton = useRef<HTMLButtonElement>(null);
  const current = useRef({ state, working });
  current.current = { state, working };
  const job = state?.job;
  const runtime = state?.runtime;
  const running = job?.phase === 'parsing' || job?.phase === 'analyzing';
  const review = job?.phase === 'review' && job.systemId === systemId;
  const setupDone = review || job?.phase === 'complete';
  const target = snapshot.systems.find((item) => item.id === systemId);
  const active = candidates.find((item) => item.id === selectedId);
  const environments = snapshot.environments.filter((item) => item.systemId === systemId);
  const targets = useMemo(() => importTargets(snapshot, systemId), [snapshot, systemId]);
  const choices = active
    ? targets
        .filter((t) => t.kind === active.kind)
        .sort((a, b) => matchScore(active, b) - matchScore(active, a))
    : [];
  const currentTarget = choices.find((t) => t.id === active?.update?.targetId);
  const suggestedTarget = choices.find((t) => t.id === active?.advice?.targetId);
  const differences = active && currentTarget ? importChanges(active, currentTarget) : [];
  const envLabel = (ids: string[]) =>
    ids.length
      ? ids.map((id) => environments.find((e) => e.id === id)?.name ?? '失效环境').join('、')
      : '系统通用';
  const originalLabels = (c: ImportCandidate) =>
    c.environmentNames.length ? c.environmentNames : [c.advice?.section || '未注明环境'];
  const similarities = useMemo(
    () =>
      new Map(
        candidates.map((c) => [
          c.id,
          {
            peers: candidates.filter((p) => p.id !== c.id && matchScore(c, p) >= 4),
            old: targets
              .filter((t) => matchScore(c, t) > 0)
              .sort((a, b) => matchScore(c, b) - matchScore(c, a)),
          },
        ]),
      ),
    [candidates, targets],
  );
  const problems = importCandidateProblems(snapshot, systemId, job?.kind ?? kind, candidates);
  const selected = candidates.filter((item) => item.selected);
  const valid =
    review && selected.length > 0 && selected.every((item) => !problems[item.id]?.length);

  async function refresh() {
    const next = await api().state();
    setState(next);
    if (next.job?.phase === 'review' && draftId.current !== next.job.id) {
      draftId.current = next.job.id;
      setCandidates(next.job.candidates);
      setSelectedId(next.job.candidates[0]?.id ?? '');
      setPasswordEdits({});
      setMapping({});
      setTab('all');
      setUnmatchedSources([]);
      setSourcePage(0);
    } else if (!next.job || ['complete', 'cancelled'].includes(next.job.phase)) {
      draftId.current = '';
      setCandidates([]);
      setPasswordEdits({});
      setSelectedId('');
      setUnmatchedSources([]);
      setSourcePage(0);
    }
  }
  useEffect(() => {
    let live = true;
    const update = () => {
      if (live) void refresh().catch((cause) => live && setError(String(cause)));
    };
    update();
    const unsubscribe = api().onChanged(update);
    const unlocked = window.desktop.onVaultStatus((status) => {
      if (!status.unlocked) {
        lockRevision.current++;
        setPasswordEdits({});
        setSources([]);
        setUnmatchedSources([]);
      }
    });
    return () => {
      live = false;
      unsubscribe();
      unlocked();
    };
  }, []);
  useEffect(
    () =>
      registerFlush(async () => {
        if (inFlight.current) await inFlight.current;
        const active = current.current.state?.job;
        if (active && !['parsing', 'analyzing', 'complete', 'cancelled'].includes(active.phase)) {
          setLeaving(true);
          throw new Error('文件导入尚未提交，请返回校对，或明确放弃本次内容。');
        }
      }),
    [registerFlush],
  );
  useEffect(() => {
    if (leaving) continueButton.current?.focus();
  }, [leaving]);
  useEffect(() => {
    let live = true;
    setSources([]);
    setFieldName('');
    setFieldValue('');
    if (job?.id && active)
      void api()
        .sources(job.id, active.sourceIds.slice(0, 50))
        .then((value) => live && setSources(value))
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [job?.id, active?.id]);

  async function perform(operation: () => Promise<unknown>) {
    if (working) return;
    setWorking(true);
    setError('');
    try {
      await operation();
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setWorking(false);
    }
  }
  function change(patch: Partial<ImportCandidate>, id = active?.id, reviewed = false) {
    setCandidates((items) =>
      items.map((item) =>
        item.id === id ? { ...item, ...patch, ...(reviewed ? {} : { reviewed: false }) } : item,
      ),
    );
  }
  function selectUpdate(targetId: string) {
    if (!active) return;
    const t = choices.find((x) => x.id === targetId);
    const scope = t?.environmentIds ?? [];
    change({
      selected: true,
      update: {
        targetId,
        fields:
          active.advice?.targetId === targetId
            ? (active.advice?.fields ?? []).filter(
                (k) => t && importChanges(active, t).some((d) => d.key === k),
              )
            : [],
      },
      environmentIds: [...scope],
      confirmDuplicate: false,
    });
  }
  function requestClose() {
    if (working) return;
    if (job && !['complete', 'cancelled'].includes(job.phase)) setLeaving(true);
    else onClose();
  }
  function applyMapping(label: string, value: string) {
    const next = { ...mapping, [label]: value };
    setMapping(next);
    setCandidates((items) =>
      items.map((item) => {
        const labels = originalLabels(item);
        if (!labels.includes(label)) return item;
        const values = [...new Set(labels.map((name) => next[name]).filter(Boolean))];
        const complete = labels.every((name) => next[name]);
        return {
          ...item,
          reviewed: false,
          ...(item.update ? { update: { ...item.update, environmentOverride: true } } : {}),
          environmentIds:
            !complete || (values.includes('common') && values.length > 1)
              ? null
              : values.includes('common')
                ? []
                : values,
        };
      }),
    );
  }
  function submit() {
    if (!valid || inFlight.current || !job) return;
    setWorking(true);
    setError('');
    setLeaving(false);
    const revision = lockRevision.current;
    inFlight.current = (async () => {
      try {
        const accounts = selected
          .filter((item) => !item.update)
          .flatMap((item) => (item.kind === 'account' ? [item] : item.accounts));
        if (
          accounts.some((account) =>
            Object.hasOwn(passwordEdits, account.id)
              ? Boolean(passwordEdits[account.id])
              : Boolean(account.passwordRef),
          ) &&
          !(await vault.ensureUnlocked())
        )
          return;
        if (revision !== lockRevision.current)
          throw new Error('凭据保护状态已变化，请重新确认密码后再提交。');
        const result = await api().commit({
          id: job.id,
          candidates: selected.map(({ advice: _, ...row }) => row),
          passwordEdits: Object.fromEntries(
            accounts
              .filter((a) => Object.hasOwn(passwordEdits, a.id))
              .map((a) => [a.id, passwordEdits[a.id]]),
          ),
        });
        setPasswordEdits({});
        setCandidates([]);
        onSaved(result.snapshot);
        await refresh();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        setWorking(false);
        inFlight.current = null;
      }
    })();
  }
  function referenceSelect(
    label: string,
    value: ImportReference | null,
    kinds: LedgerImportKind[],
    update: (next: ImportReference | null) => void,
  ) {
    if (active?.update) return null;
    const existing = [
      ...snapshot.resources.map((item) => ({
        id: item.id,
        kind: item.kind,
        name: item.name,
        systemId: item.systemId,
      })),
      ...snapshot.accessEntries.map((item) => ({
        id: item.id,
        kind: 'access' as const,
        name: item.name,
        systemId: item.systemId,
      })),
      ...snapshot.services.map((item) => ({
        id: item.id,
        kind: 'service' as const,
        name: item.name,
        systemId: item.systemId,
      })),
    ];
    const options = [
      { value: '', label: '不关联' },
      ...candidates
        .filter((item) => item.selected && item.id !== active?.id && kinds.includes(item.kind))
        .map((item) => ({
          value: `candidate:${item.id}`,
          label: `本次新增 · ${item.name || '未命名'}`,
        })),
      ...existing
        .filter((item) => item.systemId === systemId && kinds.includes(item.kind))
        .map((item) => ({ value: `existing:${item.id}`, label: `已有 · ${item.name}` })),
    ];
    return (
      <label>
        {label}
        <Select
          aria-label={label}
          value={referenceValue(value)}
          options={options}
          showSearch
          optionFilterProp="label"
          onChange={(next) => update(parseReference(next))}
        />
      </label>
    );
  }
  function passwordEditor(
    account: { id: string; passwordRef: string | null },
    label: string,
    changeSource: (passwordRef: string | null) => void,
  ) {
    const edited = Object.hasOwn(passwordEdits, account.id);
    return (
      <div className="local-import-password">
        <label>
          密码来源
          <Select
            aria-label={`${label} 密码来源`}
            value={account.passwordRef ?? ''}
            options={[
              { value: '', label: '不使用来源密码' },
              ...(job?.passwordSources ?? []).map((source) => ({
                value: source.id,
                label: source.location,
              })),
            ]}
            onChange={(value) => {
              changeSource(value || null);
              setPasswordEdits((edits) => {
                const next = { ...edits };
                delete next[account.id];
                return next;
              });
            }}
          />
        </label>
        <label>
          密码（加密保存）
          <Input.Password
            aria-label={`${label} 密码（加密保存）`}
            value={passwordEdits[account.id] ?? ''}
            placeholder={
              account.passwordRef && !edited ? '已识别来源密码，原值保持隐藏' : '留空表示不保存密码'
            }
            visibilityToggle={false}
            autoComplete="new-password"
            onChange={(event) => {
              setPasswordEdits((value) => ({ ...value, [account.id]: event.target.value }));
              if (active) change({}, active.id);
            }}
          />
        </label>
        {account.passwordRef && (
          <Checkbox
            checked={!edited}
            onChange={(event) => {
              setPasswordEdits((value) => {
                const next = { ...value };
                if (event.target.checked) delete next[account.id];
                else next[account.id] = '';
                return next;
              });
              if (active) change({}, active.id);
            }}
          >
            使用来源中的密码
          </Checkbox>
        )}
      </div>
    );
  }

  return (
    <Dialog
      title="文件导入 · 校对后保存"
      className="modal local-ledger-import-dialog"
      onClose={requestClose}
      closeDisabled={working}
      description={`目标系统：${target?.name ?? '未选择'}。解析和分析在本机完成，逐行校对后统一保存。`}
      error={error}
    >
      {leaving && (
        <Alert
          type="warning"
          showIcon
          title="本次内容尚未提交"
          description={
            <>
              <p>放弃会取消分析并清除本次原文、候选和密码修改，不影响已有台账。</p>
              <div className="modal-actions">
                <Button ref={continueButton} onClick={() => setLeaving(false)}>
                  继续校对
                </Button>
                <Button
                  danger
                  onClick={() =>
                    void perform(async () => {
                      if (job) await api().discard(job.id);
                      setPasswordEdits({});
                      onClose();
                    })
                  }
                >
                  放弃并关闭
                </Button>
              </div>
            </>
          }
        />
      )}
      {job && job.systemId !== systemId ? (
        <Alert
          type="warning"
          title="另一系统的文件导入尚未结束"
          description="请返回对应系统继续，或明确放弃后重新选择文件。"
          action={
            <Button danger onClick={() => setLeaving(true)}>
              放弃上次导入
            </Button>
          }
        />
      ) : (
        <>
          <Collapse
            size="small"
            key={setupDone ? 'review' : 'prepare'}
            defaultActiveKey={setupDone ? [] : ['prepare']}
            items={[
              {
                key: 'prepare',
                label: setupDone ? '模型与文件准备（已完成）' : '模型与文件准备',
                children: (
                  <section className="local-import-setup" aria-label="本地模型与文件准备">
                    <div className="local-import-runtime">
                      <div>
                        <h3>本地模型</h3>
                        <p className="muted">
                          {runtime?.phase === 'missing'
                            ? '未找到 Ollama，请先从官网安装。'
                            : runtime?.phase === 'starting'
                              ? '正在启动 Ollama…'
                              : runtime?.phase === 'ready' || runtime?.phase === 'downloading'
                                ? `Ollama ${runtime.version ?? ''} 已在本机运行`
                                : '启动已安装的 Ollama，准备分析所需的模型。'}
                        </p>
                      </div>
                      <div className="local-import-actions">
                        {runtime?.phase === 'missing' && (
                          <Button
                            onClick={() =>
                              void window.desktop.openExternal('https://ollama.com/download')
                            }
                          >
                            下载 Ollama
                          </Button>
                        )}
                        <Button
                          disabled={
                            working ||
                            runtime?.phase === 'starting' ||
                            runtime?.phase === 'downloading' ||
                            running
                          }
                          onClick={() => void perform(() => api().startOllama())}
                        >
                          {runtime?.phase === 'ready' ? '检查本地服务' : '启动 Ollama'}
                        </Button>
                      </div>
                    </div>
                    <div className="local-import-form-grid">
                      <label>
                        分析模型
                        <Select
                          aria-label="分析模型"
                          value={model}
                          disabled={running || working || runtime?.phase === 'downloading'}
                          onChange={setModel}
                          options={localImportModels.map((value) => ({
                            value,
                            label: value === 'qwen3:8b' ? 'Qwen3 8B' : 'Qwen3 4B',
                          }))}
                        />
                      </label>
                      <label>
                        分析范围
                        <Select
                          aria-label="文件分析范围"
                          value={job?.kind ?? kind}
                          disabled={
                            Boolean(job && !['complete', 'cancelled'].includes(job.phase)) ||
                            working
                          }
                          onChange={setKind}
                          options={[
                            { value: 'all', label: '当前系统 · 全部台账类型' },
                            ...Object.entries(ledgerImportKinds).map(([value, label]) => ({
                              value,
                              label: `仅${label}及其附属资料`,
                            })),
                          ]}
                        />
                      </label>
                    </div>
                    <div className="local-import-actions">
                      <Button
                        disabled={working || running || runtime?.phase !== 'ready'}
                        onClick={() => void perform(() => api().downloadModel(model))}
                      >
                        {runtime?.models.some((item) => item.name === model)
                          ? '校验所选模型'
                          : '下载所选模型'}
                      </Button>
                      {runtime?.phase === 'downloading' && (
                        <Button onClick={() => void perform(() => api().cancelDownload())}>
                          取消下载
                        </Button>
                      )}
                      <Button
                        disabled={
                          working ||
                          running ||
                          Boolean(job && !['complete', 'cancelled'].includes(job.phase))
                        }
                        onClick={() => void perform(() => api().chooseFile({ systemId, kind }))}
                      >
                        选择 Excel／Word／CSV
                      </Button>
                      {job?.phase === 'ready' ||
                      (job?.phase === 'failed' && job.sourceCount > 0) ? (
                        <Button
                          type="primary"
                          disabled={
                            working ||
                            runtime?.phase !== 'ready' ||
                            !runtime.models.some((item) => item.name === model)
                          }
                          onClick={() => void perform(() => api().analyze({ id: job.id, model }))}
                        >
                          开始本地分析
                        </Button>
                      ) : null}
                      {job && !['complete', 'cancelled'].includes(job.phase) && (
                        <Button disabled={working} onClick={() => setLeaving(true)}>
                          清空重选
                        </Button>
                      )}
                    </div>
                    {runtime?.download && (
                      <div role="status">
                        <Progress
                          percent={
                            runtime.download.total
                              ? Math.floor(
                                  (runtime.download.completed / runtime.download.total) * 100,
                                )
                              : 0
                          }
                        />
                        {runtime.download.message}
                      </div>
                    )}
                    {runtime?.error && <Alert type="warning" showIcon title={runtime.error} />}
                  </section>
                ),
              },
            ]}
          />
          {job && (
            <div className="local-import-job" role="status">
              <strong>{job.filename}</strong>
              <span>{job.progress.message}</span>
              {running && (
                <>
                  <Spin size="small" />
                  <Button onClick={() => void perform(() => api().cancel(job.id))}>取消分析</Button>
                </>
              )}
              {job.phase === 'analyzing' && job.progress.total > 1 && (
                <Progress
                  percent={Math.floor((job.progress.completed / job.progress.total) * 100)}
                />
              )}
            </div>
          )}
          {job?.error && <Alert type="error" showIcon title={job.error} />}
          {job?.warnings.length ? (
            <Collapse
              size="small"
              items={[
                {
                  key: 'warnings',
                  label: `需要留意的来源内容（${job.warnings.length}）`,
                  children: (
                    <ul>
                      {job.warnings.map((warning, index) => (
                        <li key={index}>{warning}</li>
                      ))}
                    </ul>
                  ),
                },
              ]}
            />
          ) : null}
          {job?.phase === 'complete' && (
            <>
              <Alert
                type="success"
                showIcon
                title={
                  job.updated
                    ? `已新增 ${job.created} 条、更新 ${job.updated} 条，所选内容全部保存。`
                    : `已新增 ${job.created} 条台账，所选内容全部保存。`
                }
                description="本次原文与分析草稿已清除。"
              />
              <Button type="primary" onClick={onClose}>
                完成
              </Button>
            </>
          )}
          {review && !candidates.length && (
            <Empty description="没有识别到候选，请检查来源、选择其他类型或改用另一模型。" />
          )}
          {review && candidates.length > 0 && (
            <>
              {job.unmatchedSourceIds.length > 0 && (
                <Collapse
                  size="small"
                  items={[
                    {
                      key: 'unmatched',
                      label: `未被候选引用的来源（${job.unmatchedSourceIds.length} 处）`,
                      children: (
                        <>
                          <p>
                            其中可能包含表头、背景说明或模型遗漏的资料。请结合原文件核对，不能将识别数量当作完整性证明。
                          </p>
                          <Button
                            onClick={() =>
                              void perform(async () => {
                                const ids = job.unmatchedSourceIds.slice(
                                  sourcePage * 50,
                                  (sourcePage + 1) * 50,
                                );
                                setUnmatchedSources(await api().sources(job.id, ids));
                                setSourcePage((value) =>
                                  (value + 1) * 50 >= job.unmatchedSourceIds.length ? 0 : value + 1,
                                );
                              })
                            }
                          >
                            查看下一组未引用来源
                          </Button>
                          <ul className="local-import-sources">
                            {unmatchedSources.map((source) => (
                              <li key={source.id}>
                                <strong>{source.location}</strong>
                                <pre>{source.text}</pre>
                              </li>
                            ))}
                          </ul>
                        </>
                      ),
                    },
                  ]}
                />
              )}
              <Collapse
                size="small"
                items={[
                  {
                    key: 'environments',
                    label: '映射来源环境',
                    children: (
                      <div className="local-import-form-grid">
                        {[...new Set(candidates.flatMap((item) => originalLabels(item)))].map(
                          (label) => (
                            <label key={label}>
                              {label}
                              <Select
                                aria-label={`来源环境 ${label}`}
                                placeholder="明确选择本系统环境或通用"
                                value={mapping[label]}
                                onChange={(value) => applyMapping(label, value)}
                                options={[
                                  { value: 'common', label: '系统通用' },
                                  ...environments.map((item) => ({
                                    value: item.id,
                                    label: item.name,
                                  })),
                                ]}
                              />
                            </label>
                          ),
                        )}
                      </div>
                    ),
                  },
                ]}
              />
              <Tabs
                activeKey={tab}
                onChange={setTab}
                items={[
                  { key: 'all', label: `全部（${candidates.length}）` },
                  ...Object.entries(ledgerImportKinds)
                    .filter(([kind]) => candidates.some((item) => item.kind === kind))
                    .map(([key, label]) => ({
                      key,
                      label: `${label}（${candidates.filter((item) => item.kind === key).length}）`,
                    })),
                ]}
              />
              <div className="local-import-review">
                <section className="local-import-list" aria-label="台账导入候选清单">
                  <Table<ImportCandidate>
                    size="small"
                    pagination={false}
                    rowKey="id"
                    dataSource={candidates.filter((item) => tab === 'all' || item.kind === tab)}
                    columns={[
                      {
                        title: '导入',
                        width: 50,
                        render: (_, item) => (
                          <Checkbox
                            aria-label={`导入候选 ${item.name}`}
                            checked={item.selected}
                            onChange={(event) =>
                              change({ selected: event.target.checked }, item.id)
                            }
                          />
                        ),
                      },
                      {
                        title: '候选资料',
                        render: (_, item) => (
                          <>
                            <Button
                              type="link"
                              className="local-import-name"
                              onClick={() => setSelectedId(item.id)}
                              aria-label={`编辑候选 ${item.name || '未命名'}`}
                            >
                              {item.name || '未命名'}
                            </Button>
                            <div>
                              {item.advice?.location} {item.advice?.section}
                            </div>
                            <div>
                              {item.selected ? (item.update ? '更新已有' : '新增') : '跳过'}
                              {similarities.get(item.id)?.peers.length ||
                              similarities.get(item.id)?.old.length
                                ? ' · 疑似重复'
                                : ''}
                            </div>
                            <div className="muted">
                              {ledgerImportKinds[item.kind]} ·{' '}
                              {item.environmentIds === null
                                ? '环境待确认'
                                : item.environmentIds.length
                                  ? item.environmentIds
                                      .map(
                                        (id) =>
                                          environments.find((environment) => environment.id === id)
                                            ?.name ?? '失效环境',
                                      )
                                      .join('、')
                                  : '系统通用'}
                            </div>
                          </>
                        ),
                      },
                      {
                        title: '校对',
                        width: 72,
                        render: (_, item) =>
                          !item.selected ? (
                            <Tag>跳过</Tag>
                          ) : (
                            <Tag color={problems[item.id]?.length ? 'orange' : 'green'}>
                              {problems[item.id]?.length ? '待校对' : '已确认'}
                            </Tag>
                          ),
                      },
                    ]}
                  />
                </section>
                <section className="local-import-detail" aria-label="候选详情">
                  {active ? (
                    <fieldset disabled={working}>
                      <div className="local-import-section">
                        <strong>
                          {active.advice?.location} {active.advice?.section}
                        </strong>
                        <p>
                          {active.advice?.environmentReason} · {active.advice?.evidence}
                        </p>
                        {(similarities.get(active.id)?.peers ?? []).map((p) => (
                          <div key={p.id}>
                            {active.advice?.modelPeerId === p.id ||
                            p.advice?.modelPeerId === active.id
                              ? '模型标记疑似重复'
                              : '本文件相似行'}{' '}
                            · {p.advice?.location} {p.advice?.section} · {p.name}（
                            {envLabel(p.environmentIds ?? [])}）
                          </div>
                        ))}
                        {(similarities.get(active.id)?.old ?? []).slice(0, 8).map((t) => (
                          <div key={t.id}>
                            已有台账相似 · {t.name}（{envLabel(t.environmentIds)}）
                          </div>
                        ))}
                        <div className="local-import-form-grid">
                          <label>
                            本行操作
                            <Select
                              aria-label="本行操作"
                              value={!active.selected ? 'skip' : active.update ? 'update' : 'new'}
                              options={[
                                { value: 'new', label: '新增独立记录' },
                                { value: 'skip', label: '跳过此行' },
                                {
                                  value: 'update',
                                  label: '更新已有记录',
                                  disabled: !choices.length,
                                },
                              ]}
                              onChange={(v) =>
                                v === 'skip'
                                  ? change({ selected: false })
                                  : v === 'new'
                                    ? change({
                                        selected: true,
                                        update: undefined,
                                        environmentIds: [...(active.advice?.environmentIds ?? [])],
                                        confirmDuplicate: true,
                                      })
                                    : selectUpdate(active.advice?.targetId ?? '')
                              }
                            />
                          </label>
                          {active.update && (
                            <label>
                              更新目标
                              <Select
                                aria-label="更新目标"
                                showSearch
                                optionFilterProp="label"
                                placeholder="选择同类型已有台账"
                                value={active.update.targetId || undefined}
                                options={choices.map((t) => ({
                                  value: t.id,
                                  label: `${t.name}（${envLabel(t.environmentIds)}）`,
                                }))}
                                onChange={(id) => selectUpdate(id)}
                              />
                            </label>
                          )}
                        </div>
                        {!active.update && active.advice?.targetId && suggestedTarget && (
                          <p>
                            可能对应“{suggestedTarget.name}”。
                            {importChanges(active, suggestedTarget)
                              .filter((d) => active.advice?.fields.includes(d.key))
                              .map((d) => d.label)
                              .join('、') || '暂无模型建议替换字段'}
                            <Button type="link" onClick={() => selectUpdate(suggestedTarget.id)}>
                              比较并选择字段
                            </Button>
                          </p>
                        )}
                        {currentTarget && active.update && (
                          <>
                            <p>
                              原环境：{envLabel(currentTarget.environmentIds)}
                              。仅更新勾选字段和确认的环境，原有账号及凭据保留。
                            </p>
                            {currentTarget.environmentIds.length > 0 &&
                              !!active.advice?.environmentIds.length &&
                              !['job', 'backup', 'node', 'account'].includes(active.kind) && (
                                <Button
                                  onClick={() =>
                                    change({
                                      update: { ...active.update!, environmentOverride: true },
                                      environmentIds: [
                                        ...new Set([
                                          ...currentTarget.environmentIds,
                                          ...(active.advice?.environmentIds ?? []),
                                        ]),
                                      ],
                                    })
                                  }
                                >
                                  追加来源环境
                                </Button>
                              )}
                            {differences.length === 0 ? (
                              <p>普通字段一致，可调整环境或跳过。</p>
                            ) : (
                              differences.map((d) => (
                                <div key={d.key}>
                                  <Checkbox
                                    aria-label={`替换 ${d.label}`}
                                    checked={active.update!.fields.includes(d.key)}
                                    onChange={(e) =>
                                      change({
                                        update: {
                                          ...active.update!,
                                          targetId: currentTarget.id,
                                          fields: e.target.checked
                                            ? [...active.update!.fields, d.key]
                                            : active.update!.fields.filter((k) => k !== d.key),
                                        },
                                      })
                                    }
                                  >
                                    {d.label} · {d.before || '空'} → {d.after}{' '}
                                    {active.advice?.targetId === currentTarget.id &&
                                    active.advice.fields.includes(d.key)
                                      ? '（模型建议）'
                                      : ''}
                                  </Checkbox>
                                </div>
                              ))
                            )}
                          </>
                        )}
                      </div>
                      <div className="local-import-form-grid">
                        <label>
                          台账类型
                          <Select
                            aria-label="候选台账类型"
                            value={active.kind}
                            disabled={job.kind !== 'all'}
                            options={Object.entries(ledgerImportKinds).map(([value, label]) => ({
                              value,
                              label,
                            }))}
                            onChange={(value) =>
                              change({
                                kind: value,
                                update: undefined,
                                confirmDuplicate: false,
                                environmentIds: [...(active.advice?.environmentIds ?? [])],
                              })
                            }
                          />
                        </label>
                        <label>
                          名称
                          <Input
                            aria-label="候选名称"
                            value={active.name}
                            onChange={(event) => change({ name: event.target.value })}
                          />
                        </label>
                        <label className="local-import-wide">
                          适用环境
                          <Select
                            aria-label="候选适用环境"
                            mode="multiple"
                            placeholder="选择已有环境或系统通用"
                            value={
                              active.environmentIds === null
                                ? []
                                : active.environmentIds.length
                                  ? active.environmentIds
                                  : ['common']
                            }
                            options={[
                              { value: 'common', label: '系统通用' },
                              ...environments.map((item) => ({ value: item.id, label: item.name })),
                            ]}
                            onChange={(values) =>
                              change({
                                ...(active.update
                                  ? { update: { ...active.update, environmentOverride: true } }
                                  : {}),
                                environmentIds:
                                  values.includes('common') &&
                                  values[values.length - 1] === 'common'
                                    ? []
                                    : values.filter((id) => id !== 'common'),
                              })
                            }
                          />
                        </label>
                        {['server', 'node'].includes(active.kind) && (
                          <>
                            <label>
                              地址／IP
                              <Input
                                aria-label="候选地址／IP"
                                value={active.address}
                                onChange={(event) => change({ address: event.target.value })}
                              />
                            </label>
                            <label>
                              端口
                              <Input
                                aria-label="候选端口"
                                value={active.port}
                                onChange={(event) => change({ port: event.target.value })}
                              />
                            </label>
                          </>
                        )}
                        {active.kind === 'service' && (
                          <label className="local-import-wide">
                            代码仓库
                            <Input
                              aria-label="候选代码仓库"
                              value={active.repository}
                              onChange={(event) => change({ repository: event.target.value })}
                            />
                          </label>
                        )}
                        {active.kind === 'node' && (
                          <>
                            {referenceSelect(
                              '节点所属服务',
                              active.service,
                              ['service'],
                              (service) => change({ service }),
                            )}
                            {referenceSelect(
                              '节点关联服务器',
                              active.server,
                              ['server'],
                              (server) => change({ server }),
                            )}
                            <label>
                              运行方式
                              <Select
                                aria-label="候选运行方式"
                                value={active.mode}
                                options={[
                                  { value: 'fixed', label: '固定' },
                                  { value: 'scheduled', label: '按需' },
                                ]}
                                onChange={(mode) =>
                                  change({
                                    mode,
                                    observed: [...new Set([...(active.observed ?? []), 'mode'])],
                                  })
                                }
                              />
                            </label>
                            <label>
                              节点规模
                              <Input
                                aria-label="候选节点规模"
                                value={active.count}
                                onChange={(event) => change({ count: event.target.value })}
                              />
                            </label>
                          </>
                        )}
                        {!active.update && active.kind === 'account' && (
                          <>
                            {referenceSelect(
                              '账号所属对象',
                              active.owner,
                              ['server', 'database', 'redis', 'other', 'access'],
                              (owner) => change({ owner }),
                            )}
                            <label>
                              用户名
                              <Input
                                aria-label="候选用户名"
                                value={active.username}
                                onChange={(event) => change({ username: event.target.value })}
                              />
                            </label>
                          </>
                        )}
                        {['job', 'backup'].includes(active.kind) && (
                          <>
                            <label>
                              频率
                              <Input
                                aria-label="候选频率"
                                value={active.frequency}
                                onChange={(event) => change({ frequency: event.target.value })}
                              />
                            </label>
                            <label>
                              状态
                              <Select
                                aria-label="候选运行状态"
                                value={active.status}
                                options={[
                                  { value: 'unverified', label: '待确认' },
                                  { value: 'active', label: '在用' },
                                  { value: 'inactive', label: '停用' },
                                ]}
                                onChange={(status) =>
                                  change({
                                    status,
                                    observed: [...new Set([...(active.observed ?? []), 'status'])],
                                  })
                                }
                              />
                            </label>
                            {referenceSelect(
                              '运维关联服务',
                              active.service,
                              ['service'],
                              (service) => change({ service }),
                            )}
                            {referenceSelect(
                              '运维关联资源',
                              active.owner,
                              ['server', 'database', 'redis', 'other'],
                              (owner) => change({ owner }),
                            )}
                          </>
                        )}
                        <label className="local-import-wide">
                          说明
                          <Input.TextArea
                            aria-label="候选说明"
                            autoSize={{ minRows: 2, maxRows: 5 }}
                            value={active.notes}
                            onChange={(event) => change({ notes: event.target.value })}
                          />
                        </label>
                        {(!['account', 'node'].includes(active.kind) || active.tags.length > 0) && (
                          <label className="local-import-wide">
                            标签
                            <Select
                              aria-label="候选标签"
                              disabled={!!active.update}
                              mode="tags"
                              value={active.tags}
                              onChange={(tags) => change({ tags })}
                            />
                          </label>
                        )}
                      </div>
                      {!active.update &&
                        active.kind === 'account' &&
                        passwordEditor(active, '独立账号', (passwordRef) =>
                          change({ passwordRef }),
                        )}
                      {!active.update &&
                        (resourceKinds.includes(active.kind) || active.accounts.length > 0) && (
                          <section className="local-import-section">
                            <h4>账号（{active.accounts.length}）</h4>
                            {active.accounts.map((account, index) => (
                              <div className="local-import-entry" key={account.id}>
                                <div className="local-import-form-grid">
                                  <label>
                                    用途／角色
                                    <Input
                                      aria-label={`账号 ${index + 1} 用途`}
                                      value={account.name}
                                      onChange={(event) =>
                                        change({
                                          accounts: active.accounts.map((item) =>
                                            item.id === account.id
                                              ? { ...item, name: event.target.value }
                                              : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <label>
                                    用户名
                                    <Input
                                      aria-label={`账号 ${index + 1} 用户名`}
                                      value={account.username}
                                      onChange={(event) =>
                                        change({
                                          accounts: active.accounts.map((item) =>
                                            item.id === account.id
                                              ? { ...item, username: event.target.value }
                                              : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                  <label className="local-import-wide">
                                    账号说明
                                    <Input.TextArea
                                      aria-label={`账号 ${index + 1} 说明`}
                                      value={account.notes}
                                      onChange={(event) =>
                                        change({
                                          accounts: active.accounts.map((item) =>
                                            item.id === account.id
                                              ? { ...item, notes: event.target.value }
                                              : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                </div>
                                {passwordEditor(account, `账号 ${index + 1}`, (passwordRef) =>
                                  change({
                                    accounts: active.accounts.map((item) =>
                                      item.id === account.id ? { ...item, passwordRef } : item,
                                    ),
                                  }),
                                )}
                                <Button
                                  size="small"
                                  danger
                                  onClick={() =>
                                    change({
                                      accounts: active.accounts.filter(
                                        (item) => item.id !== account.id,
                                      ),
                                    })
                                  }
                                >
                                  移除账号 {index + 1}
                                </Button>
                              </div>
                            ))}
                            <Button
                              onClick={() =>
                                change({
                                  accounts: [
                                    ...active.accounts,
                                    {
                                      id: newId(active.id),
                                      name: `账号 ${active.accounts.length + 1}`,
                                      username: '',
                                      notes: '',
                                      passwordRef: null,
                                    },
                                  ],
                                })
                              }
                            >
                              增加账号
                            </Button>
                          </section>
                        )}
                      {(active.kind === 'access' || active.addresses.length > 0) && (
                        <section className="local-import-section">
                          <h4>访问地址</h4>
                          {active.addresses.map((address, index) => (
                            <div className="local-import-entry" key={address.id}>
                              <label>
                                地址名称
                                <Input
                                  aria-label={`地址 ${index + 1} 名称`}
                                  value={address.label}
                                  onChange={(event) =>
                                    change({
                                      addresses: active.addresses.map((item) =>
                                        item.id === address.id
                                          ? { ...item, label: event.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <label>
                                HTTP(S) 地址
                                <Input
                                  aria-label={`地址 ${index + 1} URL`}
                                  value={address.url}
                                  onChange={(event) =>
                                    change({
                                      addresses: active.addresses.map((item) =>
                                        item.id === address.id
                                          ? { ...item, url: event.target.value }
                                          : item,
                                      ),
                                    })
                                  }
                                />
                              </label>
                              <Button
                                size="small"
                                danger
                                onClick={() =>
                                  change({
                                    addresses: active.addresses.filter(
                                      (item) => item.id !== address.id,
                                    ),
                                  })
                                }
                              >
                                移除地址 {index + 1}
                              </Button>
                            </div>
                          ))}
                          <Button
                            onClick={() =>
                              change({
                                addresses: [
                                  ...active.addresses,
                                  {
                                    id: newId(active.id),
                                    label: `地址 ${active.addresses.length + 1}`,
                                    url: '',
                                  },
                                ],
                              })
                            }
                          >
                            增加地址
                          </Button>
                        </section>
                      )}
                      {(['database', 'redis', 'other'].includes(active.kind) ||
                        active.connections.length > 0) && (
                        <section className="local-import-section">
                          <h4>资源连接</h4>
                          {active.connections.map((connection, index) => (
                            <div className="local-import-entry" key={connection.id}>
                              <div className="local-import-form-grid">
                                {(['label', 'address', 'port', 'role'] as const).map((field) => (
                                  <label key={field}>
                                    {
                                      {
                                        label: '连接名称',
                                        address: '地址',
                                        port: '端口',
                                        role: '用途／角色',
                                      }[field]
                                    }
                                    <Input
                                      aria-label={`连接 ${index + 1} ${field}`}
                                      value={connection[field]}
                                      onChange={(event) =>
                                        change({
                                          connections: active.connections.map((item) =>
                                            item.id === connection.id
                                              ? { ...item, [field]: event.target.value }
                                              : item,
                                          ),
                                        })
                                      }
                                    />
                                  </label>
                                ))}
                                {referenceSelect(
                                  `连接 ${index + 1} 服务器`,
                                  connection.server,
                                  ['server'],
                                  (server) =>
                                    change({
                                      connections: active.connections.map((item) =>
                                        item.id === connection.id ? { ...item, server } : item,
                                      ),
                                    }),
                                )}
                              </div>
                              <Button
                                size="small"
                                danger
                                onClick={() =>
                                  change({
                                    connections: active.connections.filter(
                                      (item) => item.id !== connection.id,
                                    ),
                                  })
                                }
                              >
                                移除连接 {index + 1}
                              </Button>
                            </div>
                          ))}
                          <Button
                            onClick={() =>
                              change({
                                connections: [
                                  ...active.connections,
                                  {
                                    id: newId(active.id),
                                    label: `连接 ${active.connections.length + 1}`,
                                    address: '',
                                    port: '',
                                    role: '',
                                    server: null,
                                  },
                                ],
                              })
                            }
                          >
                            增加连接
                          </Button>
                        </section>
                      )}
                      <Collapse
                        size="small"
                        items={[
                          {
                            key: 'sources',
                            label: `核对原文位置（${active.sourceIds.length}）`,
                            children: sources.length ? (
                              <>
                                {active.sourceIds.length > 50 && (
                                  <p>这里只显示前 50 处来源的短预览，其余内容请结合原文件核对。</p>
                                )}
                                <ul className="local-import-sources">
                                  {sources.map((source) => (
                                    <li key={source.id}>
                                      <strong>{source.location}</strong>
                                      <pre>{source.text}</pre>
                                    </li>
                                  ))}
                                </ul>
                              </>
                            ) : (
                              <p>暂无可核对的来源，请结合原文件检查。</p>
                            ),
                          },
                          {
                            key: 'fields',
                            label: '附加资料',
                            children: (
                              <>
                                {Object.entries(active.fields).map(([key, value]) => (
                                  <div key={key} className="local-import-extra">
                                    <label>
                                      {key}
                                      <Input.TextArea
                                        aria-label={`附加资料 ${key}`}
                                        value={value}
                                        onChange={(event) =>
                                          change({
                                            fields: { ...active.fields, [key]: event.target.value },
                                          })
                                        }
                                      />
                                    </label>
                                    <Button
                                      danger
                                      onClick={() => {
                                        const fields = { ...active.fields };
                                        delete fields[key];
                                        change({ fields });
                                      }}
                                    >
                                      移除
                                    </Button>
                                  </div>
                                ))}
                                <div className="local-import-form-grid">
                                  <Input
                                    aria-label="导入附加资料名称"
                                    placeholder="字段名称"
                                    value={fieldName}
                                    onChange={(event) => setFieldName(event.target.value)}
                                  />
                                  <Input
                                    aria-label="导入附加资料内容"
                                    placeholder="普通资料内容"
                                    value={fieldValue}
                                    onChange={(event) => setFieldValue(event.target.value)}
                                  />
                                </div>
                                <Button
                                  disabled={
                                    !ledgerImportFieldKinds.includes(active.kind) ||
                                    !fieldName.trim() ||
                                    Object.hasOwn(active.fields, fieldName.trim())
                                  }
                                  onClick={() => {
                                    change({
                                      fields: { ...active.fields, [fieldName.trim()]: fieldValue },
                                    });
                                    setFieldName('');
                                    setFieldValue('');
                                  }}
                                >
                                  添加附加资料
                                </Button>
                              </>
                            ),
                          },
                        ]}
                      />
                      {active.warnings.length > 0 && (
                        <Alert
                          type="warning"
                          title="识别时发现待核对内容"
                          description={
                            <ul>
                              {active.warnings.map((warning, index) => (
                                <li key={index}>{warning}</li>
                              ))}
                            </ul>
                          }
                        />
                      )}
                      {problems[active.id]?.length > 0 && (
                        <ul className="local-import-problems" aria-label="候选待处理问题">
                          {problems[active.id].map((problem, index) => (
                            <li key={index}>{problem}</li>
                          ))}
                        </ul>
                      )}
                      <div className="local-import-checks">
                        <Checkbox
                          disabled={!!active.update}
                          checked={active.confirmDuplicate}
                          onChange={(event) => change({ confirmDuplicate: event.target.checked })}
                        >
                          疑似重复时，仍新增为独立记录
                        </Checkbox>
                        <Checkbox
                          checked={active.reviewed}
                          onChange={(event) =>
                            change({ reviewed: event.target.checked }, active.id, true)
                          }
                        >
                          我已核对本条来源、环境和关联
                        </Checkbox>
                      </div>
                    </fieldset>
                  ) : (
                    <Empty description="选择左侧候选，核对后再导入" />
                  )}
                </section>
              </div>
              <div className="local-import-footer">
                <p>
                  已选 {selected.length} 条，
                  {selected.filter((item) => !problems[item.id]?.length).length}{' '}
                  条完成校对。来源密码保持隐藏。
                </p>
                <Button
                  type="primary"
                  aria-label="确认保存所选台账"
                  disabled={!valid || working}
                  loading={working}
                  onClick={submit}
                >
                  确认保存所选台账
                </Button>
              </div>
            </>
          )}
          {!state && <Spin tip="正在读取本地任务" />}
        </>
      )}
    </Dialog>
  );
}
