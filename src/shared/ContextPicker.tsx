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
          <select
            aria-label="关联系统"
            disabled={disabled}
            value={context.systemId ?? ''}
            onChange={(event) =>
              onChange({
                systemId: event.target.value || null,
                environmentId: null,
                resourceId: null,
              })
            }
          >
            <option value="">{unassignedSystemLabel}</option>
            {snapshot.systems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {mode !== 'system' && context.systemId && (
        <label>
          环境
          <select
            aria-label="关联环境"
            disabled={disabled}
            value={context.environmentId ?? ''}
            onChange={(event) =>
              onChange({ ...context, environmentId: event.target.value || null, resourceId: null })
            }
          >
            <option value="">整个系统</option>
            {snapshot.environments
              .filter((item) => item.systemId === context.systemId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
      )}
      {mode !== 'system' && context.systemId && (
        <label>
          资源
          <select
            aria-label="关联资源"
            disabled={disabled}
            value={context.resourceId ?? ''}
            onChange={(event) => onChange({ ...context, resourceId: event.target.value || null })}
          >
            <option value="">{context.environmentId ? '整个环境' : '整个系统'}</option>
            {snapshot.resources
              .filter(
                (item) =>
                  item.systemId === context.systemId &&
                  item.environmentId === context.environmentId,
              )
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
      )}
    </div>
  );
}
