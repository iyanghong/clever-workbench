import { Alert, Button, Checkbox, Collapse, Empty, Input, Progress, Select, Spin, Tag } from 'antd';
import { useEffect, useRef, useState, useMemo } from 'react';
import {
  FileArrowUpIcon,
  FileTextIcon,
  GearSixIcon,
  DesktopIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { Dialog } from '../../shared/Dialog';
import { completeCandidateUrls, completeImportUrl } from '../../ledger-import-url';
import { AnalysisModels } from '../settings/AnalysisModels';
import { MatchPanel, MappingDialog, ImportSummary, actionLabel } from './ImportReviewPanels';
import { importMatchScope, reviewMatches } from '../../ledger-import-matches';
import { environmentsOverlap } from '../../ledger-workspace-types';
import type { ModelSettings } from '../../ledger-import-types';
import { useVault } from '../vault/VaultProvider';
import type { Snapshot } from '../../types';
import {
  ledgerImportKinds,
  ledgerImportFieldKinds,
  type ImportCandidate,
  type ImportReference,
  type ImportSource,
  type LedgerImportKind,
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
  const [config, setConfig] = useState<ModelSettings | null>(null),
    [managing, setManaging] = useState(false);
  const [permission, setPermission] = useState(''),
    [remote, setRemote] = useState(false);
  const [summary, setSummary] = useState(false),
    [showMap, setShowMap] = useState(false),
    [mobileDetail, setMobileDetail] = useState(false);
  const manual = useRef(new Set<string>()),
    decided = useRef(new Map<string, string>()),
    queue = useRef<HTMLDivElement>(null),
    detail = useRef<HTMLDivElement>(null);
  const newScopes = useRef(new Map<string, string[] | null>());
  const [finishedSkips, setFinishedSkips] = useState(0);
  const allPosition = useRef({ id: '', top: 0 });
  const [filterDone, setFilterDone] = useState(false);
  useEffect(() => {
    let live = true;
    void api()
      .settings()
      .then((s) => {
        if (live) setConfig(s);
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    return () => {
      live = false;
    };
  }, [managing]);
  const model = config?.localModel ?? 'qwen3:8b';
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
        .sort(
          (a, b) =>
            matchScore(active, b, candidates, targets) - matchScore(active, a, candidates, targets),
        )
    : [];
  const currentTarget = choices.find((t) => t.id === active?.update?.targetId);
  const differences = active && currentTarget ? importChanges(active, currentTarget) : [];
  const envLabel = (ids: string[] | null) =>
    ids === null
      ? '环境待确认'
      : ids.length
        ? ids.map((id) => environments.find((e) => e.id === id)?.name ?? '失效环境').join('、')
        : '系统通用';
  const matches = useMemo(
    () => new Map(candidates.map((r) => [r.id, reviewMatches(r, candidates, targets, snapshot)])),
    [candidates, targets, snapshot],
  );
  const activeMatches = (active && matches.get(active.id)) ?? [];
  const suggestedTarget = choices.find(
    (t) =>
      t.id === active?.advice?.targetId &&
      activeMatches.some((m) => m.origin === 'ledger' && m.id === t.id),
  );
  const strong = (r: ImportCandidate) => matches.get(r.id)?.some((m) => m.strong) ?? false;
  const signature = (id: string) =>
    JSON.stringify(
      matches
        .get(id)
        ?.filter((m) => m.strong)
        .map((m) => [m.origin, m.id, m.name, m.sharedAddress, m.reasons]),
    );
  const disposition = (r: ImportCandidate) =>
    !strong(r) || decided.current.get(r.id) === signature(r.id);

  const problems = importCandidateProblems(snapshot, systemId, job?.kind ?? kind, candidates);
  const selected = candidates.filter((r) => r.selected);
  const checkedRow = (r: ImportCandidate) =>
    r.reviewed && !problems[r.id]?.length && disposition(r);
  const visible = candidates.filter(
    (r) => tab === 'all' || (tab === 'duplicates' ? strong(r) : !checkedRow(r)),
  );
  const valid = review && candidates.length > 0 && candidates.every(checkedRow);
  const file = job?.phase === 'cancelled' ? null : job;
  const binding = file && config?.service ? file.id + ':' + config.service.revision : '';
  const canRemote = !!binding && permission === binding;
  const useRemote = remote && canRemote;
  useEffect(() => {
    setPermission('');
    setRemote(false);
  }, [job?.id, config?.service?.revision]);
  const openRow = (id: string) => {
    setSelectedId(id);
    setFilterDone(false);
    setMobileDetail(true);
    setError('');
    detail.current?.scrollTo(0, 0);
  };
  function filterRows(next: string) {
    if (next === tab) return;
    if (tab === 'all') allPosition.current = { id: selectedId, top: queue.current?.scrollTop ?? 0 };
    setTab(next);
    setFilterDone(false);
    const list = candidates.filter(
      (r) => next === 'all' || (next === 'duplicates' ? strong(r) : !checkedRow(r)),
    );
    setSelectedId(
      next === 'all' && allPosition.current.id
        ? allPosition.current.id
        : (list.find((r) => r.id === selectedId)?.id ?? list[0]?.id ?? ''),
    );
    detail.current?.scrollTo(0, 0);
    requestAnimationFrame(() =>
      queue.current?.scrollTo(0, next === 'all' ? allPosition.current.top : 0),
    );
  }
  function confirmRow() {
    if (!active) return;
    if (!disposition(active)) {
      setError('请先在比对对象下选择保留为新增、更新已有或跳过本条。');
      detail.current?.querySelector<HTMLElement>('.import-decisions button')?.focus();
      return;
    }
    const checked = { ...completeCandidateUrls(active), reviewed: true };
    const next = candidates.map((r) => (r.id === active.id ? checked : r));
    const nextProblems = importCandidateProblems(snapshot, systemId, job?.kind ?? kind, next);
    const issues = nextProblems[active.id];
    if (issues?.length) {
      setError(issues[0]);
      const fields = detail.current?.querySelector<HTMLDetailsElement>('.import-fields');
      if (fields) fields.open = true;
      const addressNumber = /^地址 (\d+)：/.exec(issues[0])?.[1];
      const label = addressNumber
        ? `地址 ${addressNumber} URL`
        : issues[0].includes('名称')
          ? '候选名称'
          : issues[0].includes('环境')
            ? '候选适用环境'
            : issues[0].includes('目标')
              ? '更新目标'
              : '';
      const field = label
        ? detail.current?.querySelector<HTMLElement>('[aria-label="' + label + '"]')
        : detail.current?.querySelector<HTMLElement>('.local-import-problems');
      field?.focus();
      field?.scrollIntoView({ block: 'nearest' });
      return;
    }
    setCandidates(next);
    setError('');
    const pending = next.filter(
      (r) => !r.reviewed || nextProblems[r.id]?.length || !disposition(r),
    );
    if (!pending.length) {
      setSummary(true);
      return;
    }
    const left = pending.filter((r) => tab !== 'duplicates' || strong(r));
    if (!left.length) {
      setFilterDone(true);
      return;
    }
    const i = candidates.indexOf(active);
    openRow((left.find((r) => next.indexOf(r) > i) ?? left[0]).id);
  }
  async function refresh() {
    const next = await api().state();
    setState(next);
    if (next.job?.phase === 'review' && draftId.current !== next.job.id) {
      draftId.current = next.job.id;
      setCandidates(next.job.candidates);
      setSelectedId(next.job.candidates[0]?.id ?? '');
      setPasswordEdits({});
      manual.current.clear();
      newScopes.current.clear();
      setFinishedSkips(0);
      decided.current.clear();
      setSummary(false);
      setFilterDone(false);
      setMobileDetail(false);
      setTab('all');
      setUnmatchedSources([]);
      setSourcePage(0);
    } else if (!next.job || ['complete', 'cancelled'].includes(next.job.phase)) {
      draftId.current = '';
      setSummary(false);
      setFilterDone(false);
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
  function editRows(edit: (rows: ImportCandidate[]) => ImportCandidate[]) {
    setCandidates((rows) => {
      const next = edit(rows);
      return next.map((r) => {
        if (decided.current.has(r.id) || !r.advice) return r;
        if (r.update && r.update.targetId === r.advice.targetId) {
          const t = targets.find((t) => t.id === r.update!.targetId);
          if (!environmentsOverlap(r.environmentIds, t?.environmentIds ?? null))
            return { ...r, update: undefined, reviewed: false };
        }
        if (r.selected || r.advice.action !== 'skip') return r;
        const stillMatches = reviewMatches(r, next, targets, snapshot).some(
          (m) =>
            m.strong &&
            (m.origin === 'file' ? m.id === r.advice?.modelPeerId : m.id === r.advice?.targetId),
        );
        return stillMatches ? r : { ...r, selected: true, reviewed: false };
      });
    });
  }
  function change(patch: Partial<ImportCandidate>, id = active?.id, reviewed = false) {
    if (patch.addresses && error.startsWith('地址 ')) setError('');
    editRows((items) =>
      items.map((item) =>
        item.id === id ? { ...item, ...patch, ...(reviewed ? {} : { reviewed: false }) } : item,
      ),
    );
  }
  function editUrl(row: ImportCandidate, id: string, url: string) {
    change(
      {
        addresses: row.addresses.map((address) =>
          address.id === id ? { ...address, url } : address,
        ),
      },
      row.id,
    );
  }
  function selectUpdate(targetId: string) {
    if (!active) return;
    const t = choices.find((x) => x.id === targetId);
    decided.current.set(active.id, signature(active.id));
    if (active.update?.targetId === targetId) {
      change({ selected: true });
      return;
    }
    if (!active.update) newScopes.current.set(active.id, active.environmentIds);
    const scope = t?.environmentIds ?? [];
    change({
      selected: true,
      update: {
        targetId,
        fields:
          suggestedTarget?.id === targetId
            ? (active.advice?.fields ?? []).filter(
                (k) => t && importChanges(active, t).some((d) => d.key === k),
              )
            : [],
      },
      environmentIds: t ? [...scope] : active.environmentIds,
      confirmDuplicate: false,
    });
  }
  function requestClose() {
    if (working) return;
    setError('');
    if (job && !['complete', 'cancelled'].includes(job.phase)) setLeaving(true);
    else onClose();
  }
  function chooseAction(v: string) {
    if (!active) return;
    decided.current.set(active.id, signature(active.id));
    setError('');
    if (v === 'update') {
      const match = activeMatches.find(
        (m) => m.origin === 'ledger' && m.strong && m.kind === active.kind,
      );
      selectUpdate(active.update?.targetId ?? suggestedTarget?.id ?? match?.id ?? '');
      return;
    }
    change(
      v === 'skip'
        ? {
            selected: false,
            update: undefined,
            environmentIds: active.update
              ? (newScopes.current.get(active.id) ?? active.advice?.environmentIds ?? [])
              : active.environmentIds,
          }
        : {
            selected: true,
            update: undefined,
            confirmDuplicate: true,
            environmentIds: active.update
              ? (newScopes.current.get(active.id) ?? active.advice?.environmentIds ?? [])
              : active.environmentIds,
          },
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
        if (!selected.length) {
          await api().discard(job.id);
          setFinishedSkips(candidates.length);
          setSummary(false);
          return;
        }
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

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        !managing &&
        !showMap &&
        !leaving &&
        !document.querySelector('.ant-select-open,.ant-modal-root .ant-modal')
      )
        requestClose();
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [job, working, managing, showMap, leaving]);
  if (finishedSkips)
    return (
      <main className="main import-page">
        <h1>导入结果</h1>
        <Alert type="success" title={`已跳过全部 ${finishedSkips} 条候选，本次未写入台账。`} />
        <Button onClick={onClose}>返回技术台账</Button>
      </main>
    );
  if (managing)
    return (
      <main className="main import-page">
        <AnalysisModels onBack={() => setManaging(false)} />
      </main>
    );
  const modelReady = runtime?.phase === 'ready' && runtime.models.some((m) => m.name === model);
  const needsModel = runtime?.phase === 'missing' || (runtime?.phase === 'ready' && !modelReady);
  const runtimeStatus = !runtime
    ? '正在读取本机服务'
    : {
        missing: '尚未安装 Ollama',
        stopped: 'Ollama 尚未启动',
        starting: '正在启动 Ollama',
        failed: 'Ollama 启动失败',
        downloading: '正在下载本机模型',
        ready: modelReady ? '本机模型已就绪' : '尚未下载所选模型',
      }[runtime.phase];
  function setupAction() {
    if (running && file)
      return (
        <Button disabled={working} onClick={() => void perform(() => api().cancel(file.id))}>
          取消分析
        </Button>
      );
    if (file?.phase === 'failed' && !file.sourceCount) return null;
    if (!useRemote && needsModel)
      return (
        <Button
          type={file ? 'primary' : 'default'}
          disabled={working}
          onClick={() => setManaging(true)}
        >
          {runtime?.phase === 'missing' ? '前往安装 Ollama' : '前往准备模型'}
        </Button>
      );
    if (!useRemote && !modelReady)
      return (
        <Button
          type={file ? 'primary' : 'default'}
          disabled={
            !runtime || working || runtime.phase === 'starting' || runtime.phase === 'downloading'
          }
          onClick={() => void perform(() => api().startOllama())}
        >
          启动 Ollama
        </Button>
      );
    if (!file?.sourceCount) return null;
    return (
      <Button
        type="primary"
        disabled={working}
        onClick={() =>
          void perform(() =>
            useRemote && config?.service
              ? api().analyzeRemote({
                  fileId: file.id,
                  serviceRevision: config.service.revision,
                  allow: true,
                })
              : api().analyze({ id: file.id, model }),
          )
        }
      >
        {useRemote ? '使用' + config?.service?.name + '提取此文件' : '开始本地分析'}
      </Button>
    );
  }
  const addressIssue = review && /^地址 (\d+)：(.+)$/.exec(error);
  const sourceWarnings = job?.warnings.length ? (
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
  ) : null;
  return (
    <main
      className={'main import-page' + (!setupDone ? ' import-preparation' : '')}
      aria-label="文件导入 · 校对后保存"
    >
      <header className="import-page-title">
        <div>
          <small>技术台账 / {target?.name}</small>
          <h1>
            {job?.phase === 'complete'
              ? '导入结果'
              : summary
                ? '确认保存'
                : review
                  ? '校对候选'
                  : '文件导入'}
          </h1>
          {setupDone && (
            <p>
              {job?.filename} {review && ' · ' + candidates.length + ' 条候选'}{' '}
              {job?.analysisLabel && ' · ' + job.analysisLabel}
            </p>
          )}
        </div>
        <Button disabled={working} onClick={requestClose}>
          返回技术台账
        </Button>
      </header>
      <nav className="import-steps" aria-label="导入步骤">
        {['选文件与分析', '校对候选', '确认保存'].map((title, i) => (
          <span
            key={title}
            aria-current={
              i === (summary || job?.phase === 'complete' ? 2 : review ? 1 : 0) ? 'step' : undefined
            }
          >
            <b aria-hidden="true">{i + 1}</b>
            {title}
          </span>
        ))}
      </nav>
      {error && !leaving && !addressIssue && (
        <Alert role="alert" type="error" title={error} closable onClose={() => setError('')} />
      )}
      {showMap && (
        <MappingDialog
          rows={candidates}
          environments={environments}
          manual={manual.current}
          close={() => setShowMap(false)}
          apply={(changes) => {
            editRows((rows) =>
              rows.map((r) =>
                changes.has(r.id) ? { ...r, environmentIds: changes.get(r.id)! } : r,
              ),
            );
            setShowMap(false);
          }}
        />
      )}
      {leaving && (
        <Dialog
          title="放弃本次导入？"
          description="放弃会清除本次文件预览、校对内容和密码修改。"
          onClose={() => setLeaving(false)}
          onShown={() => continueButton.current?.focus()}
          closeDisabled={working}
          error={error || undefined}
        >
          <div className="modal-actions">
            <Button
              danger
              disabled={working}
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
            <Button
              type="primary"
              ref={continueButton}
              disabled={working}
              onClick={() => setLeaving(false)}
            >
              继续校对
            </Button>
          </div>
        </Dialog>
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
          {!setupDone && (
            <section className="import-setup-card" aria-label="导入设置">
              <section className="import-setup-group" aria-labelledby="import-source-title">
                <h2 id="import-source-title">导入资料</h2>
                <div className="import-setup-row">
                  <label htmlFor={file ? undefined : 'import-kind'}>分析范围</label>
                  {file ? (
                    <span>
                      {file.kind === 'all'
                        ? '当前系统 · 全部台账类型'
                        : ledgerImportKinds[file.kind]}
                    </span>
                  ) : (
                    <Select
                      id="import-kind"
                      aria-label="文件分析范围"
                      value={kind}
                      onChange={setKind}
                      disabled={working}
                      options={[
                        { value: 'all', label: '当前系统 · 全部台账类型' },
                        ...Object.entries(ledgerImportKinds).map(([value, label]) => ({
                          value,
                          label,
                        })),
                      ]}
                    />
                  )}
                </div>
                <div className="import-setup-row">
                  <span className="import-setup-label">来源文件</span>
                  <div className="import-file-field">
                    <span className="import-file-icon" aria-hidden="true">
                      {file ? <FileTextIcon /> : <FileArrowUpIcon />}
                    </span>
                    <div className="import-file-caption">
                      <strong>{file ? file.filename : 'Excel、Word 或 CSV'}</strong>
                      <small role="status">
                        {file
                          ? file.phase === 'parsing'
                            ? '正在本机解析…'
                            : file.sourceCount > 0
                              ? '已在本机解析'
                              : file.error
                                ? '解析失败'
                                : '没有可分析的内容'
                          : '.xlsx、.docx、.csv · 最大 20 MB'}
                      </small>
                    </div>
                    {file ? (
                      !running && (
                        <Button
                          size="small"
                          disabled={working}
                          onClick={() => void perform(() => api().discard(file.id))}
                        >
                          清空重选
                        </Button>
                      )
                    ) : (
                      <Button
                        type="primary"
                        disabled={working || !state}
                        onClick={() => void perform(() => api().chooseFile({ systemId, kind }))}
                      >
                        选择文件
                      </Button>
                    )}
                  </div>
                </div>
                {file && sourceWarnings}
                {file?.error && <Alert type="error" role="alert" showIcon title={file.error} />}
              </section>
              <section className="import-setup-group" aria-labelledby="import-provider-title">
                <header>
                  <h2 id="import-provider-title">分析模型</h2>
                  <Button
                    type="link"
                    icon={<GearSixIcon />}
                    disabled={working || running}
                    onClick={() => setManaging(true)}
                  >
                    管理分析模型
                  </Button>
                </header>
                <div className="import-setup-row">
                  <label htmlFor={config?.service && !running ? 'import-provider' : undefined}>
                    提取服务
                  </label>
                  <div className="import-provider-field">
                    {file?.phase === 'analyzing' ? (
                      <strong>{file.analysisLabel}</strong>
                    ) : config?.service ? (
                      <Select
                        id="import-provider"
                        aria-label="本次提取服务"
                        value={useRemote ? 'remote' : 'local'}
                        disabled={running || working}
                        onChange={(v) => setRemote(v === 'remote')}
                        options={[
                          { value: 'local', label: '本机 Ollama · ' + model },
                          { value: 'remote', label: config.service.name, disabled: !canRemote },
                        ]}
                      />
                    ) : (
                      <div className="import-local-model">
                        <DesktopIcon aria-hidden="true" />
                        <span>本机 Ollama</span>
                        <code>{model}</code>
                      </div>
                    )}
                    {!running && file && config?.service && (
                      <Checkbox
                        checked={canRemote}
                        disabled={working}
                        onChange={(e) => {
                          setPermission(e.target.checked ? binding : '');
                          if (!e.target.checked) setRemote(false);
                        }}
                      >
                        允许本文件交给指定第三方提取
                      </Checkbox>
                    )}
                    {file?.phase !== 'analyzing' && (
                      <small className="import-privacy">
                        <ShieldCheckIcon aria-hidden="true" />
                        <span>
                          {useRemote
                            ? '本文件的提取片段将发送至 ' +
                              config?.service?.endpoint +
                              '，已有台账仅在本机比对。'
                            : '文件仅在本机处理。'}
                        </span>
                      </small>
                    )}
                  </div>
                </div>
                {runtime?.error && !useRemote && <Alert title={runtime.error} type="warning" />}
              </section>
              <footer className="import-setup-footer">
                <div className="import-setup-status" role="status">
                  {running || (!useRemote && runtime?.phase === 'starting') ? (
                    <Spin size="small" />
                  ) : (
                    <i
                      aria-hidden="true"
                      className={modelReady || useRemote ? 'ready' : undefined}
                    />
                  )}
                  <span>
                    {running
                      ? file?.progress.message
                      : job?.phase === 'cancelled'
                        ? job.progress.message
                        : useRemote
                          ? '已获本文件外发许可'
                          : runtimeStatus}
                  </span>
                </div>
                {setupAction()}
                {file?.phase === 'analyzing' && file.progress.total > 1 && (
                  <Progress
                    percent={Math.floor((file.progress.completed / file.progress.total) * 100)}
                  />
                )}
              </footer>
            </section>
          )}
          {setupDone && job?.error && <Alert type="error" showIcon title={job.error} />}
          {setupDone && sourceWarnings}
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
          {summary && review && (
            <ImportSummary
              rows={candidates}
              targets={targets}
              envLabel={envLabel}
              working={working}
              submit={submit}
              edit={(id) => {
                setSummary(false);
                setTab('all');
                openRow(id);
              }}
            />
          )}
          {review && !summary && candidates.length > 0 && (
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
              <div
                className={'local-import-review ' + (mobileDetail ? 'detail-mode' : 'list-mode')}
              >
                <section className="local-import-list" aria-label="台账导入候选清单">
                  <header>
                    <h3>候选清单 · {candidates.length}</h3>
                    <div className="import-filters">
                      {[
                        ['all', '全部', candidates.length],
                        ['duplicates', '疑似重复', candidates.filter(strong).length],
                        ['pending', '待核对', candidates.filter((r) => !checkedRow(r)).length],
                      ].map(([key, label, count]) => (
                        <Button
                          key={key}
                          size="small"
                          type={tab === key ? 'primary' : 'text'}
                          onClick={() => filterRows(String(key))}
                        >
                          {label} {count}
                        </Button>
                      ))}
                    </div>
                  </header>
                  <div className="import-queue" ref={queue}>
                    {visible.map((r) => {
                      const sm = (matches.get(r.id) ?? []).filter((m) => m.strong),
                        m = sm[0];
                      return (
                        <button
                          key={r.id}
                          className="import-row"
                          aria-label={'编辑候选 ' + (r.name || '未命名')}
                          aria-current={selectedId === r.id && !filterDone ? 'true' : undefined}
                          onClick={() => openRow(r.id)}
                        >
                          <small>{String(candidates.indexOf(r) + 1).padStart(2, '0')}</small>
                          <span>
                            <b>{r.name || '未命名'}</b>
                            <small>
                              {r.advice?.location} ·{' '}
                              {envLabel(importMatchScope(r, candidates, targets))} ·{' '}
                              {actionLabel(r)}
                            </small>
                            {m && (
                              <em>
                                {m.name}（
                                {m.origin === 'file'
                                  ? '本文件 · ' + m.location
                                  : '已有台账 · ' + envLabel(m.environmentIds)}
                                ）{sm.length > 1 ? ' · 另有 ' + (sm.length - 1) + ' 条' : ''}
                              </em>
                            )}
                          </span>
                          <Tag color={checkedRow(r) ? 'green' : m ? 'orange' : undefined}>
                            {checkedRow(r) ? '已校对' : m ? '待处置' : '待核对'}
                          </Tag>
                        </button>
                      );
                    })}
                  </div>
                  <footer>
                    已校对 {candidates.filter(checkedRow).length} / {candidates.length}
                    <Button type="link" onClick={() => setShowMap(true)}>
                      批量映射环境
                    </Button>
                  </footer>
                </section>
                <section className="local-import-detail" aria-label="候选详情">
                  <Button className="import-back-list" onClick={() => setMobileDetail(false)}>
                    返回候选清单
                  </Button>
                  <div className="import-scroll" ref={detail}>
                    {filterDone ? (
                      <div>
                        <h3>当前筛选已核对完</h3>
                        <Button
                          onClick={() => {
                            setTab('all');
                            openRow(candidates.find((r) => !checkedRow(r))?.id ?? candidates[0].id);
                          }}
                        >
                          返回全部待核对
                        </Button>
                      </div>
                    ) : active ? (
                      <fieldset disabled={working}>
                        <small>
                          {ledgerImportKinds[active.kind]} · {active.advice?.location} ·{' '}
                          {active.advice?.section}
                        </small>
                        <h2>{active.name || '未命名候选'}</h2>
                        <MatchPanel
                          row={active}
                          matches={activeMatches}
                          scope={importMatchScope(active, candidates, targets)}
                          envLabel={envLabel}
                          onTarget={(id) => {
                            selectUpdate(id);
                            setError('');
                          }}
                        />
                        <div className="local-import-section">
                          <h3>如何处理本条</h3>
                          <div className="import-decisions">
                            {[
                              ['new', '保留为新增'],
                              ['update', '更新已有'],
                              ['skip', '跳过本条'],
                            ].map(([v, label]) => (
                              <Button
                                key={v}
                                disabled={v === 'update' && !choices.length}
                                type={
                                  disposition(active) &&
                                  v ===
                                    (!active.selected ? 'skip' : active.update ? 'update' : 'new')
                                    ? 'primary'
                                    : 'default'
                                }
                                onClick={() => chooseAction(v)}
                              >
                                {label}
                              </Button>
                            ))}
                          </div>
                          {activeMatches.some((m) =>
                            m.origin === 'ledger'
                              ? active.advice?.existingIds.includes(m.id)
                              : active.advice?.peerIds.includes(m.id),
                          ) && <p>{active.advice?.evidence}</p>}
                          <div className="local-import-form-grid">
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
                                      {suggestedTarget?.id === currentTarget.id &&
                                      active.advice?.fields.includes(d.key)
                                        ? '（模型建议）'
                                        : ''}
                                    </Checkbox>
                                  </div>
                                ))
                              )}
                            </>
                          )}
                        </div>
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
                            onChange={(values) => {
                              if (!active.update) manual.current.add(active.id);
                              change({
                                ...(active.update
                                  ? { update: { ...active.update, environmentOverride: true } }
                                  : {}),
                                environmentIds:
                                  values.includes('common') &&
                                  values[values.length - 1] === 'common'
                                    ? []
                                    : values.filter((id) => id !== 'common'),
                              });
                            }}
                          />
                        </label>
                        <details className="import-fields" key={active.id}>
                          <summary>编辑候选字段与附属资料</summary>
                          <div className="local-import-form-grid">
                            <label>
                              台账类型
                              <Select
                                aria-label="候选台账类型"
                                value={active.kind}
                                disabled={job.kind !== 'all'}
                                options={Object.entries(ledgerImportKinds).map(
                                  ([value, label]) => ({
                                    value,
                                    label,
                                  }),
                                )}
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
                                        observed: [
                                          ...new Set([...(active.observed ?? []), 'mode']),
                                        ],
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
                                        observed: [
                                          ...new Set([...(active.observed ?? []), 'status']),
                                        ],
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
                            {(!['account', 'node'].includes(active.kind) ||
                              active.tags.length > 0) && (
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
                                <header className="import-section-heading">
                                  <h4>账号（{active.accounts.length}）</h4>
                                  <Button
                                    size="small"
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
                                </header>
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
                              </section>
                            )}
                          {(active.kind === 'access' || active.addresses.length > 0) && (
                            <section className="local-import-section">
                              <header className="import-section-heading">
                                <h4>访问地址</h4>
                                <Button
                                  size="small"
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
                              </header>
                              {active.addresses.map((address, index) => (
                                <div
                                  className="local-import-entry import-address-row"
                                  key={address.id}
                                >
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
                                      status={
                                        addressIssue && Number(addressIssue[1]) === index + 1
                                          ? 'error'
                                          : undefined
                                      }
                                      aria-invalid={
                                        !!addressIssue && Number(addressIssue[1]) === index + 1
                                      }
                                      aria-describedby={
                                        addressIssue && Number(addressIssue[1]) === index + 1
                                          ? 'import-url-error'
                                          : undefined
                                      }
                                      onChange={(event) =>
                                        editUrl(active, address.id, event.target.value)
                                      }
                                      onBlur={(event) => {
                                        const url = completeImportUrl(event.target.value);
                                        if (url !== address.url) editUrl(active, address.id, url);
                                      }}
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
                                  {addressIssue && Number(addressIssue[1]) === index + 1 && (
                                    <small
                                      role="alert"
                                      id="import-url-error"
                                      className="import-url-error"
                                    >
                                      {addressIssue[2]}
                                    </small>
                                  )}
                                </div>
                              ))}
                            </section>
                          )}
                          {(['database', 'redis', 'other'].includes(active.kind) ||
                            active.connections.length > 0) && (
                            <section className="local-import-section">
                              <header className="import-section-heading">
                                <h4>资源连接</h4>
                                <Button
                                  size="small"
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
                              </header>
                              {active.connections.map((connection, index) => (
                                <div className="local-import-entry" key={connection.id}>
                                  <div className="local-import-form-grid">
                                    {(['label', 'address', 'port', 'role'] as const).map(
                                      (field) => (
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
                                      ),
                                    )}
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
                                      <p>
                                        这里只显示前 50 处来源的短预览，其余内容请结合原文件核对。
                                      </p>
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
                                                fields: {
                                                  ...active.fields,
                                                  [key]: event.target.value,
                                                },
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
                                          fields: {
                                            ...active.fields,
                                            [fieldName.trim()]: fieldValue,
                                          },
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
                        </details>
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
                          <ul
                            className="local-import-problems"
                            tabIndex={-1}
                            aria-label="候选待处理问题"
                          >
                            {problems[active.id].map((problem, index) => (
                              <li key={index}>{problem}</li>
                            ))}
                          </ul>
                        )}
                      </fieldset>
                    ) : (
                      <Empty description="选择候选查看详情" />
                    )}
                  </div>
                  {active && !filterDone && (
                    <footer className="local-import-footer">
                      <small>逐条校对，最后统一保存</small>
                      <Button type="primary" disabled={working} onClick={confirmRow}>
                        {candidates.some((r) => r.id !== active.id && !r.reviewed)
                          ? '确认本条并看下一条'
                          : '确认并查看汇总'}
                      </Button>
                    </footer>
                  )}
                </section>
              </div>
            </>
          )}
          {!state && <Spin tip="正在读取本地任务" />}
        </>
      )}
    </main>
  );
}
