import { useEffect, useState } from 'react';
import type { UpdateSnapshot, UpdateHistoryEntry } from '../../update-types';
import { Dialog } from '../../shared/Dialog';

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
export function UpdateDetails({ state }: { state: UpdateSnapshot | null }) {
  const [error, setError] = useState('');
  return (
    <div className="update-details">
      <strong>Clever Workbench {state ? `v${state.currentVersion}` : ''}</strong>
      <p>私有仓库更新使用本机 Git 保存的 GitHub 登录；此电脑的账号须有仓库读取权限。</p>
      <p role="status">{state ? labels[state.status] : '正在读取版本…'}</p>
      {state?.progress && (
        <progress
          aria-label="更新下载进度"
          value={state.progress.received}
          max={state.progress.total}
        />
      )}
      {state?.message && <p>{state.message}</p>}
      {state?.recovery && <p role="status">上次更新：{state.recovery.message}</p>}
      {state?.retryAt && <p>可重试时间：{new Date(state.retryAt).toLocaleString('zh-CN')}</p>}
      {state?.release && (
        <>
          <h4>新版本 v{state.release.version}</h4>
          <p>
            {state.release.publishedAt
              ? new Date(state.release.publishedAt).toLocaleString('zh-CN')
              : ''}
          </p>
          <pre className="release-notes">{state.release.notes || '此版本没有更新说明。'}</pre>
        </>
      )}
      <div className="backup-actions">
        {state?.release && ['available', 'error'].includes(state.status) && (
          <button
            className="primary-button"
            onClick={() => {
              setError('');
              void window.desktop.downloadUpdate().catch(() => setError('下载失败，请重试。'));
            }}
          >
            下载更新
          </button>
        )}
        {state?.status === 'ready' && (
          <button
            className="primary-button"
            onClick={() => {
              setError('');
              void window.desktop
                .installUpdate()
                .catch((cause) =>
                  setError(cause instanceof Error ? cause.message : '更新准备失败，请重试。'),
                );
            }}
          >
            重启并更新
          </button>
        )}
        <button
          className="secondary-button"
          disabled={
            !state ||
            [
              'unsupported',
              'checking',
              'downloading',
              'verifying',
              'ready',
              'preparing',
              'installing',
              'validating',
            ].includes(state.status)
          }
          onClick={() => {
            setError('');
            void window.desktop.checkUpdate().catch(() => setError('检查更新失败，请重试。'));
          }}
        >
          检查更新
        </button>
        <button
          className="secondary-button"
          onClick={() => {
            void window.desktop
              .openExternal('https://github.com/iyanghong/clever-workbench/releases')
              .catch(() => setError('无法打开历史版本页面。'));
          }}
        >
          历史版本
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <UpdateHistory />
    </div>
  );
}
export function UpdateBadge() {
  const state = useAppUpdate();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        className={`update-badge ${state?.status === 'available' ? 'has-update' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="应用版本与更新"
      >
        <span>{state ? `v${state.currentVersion}` : '应用版本'}</span>
        <span>
          {state?.status === 'available'
            ? '● 有更新'
            : state?.status === 'unsupported'
              ? '开发或不支持版本'
              : '检查更新'}
        </span>
      </button>
      {open && (
        <Dialog title="应用更新" onClose={() => setOpen(false)}>
          <UpdateDetails state={state} />
        </Dialog>
      )}
    </>
  );
}
export function AboutUpdate() {
  return <UpdateDetails state={useAppUpdate()} />;
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
    <details className="update-history">
      <summary>更新历史（最近 30 次）</summary>
      {entries.length === 0 && <p>尚无更新记录。</p>}
      {entries.map((entry) => (
        <article key={entry.id}>
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
                  manual: '需要处理',
                  ready: '待安装',
                  'in-progress': '进行中',
                } as const
              )[entry.outcome]
            }
          </p>
          {entry.message && <p>{entry.message}</p>}
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
          <div className="backup-actions">
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
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
