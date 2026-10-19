import { useEffect, useState } from 'react';
import type { UpdateSnapshot } from '../../update-types';
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
      <p role="status">{state ? labels[state.status] : '正在读取版本…'}</p>
      {state?.progress && (
        <progress
          aria-label="更新下载进度"
          value={state.progress.received}
          max={state.progress.total}
        />
      )}
      {state?.message && <p>{state.message}</p>}
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
