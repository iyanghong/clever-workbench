import { useState } from 'react';
import type { CreationProps } from '../../app/actions';
import { ContextPicker } from '../../shared/ContextPicker';
import { emptyContent } from '../../domain';
export function QuickTask({ snapshot, context, busy, execute, cancel }: CreationProps) {
  const [title, setTitle] = useState(''),
    [background, setBackground] = useState(context);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (title.trim())
          void execute(async () => {
            const result = await window.desktop.mutate({
              type: 'task.create',
              consumeDraft: false,
              draft: {
                title,
                markdown: '',
                content: emptyContent(),
                systemId: background.systemId ?? null,
                projectId: null,
              },
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
      </div>
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
