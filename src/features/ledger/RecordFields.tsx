import { useId, useState } from 'react';
import type { Snapshot } from '../../types';
import type { ResourceConnection } from '../../ledger-types';
import { connectionAddress, resourceProducts, secretFieldName } from '../../ledger-fields';

export function OptionalFields({
  value,
  names,
  onChange,
  prefix = '',
  custom = false,
}: {
  value: Record<string, string>;
  names: readonly string[];
  prefix?: string;
  custom?: boolean;
  onChange: (value: Record<string, string>) => void;
}) {
  const productsId = useId();
  const [fieldName, setFieldName] = useState('');
  const validField =
    fieldName.trim() &&
    !secretFieldName.test(fieldName) &&
    fieldName.trim().length <= 80 &&
    !Object.hasOwn(value, fieldName.trim()) &&
    !names.includes(fieldName.trim()) &&
    !['__proto__', 'prototype', 'constructor'].includes(fieldName.trim()) &&
    Object.keys(value).length < 50;
  return (
    <div className="record-fields">
      {[...new Set([...names, ...Object.keys(value)])].map((name) => (
        <label key={name}>
          {name}
          {/命令|说明|结果/.test(name) ? (
            <textarea
              aria-label={`${prefix}${name}`}
              value={value[name] ?? ''}
              onChange={(e) => onChange({ ...value, [name]: e.target.value })}
            />
          ) : (
            <input
              aria-label={`${prefix}${name}`}
              value={value[name] ?? ''}
              placeholder={
                name === '最近恢复验证时间' ? '例如 2026-10-22 或 2026-10-22 10:00' : '可选'
              }
              list={name === '类型' ? productsId : undefined}
              onChange={(e) => onChange({ ...value, [name]: e.target.value })}
            />
          )}
          {!names.includes(name) && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const next = { ...value };
                delete next[name];
                onChange(next);
              }}
            >
              删除字段 {name}
            </button>
          )}
        </label>
      ))}
      <datalist id={productsId}>
        {resourceProducts.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {custom && (
        <div className="extra-field">
          <input
            aria-label="附加字段名称"
            placeholder="普通字段名称"
            value={fieldName}
            onChange={(e) => setFieldName(e.target.value)}
          />
          <button
            type="button"
            className="secondary-button"
            disabled={!validField}
            onClick={() => {
              onChange({ ...value, [fieldName.trim()]: '' });
              setFieldName('');
            }}
          >
            添加附加字段
          </button>
          <small>密码、Token 和私钥请使用专门的凭据字段。</small>
        </div>
      )}
    </div>
  );
}

export function ConnectionFields({
  value,
  preferred,
  systemId,
  snapshot,
  onChange,
}: {
  value: ResourceConnection[];
  preferred: string | null;
  systemId: string;
  snapshot: Snapshot;
  onChange: (value: ResourceConnection[], preferred: string | null) => void;
}) {
  const update = (index: number, patch: Partial<ResourceConnection>) =>
    onChange(
      value.map((c, i) => (i === index ? { ...c, ...patch } : c)),
      preferred,
    );
  return (
    <section aria-label="资源连接">
      <h3>连接信息（可选）</h3>
      {value.map((c, index) => (
        <fieldset key={c.id} className="connection-fields">
          <legend>{c.label || `连接 ${index + 1}`}</legend>
          <div className="record-fields">
            <label>
              连接名称
              <input
                aria-label={`连接 ${index + 1} 名称`}
                value={c.label}
                onChange={(e) => update(index, { label: e.target.value })}
              />
            </label>
            <label>
              用途／节点角色
              <input
                aria-label={`连接 ${index + 1} 角色`}
                value={c.role}
                onChange={(e) => update(index, { role: e.target.value })}
                placeholder="如业务、管理、主节点、备节点"
              />
            </label>
            <label>
              地址
              <input
                aria-label={`连接 ${index + 1} 地址`}
                value={c.address}
                onChange={(e) => update(index, { address: e.target.value })}
                placeholder={
                  c.serverId
                    ? connectionAddress(c, snapshot.resources) || '服务器地址待补充'
                    : 'IP、主机名或 URL'
                }
              />
              {!c.address && c.serverId && <small>地址来自服务器</small>}
            </label>
            <label>
              端口
              <input
                aria-label={`连接 ${index + 1} 端口`}
                inputMode="numeric"
                value={c.port}
                onChange={(e) => update(index, { port: e.target.value })}
              />
            </label>
            <label>
              关联服务器
              <select
                aria-label={`连接 ${index + 1} 服务器`}
                value={c.serverId ?? ''}
                onChange={(e) =>
                  update(index, {
                    serverId: e.target.value || null,
                    address: !e.target.value ? connectionAddress(c, snapshot.resources) : c.address,
                  })
                }
              >
                <option value="">不关联</option>
                {snapshot.resources
                  .filter((r) => r.systemId === systemId && r.kind === 'server')
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              <input
                type="radio"
                name="preferred-resource-connection"
                checked={(preferred ?? value[0]?.id) === c.id}
                onChange={() => onChange(value, c.id)}
              />
              常用连接
            </label>
          </div>
          <button
            type="button"
            className="text-button"
            onClick={() => {
              const next = value.filter((_, i) => i !== index);
              onChange(next, preferred === c.id ? (next[0]?.id ?? null) : preferred);
            }}
          >
            删除连接 {index + 1}
          </button>
          {index > 0 && (
            <button
              type="button"
              className="text-button"
              onClick={() => {
                const next = [...value];
                [next[index - 1], next[index]] = [next[index], next[index - 1]];
                onChange(next, preferred ?? value[0].id);
              }}
            >
              上移连接 {index + 1}
            </button>
          )}
        </fieldset>
      ))}
      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          onChange(
            [
              ...value,
              {
                id: crypto.randomUUID(),
                label: '',
                address: '',
                port: '',
                role: '',
                serverId: null,
              },
            ],
            preferred,
          )
        }
      >
        添加连接
      </button>
    </section>
  );
}

export function DocumentReferences({
  value,
  systemId,
  snapshot,
  onChange,
  onOpen,
}: {
  value: string[];
  systemId: string;
  snapshot: Snapshot;
  onChange?: (value: string[]) => void;
  onOpen?: (id: string) => void;
}) {
  const documents = snapshot.documents.filter(
    (d) => d.deletedAt === null && (d.systemId === null || d.systemId === systemId),
  );
  return (
    <section aria-label="操作文档">
      <h3>操作文档</h3>
      {(onChange ? documents : documents.filter((d) => value.includes(d.id))).map((d) => (
        <div key={d.id} className="document-reference">
          {onChange && (
            <label>
              <input
                type="checkbox"
                checked={value.includes(d.id)}
                onChange={(e) =>
                  onChange(e.target.checked ? [...value, d.id] : value.filter((id) => id !== d.id))
                }
              />
              {d.title || '未命名文档'}
              {d.systemId === null ? '（通用）' : ''}
            </label>
          )}
          {onOpen && (
            <button type="button" className="text-button" onClick={() => onOpen(d.id)}>
              {onChange ? '打开文档' : d.title || '未命名文档'}
            </button>
          )}
        </div>
      ))}
      {!documents.length && <p className="field-hint">暂无可关联文档，可稍后补充。</p>}
    </section>
  );
}
