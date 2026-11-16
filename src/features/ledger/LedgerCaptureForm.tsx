import { markNewRecordChanged } from '../../shared/new-record';
import { Button, Input, Select, ConfigProvider, Collapse } from 'antd';
import { ConnectionFields, OptionalFields } from './RecordFields';
import { resourceTemplate } from '../../ledger-fields';
import type { ResourceConnection, ResourceKind } from '../../ledger-types';
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
  kind: 'access' | 'server' | 'resource';
  snapshot: Snapshot;
  context: CreationContext;
  submit: (input: LedgerCapture) => Promise<void>;
  cancel: () => void;
}) {
  const [systemId, setSystemId] = useState(context.systemId ?? snapshot.systems[0]?.id ?? '');
  const [environmentId, setEnvironmentId] = useState(context.environmentId ?? '');
  const [name, setName] = useState(''),
    [address, setAddress] = useState(''),
    [port, setPort] = useState('');
  const [purpose, setPurpose] = useState(''),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState('');
  const [resourceKind, setResourceKind] = useState<ResourceKind>('redis');
  const [connections, setConnections] = useState<ResourceConnection[]>([]);
  const [preferred, setPreferred] = useState<string | null>(null);
  const [notes, setNotes] = useState(''),
    [accountName, setAccountName] = useState(''),
    [addressLabel, setAddressLabel] = useState('');
  const [token, setToken] = useState(''),
    [privateKey, setPrivateKey] = useState('');
  const [extraAddresses, setExtraAddresses] = useState<{ label: string; url: string }[]>([]);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const vault = useVault(),
    label = kind === 'access' ? '访问入口' : kind === 'server' ? '服务器' : '资源';
  async function create() {
    if (busy || !name.trim() || !systemId) return;
    setBusy(true);
    setError('');
    try {
      if ((password || token || privateKey) && !(await vault.ensureUnlocked())) return;
      await submit({
        kind: kind === 'resource' ? resourceKind : kind,
        systemId,
        environmentId: environmentId || null,
        name,
        address,
        port: kind === 'server' ? port : undefined,
        purpose,
        fields,
        username,
        password,
        token,
        privateKey,
        accountName,
        notes,
        ...(kind === 'access'
          ? {
              addresses: [
                ...(address ? [{ label: addressLabel || '主地址', url: address }] : []),
                ...extraAddresses.filter((a) => a.url.trim()),
              ],
            }
          : {}),
        ...(kind === 'resource'
          ? {
              connections: connections.filter(
                (c) => c.label || c.address || c.port || c.role || c.serverId,
              ),
              preferredConnectionId: preferred,
            }
          : {}),
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
      data-new-record
      onChangeCapture={(e) => {
        e.currentTarget.dataset.dirty = 'true';
      }}
      aria-busy={busy}
      onSubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <ConfigProvider componentDisabled={busy}>
        <fieldset disabled={busy} className="new-record-fields">
          <p className="field-hint">只填名称也能保存。地址和账号可以现在记，也可以以后补。</p>
          <div className="record-fields">
            <label>
              名称
              <Input
                autoFocus
                aria-label={
                  kind === 'access'
                    ? '入口名称'
                    : kind === 'server'
                      ? '服务器名称'
                      : '快速新建资源名称'
                }
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && event.nativeEvent.isComposing)
                    event.preventDefault();
                }}
              />
            </label>
            {kind !== 'resource' && (
              <label>
                {kind === 'access' ? '登录地址' : 'IP / 主机名'}
                <Input
                  aria-label={kind === 'access' ? '登录地址' : '服务器 IP'}
                  value={address}
                  placeholder={kind === 'access' ? 'https://…（可选）' : '如 192.0.2.10（可选）'}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </label>
            )}
          </div>
          {kind === 'resource' && (
            <>
              <label>
                类型
                <Select
                  aria-label="新资源类型"
                  value={resourceKind}
                  onChange={(e) => {
                    markNewRecordChanged();
                    return setResourceKind(e as ResourceKind);
                  }}
                >
                  <Select.Option data-value={String('redis')} value="redis">
                    Redis
                  </Select.Option>
                  <Select.Option data-value={String('database')} value="database">
                    数据库
                  </Select.Option>
                  <Select.Option data-value={String('other')} value="other">
                    其他中间件／资源
                  </Select.Option>
                </Select>
              </label>
              <OptionalFields
                value={{ 类型: fields['类型'] ?? '', 版本: fields['版本'] ?? '' }}
                names={['类型', '版本']}
                prefix="资源"
                onChange={(next) => setFields({ ...fields, ...next })}
              />
              <ConnectionFields
                value={connections}
                preferred={preferred}
                systemId={systemId}
                snapshot={snapshot}
                onChange={(next, selected) => {
                  setConnections(next);
                  setPreferred(selected);
                }}
              />
              <Collapse
                className="compact-details"
                ghost
                defaultActiveKey={false ? ['details'] : []}
                items={[
                  {
                    key: 'details',
                    label: <>配置资料（可选）</>,
                    forceRender: true,
                    children: (
                      <>
                        <OptionalFields
                          custom
                          value={Object.fromEntries(
                            Object.entries(fields).filter(
                              ([key]) => !['类型', '版本'].includes(key),
                            ),
                          )}
                          names={resourceTemplate(resourceKind, fields['类型']).filter(
                            (key) => !['类型', '版本'].includes(key),
                          )}
                          prefix={resourceKind === 'database' ? '数据库' : '资源'}
                          onChange={(next) =>
                            setFields({
                              类型: fields['类型'] ?? '',
                              版本: fields['版本'] ?? '',
                              ...next,
                            })
                          }
                        />
                      </>
                    ),
                  },
                ]}
              />
            </>
          )}
          {kind === 'access' && (
            <Collapse
              className="compact-details"
              ghost
              defaultActiveKey={false ? ['details'] : []}
              items={[
                {
                  key: 'details',
                  label: <>地址名称与更多地址（可选）</>,
                  forceRender: true,
                  children: (
                    <>
                      <label>
                        主地址名称
                        <Input
                          aria-label="主地址名称"
                          value={addressLabel}
                          onChange={(e) => setAddressLabel(e.target.value)}
                        />
                      </label>
                      {extraAddresses.map((a, i) => (
                        <div className="record-fields" key={i}>
                          <label>
                            地址名称
                            <Input
                              value={a.label}
                              onChange={(e) =>
                                setExtraAddresses(
                                  extraAddresses.map((v, j) =>
                                    j === i ? { ...v, label: e.target.value } : v,
                                  ),
                                )
                              }
                            />
                          </label>
                          <label>
                            地址
                            <Input
                              value={a.url}
                              onChange={(e) =>
                                setExtraAddresses(
                                  extraAddresses.map((v, j) =>
                                    j === i ? { ...v, url: e.target.value } : v,
                                  ),
                                )
                              }
                            />
                          </label>
                          <Button
                            type="text"
                            htmlType="button"
                            className="text-button"
                            onClick={() =>
                              setExtraAddresses(extraAddresses.filter((_, j) => i !== j))
                            }
                          >
                            删除地址
                          </Button>
                        </div>
                      ))}
                      <Button
                        type="text"
                        htmlType="button"
                        className="text-button"
                        onClick={() =>
                          setExtraAddresses([...extraAddresses, { label: '', url: '' }])
                        }
                      >
                        添加地址
                      </Button>
                    </>
                  ),
                },
              ]}
            />
          )}
          {kind === 'server' && (
            <div className="record-fields">
              <label>
                用途
                <Input
                  aria-label="服务器用途"
                  value={purpose}
                  placeholder="如订单应用、缓存或定时任务"
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </label>
              <label>
                端口
                <Input
                  aria-label="服务器端口"
                  inputMode="numeric"
                  value={port}
                  placeholder="如 22（可选）"
                  onChange={(event) => setPort(event.target.value)}
                />
              </label>
            </div>
          )}
          <div className="record-fields">
            <label>
              用户名
              <Input
                aria-label="首个账号用户名"
                autoComplete="off"
                value={username}
                placeholder="可选，稍后可增加其他角色"
                onChange={(event) => setUsername(event.target.value)}
              />
            </label>
            <label>
              密码
              <Input.Password
                aria-label="首个账号密码"
                autoComplete="new-password"

                value={password}
                placeholder="可选，加密保存"
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
          </div>
          <Collapse
            className="compact-details"
            ghost
            defaultActiveKey={false ? ['details'] : []}
            items={[
              {
                key: 'details',
                label: <>账号角色、其他凭据与说明（可选）</>,
                forceRender: true,
                children: (
                  <>
                    <label>
                      账号角色
                      <Input
                        aria-label="首个账号角色"
                        value={accountName}
                        onChange={(e) => setAccountName(e.target.value)}
                        placeholder="默认账号"
                      />
                    </label>
                    <label>
                      Token
                      <Input.Password
                        autoComplete="new-password"
                        value={token}
                        onChange={(e) => setToken(e.target.value)}
                      />
                    </label>
                    <label>
                      私钥
                      <Input.TextArea
                        className="secret-input"
                        autoComplete="off"
                        value={privateKey}
                        onChange={(e) => setPrivateKey(e.target.value)}
                      />
                    </label>
                    <label>
                      说明
                      <Input.TextArea value={notes} onChange={(e) => setNotes(e.target.value)} />
                    </label>
                    {kind === 'server' && (
                      <OptionalFields
                        value={Object.fromEntries(
                          resourceTemplate('server').map((key) => [key, fields[key] ?? '']),
                        )}
                        names={resourceTemplate('server')}
                        prefix="服务器"
                        onChange={(next) => setFields({ ...fields, ...next })}
                      />
                    )}
                  </>
                ),
              },
            ]}
          />
          {kind === 'server' && (
            <Collapse
              className="compact-details capture-configuration"
              ghost
              defaultActiveKey={false ? ['details'] : []}
              items={[
                {
                  key: 'details',
                  label: <>操作系统与硬件配置（可选）</>,
                  forceRender: true,
                  children: (
                    <>
                      <div className="record-fields">
                        {serverConfigurationFields.map((field) => (
                          <label key={field}>
                            {field}
                            <Input
                              aria-label={`服务器${field}`}
                              value={fields[field] ?? ''}
                              onChange={(event) =>
                                setFields({ ...fields, [field]: event.target.value })
                              }
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
                    </>
                  ),
                },
              ]}
            />
          )}
          <div className="record-fields">
            <label>
              系统
              <Select
                aria-label="新记录所属系统"
                value={systemId}
                onChange={(event) => {
                  markNewRecordChanged();
                  setSystemId(event);
                  setEnvironmentId('');
                  setConnections(connections.map((c) => ({ ...c, serverId: null })));
                }}
              >
                {!snapshot.systems.length && (
                  <Select.Option data-value={String('')} value="">
                    请先创建系统
                  </Select.Option>
                )}
                {snapshot.systems.map((item) => (
                  <Select.Option data-value={String(item.id)} key={item.id} value={item.id}>
                    {item.name}
                  </Select.Option>
                ))}
              </Select>
            </label>
            <label>
              环境
              <Select
                aria-label="新记录所属环境"
                value={environmentId}
                onChange={(event) => {
                  markNewRecordChanged();
                  return setEnvironmentId(event);
                }}
              >
                <Select.Option data-value={String('')} value="">
                  系统通用
                </Select.Option>
                {snapshot.environments
                  .filter((item) => item.systemId === systemId)
                  .map((item) => (
                    <Select.Option data-value={String(item.id)} key={item.id} value={item.id}>
                      {item.name}
                    </Select.Option>
                  ))}
              </Select>
            </label>
          </div>
        </fieldset>
      </ConfigProvider>
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      <div className="modal-actions">
        <Button
          type="default"
          htmlType="button"
          className="secondary-button"
          disabled={busy}
          onClick={cancel}
        >
          取消
        </Button>
        <Button
          htmlType="submit"
          type="primary"
          className="primary-button"
          disabled={busy || !name.trim() || !systemId}
        >
          {busy ? '正在保存…' : `创建${label}`}
        </Button>
      </div>
    </form>
  );
}
function QuickCapture({
  kind,
  ...props
}: CreationProps & { kind: 'access' | 'server' | 'resource' }) {
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

export const QuickResourceCapture = (props: CreationProps) => (
  <QuickCapture {...props} kind="resource" />
);
