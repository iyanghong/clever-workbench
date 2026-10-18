import type { DatabaseSync } from 'node:sqlite';
import type { Ledger } from './ledger';
import type { ObjectContext } from '../src/ledger-types';
import type { SearchHit } from '../src/search-types';

type Entry = { hit: SearchHit; text: string };
const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
const kindWords = { redis: 'Redis 缓存', server: 'server 服务器 SSH', other: '其他资源' };
export function searchWorkspace(db: DatabaseSync, ledger: Ledger, query: unknown): SearchHit[] {
  if (typeof query !== 'string' || query.length > 1000) throw new Error('搜索内容无效或过长。');
  const terms = [...new Set(normalize(query).trim().split(/\s+/).filter(Boolean))];
  if (!terms.length) return [];
  if (terms.length > 30) throw new Error('搜索关键词过多。');
  const data = ledger.snapshot(),
    entries: Entry[] = [];
  const systems = new Map(data.systems.map((item) => [item.id, item])),
    environments = new Map(data.environments.map((item) => [item.id, item])),
    resources = new Map(data.resources.map((item) => [item.id, item]));
  const projects = new Map(
    db
      .prepare('SELECT id,name,archivedAt FROM projects')
      .all()
      .map((row) => [
        String(row.id),
        { name: String(row.name), archived: row.archivedAt !== null },
      ]),
  );
  function context(value: Partial<ObjectContext>, projectId?: string | null) {
    return [
      value.systemId ? systems.get(value.systemId)?.name : null,
      value.environmentId ? environments.get(value.environmentId)?.name : null,
      value.resourceId ? resources.get(value.resourceId)?.name : null,
      projectId
        ? `${projects.get(projectId)?.name ?? ''}${projects.get(projectId)?.archived ? ' · 已归档' : ''}`
        : null,
    ]
      .filter(Boolean)
      .join(' / ');
  }
  function add(hit: SearchHit, extra = '') {
    entries.push({ hit, text: normalize(`${hit.title} ${hit.context} ${hit.summary} ${extra}`) });
  }
  for (const item of data.systems) {
    const history = data.systemProjects
      .filter((link) => link.systemId === item.id)
      .map((link) => projects.get(link.projectId)?.name)
      .join(' ');
    add(
      {
        kind: 'system',
        id: item.id,
        title: item.name,
        context: context({}, item.currentProjectId) || '长期系统',
        summary: item.notes.slice(0, 120),
      },
      `${item.notes} ${item.url} ${history}`,
    );
  }
  for (const item of data.environments)
    add(
      {
        kind: 'environment',
        id: item.id,
        title: item.name,
        context: context({ systemId: item.systemId }),
        summary: item.notes.slice(0, 120),
      },
      item.notes,
    );
  for (const item of data.services)
    add(
      {
        kind: 'service',
        id: item.id,
        title: item.name,
        context: context({ systemId: item.systemId }),
        summary: item.repository,
      },
      item.notes,
    );
  for (const item of data.resources) {
    const environment = environments.get(item.environmentId)!;
    add(
      {
        kind: 'resource',
        id: item.id,
        title: item.name,
        context: context({ systemId: environment.systemId, environmentId: item.environmentId }),
        summary: [kindWords[item.kind], item.address, item.port].filter(Boolean).join(' · '),
      },
      `${item.notes} ${Object.values(item.fields).join(' ')}`,
    );
  }
  for (const item of data.accounts) {
    const environment = environments.get(item.environmentId)!,
      resource = item.resourceId ? resources.get(item.resourceId) : null;
    add(
      {
        kind: 'account',
        id: item.id,
        title: item.name,
        context: context({
          systemId: environment.systemId,
          environmentId: item.environmentId,
          resourceId: item.resourceId,
        }),
        summary: item.username || '无用户名',
        username: item.username,
        secretKinds: item.secretKinds,
      },
      `${resource ? kindWords[resource.kind] : ''} ${item.notes}`,
    );
  }
  for (const kind of ['task', 'document'] as const) {
    const table = kind === 'task' ? 'tasks' : 'documents';
    // Only ordinary body text and explicit metadata enter search; vault tables and preferences are never indexed.
    const rows = db
      .prepare(
        `SELECT id,title,markdown,projectId,systemId,environmentId,resourceId FROM ${table} WHERE deletedAt IS NULL`,
      )
      .all();
    for (const row of rows) {
      const body = String(row.markdown),
        plain = body.replace(/!\[[^\]]*\]\([^)]+\)/g, '[图片]').replace(/\s+/g, ' ');
      add(
        {
          kind,
          id: String(row.id),
          title: String(row.title) || '未命名文档',
          context:
            context(row as Partial<ObjectContext>, row.projectId as string | null) || '未分类',
          summary: plain.slice(0, 120),
        },
        body,
      );
    }
  }
  return entries
    .filter((entry) => terms.every((term) => entry.text.includes(term)))
    .map((entry) => ({
      hit: entry.hit,
      score:
        terms.reduce(
          (score, term) => score + (normalize(entry.hit.title).includes(term) ? 3 : 0),
          0,
        ) + (entry.hit.kind === 'account' ? 1 : 0),
    }))
    .sort((a, b) => b.score - a.score || a.hit.title.localeCompare(b.hit.title, 'zh-CN'))
    .slice(0, 100)
    .map((entry) => entry.hit);
}
