import { useEffect, useRef, useState } from 'react';
import { PlusIcon, CaretLeftIcon } from '@phosphor-icons/react';
import { modules, type ModuleProps } from './modules';
import type { CreationContext, QuickAction } from './actions';
import type { Snapshot } from '../types';
import { Dialog } from '../shared/Dialog';
export function QuickCreate({
  ready,
  context,
  navigate,
  flush,
}: {
  ready: boolean;
  context: CreationContext;
  navigate: ModuleProps['navigate'];
  flush: () => Promise<void>;
}) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [action, setAction] = useState<QuickAction | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const opening = useRef(false),
    working = useRef(false),
    flushRef = useRef(flush);
  const readyRef = useRef(ready);
  readyRef.current = ready;
  flushRef.current = flush;
  async function show() {
    if (!readyRef.current || opening.current || document.querySelector('dialog[open]')) return;
    opening.current = true;
    try {
      await flushRef.current();
      setSnapshot(await window.desktop.snapshot());
      setAction(null);
      setError('');
    } catch (cause) {
      setError(String(cause));
    } finally {
      opening.current = false;
    }
  }
  function cancel() {
    if (!working.current) {
      setSnapshot(null);
      setAction(null);
      setError('');
    }
  }
  async function execute(operation: () => Promise<Parameters<ModuleProps['navigate']>[0]>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError('');
    try {
      await navigate(await operation());
      setSnapshot(null);
      setAction(null);
    } catch (cause) {
      setError(String(cause));
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        !event.isComposing &&
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === 'n'
      ) {
        event.preventDefault();
        void show();
      }
    };
    window.addEventListener('keydown', key);
    const unsubscribe = window.desktop.onNativeCommand((command) => {
      if (command === 'new') void show();
    });
    return () => {
      window.removeEventListener('keydown', key);
      unsubscribe();
    };
  }, []);
  const Form = action?.Form;
  return (
    <>
      <button
        className="global-new"
        aria-label="快速新建"
        disabled={!ready}
        onClick={() => void show()}
      >
        <PlusIcon size={17} />
        <span>新建</span>
      </button>
      {error && !snapshot && (
        <span className="error-text" role="alert">
          {error}
        </span>
      )}
      {snapshot && (
        <Dialog
          title={action?.title ?? '快速新建'}
          onClose={cancel}
          error={error}
          className="modal quick-create-dialog"
        >
          {Form ? (
            <>
              <button
                className="text-button quick-back"
                disabled={busy}
                onClick={() => setAction(null)}
              >
                <CaretLeftIcon size={13} />
                其他类型
              </button>
              <Form
                snapshot={snapshot}
                context={context}
                busy={busy}
                execute={execute}
                cancel={cancel}
              />
            </>
          ) : (
            <div className="quick-action-list">
              {modules
                .flatMap((module) => module.actions ?? [])
                .sort((a, b) => (a.order ?? 100) - (b.order ?? 100))
                .map((item) => (
                  <button
                    key={item.id}
                    aria-label={item.title}
                    onClick={() => {
                      if (item.create) void execute(() => item.create!(context, snapshot));
                      else setAction(item);
                    }}
                    disabled={busy}
                  >
                    <item.icon size={23} weight="duotone" />
                    <span>
                      <strong>{item.title}</strong>
                      <small>{item.description}</small>
                    </span>
                  </button>
                ))}
            </div>
          )}
        </Dialog>
      )}
    </>
  );
}
