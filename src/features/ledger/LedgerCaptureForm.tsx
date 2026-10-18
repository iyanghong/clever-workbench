import { useState } from 'react';
import type { CreationContext, CreationProps } from '../../app/actions';
import type { LedgerCapture } from '../../ledger-types';
import { serverConfigurationFields } from '../../ledger-types';
import type { Snapshot } from '../../types';
import { useVault } from '../vault/VaultProvider';

export function LedgerCaptureForm({
  kind,
  snapshot,
  context,
  submit,
  cancel,
}: {
  kind: LedgerCapture['kind'];
  snapshot: Snapshot;
  context: CreationContext;
  submit: (input: LedgerCapture) => Promise<void>;
  cancel: () => void;
}) {
  const [systemId, setSystemId] = useState(context.systemId ?? snapshot.systems[0]?.id ?? '');
  const [environmentId, setEnvironmentId] = useState(context.environmentId ?? '');
  const [name, setName] = useState(''),
    [address, setAddress] = useState('');
  const [purpose, setPurpose] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const vault = useVault(),
    label = kind === 'access' ? '访问入口' : '服务器';
  async function create() {
    if (busy || !name.trim() || !systemId) return;
    setBusy(true);
    setError('');
    try {
      if (password && !(await vault.ensureUnlocked())) return;
      await submit({
        kind,
        systemId,
        environmentId: environmentId || null,
        name,
        address,
        purpose,
        fields,
        username,
        password,
      });
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="ledger-capture"
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <p className="field-hint">只填名称也能保存。地址和账号可以现在记，也可以以后补。</p>
      <div className="record-fields">
        <label>
          名称
          <input
            autoFocus
            aria-label={kind === 'access' ? '入口名称' : '服务器名称'}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && event.nativeEvent.isComposing) event.preventDefault();
            }}
          />
        </label>
        <label>
          {kind === 'access' ? '登录地址' : 'IP / 主机名'}
          <input
            aria-label={kind === 'access' ? '登录地址' : '服务器 IP'}
            value={address}
            placeholder={kind === 'access' ? 'https://…（可选）' : '如 192.0.2.10（可选）'}
            onChange={(event) => setAddress(event.target.value)}
          />
        </label>
      </div>
      {kind === 'server' && (
        <label>
          用途
          <input
            aria-label="服务器用途"
            value={purpose}
            placeholder="如订单应用、缓存或定时任务"
            onChange={(event) => setPurpose(event.target.value)}
          />
        </label>
      )}
      {kind === 'server' && (
        <details className="compact-details capture-configuration">
          <summary>操作系统与硬件配置（可选）</summary>
          <div className="record-fields">
            {serverConfigurationFields.map((field) => (
              <label key={field}>
                {field}
                <input
                  aria-label={`服务器${field}`}
                  value={fields[field] ?? ''}
                  onChange={(event) => setFields({ ...fields, [field]: event.target.value })}
                  placeholder={
                    field === '操作系统'
                      ? '如 Kylin Linux V10'
                      : field === 'CPU'
                        ? '型号与核数，如 16 核'
                        : field === '内存'
                          ? '如 32G'
                          : '如 500G'
                  }
                />
              </label>
            ))}
          </div>
        </details>
      )}
      <div className="record-fields">
        <label>
          系统
          <select
            aria-label="新记录所属系统"
            value={systemId}
            onChange={(event) => {
              setSystemId(event.target.value);
              setEnvironmentId('');
            }}
          >
            {!snapshot.systems.length && <option value="">请先创建系统</option>}
            {snapshot.systems.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          环境
          <select
            aria-label="新记录所属环境"
            value={environmentId}
            onChange={(event) => setEnvironmentId(event.target.value)}
          >
            <option value="">系统通用</option>
            {snapshot.environments
              .filter((item) => item.systemId === systemId)
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
      </div>
      <div className="record-fields">
        <label>
          用户名
          <input
            aria-label="首个账号用户名"
            autoComplete="off"
            value={username}
            placeholder="可选，稍后可增加其他角色"
            onChange={(event) => setUsername(event.target.value)}
          />
        </label>
        <label>
          密码
          <input
            aria-label="首个账号密码"
            autoComplete="new-password"
            type="password"
            value={password}
            placeholder="可选，加密保存"
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
      </div>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <button type="button" className="secondary-button" disabled={busy} onClick={cancel}>
          取消
        </button>
        <button className="primary-button" disabled={busy || !name.trim() || !systemId}>
          {busy ? '正在保存…' : `创建${label}`}
        </button>
      </div>
    </form>
  );
}
function QuickCapture({ kind, ...props }: CreationProps & { kind: LedgerCapture['kind'] }) {
  return (
    <LedgerCaptureForm
      kind={kind}
      snapshot={props.snapshot}
      context={props.context}
      cancel={props.cancel}
      submit={(input) =>
        props.execute(async () => {
          const result = await window.desktop.captureLedger(input);
          return { module: 'ledger', objectId: result.createdId };
        })
      }
    />
  );
}
export const QuickAccess = (props: CreationProps) => <QuickCapture {...props} kind="access" />;
export const QuickServer = (props: CreationProps) => <QuickCapture {...props} kind="server" />;
