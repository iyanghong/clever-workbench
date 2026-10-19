import type { Snapshot } from '../src/types';
import type { DeploymentNode, ScopeKind } from '../src/ledger-workspace-types';
import { inEnvironment, scopeFor } from '../src/ledger-workspace-types';
import type {
  LedgerCopySelection,
  LedgerCopyRequest,
  LedgerCopyCandidate,
  LedgerCopyPreview,
} from '../src/ledger-copy-types';

const states = { active: '在用', inactive: '停用', unverified: '待确认' };
const lines = (fields: [string, string | undefined | null][]) =>
  fields
    .filter(([, value]) => value?.trim())
    .map(([key, value]) => `${key}：${value}`)
    .join('\n');
const kinds = ['resource', 'access', 'service', 'node', 'operation'];
function id(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !value || value.length > 100)
    throw new Error('复制对象标识无效。');
}
function validate(snapshot: Snapshot, input: unknown): asserts input is LedgerCopySelection {
  if (!input || typeof input !== 'object') throw new Error('复制范围无效。');
  const selection = input as LedgerCopySelection;
  id(selection.systemId);
  id(selection.environment);
  if (!snapshot.systems.some((s) => s.id === selection.systemId)) throw new Error('系统已不存在。');
  if (
    !['all', 'common'].includes(selection.environment) &&
    !snapshot.environments.some(
      (e) => e.id === selection.environment && e.systemId === selection.systemId,
    )
  )
    throw new Error('复制环境不属于当前系统。');
  if (
    !Array.isArray(selection.objects) ||
    !selection.objects.length ||
    selection.objects.length > 1000
  )
    throw new Error('请选择 1 至 1000 条资料。');
  for (const ref of selection.objects) {
    if (!ref || !kinds.includes(ref.kind)) throw new Error('复制对象类型无效。');
    id(ref.id);
  }
}
function requireRecord<T extends { id: string }>(items: T[], id: string): T {
  const item = items.find((r) => r.id === id);
  if (!item) throw new Error('记录或关联资料已不存在，请刷新后重新选择。');
  return item;
}

// Collect only ordinary metadata; passwords are read separately after candidate validation.
export function collectLedgerCopy(
  snapshot: Snapshot,
  selection: LedgerCopySelection,
): LedgerCopyPreview & { text: string } {
  validate(snapshot, selection);
  const system = requireRecord(snapshot.systems, selection.systemId);
  const sections: string[] = [],
    titles: string[] = [];
  const owners = new Map<string, string>(),
    seen = new Set<string>(),
    seenNodes = new Set<string>();
  const environmentName = (id: string) => {
    const e = requireRecord(snapshot.environments, id);
    if (e.systemId !== system.id) throw new Error('关联环境不属于当前系统。');
    return e.name;
  };
  const own = <T extends { systemId: string | null }>(item: T): T => {
    if (item.systemId !== system.id) throw new Error('资料不属于当前系统。');
    return item;
  };
  function scope(kind: ScopeKind, id: string, environmentId?: string | null): [string, string][] {
    const range = scopeFor(snapshot.scopes, kind, id, environmentId);
    if (!inEnvironment(range, selection.environment))
      throw new Error('资料已不在所选环境范围内，请重新选择。');
    return [
      ['所属系统', system.name],
      [
        '适用环境',
        range.environmentIds.length
          ? range.environmentIds.map(environmentName).join('、')
          : '系统通用',
      ],
      ['标签', range.tags.join('、')],
    ];
  }
  function server(node: DeploymentNode) {
    if (!node.serverId) return undefined;
    const r = own(requireRecord(snapshot.resources, node.serverId));
    if (r.kind !== 'server') throw new Error('部署节点的服务器关联无效。');
    return r;
  }
  function nodes(serviceId: string, environment: string) {
    own(requireRecord(snapshot.services, serviceId));
    return snapshot.deploymentNodes
      .filter(
        (n) =>
          n.serviceId === serviceId && (environment === 'all' || n.environmentId === environment),
      )
      .sort((a, b) =>
        environmentName(a.environmentId).localeCompare(environmentName(b.environmentId), 'zh-CN'),
      );
  }
  function nodeAccounts(node: DeploymentNode) {
    const r = server(node);
    if (r) owners.set(`resource:${r.id}`, r.name);
  }
  function nodeText(node: DeploymentNode) {
    const service = own(requireRecord(snapshot.services, node.serviceId)),
      r = server(node);
    nodeAccounts(node);
    if (seenNodes.has(node.id)) return '';
    seenNodes.add(node.id);
    return lines([
      ['部署节点', node.name],
      ['所属系统', system.name],
      ['服务', service.name],
      ['部署环境', environmentName(node.environmentId)],
      ['部署方式', node.mode === 'scheduled' ? '按需调度' : '固定部署'],
      ['节点规模', node.count],
      ['服务器', r?.name],
      ['地址', node.address || r?.address],
      ['地址来源', !node.address && r?.address ? `服务器 ${r.name}` : ''],
      ['端口', node.port],
      ['说明', node.notes],
    ]);
  }
  for (const ref of selection.objects) {
    const key = `${ref.kind}:${ref.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let text = '',
      name = '';
    if (ref.kind === 'resource') {
      const r = own(requireRecord(snapshot.resources, ref.id));
      name = r.name;
      text = lines([
        [r.kind === 'server' ? '服务器' : '数据库／中间件', r.name],
        ...scope('resource', r.id, r.environmentId),
        [r.kind === 'server' ? 'IP' : '地址', r.address],
        ['端口', r.port],
        ...Object.entries(r.fields),
        ['说明', r.notes],
      ]);
      owners.set(key, r.name);
    } else if (ref.kind === 'access') {
      const a = own(requireRecord(snapshot.accessEntries, ref.id));
      name = a.name;
      text = lines([
        ['访问入口', a.name],
        ...scope('access', a.id, a.environmentId),
        ...a.addresses.map(
          (address) =>
            [
              `${address.label}${address.id === a.preferredAddressId ? '（常用）' : ''}`,
              address.url,
            ] as [string, string],
        ),
        ['说明', a.notes],
      ]);
      owners.set(key, a.name);
    } else if (ref.kind === 'service') {
      const s = own(requireRecord(snapshot.services, ref.id)),
        state = scopeFor(snapshot.scopes, 'service', s.id);
      name = s.name;
      const nodeList = nodes(s.id, selection.environment);
      text = [
        lines([
          ['服务', s.name],
          ...scope('service', s.id),
          ['代码仓库', s.repository],
          ['状态', states[state.status ?? 'active']],
          ['状态说明', state.statusNotes],
          ['说明', s.notes],
        ]),
        ...nodeList.map(nodeText),
      ]
        .filter(Boolean)
        .join('\n\n');
    } else if (ref.kind === 'node') {
      const n = requireRecord(snapshot.deploymentNodes, ref.id);
      name = n.name;
      if (selection.environment !== 'all' && selection.environment !== n.environmentId)
        throw new Error('节点已不在所选环境范围内。');
      text = nodeText(n);
    } else {
      const o = own(requireRecord(snapshot.operations, ref.id));
      name = o.name;
      let related = '';
      if (o.resourceId) {
        const r = own(requireRecord(snapshot.resources, o.resourceId));
        related = r.name;
        owners.set(`resource:${r.id}`, r.name);
      }
      if (o.serviceId) {
        const s = own(requireRecord(snapshot.services, o.serviceId));
        related = s.name;
        nodes(s.id, o.environmentId ?? selection.environment).forEach(nodeAccounts);
      }
      let document = '';
      if (o.documentId) {
        const d = own(requireRecord(snapshot.documents, o.documentId));
        if (d.deletedAt !== null) throw new Error('步骤文档已被删除。');
        document = d.title;
      }
      text = lines([
        ['运行维护', o.name],
        ...scope('operation', o.id, o.environmentId),
        ['类型', o.kind === 'backup' ? '备份策略' : '运行作业'],
        ['频率', o.frequency],
        ['状态', states[o.status]],
        ['关联对象', related],
        ['步骤文档', document],
        ['说明', o.notes],
      ]);
    }
    if (text) {
      sections.push(text);
      titles.push(name);
    }
  }
  const accounts: LedgerCopyCandidate[] = [];
  for (const [ownerId, ownerName] of owners) {
    for (const a of snapshot.accounts.filter(
      (a) =>
        a.systemId === system.id &&
        (a.resourceId ? `resource:${a.resourceId}` : a.accessId ? `access:${a.accessId}` : '') ===
          ownerId,
    )) {
      accounts.push({
        id: a.id,
        name: a.name,
        username: a.username,
        ownerId,
        ownerName,
        hasPassword: a.secretKinds.includes('password'),
      });
    }
  }
  return {
    text: sections.join('\n\n──────────\n\n'),
    titles,
    environment:
      selection.environment === 'all'
        ? '全部环境'
        : selection.environment === 'common'
          ? '仅系统通用'
          : environmentName(selection.environment),
    accounts,
  };
}
export function prepareLedgerCopy(
  snapshot: Snapshot,
  request: LedgerCopyRequest,
  readPassword: (id: string) => string,
): { value: string; sensitive: boolean } {
  const collected = collectLedgerCopy(snapshot, request);
  if (
    !Array.isArray(request.accountIds) ||
    request.accountIds.length > 1000 ||
    typeof request.includePasswords !== 'boolean'
  )
    throw new Error('账号复制选项无效。');
  const selected = new Set<string>();
  for (const accountId of request.accountIds) {
    id(accountId);
    if (!collected.accounts.some((a) => a.id === accountId))
      throw new Error('所选账号不属于本次资料范围，请重新选择。');
    selected.add(accountId);
  }
  let sensitive = false;
  const groups = new Map<string, string[]>();
  for (const a of collected.accounts.filter((a) => selected.has(a.id))) {
    const password = request.includePasswords
      ? a.hasPassword
        ? readPassword(a.id)
        : '未保存密码'
      : undefined;
    if (request.includePasswords && a.hasPassword) sensitive = true;
    const group = groups.get(a.ownerId) ?? [`所属对象：${a.ownerName}`];
    group.push(
      lines([
        ['账号用途', a.name],
        ['用户名', a.username || '未填写'],
      ]) + (request.includePasswords ? `\n密码：${password}` : ''),
    );
    groups.set(a.ownerId, group);
  }
  const appendix = groups.size
    ? '\n\n附带账号\n\n' + [...groups.values()].map((group) => group.join('\n\n')).join('\n\n')
    : '';
  return { value: collected.text + appendix, sensitive };
}
