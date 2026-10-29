import { GuidanceButton } from '../guidance/Guidance';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowClockwiseIcon,
  ArrowSquareOutIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  GithubLogoIcon,
  InfoIcon,
  LockKeyIcon,
  SquaresFourIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';
import type { UpdateSnapshot, UpdateHistoryEntry } from '../../update-types';
import { Dialog } from '../../shared/Dialog';
import { useVault } from '../vault/VaultProvider';
import './app-update.css';

export function useAppUpdate() {
  const [state, setState] = useState<UpdateSnapshot | null>(null);
  useEffect(() => {
    let active = true,
      received = false;
    const off = window.desktop.onUpdateState((next) => {
      received = true;
      if (active) setState(next);
    });
    void window.desktop
      .updateSnapshot()
      .then((next) => {
        if (active && !received) setState(next);
      })
      .catch(() => {});
    return () => {
      active = false;
      off();
    };
  }, []);
  return state;
}
const labels: Record<UpdateSnapshot['status'], string> = {
  downloading: '正在下载更新…',
  verifying: '正在校验更新…',
  ready: '更新已准备好，可以重启安装',
  preparing: '正在保存并备份…',
  installing: '正在安装更新…',
  validating: '等待新版启动确认…',
  success: '更新成功',
  manual: '需要人工处理',
  idle: '尚未检查更新',
  checking: '正在检查更新…',
  unsupported: '不支持在线更新',
  'up-to-date': '已是最新版本',
  'no-release': '暂无正式版本',
  incompatible: '暂无兼容更新包',
  available: '有新版本',
  error: '更新失败',
};
const descriptions: Partial<Record<UpdateSnapshot['status'], string>> = {
  'up-to-date': '当前没有需要安装的正式更新。',
  available: '新版本已发布，下载完成后可自行选择重启时间。',
  ready: '安装前会保存当前工作，并创建完整加密备份。',
  checking: '正在连接 GitHub，获取最新版本信息。',
  downloading: '下载期间可以继续使用工作台。',
  verifying: '正在检查更新包的完整性与兼容性。',
  preparing: '正在保存编辑内容并准备完整加密备份。',
  installing: '更新助手正在替换应用，请稍候。',
  validating: '正在确认新版本、资料库与窗口是否正常。',
  success: '新版本与工作空间已通过启动检查。',
};
export function UpdateDetails({
  state,
  allowCheck = false,
  onBeforeGuidance,
}: {
  state: UpdateSnapshot | null;
  allowCheck?: boolean;
  onBeforeGuidance?: () => void;
}) {
  const vault = useVault();
  const [error, setError] = useState('');
  const status = state?.status;
  const busy =
    !!status &&
    ['checking', 'downloading', 'verifying', 'preparing', 'installing', 'validating'].includes(
      status,
    );
  const canDownload = !!state?.release && (status === 'available' || status === 'error');
  const canInstall = status === 'ready';
  const canCancelDownload = status === 'downloading';
  const canManualInstall =
    !!state?.release &&
    status === 'error' &&
    !!state.downloadErrorCode &&
    (/^net::ERR_[A-Z0-9_]+$/.test(state.downloadErrorCode) ||
      [
        'NETWORK_INTERRUPTED',
        'NETWORK_TIMEOUT',
        'NETWORK_IDLE',
        'INCOMPLETE_RESPONSE',
        'DOWNLOAD_TIME_LIMIT',
        'HTTP_408',
        'HTTP_429',
        'HTTP_500',
        'HTTP_502',
        'HTTP_503',
        'HTTP_504',
      ].includes(state.downloadErrorCode));
  const tone =
    status === 'error'
      ? 'error'
      : status === 'manual' || status === 'incompatible'
        ? 'warning'
        : status === 'success' || status === 'up-to-date'
          ? 'success'
          : busy || status === 'available' || canInstall
            ? 'accent'
            : 'neutral';
  const StatusIcon = busy
    ? ArrowsClockwiseIcon
    : tone === 'success'
      ? CheckCircleIcon
      : tone === 'error' || tone === 'warning'
        ? WarningCircleIcon
        : canDownload || canInstall
          ? DownloadSimpleIcon
          : InfoIcon;
  const description =
    state?.message ||
    (status && descriptions[status]) ||
    '在这里检查正式版本，查看更新内容与安装记录。';
  const progress = state?.progress;
  const percent =
    progress && progress.total > 0
      ? Math.min(100, Math.floor((progress.received / progress.total) * 100))
      : null;
  return (
    <div className="update-details" data-tone={tone}>
      <div className="update-identity">
        <div className="app-mark update-app-mark" aria-hidden="true">
          <SquaresFourIcon weight="fill" size={30} />
        </div>
        <div className="update-product">
          <strong>
            Clever Workbench <span>{state ? `v${state.currentVersion}` : '正在读取版本…'}</span>
          </strong>
          <span className="update-channel">
            <GithubLogoIcon size={13} aria-hidden="true" /> 正式版本
          </span>
        </div>
      </div>
      <section className="update-status-card" aria-label="更新状态">
        <div className={`update-status-icon ${busy ? 'is-working' : ''}`} aria-hidden="true">
          <StatusIcon size={25} weight={tone === 'success' ? 'fill' : 'regular'} />
        </div>
        <div className="update-status-copy">
          <h3 role="status">{state ? labels[state.status] : '正在读取版本…'}</h3>
          <p>{description}</p>
          {status === 'downloading' && state?.downloadAttempt && (
            <p>
              下载尝试 {state.downloadAttempt.current} / {state.downloadAttempt.maximum}
            </p>
          )}
          {state?.retryAt && <p>可重试时间：{formatDate(state.retryAt)}</p>}
        </div>
        {progress && (
          <div className="update-progress">
            <div>
              <span>
                {formatBytes(progress.received)} / {formatBytes(progress.total)}
              </span>
              <strong>{percent === null ? '下载中' : `${percent}%`}</strong>
            </div>
            <progress aria-label="更新下载进度" value={progress.received} max={progress.total} />
          </div>
        )}
      </section>
      {canManualInstall && (
        <p className="update-notice">
          手动安装前请先导出完整加密备份，并核对正式 Release 中的 SHA256SUMS。
        </p>
      )}
      {state?.recovery && (
        <p className="update-notice" role="status">
          <InfoIcon size={17} aria-hidden="true" />
          <span>上次更新：{state.recovery.message}</span>
        </p>
      )}
      {state?.release && (
        <section className="update-release" aria-label="版本说明">
          <div className="update-release-heading">
            <h4>新版本 v{state.release.version}</h4>
            <span>更新内容</span>
          </div>
          {state.release.publishedAt && (
            <p className="update-release-date">发布于 {formatDate(state.release.publishedAt)}</p>
          )}
          <pre className="release-notes">{state.release.notes || '此版本没有更新说明。'}</pre>
        </section>
      )}
      {error && (
        <p role="alert" className="update-notice update-action-error">
          <WarningCircleIcon size={17} aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
      <div className="update-secondary">
        <GuidanceButton
          guideId="application-update"
          accessibleLabel="应用更新使用指引"
          beforeOpen={onBeforeGuidance}
        />
        <details className="update-disclosure update-source">
          <summary>
            <LockKeyIcon size={16} aria-hidden="true" />
            <span>更新来源与访问权限</span>
            <CaretDownIcon size={13} aria-hidden="true" />
          </summary>
          <div className="update-source-content">
            <strong>iyanghong/clever-workbench</strong>
            <p>私有仓库更新使用本机 Git 保存的 GitHub 登录；此电脑的账号须有仓库读取权限。</p>
          </div>
        </details>
        <GuidanceButton
          guideId="update-history-and-recovery"
          accessibleLabel="更新历史使用指引"
          beforeOpen={onBeforeGuidance}
        />
        <UpdateHistory />
      </div>
      <footer className="update-footer">
        <div className="update-actions">
          <button
            className="update-history-link"
            onClick={() => {
              void window.desktop
                .openExternal('https://github.com/iyanghong/clever-workbench/releases')
                .catch(() => setError('无法打开历史版本页面。'));
            }}
          >
            <ArrowSquareOutIcon size={15} aria-hidden="true" />
            历史版本
          </button>
          {canManualInstall && (
            <button
              className="update-history-link update-manual-link"
              onClick={() => {
                void window.desktop
                  .openExternal(state.release!.pageUrl)
                  .catch(() => setError('无法打开正式 Release 页面。'));
              }}
            >
              <ArrowSquareOutIcon size={15} aria-hidden="true" />
              查看正式 Release 手动安装
            </button>
          )}
          <div className="update-primary-actions">
            {allowCheck && (
              <button
                className={canDownload || canInstall ? 'secondary-button' : 'primary-button'}
                disabled={!state || status === 'unsupported' || busy || canInstall}
                onClick={() => {
                  setError('');
                  void window.desktop.checkUpdate().catch(() => setError('检查更新失败，请重试。'));
                }}
              >
                <ArrowClockwiseIcon size={15} aria-hidden="true" />
                检查更新
              </button>
            )}
            {canDownload && (
              <button
                className="primary-button"
                onClick={() => {
                  setError('');
                  void window.desktop.downloadUpdate().catch(() => setError('下载失败，请重试。'));
                }}
              >
                <DownloadSimpleIcon size={16} aria-hidden="true" />
                {status === 'error' ? '重试下载' : '下载更新'}
              </button>
            )}
            {canCancelDownload && (
              <button
                className="secondary-button"
                onClick={() => {
                  void window.desktop
                    .cancelUpdateDownload()
                    .catch(() => setError('无法取消下载，请稍后重试。'));
                }}
              >
                取消下载
              </button>
            )}
            {canInstall && (
              <button
                className="primary-button"
                onClick={() => {
                  setError('');
                  void vault
                    .ensureBackup()
                    .then((configured) => (configured ? window.desktop.installUpdate() : undefined))
                    .catch((cause) =>
                      setError(
                        (cause instanceof Error ? cause.message : '更新准备失败，请重试。').replace(
                          /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
                          '',
                        ),
                      ),
                    );
                }}
              >
                <ArrowClockwiseIcon size={16} aria-hidden="true" />
                重启并更新
              </button>
            )}
          </div>
        </div>
        <p className="update-schedule">
          {status === 'unsupported'
            ? '在线更新仅适用于受支持的正式安装版'
            : '启动时自动检查 · 运行期间每 30 分钟检查一次'}
        </p>
      </footer>
    </div>
  );
}
export function UpdateBadge({ state }: { state: UpdateSnapshot | null }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState(false);
  const notified = useRef<string | undefined>(undefined);
  const version = state?.release?.version;
  const preparedId = state?.preparedId ?? version;
  useEffect(() => {
    if (state?.status === 'downloading') notified.current = undefined;
    if (state && !['ready', 'preparing', 'installing'].includes(state.status)) setPrompt(false);
    if (state?.status === 'ready' && version && notified.current !== preparedId) {
      setOpen(false);
      setPrompt(true);
    }
  }, [state?.status, version, preparedId]);
  const hasUpdate =
    !!state?.release &&
    [
      'available',
      'downloading',
      'verifying',
      'ready',
      'preparing',
      'installing',
      'validating',
      'error',
    ].includes(state.status);
  return (
    <>
      {hasUpdate && (
        <button
          className="update-badge"
          onClick={() => {
            if (state.status === 'ready') setPrompt(true);
            else setOpen(true);
          }}
          aria-label="查看可用更新"
          title={`新版本 v${state.release!.version} · ${labels[state.status]}`}
        >
          <DownloadSimpleIcon size={12} aria-hidden="true" />
          更新
        </button>
      )}
      {open && !prompt && (
        <Dialog className="modal update-dialog" title="应用更新" onClose={() => setOpen(false)}>
          <UpdateDetails state={state} onBeforeGuidance={() => setOpen(false)} />
        </Dialog>
      )}
      {prompt && state?.status === 'ready' && (
        <UpdateRestartPrompt
          state={state}
          onClose={() => setPrompt(false)}
          onShown={() => {
            notified.current = preparedId;
          }}
        />
      )}
    </>
  );
}

function UpdateRestartPrompt({
  state,
  onClose,
  onShown,
}: {
  state: UpdateSnapshot;
  onClose: () => void;
  onShown: () => void;
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      className="modal update-restart-dialog"
      title="更新已准备好"
      description={`v${state.release?.version} 已下载并通过校验`}
      onClose={onClose}
      closeDisabled={busy}
      exclusive
      onShown={onShown}
    >
      <div className="update-restart-copy">
        <div className="update-restart-icon" aria-hidden="true">
          <ArrowClockwiseIcon size={28} />
        </div>
        <p>现在重启以安装新版本？重启前会保存当前工作，并创建完整加密备份。</p>
        <p>选择稍后重启可继续工作，准备好后点击品牌旁的更新按钮即可。</p>
        {(error || state.message) && (
          <p role="alert" className="error-text">
            {error || state.message}
          </p>
        )}
      </div>
      <footer className="update-restart-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose}>
          稍后重启
        </button>
        <button
          className="primary-button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setError('');
            void window.desktop
              .installUpdate()
              .catch((cause) => {
                setError(
                  (cause instanceof Error ? cause.message : '更新准备失败，请重试。').replace(
                    /^(?:Error: )?Error invoking remote method '[^']+': (?:Error: )?/,
                    '',
                  ),
                );
              })
              .finally(() => setBusy(false));
          }}
        >
          <ArrowClockwiseIcon size={16} aria-hidden="true" />
          {busy ? '正在准备…' : '立即重启并更新'}
        </button>
      </footer>
    </Dialog>
  );
}
export function AboutUpdate() {
  return <UpdateDetails state={useAppUpdate()} allowCheck />;
}

function UpdateHistory() {
  const [entries, setEntries] = useState<UpdateHistoryEntry[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const load = () => {
      void window.desktop
        .updateHistory()
        .then((value) => {
          if (active) setEntries(value);
        })
        .catch(() => {
          if (active) setError('无法读取更新记录。');
        });
    };
    load();
    const off = window.desktop.onUpdateHistory(load);
    return () => {
      active = false;
      off();
    };
  }, []);
  const reveal = (id: string, kind: 'backup' | 'logs' | 'previous') => {
    void window.desktop
      .openUpdateRecovery(id, kind)
      .catch(() => setError('恢复资料不存在或无法打开，请检查记录中的位置。'));
  };
  return (
    <details className="update-history update-disclosure">
      <summary>
        <ClockCounterClockwiseIcon size={16} aria-hidden="true" />
        <span>更新历史（最近 30 次）</span>
        <CaretDownIcon size={13} aria-hidden="true" />
      </summary>
      {entries.length === 0 && <p className="update-history-empty">尚无更新记录。</p>}
      {entries.map((entry) => (
        <article key={entry.id} className="update-history-entry" data-outcome={entry.outcome}>
          <strong>
            v{entry.currentVersion} →{' '}
            {entry.targetVersion ? `v${entry.targetVersion}` : '待确认版本'}
          </strong>
          <p>
            {new Date(entry.createdAt).toLocaleString('zh-CN')} ·{' '}
            {
              (
                {
                  success: '成功',
                  failed: '失败',
                  cancelled: '已取消',
                  manual: '需要处理',
                  ready: '待安装',
                  'in-progress': '进行中',
                } as const
              )[entry.outcome]
            }
          </p>
          {entry.message && <p>{entry.message}</p>}
          {(entry.downloadedBytes !== undefined ||
            entry.downloadAttempts ||
            entry.downloadErrorCode) && (
            <p>
              {entry.downloadedBytes !== undefined &&
                `已下载 ${formatBytes(entry.downloadedBytes)}`}
              {entry.downloadAttempts ? ` · 尝试 ${entry.downloadAttempts} 次` : ''}
              {entry.downloadErrorCode ? ` · 错误码 ${entry.downloadErrorCode}` : ''}
            </p>
          )}
          {entry.cleanup && (
            <p>
              {entry.cleanup === 'complete'
                ? '旧应用和本次下载文件已清理；完整加密备份与更新日志已保留。'
                : '更新已成功，部分旧文件未能清理。请查看日志，确认文件未被占用后再处理。'}
            </p>
          )}
          <p>
            阶段耗时：
            {Object.entries(entry.durations)
              .map(
                ([phase, ms]) =>
                  `${labels[phase as UpdateSnapshot['status']] ?? phase} ${(ms / 1000).toFixed(1)} 秒`,
              )
              .join(' · ') || '尚未记录'}
          </p>
          {entry.backup && <p className="path-text">备份：{entry.backup}</p>}
          <div className="update-recovery-actions">
            {entry.backup && (
              <button className="secondary-button" onClick={() => reveal(entry.id, 'backup')}>
                定位备份
              </button>
            )}
            {entry.previousApp && (
              <button className="secondary-button" onClick={() => reveal(entry.id, 'previous')}>
                定位旧应用
              </button>
            )}
            {entry.transactionDirectory && (
              <button className="secondary-button" onClick={() => reveal(entry.id, 'logs')}>
                查看日志文件
              </button>
            )}
          </div>
          {entry.outcome === 'manual' && (
            <p>
              保留当前资料和完整备份。使用历史版本前确认数据兼容性；需要恢复时在设置中明确选择备份，不会自动覆盖数据库。
            </p>
          )}
        </article>
      ))}
      {error && (
        <p role="alert" className="update-action-error">
          {error}
        </p>
      )}
    </details>
  );
}

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' })
    : '时间暂不可用';
}
function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
}
