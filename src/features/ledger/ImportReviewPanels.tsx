import { Button, Select, Tag } from 'antd';
import { FilesIcon, StackIcon, IntersectIcon, CheckCircleIcon } from '@phosphor-icons/react';
import { Dialog } from '../../shared/Dialog';
import { ledgerImportKinds, type ImportCandidate } from '../../ledger-import-types';
import {
  endpointValues,
  importChanges,
  sameEnvironment,
  type ReviewMatch,
  type ImportTarget,
} from '../../ledger-import-matches';
import type { Snapshot } from '../../types';
import { useState } from 'react';

export type EnvLabel = (ids: string[] | null) => string;
export const actionLabel = (row: ImportCandidate) =>
  !row.selected ? '跳过' : row.update ? '更新' : '新增';
export const sourceLabels = (row: ImportCandidate) =>
  row.environmentNames.length ? row.environmentNames : [row.advice?.section || '未注明环境'];
export function MatchPanel({
  row,
  matches,
  scope,
  envLabel,
  onTarget,
}: {
  row: ImportCandidate;
  matches: ReviewMatch[];
  scope: string[] | null;
  envLabel: EnvLabel;
  onTarget: (id: string) => void;
}) {
  const strong = matches.filter((m) => m.strong),
    weak = matches.filter((m) => !m.strong);
  return (
    <>
      {strong.length ? (
        <section className="import-matches" aria-label="疑似重复对象">
          <header>
            <h3>
              <IntersectIcon /> 疑似重复对象
            </h3>
            <span>{strong.length} 个匹配</span>
          </header>
          {strong.map((m) => (
            <div className="import-match" key={m.origin + m.id}>
              <div>
                <small>
                  {m.origin === 'file' ? <FilesIcon /> : <StackIcon />}{' '}
                  {m.origin === 'file'
                    ? '本文件 · ' + m.location
                    : '已有台账 · ' + ledgerImportKinds[m.kind]}
                </small>
                <strong>{m.name || '未命名'}</strong>
              </div>
              <div>
                <b>{m.reasons.join('、')}</b>
                <small>
                  本行 {envLabel(scope)}，对方 {envLabel(m.environmentIds)}
                </small>
                {m.sharedAddress && <code>{m.sharedAddress}</code>}
              </div>
              <details>
                <summary>查看对照</summary>
                <p>
                  当前候选　{row.name} · {endpointValues(row).join('、') || '未填写地址'}
                </p>
                <p>
                  比对对象　{m.name} · {m.addresses.join('、') || '未填写地址'}
                </p>
              </details>
              {m.origin === 'ledger' && m.kind === row.kind && (
                <Button size="small" type="link" onClick={() => onTarget(m.id)}>
                  {row.update?.targetId === m.id ? '当前更新目标' : '选为更新目标'}
                </Button>
              )}
            </div>
          ))}
        </section>
      ) : (
        <div className="import-no-match">
          <CheckCircleIcon /> 未发现强匹配对象
        </div>
      )}
      {weak.length > 0 && (
        <details className="import-weak">
          <summary>其他相似项（{weak.length}）· 仅供参考</summary>
          {weak.map((m) => (
            <p key={m.origin + m.id}>
              {m.name} · {m.origin === 'file' ? '本文件 · ' + m.location : '已有台账'} ·{' '}
              {envLabel(m.environmentIds)} · 名称部分相似
            </p>
          ))}
        </details>
      )}
    </>
  );
}

export function MappingDialog({
  rows,
  environments,
  manual,
  close,
  apply,
}: {
  rows: ImportCandidate[];
  environments: Snapshot['environments'];
  manual: Set<string>;
  close: () => void;
  apply: (changes: Map<string, string[]>) => void;
}) {
  const [map, setMap] = useState<Record<string, string>>({});
  const changes = new Map<string, string[]>();
  const eligible = rows.filter((r) => r.selected && !r.update && !r.reviewed && !manual.has(r.id));
  for (const r of eligible) {
    const labels = sourceLabels(r),
      values = labels.map((l) => map[l]);
    if (values.some((v) => !v)) continue;
    const distinct = [...new Set(values)];
    if (distinct.length > 1 && distinct.includes('common')) continue;
    const next = distinct.includes('common') ? [] : distinct;
    if (r.environmentIds === null || !sameEnvironment(r.environmentIds, next))
      changes.set(r.id, next);
  }
  return (
    <Dialog
      title="批量映射环境"
      onClose={close}
      description="仅调整尚未确认、尚未手动指定环境的新增行。多来源行需为各来源选择一致的通用范围或具体环境。"
    >
      {[...new Set(rows.flatMap(sourceLabels))].map((label) => (
        <label className="import-map-row" key={label}>
          <b>{label}</b>
          <Select
            aria-label={'来源环境 ' + label}
            value={map[label] || ''}
            onChange={(v) => setMap({ ...map, [label]: v })}
            options={[
              { label: '保持当前环境', value: '' },
              { label: '系统通用', value: 'common' },
              ...environments.map((e) => ({ label: e.name, value: e.id })),
            ]}
          />
          <small>{eligible.filter((r) => sourceLabels(r).includes(label)).length} 条可映射</small>
        </label>
      ))}
      <div className="local-import-footer">
        <span role="status">将修改 {changes.size} 条</span>
        <Button type="primary" disabled={!changes.size} onClick={() => apply(changes)}>
          应用映射
        </Button>
      </div>
    </Dialog>
  );
}

export function ImportSummary({
  rows,
  targets,
  envLabel,
  edit,
  submit,
  working,
}: {
  rows: ImportCandidate[];
  targets: ImportTarget[];
  envLabel: EnvLabel;
  edit: (id: string) => void;
  submit: () => void;
  working: boolean;
}) {
  const counts = ['新增', '更新', '跳过'].map(
    (label) => [label, rows.filter((r) => actionLabel(r) === label).length] as const,
  );
  const byId = new Map(targets.map((t) => [t.id, t]));
  return (
    <section className="import-summary" aria-label="保存前汇总">
      <div className="import-counts">
        {counts.map(([label, n]) => (
          <span key={label}>
            <strong>{n}</strong> {label}
          </span>
        ))}
        <small>共 {rows.length} 条已校对</small>
      </div>
      <div className="import-summary-body">
        {rows.map((r, i) => {
          const t = r.update && byId.get(r.update.targetId);
          return (
            <article key={r.id}>
              <span className="import-index">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <strong>{r.name || '未命名'}</strong>
                <small>
                  {r.advice?.location} · {ledgerImportKinds[r.kind]}
                </small>
              </div>
              <div>
                <Tag>{actionLabel(r)}</Tag>
                {r.selected && (t ? '「' + t.name + '」' : envLabel(r.environmentIds))}
                {t &&
                  r.selected &&
                  importChanges(r, t)
                    .filter((d) => r.update?.fields.includes(d.key))
                    .map((d) => (
                      <p key={d.key}>
                        {d.label}：{d.before || '空'} → {d.after}
                      </p>
                    ))}
                {t &&
                  r.selected &&
                  r.update?.environmentOverride &&
                  !sameEnvironment(t.environmentIds, r.environmentIds ?? []) && (
                    <p>
                      适用环境：{envLabel(t.environmentIds)} → {envLabel(r.environmentIds)}
                    </p>
                  )}
              </div>
              <Button
                type="link"
                disabled={working}
                aria-label={'修改第 ' + (i + 1) + ' 条'}
                onClick={() => edit(r.id)}
              >
                修改
              </Button>
            </article>
          );
        })}
      </div>
      <footer className="local-import-footer">
        <span>确认后统一保存所选新增与更新</span>
        <Button type="primary" loading={working} onClick={submit}>
          确认保存所选台账
        </Button>
      </footer>
    </section>
  );
}
