import { markNewRecordChanged } from './new-record';
import { Select } from 'antd';
import type { Snapshot } from '../types';
import type { ObjectContext } from '../ledger-types';

export function contextLabel(snapshot: Snapshot, value: Partial<ObjectContext>) {
  return [
    snapshot.systems.find((item) => item.id === value.systemId)?.name,
    snapshot.environments.find((item) => item.id === value.environmentId)?.name,
    snapshot.resources.find((item) => item.id === value.resourceId)?.name,
  ]
    .filter(Boolean)
    .join(' / ');
}
export function ContextPicker({
  snapshot,
  value,
  onChange,
  disabled,
  mode = 'all',
  unassignedSystemLabel = '无系统关联',
}: {
  snapshot: Snapshot;
  value: Partial<ObjectContext>;
  onChange: (value: ObjectContext) => void;
  disabled?: boolean;
  mode?: 'all' | 'system' | 'details';
  unassignedSystemLabel?: string;
}) {
  const context: ObjectContext = {
    systemId: value.systemId ?? null,
    environmentId: value.environmentId ?? null,
    resourceId: value.resourceId ?? null,
  };
  return (
    <div className="context-fields">
      {mode !== 'details' && (
        <label>
          系统
          <Select
            aria-label="关联系统"
            disabled={disabled}
            value={context.systemId ?? ''}
            onChange={(event) => {
              markNewRecordChanged();
              return onChange({
                systemId: event || null,
                environmentId: null,
                resourceId: null,
              });
            }}
          >
            <Select.Option data-value={String('')} value="">
              {unassignedSystemLabel}
            </Select.Option>
            {snapshot.systems.map((item) => (
              <Select.Option data-value={String(item.id)} key={item.id} value={item.id}>
                {item.name}
              </Select.Option>
            ))}
          </Select>
        </label>
      )}
      {mode !== 'system' && context.systemId && (
        <label>
          环境
          <Select
            aria-label="关联环境"
            disabled={disabled}
            value={context.environmentId ?? ''}
            onChange={(event) => {
              markNewRecordChanged();
              return onChange({ ...context, environmentId: event || null, resourceId: null });
            }}
          >
            <Select.Option data-value={String('')} value="">
              整个系统
            </Select.Option>
            {snapshot.environments
              .filter((item) => item.systemId === context.systemId)
              .map((item) => (
                <Select.Option data-value={String(item.id)} key={item.id} value={item.id}>
                  {item.name}
                </Select.Option>
              ))}
          </Select>
        </label>
      )}
      {mode !== 'system' && context.systemId && (
        <label>
          资源
          <Select
            aria-label="关联资源"
            disabled={disabled}
            value={context.resourceId ?? ''}
            onChange={(event) => {
              markNewRecordChanged();
              return onChange({ ...context, resourceId: event || null });
            }}
          >
            <Select.Option data-value={String('')} value="">
              {context.environmentId ? '整个环境' : '整个系统'}
            </Select.Option>
            {snapshot.resources
              .filter(
                (item) =>
                  item.systemId === context.systemId &&
                  item.environmentId === context.environmentId,
              )
              .map((item) => (
                <Select.Option data-value={String(item.id)} key={item.id} value={item.id}>
                  {item.name}
                </Select.Option>
              ))}
          </Select>
        </label>
      )}
    </div>
  );
}
