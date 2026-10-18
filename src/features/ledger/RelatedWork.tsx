import { useState } from 'react';
import { PlusIcon, NotePencilIcon, ArrowUpRightIcon } from '@phosphor-icons/react';
import type { Snapshot } from '../../types';
import type { ObjectContext } from '../../ledger-types';
import type { ModuleProps } from '../../app/modules';
export type RelatedHost = {
  createDocument: (context: Partial<ObjectContext>) => Promise<void>;
  createTask: (context: Partial<ObjectContext>, title: string) => Promise<void>;
  navigate: ModuleProps['navigate'];
};
export function RelatedWork({
  context,
  snapshot,
  createDocument,
  createTask,
  navigate,
  onError,
}: RelatedHost & {
  context: Partial<ObjectContext>;
  snapshot: Snapshot;
  onError: (message: string) => void;
}) {
  const [title, setTitle] = useState(''),
    [busy, setBusy] = useState(false);
  const scope = context.resourceId ? '资源' : context.environmentId ? '环境' : '系统';
  const matches = (item: Partial<ObjectContext>) =>
    (!context.systemId || context.systemId === item.systemId) &&
    (!context.environmentId || context.environmentId === item.environmentId) &&
    (!context.resourceId || context.resourceId === item.resourceId);
  const documents = snapshot.documents.filter((item) => item.deletedAt === null && matches(item));
  const tasks = snapshot.tasks.filter((item) => item.deletedAt === null && matches(item));
  async function run(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    try {
      await operation();
    } catch (cause) {
      onError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="related-work" aria-label={`${scope}相关资料`}>
      <div className="section-heading">
        <h3>相关工作</h3>
        <button
          className="text-button"
          aria-label={`为${scope}写文档`}
          disabled={busy}
          onClick={() => void run(() => createDocument(context))}
        >
          <NotePencilIcon size={15} />
          写文档
        </button>
      </div>
      <form
        className="quick-add system-task-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (title.trim()) void run(() => createTask(context, title));
        }}
      >
        <PlusIcon size={17} />
        <input
          aria-label={`为当前${scope}新增任务`}
          value={title}
          disabled={busy}
          placeholder={`为这个${scope}记一件事…`}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
        <kbd>↵</kbd>
      </form>
      {(documents.length > 0 || tasks.length > 0) && (
        <details className="compact-details">
          <summary>
            已有记录 · {documents.length} 份文档，{tasks.length} 项任务
          </summary>
          <div className="related-links">
            {documents.map((item) => (
              <button
                key={item.id}
                onClick={() => void navigate({ module: 'documents', objectId: item.id })}
              >
                <NotePencilIcon size={14} />
                {item.title || '未命名文档'}
                <ArrowUpRightIcon size={13} />
              </button>
            ))}
            {tasks.map((item) => (
              <button
                key={item.id}
                onClick={() => void navigate({ module: 'tasks', objectId: item.id })}
              >
                {item.completedAt ? '✓' : '○'} {item.title}
                <ArrowUpRightIcon size={13} />
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
