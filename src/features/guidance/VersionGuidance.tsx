import { useEffect, useRef, useState } from 'react';
import { Dialog } from '../../shared/Dialog';
import {
  groupVersionChanges,
  planVersionGuidance,
  visibleGuidanceVersions,
} from '../../guidance/versions';
import type { GuidanceDeviceState, GuidanceVersions, ReleaseGuide } from '../../guidance/types';
import { bundledGuidance } from './bundled';
import { manualGuidanceAvailability } from './manual-open';

export function VersionGuidance({
  manualRequest,
  disabled,
  generation,
  preparePrompt,
  onGuide,
}: {
  manualRequest: number;
  disabled: boolean;
  generation: number;
  preparePrompt?: () => Promise<boolean>;
  onGuide: (id: string) => void;
}) {
  const [runtime, setRuntime] = useState<GuidanceVersions | null>(null);
  const [device, setDevice] = useState<GuidanceDeviceState | null>(null);
  const [view, setView] = useState<{ records?: ReleaseGuide[]; automatic?: boolean } | null>(null);
  const [wasShown, setWasShown] = useState(false);
  const [warning, setWarning] = useState('');
  const [notice, setNotice] = useState('');
  const handledManual = useRef(0);
  const shownInSession = useRef(false);
  const activity = useRef({ time: Date.now(), sequence: 0, composing: false });
  const displayGuard = useRef<() => boolean>(() => false);
  const currentView = useRef(view);
  currentView.current = view;
  useEffect(() => {
    let active = true;
    setView(null);
    setRuntime(null);
    setDevice(null);
    setNotice('');
    void Promise.all([window.desktop.guidanceVersions(), window.desktop.guidanceState()])
      .then(([versions, state]) => {
        if (active) {
          setRuntime(versions);
          setDevice(state);
          setWarning(state.warning ?? '');
        }
      })
      .catch(() => {
        if (active) setWarning('版本说明或本机提示记录暂不可用，可稍后重新查看。');
      });
    return () => {
      active = false;
    };
  }, [generation]);
  useEffect(() => {
    if (!manualRequest || manualRequest === handledManual.current || disabled) return;
    handledManual.current = manualRequest;
    let active = true;
    setNotice('');
    void manualGuidanceAvailability({
      busy: '请等待当前操作完成后查看版本说明。',
      modal: '请先关闭当前弹窗，再查看版本说明。',
      unavailable: '暂时无法打开版本说明，请稍后重试。',
    }).then((result) => {
      if (!active) return;
      if (result.ok) setView({});
      else setNotice(result.message);
    });
    return () => {
      active = false;
    };
  }, [manualRequest, disabled, generation]);
  useEffect(() => {
    if (!runtime || !device || disabled || wasShown || shownInSession.current) return;
    const records = planVersionGuidance(runtime, device);
    if (
      !records.some((record) => record.operationChange === 'changed' && record.changes.length > 0)
    )
      return;
    let active = true,
      checking = false,
      timer: number | undefined;
    const ready = () =>
      !document.hidden &&
      !activity.current.composing &&
      Date.now() - activity.current.time >= 1000 &&
      !!document.querySelector('.workspace-shell main') &&
      !document.querySelector(
        'dialog[open], [role="alertdialog"], .module-loading, .loading, [aria-busy="true"]',
      );
    displayGuard.current = ready;
    const attempt = () => {
      timer = undefined;
      if (!active || shownInSession.current || !ready()) return;
      if (currentView.current) {
        document.dispatchEvent(new Event('guidance-dialog-retry'));
        return;
      }
      if (checking) return;
      checking = true;
      const sequence = activity.current.sequence;
      void (async () => {
        if (!(await window.desktop.guidanceAvailability()).available) return;
        if (preparePrompt && !(await preparePrompt())) return;
        if (!(await window.desktop.guidanceAvailability()).available) return;
        if (!active || sequence !== activity.current.sequence || !ready()) return;
        setView({ records, automatic: true });
      })()
        .catch(() => {})
        .finally(() => {
          checking = false;
          if (sequence !== activity.current.sequence) schedule();
        });
    };
    const schedule = () => {
      if (!active || shownInSession.current || checking) return;
      if (timer !== undefined) clearTimeout(timer);
      timer = window.setTimeout(attempt, Math.max(0, 1000 - (Date.now() - activity.current.time)));
    };
    const touch = (event: Event) => {
      activity.current.time = Date.now();
      activity.current.sequence++;
      if (event.type === 'compositionstart') activity.current.composing = true;
      if (event.type === 'compositionend') activity.current.composing = false;
      schedule();
    };
    const events = ['keydown', 'input', 'pointerdown', 'compositionstart', 'compositionend'];
    events.forEach((name) => document.addEventListener(name, touch, true));
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['open', 'aria-busy', 'class'],
    });
    const offAvailability = window.desktop.onGuidanceAvailabilityChanged(schedule);
    document.addEventListener('visibilitychange', schedule);
    window.addEventListener('focus', schedule);
    schedule();
    return () => {
      active = false;
      if (timer !== undefined) clearTimeout(timer);
      observer.disconnect();
      offAvailability();
      events.forEach((name) => document.removeEventListener(name, touch, true));
      document.removeEventListener('visibilitychange', schedule);
      window.removeEventListener('focus', schedule);
    };
  }, [runtime, device, disabled, generation, preparePrompt, wasShown]);
  useEffect(() => {
    if (disabled) setView(null);
  }, [disabled]);
  if (!view || disabled)
    return notice ? (
      <div className="toast guidance-notice" role="status">
        <span>{notice}</span>
        <button onClick={() => setNotice('')}>关闭</button>
      </div>
    ) : null;
  const records = view.records;
  return (
    <Dialog
      title={records ? '版本操作指引' : '版本操作说明'}
      className="modal guidance-dialog"
      exclusive
      canShow={view.automatic ? () => displayGuard.current() : undefined}
      description="随应用提供 · 可随时关闭或在设置中重看"
      onClose={() => setView(null)}
      onShown={() => {
        if (!view.automatic || !runtime || shownInSession.current) return;
        shownInSession.current = true;
        setWasShown(true);
        void window.desktop
          .guidanceAcknowledge(runtime.currentVersion)
          .then((state) => {
            setDevice(state);
            setWarning(state.warning ?? '');
          })
          .catch(() =>
            setWarning('无法保存本机指引提示记录。本次运行不会重复提示，重启后可能再次显示。'),
          );
      }}
    >
      <div className="guidance-body">
        {warning && <p role="status">{warning}</p>}
        <p className="guidance-intro">
          只展示本安装包提供的说明。历史仅包含已确认发布的记录，缺失版本的操作变化未作推测。
        </p>
        {!records &&
          runtime &&
          !runtime.releases.some((record) => record.version === runtime.currentVersion) && (
            <p role="status">当前版本暂未提供完整操作说明；这不表示本次没有操作变化。</p>
          )}
        {records ? (
          <>
            {records.map((record) => (
              <section key={record.version}>
                <h3>v{record.version}</h3>
                <p>{record.summary}</p>
                {record.operationChange === 'none' && <p>无新增操作：{record.noOperationReason}</p>}
                {record.operationChange === 'changed' && !record.changes.length && (
                  <p>暂未提供完整操作指引。</p>
                )}
              </section>
            ))}
            {groupVersionChanges(records).map((group) => {
              const guide = bundledGuidance.features.find(
                (feature) =>
                  feature.id === group.guideId &&
                  feature.platforms.includes(window.desktop.platform as 'darwin'),
              );
              return (
                <section key={group.guideId} className="guidance-version-feature">
                  <h3>{guide?.title ?? '历史功能说明'}</h3>
                  <ul>
                    {group.changes.map((change, i) => (
                      <li key={i}>
                        <p>{change.summary}</p>
                        <small>{change.versions.map((v) => `v${v}`).join('、')}</small>
                      </li>
                    ))}
                  </ul>
                  {guide ? (
                    <button
                      className="guidance-button"
                      onClick={() => {
                        setView(null);
                        onGuide(guide.id);
                      }}
                    >
                      查看当前用法：{guide.title}
                    </button>
                  ) : (
                    <p>此功能指引已移除或暂不可用，历史摘要仍可阅读。</p>
                  )}
                </section>
              );
            })}
          </>
        ) : runtime && visibleGuidanceVersions(runtime).length ? (
          <ul className="guidance-list">
            {visibleGuidanceVersions(runtime).map((record) => (
              <li key={record.version}>
                <button
                  aria-label={`查看 v${record.version} 操作说明`}
                  onClick={() => setView({ records: [record] })}
                >
                  <span>
                    <strong>
                      v{record.version}
                      {record.version === runtime.currentVersion ? ' · 当前版本' : ''}
                    </strong>
                    <small>{record.summary}</small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p role="status">此安装包暂未提供可用的版本操作说明，功能本身仍可正常使用。</p>
        )}
      </div>
      <footer className="guidance-actions">
        <button className="primary-button" onClick={() => setView(null)}>
          知道了
        </button>
      </footer>
    </Dialog>
  );
}
