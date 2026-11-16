import { markNewRecordChanged } from '../../shared/new-record';
import { Button, Checkbox, Input, Select, ConfigProvider } from 'antd';
import { useState, type CSSProperties } from 'react';
import type { Snapshot } from '../../types';
import { taskTagColors, type TaskTag, type TaskTagColor } from '../../task-tags';
import { Dialog } from '../../shared/Dialog';

export function TaskTagChips({ ids = [], tags = [] }: { ids?: string[]; tags?: TaskTag[] }) {
  return (
    <span className="task-tag-chips">
      {tags
        .filter((tag) => ids.includes(tag.id))
        .map((tag) => (
          <span
            key={tag.id}
            className="task-tag-chip"
            style={{ '--tag-color': `var(--tag-${tag.color})` } as CSSProperties}
          >
            <span className="task-tag-dot" aria-hidden="true" />
            {tag.name}
          </span>
        ))}
    </span>
  );
}

export function TaskTagManager({
  snapshot,
  onSnapshot,
  onClose,
}: {
  snapshot: Snapshot;
  onSnapshot: (snapshot: Snapshot) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(''),
    [color, setColor] = useState<TaskTagColor>('blue');
  const [editing, setEditing] = useState<string | undefined>(),
    [deleting, setDeleting] = useState<TaskTag | null>(null);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const tags = snapshot.taskTags ?? [];
  function reset() {
    setEditing(undefined);
    setName('');
    setColor('blue');
  }
  async function save() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onSnapshot(
        (await window.desktop.mutate({ type: 'task-tag.save', id: editing, name, color })).snapshot,
      );
      reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    setError('');
    try {
      onSnapshot(
        (await window.desktop.mutate({ type: 'task-tag.delete', id: deleting.id })).snapshot,
      );
      if (editing === deleting.id) reset();
      setDeleting(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="任务标签" onClose={onClose} error={error} closeDisabled={busy}>
      <p className="page-description">全部工作任务共用。颜色用于分类，临期和逾期单独提示。</p>
      <form
        className="task-tag-form"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <label>
          标签名称
          <Input
            aria-label="标签名称"
            value={name}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          标签颜色
          <Select
            aria-label="标签颜色"
            value={color}
            disabled={busy}
            onChange={(event) => {
              markNewRecordChanged();
              return setColor(event as TaskTagColor);
            }}
          >
            {Object.entries(taskTagColors).map(([value, label]) => (
              <Select.Option data-value={String(value)} key={value} value={value}>
                {label}
              </Select.Option>
            ))}
          </Select>
        </label>
        <Button
          htmlType="submit"
          type="primary"
          className="primary-button"
          disabled={busy || !name.trim()}
        >
          {editing ? '保存标签' : '创建标签'}
        </Button>
        {editing && (
          <Button
            type="text"
            htmlType="button"
            className="text-button"
            onClick={reset}
            disabled={busy}
          >
            取消编辑
          </Button>
        )}
      </form>
      <div className="task-tag-management">
        {tags.map((tag) => (
          <div className="task-tag-management-row" key={tag.id}>
            <TaskTagChips tags={[tag]} ids={[tag.id]} />
            <span className="muted">
              {snapshot.tasks.filter((task) => task.tagIds?.includes(tag.id)).length} 项任务
            </span>
            <Button
              htmlType="submit"
              type="text"
              className="text-button"
              aria-label={`编辑标签 ${tag.name}`}
              disabled={busy}
              onClick={() => {
                setEditing(tag.id);
                setName(tag.name);
                setColor(tag.color);
              }}
            >
              编辑
            </Button>
            <Button
              htmlType="submit"
              type="text"
              danger
              className="text-button danger-hover"
              aria-label={`删除标签 ${tag.name}`}
              disabled={busy}
              onClick={() => setDeleting(tag)}
            >
              删除
            </Button>
          </div>
        ))}
        {!tags.length && <p className="muted">还没有任务标签，创建后即可在任务中选用。</p>}
      </div>
      {deleting && (
        <div className="task-tag-delete" role="group" aria-label="确认删除任务标签">
          <p>
            删除“{deleting.name}”将从{' '}
            {snapshot.tasks.filter((task) => task.tagIds?.includes(deleting.id)).length}{' '}
            项任务移除标记，任务本身保留。
          </p>
          <Button
            htmlType="submit"
            type="default"
            className="secondary-button"
            disabled={busy}
            onClick={() => setDeleting(null)}
          >
            取消
          </Button>
          <Button
            htmlType="submit"
            type="primary"
            danger
            className="danger-button"
            disabled={busy}
            onClick={() => void remove()}
          >
            确认删除标签
          </Button>
        </div>
      )}
    </Dialog>
  );
}

export function TaskTagPicker({
  snapshot,
  ids = [],
  onChange,
  onSnapshot,
  disabled = false,
}: {
  snapshot: Snapshot;
  ids?: string[];
  onChange: (ids: string[]) => void;
  onSnapshot: (snapshot: Snapshot) => void;
  disabled?: boolean;
}) {
  const [manage, setManage] = useState(false);
  return (
    <>
      <ConfigProvider componentDisabled={disabled}>
        <fieldset className="task-tag-picker" disabled={disabled}>
          <legend>颜色标签（可选）</legend>
          <div className="task-tag-options">
            {(snapshot.taskTags ?? []).map((tag) => (
              <Checkbox
                key={tag.id}
                aria-label={`标签 ${tag.name}`}
                checked={ids.includes(tag.id)}
                onChange={(event) =>
                  onChange(
                    event.target.checked ? [...ids, tag.id] : ids.filter((id) => id !== tag.id),
                  )
                }
              >
                <TaskTagChips tags={[tag]} ids={[tag.id]} />
              </Checkbox>
            ))}
          </div>
          <Button
            type="text"
            htmlType="button"
            className="text-button"
            onClick={() => setManage(true)}
          >
            管理任务标签
          </Button>
        </fieldset>
      </ConfigProvider>
      {manage && (
        <TaskTagManager
          snapshot={snapshot}
          onSnapshot={onSnapshot}
          onClose={() => setManage(false)}
        />
      )}
    </>
  );
}
