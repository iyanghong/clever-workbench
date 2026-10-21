import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { BookOpenIcon, ArrowRightIcon } from '@phosphor-icons/react';
import { Dialog } from '../../shared/Dialog';
import { guidanceTarget, type GuidancePlacement } from '../../guidance/registry';
import type { FeatureGuide } from '../../guidance/types';
import { bundledGuidance, guidanceImage } from './bundled';
import './guidance.css';
import { VersionGuidance } from './VersionGuidance';

export type GuidanceNavigationResult = { ok: boolean; message?: string };
type GuidanceContextValue = {
  openGuide: (id: string) => void;
  openLibrary: (placement?: GuidancePlacement) => void;
  openVersions: () => void;
};
const GuidanceContext = createContext<GuidanceContextValue>({
  openGuide() {},
  openLibrary() {},
  openVersions() {},
});
export const useGuidance = () => useContext(GuidanceContext);

/** This host owns manual guidance. It never executes actions embedded in content. */
export function GuidanceProvider({
  children,
  navigate,
  disabled = false,
  generation,
  preparePrompt,
}: {
  children: ReactNode;
  navigate: (target: string, stillCurrent?: () => boolean) => Promise<GuidanceNavigationResult>;
  disabled?: boolean;
  generation: number;
  preparePrompt?: () => Promise<boolean>;
}) {
  const [versionRequest, setVersionRequest] = useState(0);
  const [selection, setSelection] = useState<{ id?: string; placement?: GuidancePlacement } | null>(
    null,
  );
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const origin = useRef<HTMLElement | null>(null);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  useEffect(() => {
    request.current++;
    setSelection(null);
  }, [generation, disabled]);
  const close = () => {
    request.current++;
    setSelection(null);
    if (origin.current?.isConnected) origin.current.focus({ preventScroll: true });
  };
  const open = (next: NonNullable<typeof selection>) => {
    const token = ++request.current;
    origin.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (disabledRef.current) return;
    setNotice('');
    void window.desktop
      .guidanceAvailability()
      .then((availability) => {
        if (token !== request.current || disabledRef.current) return;
        if (!availability.available) {
          setNotice(availability.reason ?? '请等待当前操作完成后查看指引。');
          return;
        }
        // Recheck after asynchronous availability; do not place a guide over a newly opened modal.
        if (document.querySelector('dialog[open], [role="alertdialog"]')) {
          setNotice('请先关闭当前弹窗，再查看使用指引。');
          return;
        }
        setSelection(next);
      })
      .catch(() => {
        if (token === request.current) setNotice('暂时无法打开指引，请稍后重试。');
      });
  };
  const features = bundledGuidance.features.filter((guide) =>
    guide.platforms.includes(window.desktop.platform as 'darwin'),
  );
  const guide = selection?.id ? features.find((item) => item.id === selection.id) : undefined;
  return (
    <GuidanceContext.Provider
      value={{
        openGuide: (id) => open({ id }),
        openLibrary: (placement) => open({ placement }),
        openVersions: () => setVersionRequest((value) => value + 1),
      }}
    >
      {children}
      <VersionGuidance
        manualRequest={versionRequest}
        disabled={disabled}
        generation={generation}
        preparePrompt={preparePrompt}
        onGuide={(id) => setSelection({ id })}
      />
      {notice && (
        <div className="toast guidance-notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice('')}>关闭</button>
        </div>
      )}
      {selection &&
        !disabled &&
        (guide ? (
          <GuideDialog
            key={guide.id}
            guide={guide}
            onClose={close}
            navigate={async (target) => {
              const token = request.current;
              const result = await navigate(
                target,
                () => token === request.current && !disabledRef.current,
              );
              if (token !== request.current)
                return { ok: false, message: '资料已切换，请重新打开指引。' };
              return result;
            }}
            onNavigated={close}
          />
        ) : (
          <Dialog title="使用指引" className="modal guidance-dialog" onClose={close} exclusive>
            <div className="guidance-body">
              <p className="guidance-intro">
                随应用提供，离线也能查阅。选择功能，按步骤了解操作和结果。
              </p>
              {selection.id ? (
                <p role="status">此指引暂不可用。可以关闭后查看其他指引，功能本身仍可正常使用。</p>
              ) : (
                <GuideList
                  guides={features.filter(
                    (item) => !selection.placement || item.placements.includes(selection.placement),
                  )}
                  onSelect={(id) => setSelection({ id })}
                />
              )}
            </div>
          </Dialog>
        ))}
    </GuidanceContext.Provider>
  );
}
export function GuideList({
  guides,
  onSelect,
}: {
  guides: FeatureGuide[];
  onSelect: (id: string) => void;
}) {
  if (!guides.length) return <p role="status">当前暂无可用指引。功能本身仍可正常使用。</p>;
  return (
    <ul className="guidance-list">
      {guides.map((guide) => (
        <li key={guide.id}>
          <button onClick={() => onSelect(guide.id)} aria-label={guide.title}>
            <BookOpenIcon size={20} aria-hidden="true" />
            <span>
              <strong>{guide.title}</strong>
              <small>{guide.purpose}</small>
            </span>
            <ArrowRightIcon size={16} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
export function GuidanceButton({
  guideId,
  placement,
  label = '使用指引',
  accessibleLabel,
  beforeOpen,
}: {
  guideId?: string;
  placement?: GuidancePlacement;
  label?: string;
  accessibleLabel?: string;
  beforeOpen?: () => void;
}) {
  const { openGuide, openLibrary } = useGuidance();
  return (
    <button
      type="button"
      className="guidance-button"
      aria-label={accessibleLabel ?? label}
      onClick={() => {
        beforeOpen?.();
        guideId ? openGuide(guideId) : openLibrary(placement);
      }}
    >
      <BookOpenIcon size={16} aria-hidden="true" />
      {label}
    </button>
  );
}
export function SettingsGuidance() {
  const { openVersions } = useGuidance();
  return (
    <section
      className="settings-guidance"
      id="settings-guidance"
      aria-labelledby="guidance-heading"
    >
      <h3 id="guidance-heading">使用指引</h3>
      <p>查阅功能的准备条件、操作步骤和常见问题。内容随版本提供，离线可用。</p>
      <GuidanceButton label="查看全部使用指引" />
      <button className="guidance-button" onClick={openVersions}>
        查看版本操作说明
      </button>
    </section>
  );
}
export function GuideDialog({
  guide,
  navigate,
  onClose,
  onNavigated,
}: {
  guide: FeatureGuide;
  navigate: (target: string, stillCurrent?: () => boolean) => Promise<GuidanceNavigationResult>;
  onClose: () => void;
  onNavigated: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [brokenImages, setBrokenImages] = useState<Set<string>>(new Set());
  const body = useRef<HTMLDivElement>(null);
  const step = guide.steps[index];
  const target = guidanceTarget(guide.entry.target);
  const src = step.image && guidanceImage(step.image.src);
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [index]);
  return (
    <Dialog
      title={guide.title}
      className="modal guidance-dialog"
      description="功能使用指引 · 离线可用"
      onClose={onClose}
      exclusive
    >
      <p className="guidance-step-position" aria-live="polite">
        第 {index + 1} 步，共 {guide.steps.length} 步
      </p>
      <div className="guidance-body" ref={body}>
        <p className="guidance-intro">{guide.purpose}</p>
        <details className="guidance-preparation" open={index === 0 ? true : undefined}>
          <summary>准备条件与功能入口</summary>
          {guide.prerequisites.items.length ? (
            <ul>
              {guide.prerequisites.items.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          ) : (
            <p>{guide.prerequisites.notApplicableReason}</p>
          )}
          <p>
            <strong>功能入口：</strong>
            {guide.entry.label}
          </p>
        </details>
        <article className="guidance-step" aria-labelledby="guidance-step-heading">
          <h3 id="guidance-step-heading">{step.title}</h3>
          <p>{step.action}</p>
          <div className="guidance-result">
            <strong>预期结果</strong>
            <p>{step.expectedResult}</p>
          </div>
          {step.image && (
            <figure>
              {src && !brokenImages.has(src) ? (
                <img
                  src={src}
                  alt={step.image.alt}
                  onError={() => setBrokenImages((previous) => new Set(previous).add(src))}
                />
              ) : (
                <p className="guidance-image-fallback">图片暂不可用：{step.image.alt}</p>
              )}
              {step.image.caption && <figcaption>{step.image.caption}</figcaption>}
            </figure>
          )}
        </article>
        {index === guide.steps.length - 1 && (
          <section className="guidance-completion">
            <h3>完成结果</h3>
            <p>{guide.completion}</p>
          </section>
        )}
        <details className="guidance-faq">
          <summary>常见问题</summary>
          {guide.faq.items.length ? (
            guide.faq.items.map((item, i) => (
              <section key={i}>
                <h4>{item.question}</h4>
                <p>{item.answer}</p>
              </section>
            ))
          ) : (
            <p>{guide.faq.notApplicableReason}</p>
          )}
        </details>
        {!target && <p role="status">此功能入口已移除或暂不可用，可以继续阅读说明。</p>}
        {error && (
          <p role="alert" className="error-text">
            {error}
          </p>
        )}
      </div>
      <footer className="guidance-actions">
        <div>
          <button
            className="secondary-button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
          >
            上一步
          </button>
          <button
            className="secondary-button"
            disabled={index === guide.steps.length - 1}
            onClick={() => setIndex(index + 1)}
          >
            下一步
          </button>
        </div>
        <button
          className="primary-button"
          disabled={!target || busy}
          onClick={() => {
            setBusy(true);
            setError('');
            void navigate(guide.entry.target)
              .then((result) => {
                if (result.ok) onNavigated();
                else setError(result.message ?? '未能前往功能，请确认当前编辑已保存后重试。');
              })
              .catch((cause) =>
                setError(cause instanceof Error ? cause.message : '无法前往功能，请稍后重试。'),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? '正在保存…' : '前往功能'}
        </button>
      </footer>
    </Dialog>
  );
}
