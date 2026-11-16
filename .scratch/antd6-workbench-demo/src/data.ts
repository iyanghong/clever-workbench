export type Category =
  'access' | 'accounts' | 'servers' | 'resources' | 'services' | 'operations' | 'documents';
export type RecordItem = {
  id: string;
  category: Category;
  system: string;
  env: string[];
  name: string;
  address: string;
  product: string;
  username: string;
  notes: string;
  tags: string[];
  status: '在用' | '停用' | '待确认';
  updated: string;
};
export type Task = {
  id: string;
  title: string;
  system: string;
  tags: string[];
  due: string;
  started: string;
  completed: string;
  done: boolean;
  deleted: boolean;
  content: string;
};
export type DocumentItem = {
  id: string;
  title: string;
  system: string;
  category: string;
  updated: string;
  markdown: string;
  deleted: boolean;
};
export type Project = {
  id: string;
  name: string;
  period: string;
  systems: string[];
  archived: boolean;
  notes: string;
};
export type DemoData = {
  records: RecordItem[];
  tasks: Task[];
  documents: DocumentItem[];
  projects: Project[];
  favorites: string[];
};
export const today = '2026-11-16';
export const systems = [
  {
    id: 'orders',
    name: '订单中心',
    short: '订',
    color: '#1677ff',
    project: '交易平台升级',
    notes: '订单、支付与履约的核心业务系统。',
  },
  {
    id: 'finance',
    name: '财务共享平台',
    short: '财',
    color: '#13a8a8',
    project: '财务数字化二期',
    notes: '报销、核算与资金管理的一体化工作平台。',
  },
  {
    id: 'operations',
    name: '运维管理平台',
    short: '运',
    color: '#722ed1',
    project: '基础设施治理',
    notes: '统一的监控、发布与基础设施管理。',
  },
];
export const systemOptions = systems.map((s) => ({ value: s.id, label: s.name }));
export const systemName = (id: string) => systems.find((s) => s.id === id)?.name ?? '通用资料';
export const categories: { key: Category; label: string; singular: string; hint: string }[] = [
  {
    key: 'access',
    label: '访问入口',
    singular: '访问入口',
    hint: '管理系统地址、控制台和常用链接。',
  },
  {
    key: 'accounts',
    label: '账号',
    singular: '账号',
    hint: '按用途管理账号，凭据与普通资料分开保护。',
  },
  {
    key: 'servers',
    label: '服务器',
    singular: '服务器',
    hint: '查看部署节点、网络地址和关联账号。',
  },
  {
    key: 'resources',
    label: '数据库 / 中间件',
    singular: '资源',
    hint: '连接信息、产品版本与日常维护资料。',
  },
  { key: 'services', label: '应用部署', singular: '应用', hint: '代码仓库、部署节点与版本信息。' },
  {
    key: 'operations',
    label: '运行维护',
    singular: '运维资料',
    hint: '作业、备份策略和恢复验证记录。',
  },
  { key: 'documents', label: '关联文档', singular: '关联文档', hint: '复用系统文档与排障方案。' },
];
const rows: [Category, string, string, string, string, string, string][] = [
  [
    'access',
    '订单管理后台',
    'https://admin.orders.example.com',
    '业务后台',
    'admin_readonly',
    '日常订单查询与异常处理入口',
    '生产',
  ],
  [
    'access',
    'Grafana 监控面板',
    'https://grafana.example.com/d/orders',
    'Grafana',
    'ops_viewer',
    'API 延迟、错误率与数据库连接池监控',
    '通用',
  ],
  [
    'access',
    '测试环境控制台',
    'https://staging.orders.example.com',
    '业务后台',
    'tester',
    '联调、回归与版本验收',
    '测试',
  ],
  [
    'access',
    'Jenkins 持续集成',
    'https://ci.example.com/job/orders',
    'Jenkins',
    'deploy_bot',
    '构建、灰度发布与回滚',
    '通用',
  ],
  [
    'accounts',
    '应用部署账号',
    'order-app-01 · SSH',
    'SSH 账号',
    'deploy',
    '发布订单服务，仅开放应用目录权限',
    '生产',
  ],
  [
    'accounts',
    '数据库只读账号',
    'orders-primary · MySQL',
    '数据库账号',
    'order_readonly',
    '问题定位与业务数据核查',
    '生产',
  ],
  [
    'accounts',
    '监控服务账号',
    'Grafana 监控面板',
    '服务账号',
    'ops_viewer',
    '只读访问监控指标和告警历史',
    '通用',
  ],
  [
    'accounts',
    '测试环境管理员',
    '测试环境控制台',
    '应用账号',
    'test_admin',
    '测试和验收专用账号',
    '测试',
  ],
  [
    'servers',
    'order-app-01',
    '10.24.16.21',
    'Ubuntu 24.04 LTS',
    'deploy',
    '主应用节点 · 8 核 / 16 GB / 200 GB',
    '生产',
  ],
  [
    'servers',
    'order-app-02',
    '10.24.16.22',
    'Ubuntu 24.04 LTS',
    'deploy',
    '应用节点 · 8 核 / 16 GB / 200 GB',
    '生产',
  ],
  [
    'servers',
    'order-db-01',
    '10.24.16.31',
    'Rocky Linux 9',
    'dba',
    '数据库主节点 · 16 核 / 64 GB / 1 TB',
    '生产',
  ],
  [
    'servers',
    'order-staging-01',
    '10.24.32.11',
    'Ubuntu 24.04 LTS',
    'tester',
    '联调节点 · 4 核 / 8 GB / 100 GB',
    '测试',
  ],
  [
    'servers',
    'order-worker-01',
    '10.24.16.41',
    'Ubuntu 24.04 LTS',
    'deploy',
    '异步任务节点 · 8 核 / 16 GB / 200 GB',
    '生产',
  ],
  [
    'resources',
    '订单业务库',
    'mysql.orders.internal:3306',
    'MySQL 8.4',
    'order_readonly',
    '主从高可用 · 库名 orders_prod',
    '生产',
  ],
  [
    'resources',
    '订单缓存集群',
    'redis.orders.internal:6379',
    'Redis 7.4',
    'default',
    '三主三从 · 订单会话与热点数据',
    '生产',
  ],
  [
    'resources',
    '交易消息集群',
    'mq.orders.internal:9092',
    'Kafka 3.9',
    'order_consumer',
    '订单事件、支付结果与异步通知',
    '生产',
  ],
  [
    'resources',
    '订单测试库',
    'mysql.staging.internal:3306',
    'MySQL 8.4',
    'tester',
    '联调与自动化回归专用',
    '测试',
  ],
  [
    'services',
    'order-api',
    'https://git.example.com/trade/order-api',
    'Java 21 · Spring Boot',
    'deploy',
    '订单核心 API · 当前版本 v2.8.3',
    '生产',
  ],
  [
    'services',
    'payment-worker',
    'https://git.example.com/trade/payment-worker',
    'Java 21',
    'deploy',
    '支付结果处理 · 当前版本 v1.6.0',
    '生产',
  ],
  [
    'services',
    'order-web',
    'https://git.example.com/trade/order-web',
    'React · Nginx',
    'deploy',
    '管理后台 · 当前版本 v3.2.1',
    '生产',
  ],
  [
    'operations',
    '数据库每日全量备份',
    '0 2 * * *',
    '备份策略',
    'backup_bot',
    '每天 02:00 执行，保留 14 天；最近恢复验证 11 月 13 日',
    '生产',
  ],
  [
    'operations',
    '过期订单清理作业',
    '0 */2 * * *',
    '定时作业',
    'job_runner',
    '每两小时清理超过 30 分钟的未支付订单',
    '生产',
  ],
  [
    'operations',
    '应用日志归档',
    '30 3 * * *',
    '归档作业',
    'deploy',
    '压缩前一天日志，归档到本地存储',
    '生产',
  ],
  [
    'documents',
    '订单服务发布与回滚手册',
    '技术文档 / 发布运维',
    '操作手册',
    '',
    '发布检查清单、灰度验证和紧急回滚步骤',
    '通用',
  ],
  [
    'documents',
    '数据库连接池排障记录',
    '技术文档 / 故障复盘',
    '排障记录',
    '',
    '连接池耗尽的定位过程与参数调整依据',
    '生产',
  ],
];
export const initialData: DemoData = {
  records: rows.map((r, i) => ({
    id: `r${i}`,
    category: r[0],
    system: 'orders',
    name: r[1],
    address: r[2],
    product: r[3],
    username: r[4],
    notes: r[5],
    env: [r[6]],
    tags: i % 3 === 0 ? ['核心业务', '重点关注'] : ['核心业务'],
    status: '在用',
    updated: i % 2 === 0 ? '2026-11-16 09:12' : '2026-11-15 16:40',
  })),
  tasks: [
    ['检查订单库备份与恢复记录', 'orders', '2026-11-15 18:00', '2026-11-12', '', '排障,本周'],
    ['联调支付回调，核对异常订单状态', 'orders', '2026-11-16 17:00', '2026-11-13', '', '本周,联调'],
    ['整理财务共享平台上线检查清单', 'finance', '2026-11-18 18:00', '2026-11-10', '', '发布'],
    ['调整 Redis 连接池与告警阈值', 'orders', '2026-11-19 12:00', '2026-11-14', '', '优化'],
    ['补充生产节点的访问账号资料', 'operations', '2026-11-20 18:00', '2026-11-15', '', '资料整理'],
    ['记录本周技术例会结论', '', '', '2026-11-16', '', '本周'],
    ['完成订单 API 灰度发布', 'orders', '2026-11-13 18:00', '2026-11-09', '2026-11-13', '发布'],
    ['验证数据库主从切换流程', 'orders', '2026-11-12 18:00', '2026-11-06', '2026-11-12', '排障'],
    ['更新监控平台访问入口', 'operations', '', '2026-11-03', '2026-11-10', '资料整理'],
  ].map((r, i) => ({
    id: `t${i}`,
    title: r[0],
    system: r[1],
    due: r[2],
    started: r[3],
    completed: r[4],
    done: Boolean(r[4]),
    deleted: false,
    tags: r[5].split(','),
    content:
      '## 处理目标\n\n核对当前环境和相关资料，记录处理过程与验证结果。\n\n## 待办清单\n\n- [x] 确认生产环境与责任系统\n- [ ] 完成异常场景验证\n- [ ] 更新关联文档与回滚步骤\n\n## 处理记录\n\n已完成初步检查，等待本轮验证。',
  })),
  documents: [
    {
      id: 'd0',
      title: '订单服务发布与回滚手册',
      system: 'orders',
      category: '发布运维',
      updated: '2026-11-16 09:20',
      deleted: false,
      markdown:
        '# 订单服务发布与回滚手册\n\n发布前确认、灰度验证，以及异常情况下的恢复步骤。\n\n## 发布前检查\n\n- [x] 数据库备份已完成并验证\n- [x] 回滚版本和配置已留存\n- [ ] 灰度节点健康检查通过\n\n## 灰度发布\n\n先更新 order-app-02，观察错误率、响应时间和连接池使用率。确认稳定后，再逐步切换其余节点。\n\n```bash\ncurl -f https://orders.example.com/health\n```\n\n## 验证标准\n\n| 检查项 | 通过标准 |\n| --- | --- |\n| 服务健康 | 所有节点返回正常 |\n| 支付回调 | 测试订单状态一致 |\n| API 错误率 | 低于 0.1% |\n\n## 紧急回滚\n\n停止流量切换，将应用回退至上一稳定版本。保留日志与现场资料，确认订单状态一致后再恢复业务。',
    },
    {
      id: 'd1',
      title: '数据库连接池耗尽排障记录',
      system: 'orders',
      category: '故障复盘',
      updated: '2026-11-15 16:40',
      deleted: false,
      markdown:
        '# 数据库连接池耗尽排障记录\n\n## 问题现象\n\n晚高峰出现请求排队，部分订单提交超时。\n\n## 定位过程\n\n检查慢查询、活跃连接与线程堆栈，发现批量查询未设置合理的分页上限。\n\n## 处理方案\n\n限制单次查询数据量，调整连接超时，增加连接池等待时间告警。\n\n## 验证结果\n\n高峰模拟流量下连接数稳定，超时率恢复正常。',
    },
    {
      id: 'd2',
      title: '财务共享平台环境说明',
      system: 'finance',
      category: '系统资料',
      updated: '2026-11-14 10:15',
      deleted: false,
      markdown:
        '# 财务共享平台环境说明\n\n## 环境划分\n\n生产、预生产和测试环境分别维护访问入口与账号。\n\n## 访问方式\n\n先连接公司内网，再从台账打开对应环境入口。\n\n## 变更记录\n\n本月完成预生产环境配置更新。',
    },
    {
      id: 'd3',
      title: '常用 Linux 排查命令',
      system: '',
      category: '通用知识',
      updated: '2026-11-12 15:30',
      deleted: false,
      markdown:
        '# 常用 Linux 排查命令\n\n## 内存与进程\n\n```bash\nfree -h\nps aux --sort=-%mem | head\n```\n\n## 网络连接\n\n```bash\nss -lntp\n```\n\n## 磁盘使用\n\n```bash\ndf -h\ndu -sh /var/log/*\n```',
    },
    {
      id: 'd4',
      title: '技术方案评审记录模板',
      system: '',
      category: '通用知识',
      updated: '2026-11-10 11:00',
      deleted: false,
      markdown:
        '# 技术方案评审记录\n\n## 背景与目标\n\n记录需要解决的问题和预期结果。\n\n## 方案与取舍\n\n说明关键决策、替代方案和影响范围。\n\n## 验证与回滚\n\n写清验证条件与恢复办法。',
    },
  ],
  projects: [
    {
      id: 'p0',
      name: '交易平台升级',
      period: '2026.07 — 至今',
      systems: ['orders'],
      archived: false,
      notes: '订单中心架构优化与支付链路升级。',
    },
    {
      id: 'p1',
      name: '财务数字化二期',
      period: '2026.03 — 至今',
      systems: ['finance'],
      archived: false,
      notes: '报销、核算与预算流程一体化。',
    },
    {
      id: 'p2',
      name: '订单中心一期建设',
      period: '2025.06 — 2026.06',
      systems: ['orders'],
      archived: true,
      notes: '完成核心订单链路建设。系统继续沿用，资料保持原有归属。',
    },
    {
      id: 'p3',
      name: '基础设施治理',
      period: '2025.01 — 2026.02',
      systems: ['operations'],
      archived: true,
      notes: '统一监控、发布与运维入口。',
    },
  ],
  favorites: ['r0', 'r1', 'tool:config-diff', 'tool:data-format'],
};

for (const system of ['finance', 'operations']) {
  for (const category of categories) {
    const sample = initialData.records.find((r) => r.category === category.key)!;
    initialData.records.push({
      ...sample,
      id: `${system}-${category.key}`,
      system,
      name: `${system === 'finance' ? '财务' : '运维'}${category.singular}`,
      address:
        category.key === 'servers'
          ? system === 'finance'
            ? '10.32.16.21'
            : '10.48.16.21'
          : category.key === 'access'
            ? `https://${system}.example.com`
            : sample.address,
      tags: ['日常维护'],
      notes: `${systemName(system)}的${category.label}示例资料。`,
    });
  }
}
initialData.tasks.push({
  ...initialData.tasks[0],
  id: 'deleted-task',
  title: '旧版发布验证清单',
  deleted: true,
});
initialData.documents.push({
  ...initialData.documents[3],
  id: 'deleted-doc',
  title: '旧环境连接说明',
  deleted: true,
});

export const toolInfo = [
  {
    id: 'zip-text',
    title: 'ZIP 文本归档',
    description: '文件归档为加密文本分片，支持 Git 筛选与还原。',
    group: '文件处理',
    color: 'blue',
  },
  {
    id: 'config-diff',
    title: '配置对比',
    description: '对比文本、JSON 与 .env，快速定位配置差异。',
    group: '开发调试',
    color: 'cyan',
  },
  {
    id: 'data-format',
    title: '数据格式助手',
    description: 'JSON 格式化、压缩、排序与路径提取。',
    group: '开发调试',
    color: 'purple',
  },
  {
    id: 'time-cron',
    title: '时间与 Cron',
    description: '转换时间戳，解释表达式并查看执行计划。',
    group: '开发调试',
    color: 'orange',
  },
  {
    id: 'text-transform',
    title: '批量文本处理',
    description: '去重、排序、提取列与批量查找替换。',
    group: '内容处理',
    color: 'green',
  },
  {
    id: 'table-data',
    title: '表格数据转换',
    description: 'CSV、TSV 与 JSON 之间的快速转换。',
    group: '内容处理',
    color: 'geekblue',
  },
];
