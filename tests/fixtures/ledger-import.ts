import fs from 'node:fs/promises';
import path from 'node:path';
import ExcelJS from 'exceljs';
import { Document, Packer, Paragraph, ExternalHyperlink, TextRun } from 'docx';

export async function createLedgerImportFixtures(directory: string) {
  await fs.mkdir(directory, { recursive: true });
  const csv = path.join(directory, '合成入口与服务器.csv');
  await fs.writeFile(
    csv,
    [
      '类型,名称,环境,地址,端口,账号用途,用户名,密码',
      '服务器,跳板机,生产,192.0.2.10,22,运维账号,000123,fixture-ssh!23',
      '访问入口,制品仓库,生产,https://repo.example.invalid,,维护账号,repo_admin,fixture-repo!23',
    ].join('\r\n'),
  );
  const xlsx = path.join(directory, '合成资源交接.xlsx');
  const workbook = new ExcelJS.Workbook();
  const servers = workbook.addWorksheet('服务器');
  servers.addRow(['名称', '环境', 'IP', '用途']);
  servers.addRow(['应用节点', '生产', '192.0.2.11', '运行订单应用']);
  const databases = workbook.addWorksheet('数据库');
  databases.addRow([
    '资源编号（同编号是同一实例）',
    '名称',
    '环境',
    '连接名称',
    '地址',
    '端口',
    '账号用途',
    '用户名',
    '密码',
  ]);
  databases.addRow([
    'DB-01',
    '订单数据库',
    '生产',
    '业务连接',
    '192.0.2.20',
    5432,
    '应用账号',
    'orders_app',
    'fixture-db!23',
  ]);
  databases.addRow([
    'DB-01',
    '订单数据库',
    '生产',
    '管理连接',
    '192.0.2.21',
    5432,
    '只读账号',
    'orders_read',
    'fixture-readonly!23',
  ]);
  const redis = workbook.addWorksheet('Redis');
  redis.addRow(['名称', '环境', '地址', '端口']);
  redis.addRow(['测试缓存', '测试', '192.0.2.40', 6379]);
  await workbook.xlsx.writeFile(xlsx);
  const docx = path.join(directory, '合成运维手册.docx');
  const paragraphs = [
    '脱敏演示系统的交接资料。以下内容全部为合成样例，不对应实际设备或账号。',
    new Paragraph({
      children: [
        new TextRun('服务：订单服务；代码仓库：'),
        new ExternalHyperlink({
          link: 'https://git.example.invalid/orders',
          children: [new TextRun('查看代码仓库')],
        }),
        new TextRun('；适用环境：生产。'),
      ],
    }),
    '部署节点：订单API节点；所属服务：订单服务；环境：生产；地址：192.0.2.30；端口：8080。',
    '其他资源：消息队列；产品类型：RabbitMQ；环境：生产；连接地址：192.0.2.50；端口：5672。',
    '运行作业：每日归档；环境：生产；所属服务：订单服务；执行频率：每天 02:00。',
    '备份策略：队列备份；环境：生产；所属资源：消息队列；备份频率：每天 03:00。',
    '独立账号：应急维护；用户名：operator；环境：生产；密码：“fixture-manual!23”。',
  ];
  await fs.writeFile(
    docx,
    await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: paragraphs.map((value) =>
              typeof value === 'string' ? new Paragraph(value) : value,
            ),
          },
        ],
      }),
    ),
  );
  return [
    { filename: csv, expected: { 跳板机: 'server', 制品仓库: 'access' } },
    { filename: xlsx, expected: { 应用节点: 'server', 订单数据库: 'database', 测试缓存: 'redis' } },
    {
      filename: docx,
      expected: {
        订单服务: 'service',
        订单API节点: 'node',
        消息队列: 'other',
        每日归档: 'job',
        队列备份: 'backup',
        应急维护: 'account',
      },
    },
  ];
}
