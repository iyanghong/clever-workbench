import { importTargets } from '../src/ledger-import-matches';
import { targetRevision } from './ledger-import-advice';
import { updateFromCandidate } from './ledger-import-update';
import { randomUUID } from 'node:crypto';
import type { Store } from './store';
import { WorkspaceLedger } from './ledger-workspace';
import { ledgerFields } from './ledger-details';
import {
  ledgerImportKinds,
  type ImportCandidate,
  type ImportReference,
  type LedgerImportKind,
} from '../src/ledger-import-types';
import { importCandidateProblems } from '../src/ledger-import-review';
import { ledgerColumnAliases } from '../src/ledger-columns';

export type PreparedLedgerImport = {
  id: string;
  systemId: string;
  kind: LedgerImportKind | 'all';
  candidates: ImportCandidate[];
  passwords: Record<string, string>;
  sensitiveValues: string[];
  targetRevisions?: ReadonlyMap<string, string>;
};

export function validateLedgerImport(input: PreparedLedgerImport) {
  const string = (value: unknown, max = 100_000) => {
    if (typeof value !== 'string' || value.length > max)
      throw new Error('导入字段格式无效或过长。');
  };
  if (
    !input ||
    typeof input !== 'object' ||
    !/^[a-f0-9-]{36}$/i.test(input.id) ||
    typeof input.systemId !== 'string' ||
    (input.kind !== 'all' && !Object.hasOwn(ledgerImportKinds, input.kind)) ||
    !Array.isArray(input.candidates) ||
    !input.candidates.length ||
    input.candidates.length > 1000
  )
    throw new Error('导入批次格式无效，最多支持 1000 条候选。');
  const ids = new Set<string>();
  const identity = (value: unknown) => {
    string(value, 100);
    if (!value || ids.has(value as string)) throw new Error('导入候选标识为空或重复。');
    ids.add(value as string);
  };
  const reference = (value: ImportReference | null) => {
    if (value === null) return;
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length !== 1
    )
      throw new Error('对象关联格式无效。');
    if ('candidate' in value) string(value.candidate, 100);
    else if ('existing' in value) string(value.existing, 100);
    else throw new Error('对象关联格式无效。');
  };
  let count = 0;
  for (const candidate of input.candidates) {
    if (
      !candidate ||
      typeof candidate !== 'object' ||
      !Object.hasOwn(ledgerImportKinds, candidate.kind) ||
      typeof candidate.selected !== 'boolean' ||
      typeof candidate.reviewed !== 'boolean' ||
      typeof candidate.confirmDuplicate !== 'boolean'
    )
      throw new Error('候选格式无效。');
    identity(candidate.id);
    if (
      candidate.observed !== undefined &&
      (!Array.isArray(candidate.observed) ||
        candidate.observed.length > 2 ||
        candidate.observed.some((key) => !['status', 'mode'].includes(key)))
    )
      throw Error('来源字段标记无效。');
    if (candidate.update !== undefined) {
      const u = candidate.update;
      if (
        !u ||
        typeof u.targetId !== 'string' ||
        (u.environmentOverride !== undefined && typeof u.environmentOverride !== 'boolean') ||
        u.targetId.length > 100 ||
        !Array.isArray(u.fields) ||
        u.fields.length > 1000 ||
        u.fields.some((k) => typeof k !== 'string' || k.length > 300) ||
        new Set(u.fields).size !== u.fields.length
      )
        throw Error('更新目标或替换字段无效。');
    }
    for (const field of [
      'name',
      'address',
      'port',
      'notes',
      'repository',
      'username',
      'frequency',
      'count',
    ] as const)
      string(candidate[field]);
    if (
      candidate.environmentIds !== null &&
      (!Array.isArray(candidate.environmentIds) ||
        candidate.environmentIds.length > 100 ||
        candidate.environmentIds.some((id) => typeof id !== 'string' || id.length > 100))
    )
      throw new Error('环境映射格式无效。');
    if (
      !Array.isArray(candidate.tags) ||
      candidate.tags.length > 30 ||
      candidate.tags.some((tag) => typeof tag !== 'string' || tag.length > 80)
    )
      throw new Error('标签格式无效。');
    ledgerFields(candidate.fields);
    for (const key of ['accounts', 'connections', 'addresses'] as const)
      if (!Array.isArray(candidate[key]) || candidate[key].length > 100)
        throw new Error('账号、地址或连接过多。');
    if (
      !['active', 'inactive', 'unverified'].includes(candidate.status) ||
      !['fixed', 'scheduled'].includes(candidate.mode)
    )
      throw new Error('运维状态或部署方式无效。');
    reference(candidate.service);
    reference(candidate.server);
    reference(candidate.owner);
    if (candidate.passwordRef !== null) string(candidate.passwordRef, 100);
    for (const account of candidate.accounts) {
      if (!account || typeof account !== 'object') throw new Error('账号格式无效。');
      identity(account.id);
      string(account.name, 1000);
      string(account.username, 10_000);
      string(account.notes);
      if (account.passwordRef !== null) string(account.passwordRef, 100);
    }
    for (const connection of candidate.connections) {
      if (!connection || typeof connection !== 'object') throw new Error('连接格式无效。');
      identity(connection.id);
      for (const field of ['label', 'address', 'port', 'role'] as const)
        string(connection[field], 10_000);
      reference(connection.server);
    }
    for (const address of candidate.addresses) {
      if (!address || typeof address !== 'object') throw new Error('地址格式无效。');
      identity(address.id);
      string(address.label, 100);
      string(address.url, 10_000);
    }
    if (candidate.selected)
      count +=
        1 + candidate.accounts.length + candidate.connections.length + candidate.addresses.length;
  }
  if (!count || count > 1000)
    throw new Error('本次所选对象及附属资料合计应在 1 到 1000 项内，请缩小范围。');
  if (
    !input.passwords ||
    typeof input.passwords !== 'object' ||
    Array.isArray(input.passwords) ||
    !Array.isArray(input.sensitiveValues)
  )
    throw new Error('密码暂存格式无效。');
  for (const [id, password] of Object.entries(input.passwords)) {
    if (!ids.has(id)) throw new Error('密码缺少对应账号。');
    string(password, 256_000);
  }
  const secrets = [...input.sensitiveValues, ...Object.values(input.passwords)];
  if (
    secrets.length > 5000 ||
    secrets.some((value) => typeof value !== 'string' || value.length > 256_000)
  )
    throw new Error('敏感内容暂存过多。');
  const ordinary = (value: unknown): void => {
    if (typeof value === 'string') {
      if (
        secrets.some(
          (secret) => secret && (secret.length >= 4 || value === secret) && value.includes(secret),
        )
      )
        throw new Error('普通字段含有来源中的秘密，请移除并使用账号密码字段。');
    } else if (Array.isArray(value)) value.forEach(ordinary);
    else if (value && typeof value === 'object') Object.values(value).forEach(ordinary);
  };
  const structuredFields = new Set(
    Object.values(ledgerColumnAliases)
      .filter((value) => value.startsWith('field:') && value !== 'field:用途')
      .map((value) => value.slice(6)),
  );
  for (const candidate of input.candidates.filter((item) => item.selected)) {
    ordinary(candidate.notes);
    candidate.accounts.forEach((account) => ordinary(account.notes));
    for (const [key, value] of Object.entries(candidate.fields))
      if (!structuredFields.has(key)) ordinary(value);
    for (const value of [
      candidate.address,
      candidate.repository,
      ...candidate.connections.map((connection) => connection.address),
      ...candidate.addresses.map((address) => address.url),
    ]) {
      if (
        /[a-z][a-z0-9+.-]*:\/\/[^\s/:]+:[^\s@]+@|[?&](?:password|passwd|pwd|token|access_token|refresh_token|api_key|secret)=/i.test(
          value,
        )
      )
        throw new Error('地址中不能内嵌密码或密钥，请改用专门的账号密码字段。');
    }
  }
}

// Called inside Vault's single transaction, after credentials and all input shapes are checked.
export function saveLedgerImport(
  store: Store,
  input: PreparedLedgerImport,
  writePassword: (id: string, password: string) => void,
) {
  const selected = input.candidates.filter((candidate) => candidate.selected);
  const snapshot = store.snapshot();
  store.ledger.system(input.systemId);
  const problems = importCandidateProblems(snapshot, input.systemId, input.kind, input.candidates);
  const invalid = selected.find((candidate) => problems[candidate.id]?.length);
  if (invalid) throw new Error(`请完成候选校对：${problems[invalid.id].join('；')}。`);
  const targets = new Map(importTargets(snapshot, input.systemId).map((t) => [t.id, t]));
  const updating = new Set<string>();
  for (const c of selected)
    if (c.update) {
      const t = targets.get(c.update.targetId);
      if (!t || t.kind !== c.kind || input.targetRevisions?.get(t.id) !== targetRevision(t))
        throw Error('更新目标已修改、移除或不属于本次预览，请重新分析。');
      if (updating.has(t.id)) throw Error('所选候选重复更新同一对象，请保留一项。');
      updating.add(t.id);
    }
  const workspace = new WorkspaceLedger(store.db);
  const created = new Map<string, string>(),
    visiting = new Set<string>();
  const now = Date.now();
  const resolve = (reference: ImportReference | null, allowed: LedgerImportKind[]) => {
    if (!reference) return null;
    if ('candidate' in reference) {
      const target = selected.find((candidate) => candidate.id === reference.candidate);
      if (!target || !allowed.includes(target.kind))
        throw new Error('关联候选未选择或类型不正确。');
      return create(target);
    }
    const target =
      snapshot.resources.find((item) => item.id === reference.existing) ??
      snapshot.accessEntries.find((item) => item.id === reference.existing) ??
      snapshot.services.find((item) => item.id === reference.existing);
    const kind =
      snapshot.resources.find((item) => item.id === reference.existing)?.kind ??
      (snapshot.accessEntries.some((item) => item.id === reference.existing)
        ? 'access'
        : 'service');
    if (!target || target.systemId !== input.systemId || !allowed.includes(kind))
      throw new Error('关联对象必须属于本系统且类型正确。');
    return target.id;
  };
  const account = (
    owner: { resourceId?: string | null; accessId?: string | null; environmentId: string | null },
    value: { id: string; name: string; username: string; notes: string },
    confirmDuplicate: boolean,
  ) => {
    if (
      !confirmDuplicate &&
      value.username &&
      store.ledger
        .snapshot()
        .accounts.some(
          (item) =>
            item.systemId === input.systemId &&
            item.environmentId === owner.environmentId &&
            item.resourceId === (owner.resourceId ?? null) &&
            item.accessId === (owner.accessId ?? null) &&
            item.username === value.username,
        )
    )
      throw new Error('疑似重复账号，请核对后确认新增独立记录。');
    const id = store.ledger.saveAccount(
      {
        type: 'account.save',
        ...owner,
        name: value.name,
        username: value.username,
        notes: value.notes,
      },
      now,
    );
    const password = input.passwords[value.id];
    if (password) writePassword(id, password);
    return id;
  };
  const create = (candidate: ImportCandidate): string => {
    const completed = created.get(candidate.id);
    if (completed) return completed;
    if (candidate.update) {
      const id = updateFromCandidate(
        store,
        snapshot,
        input.systemId,
        candidate,
        targets.get(candidate.update.targetId)!,
      );
      created.set(candidate.id, id);
      return id;
    }
    if (visiting.has(candidate.id)) throw new Error('候选存在循环关联，请修正。');
    visiting.add(candidate.id);
    const environmentIds = candidate.environmentIds!;
    const environmentId = environmentIds[0] ?? null;
    let id: string;
    if (['server', 'database', 'redis', 'other'].includes(candidate.kind)) {
      const connections = candidate.connections.map((connection) => ({
        id: randomUUID(),
        label: connection.label,
        address: connection.address,
        port: connection.port,
        role: connection.role,
        serverId: resolve(connection.server, ['server']),
      }));
      id = store.ledger.saveResource(
        {
          type: 'resource.save',
          systemId: input.systemId,
          environmentId,
          kind: candidate.kind as 'server' | 'database' | 'redis' | 'other',
          name: candidate.name,
          address: candidate.address,
          port: candidate.port,
          notes: candidate.notes,
          fields: candidate.fields,
          connections: candidate.kind !== 'server' && !connections.length ? undefined : connections,
          preferredConnectionId: connections[0]?.id ?? null,
        },
        now,
      );
      workspace.saveScope('resource', id, { environmentIds, tags: candidate.tags });
    } else if (candidate.kind === 'access') {
      id = store.ledger.accessEntries.save(
        {
          type: 'access.save',
          systemId: input.systemId,
          environmentId,
          name: candidate.name,
          notes: candidate.notes,
          addresses: candidate.addresses.map(({ label, url }) => ({ label, url })),
        },
        now,
      );
      workspace.saveScope('access', id, { environmentIds, tags: candidate.tags });
    } else if (candidate.kind === 'service') {
      id = store.ledger.saveService(
        {
          type: 'service.save',
          systemId: input.systemId,
          name: candidate.name,
          notes: candidate.notes,
          repository: candidate.repository,
        },
        now,
      );
      workspace.saveScope('service', id, { environmentIds, tags: candidate.tags });
    } else if (candidate.kind === 'node') {
      const serviceId = resolve(candidate.service, ['service']);
      if (!serviceId || !environmentId) throw new Error('部署节点需要服务和环境。');
      id = workspace.saveNode({
        serviceId,
        environmentId,
        name: candidate.name,
        serverId: resolve(candidate.server, ['server']),
        address: candidate.address,
        port: candidate.port,
        notes: candidate.notes,
        mode: candidate.mode,
        count: candidate.count,
        fields: candidate.fields,
      });
    } else if (candidate.kind === 'account') {
      const ownerId = resolve(candidate.owner, ['server', 'database', 'redis', 'other', 'access']);
      const access = ownerId
        ? store.ledger.accessEntries.list().find((item) => item.id === ownerId)
        : null;
      const resource = ownerId && !access ? store.ledger.resource(ownerId) : null;
      id = account(
        {
          environmentId: ownerId
            ? access
              ? access.environmentId
              : resource!.environmentId
            : environmentId,
          resourceId: resource?.id ?? null,
          accessId: access?.id ?? null,
        },
        candidate,
        candidate.confirmDuplicate,
      );
    } else if (candidate.kind === 'job' || candidate.kind === 'backup') {
      id = workspace.saveOperation({
        systemId: input.systemId,
        environmentId,
        serviceId: resolve(candidate.service, ['service']),
        resourceId: resolve(candidate.owner, ['server', 'database', 'redis', 'other']),
        documentId: null,
        name: candidate.name,
        kind: candidate.kind,
        frequency: candidate.frequency,
        status: candidate.status,
        notes: candidate.notes,
        fields: candidate.fields,
      });
      workspace.saveScope('operation', id, { environmentIds, tags: candidate.tags });
    } else throw new Error('不支持的导入类型。');
    created.set(candidate.id, id);
    if (candidate.accounts.length)
      for (const value of candidate.accounts)
        account(
          {
            environmentId,
            resourceId: candidate.kind === 'access' ? null : id,
            accessId: candidate.kind === 'access' ? id : null,
          },
          value,
          candidate.confirmDuplicate,
        );
    visiting.delete(candidate.id);
    return id;
  };
  for (const candidate of selected) create(candidate);
  const first = created.get(selected[0].id)!;
  store.db
    .prepare('INSERT INTO ledger_batches VALUES(?,?,?)')
    .run(`import:${input.id}`, first, now);
  return first;
}
