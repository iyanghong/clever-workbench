import type { Snapshot } from './types';
import type { ResourceConnection, ResourceKind, ResourceRecord } from './ledger-types';

export const resourceProducts = [
  'MySQL',
  'PostgreSQL',
  'Oracle',
  'SQL Server',
  '达梦',
  'Redis',
  'RabbitMQ',
  'Kafka',
  'Nginx',
  'Elasticsearch',
];
export function resourceTemplate(kind: ResourceKind, product = '') {
  if (kind === 'server') return ['登录协议', '位置', '资产编号'];
  const paths = ['目录', '配置', '日志'];
  if (kind === 'database')
    return ['类型', '版本', '实例', '服务名', '库名', '字符集', '主备', ...paths];
  if (kind === 'redis' || /redis/i.test(product))
    return ['类型', '版本', 'DB 编号', '集群说明', '持久化说明', ...paths];
  return [
    '类型',
    '版本',
    '实例',
    ...(/rabbitmq/i.test(product)
      ? ['虚拟主机']
      : /kafka|kubernetes/i.test(product)
        ? ['命名空间']
        : []),
    '集群说明',
    ...paths,
  ];
}
export const nodeFields = [
  '部署方式',
  '版本',
  '程序／镜像',
  '部署目录',
  '配置位置',
  '日志位置',
  '启动命令',
  '停止命令',
  '健康检查地址',
  '命名空间',
  '工作负载',
];
export const operationFields = {
  job: ['脚本／命令', '执行用户', '日志位置'],
  backup: ['备份方式', '目标位置', '保留周期', '恢复说明', '最近恢复验证时间', '恢复验证结果'],
};
export function connectionAddress(connection: ResourceConnection, resources: ResourceRecord[]) {
  return connection.address || resources.find((r) => r.id === connection.serverId)?.address || '';
}
export function resourceConnectionText(resource: ResourceRecord, resources: ResourceRecord[]) {
  return (resource.connections ?? [])
    .map((c) =>
      [c.label, connectionAddress(c, resources), c.port, c.role].filter(Boolean).join(' '),
    )
    .join('\n');
}

export function systemDocuments(snapshot: Snapshot, systemId: string) {
  const services = snapshot.services.filter((s) => s.systemId === systemId);
  const serviceIds = new Set(services.map((s) => s.id));
  const references = new Set([
    ...services.flatMap((s) => s.documentIds ?? []),
    ...snapshot.deploymentNodes
      .filter((n) => serviceIds.has(n.serviceId))
      .flatMap((n) => n.documentIds ?? []),
  ]);
  return snapshot.documents.filter(
    (d) =>
      d.deletedAt === null &&
      (d.systemId === systemId || (d.systemId === null && references.has(d.id))),
  );
}

export const secretFieldName = /密码|口令|password|token|私钥|private.?key/i;
