import { useEffect, useRef, useState } from 'react';
import {
  ArchiveIcon,
  FolderOpenIcon,
  ClipboardTextIcon,
  ArrowRightIcon,
  CheckCircleIcon,
} from '@phosphor-icons/react';
import {
  defaultZipSettings,
  type GitFilter,
  type ZipCommand,
  type ZipSettings,
  type ZipState,
} from '../../tool-types';
import type { ToolPageProps } from './registry';

type Mode = 'pack' | 'git' | 'restore' | 'paste';
type Draft = ZipSettings & {
  mode: Mode;
  branch: string;
  author: string;
  start: string;
  end: string;
  recentHours: 0 | 24 | 48;
  selected: string[];
  gitSource: string;
  branchSearch: string;
};
const initial = (): Draft => ({
  ...defaultZipSettings,
  mode: 'pack',
  branch: '',
  author: '',
  start: '',
  end: '',
  recentHours: 0,
  selected: [],
  gitSource: '',
  branchSearch: '',
});
// Session inputs survive page navigation; passwords remain only in the mounted form.
let remembered: Draft | null = null;
window.desktop.onDataRestored(() => {
  remembered = null;
});
const modes: { id: Mode; title: string }[] = [
  { id: 'pack', title: '归档文件' },
  { id: 'git', title: 'Git 筛选归档' },
  { id: 'restore', title: '目录还原' },
  { id: 'paste', title: '剪贴板还原' },
];
const settingsOf = (draft: Draft): ZipSettings => ({
  source: draft.source,
  outputDir: draft.outputDir,
  partSizeMB: draft.partSizeMB,
});
const validSize = (n: number) => Number.isInteger(n) && n >= 1 && n <= 200;
const selectionKey = (values: string[]) => [...values].sort().join(',');

export function ZipTextPage({ registerFlush }: ToolPageProps) {
  const [draft, setDraft] = useState<Draft>(() => remembered ?? initial());
  const [state, setState] = useState<ZipState | null>(null),
    stateRef = useRef<ZipState | null>(null);
  const [error, setError] = useState(''),
    [sending, setSending] = useState(false);
  const sendingRef = useRef(false),
    pasteTarget = useRef<HTMLDivElement>(null);
  const [password, setPassword] = useState(''),
    [confirm, setConfirm] = useState('');
  const [visibleCommits, setVisibleCommits] = useState(200),
    [visibleParts, setVisibleParts] = useState(200);
  const [visibleFiles, setVisibleFiles] = useState(200);
  const packing = draft.mode === 'pack' || draft.mode === 'git';
  const busy = sending || !!state?.busy;
  const pasteShortcut = window.desktop.platform === 'darwin' ? '⌘V' : 'Ctrl+V';
  const update = (patch: Partial<Draft>) =>
    setDraft((current) => {
      remembered = { ...current, ...patch };
      return remembered;
    });
  const receive = (next: ZipState) => {
    stateRef.current = next;
    setState(next);
  };
  useEffect(() => {
    let active = true,
      polling = false;
    const refresh = async () => {
      if (polling) return;
      polling = true;
      try {
        const next = await window.desktop.tools.state('zip-text');
        if (!active) return;
        receive(next);
        if (!remembered) {
          remembered = { ...initial(), ...next.settings };
          setDraft(remembered);
        }
      } catch (cause) {
        if (active) setError(String(cause));
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 400);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(
    () =>
      registerFlush(async () => {
        const current = remembered;
        if (current && !stateRef.current?.busy && validSize(current.partSizeMB))
          await window.desktop.tools.command('zip-text', {
            type: 'settings',
            value: settingsOf(current),
          });
      }),
    [registerFlush],
  );
  useEffect(() => {
    if (
      state?.operation === 'git.branches' &&
      !state.busy &&
      state.branch &&
      !draft.branch &&
      draft.gitSource === draft.source
    )
      update({ branch: state.branch });
  }, [state?.busy, state?.branch, draft.branch, draft.gitSource, draft.source]);
  async function send(command: ZipCommand) {
    if (sendingRef.current) return false;
    sendingRef.current = true;
    setSending(true);
    setError('');
    try {
      const next = await window.desktop.tools.command('zip-text', command);
      receive(next);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }
  useEffect(() => {
    if (draft.mode !== 'paste') return;
    if (!document.querySelector('dialog[open]'))
      pasteTarget.current?.focus({ preventScroll: true });
    const acceptsPaste = (target: EventTarget | null) => {
      if (document.querySelector('dialog[open]')) return false;
      if (!(target instanceof Element)) return false;
      if (pasteTarget.current?.contains(target)) return true;
      return !target.closest(
        'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"]',
      );
    };
    const capture = () => {
      if (!stateRef.current || stateRef.current.busy || sendingRef.current) return;
      void send({ type: 'paste.capture' });
    };
    const keydown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.altKey ||
        event.shiftKey ||
        !(event.metaKey || event.ctrlKey) ||
        event.key.toLowerCase() !== 'v' ||
        !acceptsPaste(event.target)
      )
        return;
      // Read large clipboard contents in the worker, before the browser's default paste.
      event.preventDefault();
      if (!event.repeat) capture();
    };
    const paste = (event: ClipboardEvent) => {
      if (!acceptsPaste(event.target)) return;
      event.preventDefault();
      capture();
    };
    window.addEventListener('keydown', keydown, true);
    window.addEventListener('paste', paste, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      window.removeEventListener('paste', paste, true);
    };
  }, [draft.mode]);
  const selectedKey = selectionKey(draft.selected);
  useEffect(() => {
    if (draft.mode !== 'git' || !draft.selected.length || stateRef.current?.busy) return;
    const timer = setTimeout(
      () => void send({ type: 'git.preview', source: draft.source, commits: draft.selected }),
      180,
    );
    return () => clearTimeout(timer);
  }, [selectedKey, draft.source, draft.mode]);
  async function choose(kind: 'file' | 'directory' | 'output') {
    try {
      const selected = await window.desktop.tools.choosePath(kind);
      if (selected)
        update(
          kind === 'output'
            ? { outputDir: selected }
            : { source: selected, selected: [], branch: '', gitSource: '' },
        );
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function start() {
    if (!password) {
      setError('请输入归档密码。');
      return;
    }
    if (packing && password !== confirm) {
      setError('两次输入的密码不一致。');
      return;
    }
    const settings = settingsOf(draft);
    const accepted = await send(
      packing
        ? {
            type: 'pack',
            settings,
            password,
            ...(draft.mode === 'git' ? { commits: draft.selected } : {}),
          }
        : { type: draft.mode === 'paste' ? 'paste.restore' : 'restore', settings, password },
    );
    if (accepted) {
      setPassword('');
      setConfirm('');
    }
  }
  const preview = state?.preview;
  const previewCurrent =
    !!preview && preview.source === draft.source && selectionKey(preview.commits) === selectedKey;
  const canRun =
    !!state &&
    !busy &&
    !!password &&
    validSize(draft.partSizeMB) &&
    (draft.mode === 'paste' ? state.partsReady && !!draft.outputDir : !!draft.source.trim()) &&
    (draft.mode !== 'git' || (previewCurrent && !!preview?.available.length));
  const displayedCommits = draft.branch === state?.branch ? state.commits : [];
  const outside = draft.selected.filter(
    (sha) => !displayedCommits.some((c) => c.sha === sha),
  ).length;
  function toggle(sha: string) {
    update({
      selected: draft.selected.includes(sha)
        ? draft.selected.filter((s) => s !== sha)
        : [...draft.selected, sha],
    });
  }
  function selectAll(invert = false) {
    const next = new Set(draft.selected);
    for (const commit of displayedCommits) {
      if (invert && next.has(commit.sha)) next.delete(commit.sha);
      else next.add(commit.sha);
    }
    update({ selected: [...next] });
  }
  function datePreset(value: string) {
    const day = new Date(),
      format = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (value === '24' || value === '48') {
      update({ recentHours: Number(value) as 24 | 48, start: '', end: '' });
      return;
    }
    if (value === 'all') {
      update({ recentHours: 0, start: '', end: '' });
      return;
    }
    const end = value === 'month' ? new Date(day.getFullYear(), day.getMonth() + 1, 0) : day;
    const start =
      value === 'month' ? new Date(day.getFullYear(), day.getMonth(), 1) : new Date(day);
    if (value === 'week') start.setDate(start.getDate() - 6);
    update({ recentHours: 0, start: format(start), end: format(end) });
  }
  function changeMode(mode: Mode) {
    update({ mode, ...(mode === 'pack' ? { selected: [], branch: '', gitSource: '' } : {}) });
    setError('');
    setPassword('');
    setConfirm('');
  }
  return (
    <>
      <div className="tools-heading">
        <span className="eyebrow">文件转换 · 本地处理</span>
        <h1>ZIP 文本归档</h1>
        <p>把文件加密为文本分片，方便传递；收齐分片后，用密码还原。</p>
      </div>
      <div className="tool-tabs" role="tablist" aria-label="归档操作">
        {modes.map((mode, index) => (
          <button
            key={mode.id}
            role="tab"
            aria-selected={draft.mode === mode.id}
            aria-controls="zip-operation-panel"
            tabIndex={draft.mode === mode.id ? 0 : -1}
            disabled={busy}
            onClick={() => changeMode(mode.id)}
            onKeyDown={(event) => {
              if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
              event.preventDefault();
              const next =
                event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? modes.length - 1
                    : (index + (event.key === 'ArrowLeft' ? -1 : 1) + modes.length) % modes.length;
              changeMode(modes[next].id);
              event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                [next]?.focus();
            }}
          >
            {mode.title}
          </button>
        ))}
      </div>
      <div className="tool-workspace">
        <section
          className="tool-form"
          id="zip-operation-panel"
          role="tabpanel"
          aria-label={modes.find((mode) => mode.id === draft.mode)?.title}
        >
          <fieldset disabled={busy || !state}>
            {draft.mode !== 'paste' && (
              <div className="tool-field">
                <label htmlFor="zip-source">
                  {draft.mode === 'restore'
                    ? '文本分片目录'
                    : draft.mode === 'git'
                      ? 'Git 工作目录'
                      : '待归档文件或目录'}
                </label>
                <div className="tool-path">
                  <input
                    id="zip-source"
                    value={draft.source}
                    placeholder="选择或输入本地路径"
                    onChange={(e) =>
                      update({ source: e.target.value, selected: [], branch: '', gitSource: '' })
                    }
                  />
                  {draft.mode === 'pack' && (
                    <button className="secondary-button" onClick={() => void choose('file')}>
                      选文件
                    </button>
                  )}
                  <button className="secondary-button" onClick={() => void choose('directory')}>
                    <FolderOpenIcon size={16} />
                    选目录
                  </button>
                </div>
                <p className="tool-hint">
                  {draft.mode === 'restore'
                    ? '选择包含 part-000001.txt 等分片的目录，无需填写原分片大小。'
                    : draft.mode === 'git'
                      ? '提交只确定文件路径，归档读取当前磁盘内容，包含未提交修改。'
                      : '保留目录结构、空目录与二进制文件；完整目录包含隐藏文件。'}
                </p>
              </div>
            )}
            {draft.mode === 'git' && (
              <div className="tool-git">
                <div className="tool-section-title">
                  <h2>选择 Git 提交</h2>
                  <button
                    className="secondary-button"
                    disabled={!draft.source}
                    onClick={() => {
                      update({ selected: [], branch: '', gitSource: draft.source });
                      void send({ type: 'git.branches', source: draft.source });
                    }}
                  >
                    读取分支
                  </button>
                </div>
                {draft.gitSource === draft.source && !!state?.branches.length && (
                  <>
                    <div className="tool-fields-two">
                      <label className="tool-field">
                        查找分支
                        <input
                          value={draft.branchSearch}
                          placeholder="输入分支名"
                          onChange={(e) => update({ branchSearch: e.target.value })}
                        />
                      </label>
                      <div className="tool-field">
                        <label htmlFor="zip-git-branch">分支</label>
                        <select
                          id="zip-git-branch"
                          value={draft.branch}
                          onChange={(e) => {
                            update({ branch: e.target.value, selected: [] });
                            setVisibleCommits(200);
                          }}
                        >
                          {state.branches
                            .filter(
                              (b) =>
                                b.ref === draft.branch ||
                                b.label.toLowerCase().includes(draft.branchSearch.toLowerCase()),
                            )
                            .map((b) => (
                              <option key={b.ref} value={b.ref}>
                                {b.label}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <label className="tool-field">
                      作者
                      <input
                        value={draft.author}
                        placeholder="姓名或邮箱，支持部分匹配"
                        onChange={(e) => update({ author: e.target.value })}
                      />
                    </label>
                    <div className="tool-date-presets">
                      {[
                        ['all', '不限'],
                        ['24', '近 1 天'],
                        ['48', '近 2 天'],
                        ['week', '最近 7 天'],
                        ['month', '本月'],
                      ].map(([value, label]) => (
                        <button
                          type="button"
                          key={value}
                          className="text-button"
                          onClick={() => datePreset(value)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="tool-fields-two">
                      <label className="tool-field">
                        开始日期
                        <input
                          type="date"
                          value={draft.start}
                          onChange={(e) => update({ start: e.target.value, recentHours: 0 })}
                        />
                      </label>
                      <label className="tool-field">
                        结束日期
                        <input
                          type="date"
                          value={draft.end}
                          onChange={(e) => update({ end: e.target.value, recentHours: 0 })}
                        />
                      </label>
                    </div>
                    {draft.recentHours > 0 && (
                      <p className="tool-hint">当前范围：过去 {draft.recentHours} 小时。</p>
                    )}
                    <button
                      className="secondary-button"
                      onClick={() => {
                        setVisibleCommits(200);
                        void send({
                          type: 'git.commits',
                          filter: {
                            source: draft.source,
                            branch: draft.branch,
                            author: draft.author,
                            start: draft.start,
                            end: draft.end,
                            recentHours: draft.recentHours,
                          } satisfies GitFilter,
                        });
                      }}
                    >
                      应用筛选
                    </button>
                    <div className="tool-selection-actions">
                      <span>
                        已选 {draft.selected.length} 项
                        {outside ? `（${outside} 项在当前筛选外）` : ''}
                      </span>
                      <button className="text-button" onClick={() => selectAll()}>
                        全选筛选结果
                      </button>
                      <button className="text-button" onClick={() => selectAll(true)}>
                        反选
                      </button>
                      <button className="text-button" onClick={() => update({ selected: [] })}>
                        清空
                      </button>
                    </div>
                    <div className="tool-commits">
                      {displayedCommits.slice(0, visibleCommits).map((commit) => (
                        <label className="tool-commit" key={commit.sha}>
                          <input
                            type="checkbox"
                            checked={draft.selected.includes(commit.sha)}
                            onChange={() => toggle(commit.sha)}
                          />
                          <span>
                            <strong>{commit.subject}</strong>
                            <small>
                              {commit.sha.slice(0, 8)} · {commit.author} ·{' '}
                              {new Date(commit.timestamp * 1000).toLocaleString()}
                            </small>
                          </span>
                        </label>
                      ))}
                      {!displayedCommits.length && (
                        <p className="tool-hint">应用筛选后选择提交；查询只读取本机历史。</p>
                      )}
                    </div>
                    {displayedCommits.length > visibleCommits && (
                      <button
                        className="text-button"
                        onClick={() => setVisibleCommits((count) => count + 200)}
                      >
                        再显示 200 项（共 {displayedCommits.length} 项）
                      </button>
                    )}
                    <button
                      className="secondary-button"
                      disabled={!draft.selected.length}
                      onClick={() =>
                        void send({
                          type: 'git.preview',
                          source: draft.source,
                          commits: draft.selected,
                        })
                      }
                    >
                      刷新文件预览
                    </button>
                  </>
                )}
                {previewCurrent && (
                  <div className="tool-preview">
                    <h3>
                      将打包 {preview.available.length} 个文件
                      {preview.missing.length > 0
                        ? `，跳过 ${preview.missing.length} 个缺失文件`
                        : ''}
                    </h3>
                    <p>当前未压缩大小：{(preview.bytes / 1_000_000).toFixed(2)} MB</p>
                    <details open>
                      <summary>文件范围</summary>
                      <ul>
                        {preview.available.slice(0, visibleFiles).map((name) => (
                          <li key={name}>
                            {name} <small>({(preview.sizes[name] / 1024).toFixed(1)} KB)</small>
                          </li>
                        ))}
                      </ul>
                    </details>
                    {!!preview.missing.length && (
                      <details open>
                        <summary>缺失文件，不输出删除指令</summary>
                        <ul>
                          {preview.missing.slice(0, visibleFiles).map((name) => (
                            <li key={name}>{name}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {Math.max(preview.available.length, preview.missing.length) > visibleFiles && (
                      <button
                        className="text-button"
                        onClick={() => setVisibleFiles((count) => count + 200)}
                      >
                        显示更多文件
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            {draft.mode === 'paste' && (
              <div className="tool-paste">
                <div className="tool-section-title">
                  <h2>收集文本分片</h2>
                  <button
                    className="secondary-button"
                    onClick={() => void send({ type: 'paste.capture' })}
                  >
                    <ClipboardTextIcon size={16} />
                    从剪贴板加入
                  </button>
                </div>
                <p className="tool-hint">
                  先复制一个 TXT 的完整内容，再按 {pasteShortcut}{' '}
                  加入分片。顺序不限，重复会自动跳过。
                </p>
                <div
                  className="tool-paste-target"
                  ref={pasteTarget}
                  tabIndex={0}
                  role="textbox"
                  aria-label="粘贴分片区域"
                  aria-readonly="true"
                  aria-disabled={busy || !state}
                  aria-keyshortcuts={window.desktop.platform === 'darwin' ? 'Meta+V' : 'Control+V'}
                  onClick={() => pasteTarget.current?.focus({ preventScroll: true })}
                >
                  <ClipboardTextIcon size={24} />
                  <div>
                    <strong>按 {pasteShortcut} 粘贴分片</strong>
                    <span>点击此处后粘贴；每次加入一片，可连续添加。</span>
                  </div>
                </div>
                <p className={state?.partsReady ? 'tool-ready' : 'tool-hint'} role="status">
                  {state?.partsDescription}
                </p>
                {state?.notice && (
                  <p className="tool-ready" role="status">
                    {state.notice}
                  </p>
                )}
                <div className="tool-parts">
                  {state?.parts.slice(0, visibleParts).map((part) => (
                    <div className="tool-part" key={part.id}>
                      <div>
                        <strong>
                          第 {part.index} / {part.count} 片
                        </strong>
                        <small>{(part.size / 1_000_000).toFixed(2)} MB</small>
                        <code>{part.preview.slice(0, 48)}…</code>
                        {part.error && <p className="tool-error">{part.error}</p>}
                      </div>
                      <button
                        className="text-button"
                        aria-label={`替换第 ${part.index} 片`}
                        onClick={() => void send({ type: 'paste.capture', replaceId: part.id })}
                      >
                        从剪贴板替换
                      </button>
                      <button
                        className="text-button"
                        aria-label={`移除第 ${part.index} 片`}
                        onClick={() => void send({ type: 'paste.remove', id: part.id })}
                      >
                        移除
                      </button>
                    </div>
                  ))}
                </div>
                {(state?.parts.length ?? 0) > visibleParts && (
                  <button className="text-button" onClick={() => setVisibleParts((n) => n + 200)}>
                    显示更多分片
                  </button>
                )}
                {!!state?.parts.length && (
                  <button
                    className="text-button"
                    onClick={() => void send({ type: 'paste.clear' })}
                  >
                    清空本次分片
                  </button>
                )}
              </div>
            )}
            <div className="tool-field">
              <label htmlFor="zip-output">输出位置</label>
              <div className="tool-path">
                <input
                  id="zip-output"
                  value={draft.outputDir}
                  placeholder={
                    draft.mode === 'paste'
                      ? '请选择输出目录'
                      : packing
                        ? '留空保存到源文件或目录旁'
                        : '留空保存到分片目录内'
                  }
                  onChange={(e) => update({ outputDir: e.target.value })}
                />
                <button className="secondary-button" onClick={() => void choose('output')}>
                  <FolderOpenIcon size={16} />
                  选择
                </button>
              </div>
            </div>
            <p className="tool-hint">
              {packing
                ? '在输出位置新建“原名称.txtparts”；留空则保存到源文件或目录旁。'
                : '在输出位置新建 restored；目录还原留空则保存到分片目录内。'}{' '}
              已有目标目录不会被覆盖。
            </p>
            {packing && (
              <div className="tool-field tool-part-size">
                <label htmlFor="zip-part-size">每个 TXT 大小上限</label>
                <div className="tool-inline">
                  <input
                    id="zip-part-size"
                    type="number"
                    min="1"
                    max="200"
                    step="1"
                    value={draft.partSizeMB || ''}
                    onChange={(e) => update({ partSizeMB: Number(e.target.value) })}
                  />
                  <span>MB</span>
                </div>
                <small>1～200 MB，默认 50 MB。</small>
              </div>
            )}
            <div className="tool-fields-two">
              <label className="tool-field">
                {packing ? '设置归档密码' : '归档密码'}
                <input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {packing && (
                <label className="tool-field">
                  再次输入密码
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </label>
              )}
            </div>
          </fieldset>
          {(error || state?.error) && (
            <p className="tool-error" role="alert">
              {error || state?.error}
            </p>
          )}
          <div className="tool-run">
            <button className="primary-button" disabled={!canRun} onClick={() => void start()}>
              {packing ? <ArchiveIcon size={18} /> : <ArrowRightIcon size={18} />}
              {packing ? '开始归档' : '开始还原'}
            </button>
            <span>密码仅用于本次处理，不会保存。</span>
          </div>
        </section>
        <aside className="tool-status" aria-label="工具运行状态">
          <h2>{state?.busy ? '正在处理' : state?.output ? '本次结果' : '准备开始'}</h2>
          {state?.busy && state.progress && (
            <div className="tool-progress" role="status">
              <strong>{state.progress.phase}</strong>
              <progress
                aria-label="当前阶段进度"
                {...(state.progress.total !== null
                  ? {
                      max: Math.max(1, state.progress.total),
                      value: state.progress.total ? state.progress.processed : 1,
                    }
                  : {})}
              />
              <small>
                {state.progress.total !== null
                  ? `${(state.progress.processed / 1_000_000).toFixed(1)} / ${(state.progress.total / 1_000_000).toFixed(1)} MB`
                  : `${(state.progress.processed / 1_000_000).toFixed(1)} MB`}
              </small>
              {state.progress.filename && (
                <p title={state.progress.filename}>{state.progress.filename}</p>
              )}
            </div>
          )}
          {state?.busy && <p>可以切换到工作台其他页面，处理会继续。任务完成前暂时无法退出应用。</p>}
          {state?.output && !state.busy && (
            <div className="tool-result">
              <CheckCircleIcon size={30} weight="duotone" />
              <p>处理完成，文件已保存。</p>
              <code>{state.output}</code>
              <button
                className="secondary-button"
                onClick={() =>
                  void window.desktop.tools.openOutput('zip-text').catch((e) => setError(String(e)))
                }
              >
                打开结果目录
              </button>
              <button
                className="text-button"
                onClick={() =>
                  void window.desktop.copyText(state.output).catch((e) => setError(String(e)))
                }
              >
                复制输出路径
              </button>
            </div>
          )}
          {!state?.busy && !state?.output && (
            <>
              <ArchiveIcon className="tool-status-icon" size={40} weight="duotone" />
              <p>选择输入、输出位置和密码后开始。</p>
            </>
          )}
          <div className="tool-status-note">
            <p>与原独立工具的文本分片互通。</p>
            <p>全部在本机处理，不上传文件。</p>
          </div>
        </aside>
      </div>
    </>
  );
}
