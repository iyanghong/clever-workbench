import { importTargets, importChanges, sameEnvironment } from './ledger-import-matches';
import type { Snapshot } from './types';
import {
  ledgerImportKinds,
  ledgerImportFieldKinds,
  type ImportCandidate,
  type ImportReference,
  type LedgerImportKind,
} from './ledger-import-types';

export function importReferenceTarget(
  snapshot: Snapshot,
  candidates: ImportCandidate[],
  reference: ImportReference | null,
) {
  if (!reference) return null;
  if ('candidate' in reference) {
    const item = candidates.find(
      (candidate) => candidate.id === reference.candidate && candidate.selected,
    );
    return item ? { id: item.id, kind: item.kind, name: item.name, systemId: null } : null;
  }
  const resource = snapshot.resources.find((item) => item.id === reference.existing);
  if (resource) return { ...resource, kind: resource.kind };
  const access = snapshot.accessEntries.find((item) => item.id === reference.existing);
  if (access) return { ...access, kind: 'access' as const };
  const service = snapshot.services.find((item) => item.id === reference.existing);
  return service ? { ...service, kind: 'service' as const } : null;
}

export function importCandidateProblems(
  snapshot: Snapshot,
  systemId: string,
  kind: LedgerImportKind | 'all',
  candidates: ImportCandidate[],
) {
  const result: Record<string, string[]> = {};
  const targets = new Map(importTargets(snapshot, systemId).map((t) => [t.id, t]));
  const existing = [
    ...snapshot.resources
      .filter((item) => item.systemId === systemId)
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        name: item.name,
        addresses: [
          item.address,
          ...(item.connections ?? []).map(
            (connection) =>
              connection.address ||
              snapshot.resources.find((server) => server.id === connection.serverId)?.address ||
              '',
          ),
        ],
      })),
    ...snapshot.accessEntries
      .filter((item) => item.systemId === systemId)
      .map((item) => ({
        id: item.id,
        kind: 'access',
        name: item.name,
        addresses: item.addresses.map((address) => address.url),
      })),
    ...candidates
      .filter(
        (item) =>
          item.selected && ['server', 'database', 'redis', 'other', 'access'].includes(item.kind),
      )
      .map((item) => ({
        id: item.id,
        kind: item.kind,
        name: item.name,
        addresses: [
          item.address,
          ...item.addresses.map((address) => address.url),
          ...item.connections.map((connection) => connection.address),
        ],
      })),
  ];
  for (const candidate of candidates) {
    const errors: string[] = [];
    result[candidate.id] = errors;
    if (!candidate.selected) continue;
    if (!candidate.name.trim()) errors.push('请填写名称');
    if (!candidate.reviewed) errors.push('请核对来源并确认本条资料');
    if (kind !== 'all' && candidate.kind !== kind) errors.push('超出本次所选类型');
    const effectiveEnvironments =
      candidate.update && !candidate.update.environmentOverride
        ? (targets.get(candidate.update.targetId)?.environmentIds ?? null)
        : candidate.environmentIds;
    if (effectiveEnvironments === null) errors.push('请明确选择环境或系统通用');
    else {
      if (
        effectiveEnvironments.some(
          (id) =>
            !snapshot.environments.some(
              (environment) => environment.id === id && environment.systemId === systemId,
            ),
        )
      )
        errors.push('环境不属于当前系统');
      if (['node', 'job', 'backup'].includes(candidate.kind) && effectiveEnvironments.length > 1)
        errors.push('此类型只能选择一个环境');
      if (candidate.kind === 'node' && effectiveEnvironments.length !== 1)
        errors.push('部署节点需要明确环境');
    }
    if (candidate.update) {
      const t = targets.get(candidate.update.targetId);
      if (!t || t.kind !== candidate.kind) errors.push('请选择当前系统的同类型更新目标');
      else {
        if (
          !candidate.update.fields.length &&
          sameEnvironment(t.environmentIds, effectiveEnvironments ?? [])
        )
          errors.push('请选择要更新的字段或调整环境，也可以跳过');
        if (
          candidate.update.fields.some((k) => !importChanges(candidate, t).some((d) => d.key === k))
        )
          errors.push('所选字段已变化，请重新核对');
        if (
          candidates.some((o) => o.selected && o.id !== candidate.id && o.update?.targetId === t.id)
        )
          errors.push('多行指向同一更新目标，请保留一项');
        if (
          t.kind === 'account' &&
          (t.ownerBound
            ? !sameEnvironment(t.environmentIds, effectiveEnvironments ?? [])
            : effectiveEnvironments?.length !== 1)
        )
          errors.push('独立账号需选择一个环境，附属账号随所属对象展示');
      }
      continue;
    }
    const reference = (
      value: ImportReference | null,
      kinds: LedgerImportKind[],
      label: string,
      required = false,
    ) => {
      if (!value) {
        if (required) errors.push(`请选择${label}`);
        return;
      }
      const target = importReferenceTarget(snapshot, candidates, value);
      if (
        !target ||
        !kinds.includes(target.kind) ||
        (target.systemId && target.systemId !== systemId)
      )
        errors.push(`${label}无效、未勾选或不在本系统`);
    };
    if (candidate.kind === 'node') {
      reference(candidate.service, ['service'], '所属服务', true);
      reference(candidate.server, ['server'], '关联服务器');
    }
    if (candidate.kind === 'account') {
      reference(
        candidate.owner,
        ['server', 'database', 'redis', 'other', 'access'],
        '账号所属对象',
      );
      if (!candidate.owner && candidate.environmentIds?.length !== 1)
        errors.push('独立账号需要所属对象或一个明确环境');
    }
    if (candidate.kind === 'job' || candidate.kind === 'backup') {
      reference(candidate.service, ['service'], '关联服务');
      reference(candidate.owner, ['server', 'database', 'redis', 'other'], '关联资源');
      if (candidate.service && candidate.owner) errors.push('运维资料只能关联一个服务或资源');
    }
    for (const connection of candidate.connections)
      reference(connection.server, ['server'], '连接服务器');
    for (const port of [
      candidate.port,
      ...candidate.connections.map((connection) => connection.port),
    ]) {
      if (port && (!/^\d+$/.test(port) || Number(port) < 1 || Number(port) > 65535))
        errors.push('端口应为 1 到 65535，或留空');
    }
    if (
      candidate.accounts.length &&
      !['server', 'database', 'redis', 'other', 'access'].includes(candidate.kind)
    )
      errors.push('此类型不能直接附带账号');
    if (candidate.connections.length && !['database', 'redis', 'other'].includes(candidate.kind))
      errors.push('此类型不使用资源连接');
    if (candidate.addresses.length && candidate.kind !== 'access')
      errors.push('只有访问入口使用具名地址');
    if (Object.keys(candidate.fields).length && !ledgerImportFieldKinds.includes(candidate.kind))
      errors.push('此类型不保存附加字段，请移除或修正类型');
    if (candidate.tags.length && ['node', 'account'].includes(candidate.kind))
      errors.push('账号与部署节点不独立设置标签，请移除');
    if (candidate.accounts.some((account) => !account.name.trim()))
      errors.push('请填写每组账号的用途或角色');
    if (candidate.connections.some((connection) => !connection.label.trim()))
      errors.push('请填写每组连接名称');
    if (candidate.addresses.some((address) => !address.label.trim()))
      errors.push('请填写每个地址名称');
    if (
      new Set(candidate.accounts.map((account) => account.name.trim().toLowerCase())).size !==
      candidate.accounts.length
    )
      errors.push('同一对象的账号用途不能重复');
    const own = existing.find((item) => item.id === candidate.id);
    if (
      own &&
      !candidate.confirmDuplicate &&
      existing.some(
        (item) =>
          item.id !== own.id &&
          (item.name.toLowerCase() === own.name.trim().toLowerCase() ||
            own.addresses.some((address) => address && item.addresses.includes(address))),
      )
    )
      errors.push('疑似重复，请跳过或确认新增独立记录');
    if (!Object.hasOwn(ledgerImportKinds, candidate.kind)) errors.push('台账类型无效');
  }
  return result;
}
