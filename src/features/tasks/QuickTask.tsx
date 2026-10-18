import { useState } from 'react';
import type { CreationProps } from '../../app/actions';
import { ContextPicker } from '../../shared/ContextPicker';
import { emptyContent } from '../../domain';
export function QuickTask({ snapshot, context, busy, execute, cancel }: CreationProps) {
  const [title, setTitle] = useState(''),
    [background, setBackground] = useState(context);
  const inherited =
    context.projectId === undefined
      ? snapshot.systems.find((item) => item.id === context.systemId)?.currentProjectId
      : context.projectId;
  const [projectId, setProjectId] = useState(
    snapshot.projects.some((item) => item.id === inherited && item.archivedAt === null)
      ? (inherited ?? null)
      : null,
  );
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim())
          void execute(async () => {
            const result = await window.desktop.mutate({
              type: 'task.create',
              consumeDraft: false,
              draft: { title, markdown: '', content: emptyContent(), ...background, projectId },
            });
            return { module: 'tasks', objectId: result.createdId };
          });
      }}
    >
      <label className="field-label">
        任务标题
        <input
          autoFocus
          aria-label="快速新建任务标题"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
          }}
        />
      </label>
      <div className="quick-task-associations">
        <ContextPicker
          mode="system"
          snapshot={snapshot}
          value={background}
          onChange={(value) => setBackground({ ...background, ...value })}
        />
        <div className="context-fields">
          <label>
            项目（可选）
            <select
              aria-label="新任务项目"
              value={projectId ?? ''}
              onChange={(event) => setProjectId(event.target.value || null)}
            >
              <option value="">不关联项目</option>
              {snapshot.projects
                .filter((item) => item.archivedAt === null)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </div>
      {background.systemId && (
        <details className="compact-details">
          <summary>环境与资源（可选）</summary>
          <ContextPicker
            mode="details"
            snapshot={snapshot}
            value={background}
            onChange={(value) => setBackground({ ...background, ...value })}
          />
        </details>
      )}
      <div className="modal-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={cancel}>
          取消
        </button>
        <button className="primary-button" disabled={busy || !title.trim()}>
          创建任务
        </button>
      </div>
    </form>
  );
}
