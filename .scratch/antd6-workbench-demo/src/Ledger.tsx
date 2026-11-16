import { useEffect, useState, type ReactNode } from 'react';
import {
  App,
  Alert,
  Avatar,
  Badge,
  Button,
  Checkbox,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowRightIcon,
  CopyIcon,
  DatabaseIcon,
  DotsThreeIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  GearSixIcon,
  GlobeIcon,
  LinkIcon,
  LockKeyIcon,
  PencilSimpleIcon,
  PlusIcon,
  RocketLaunchIcon,
  DesktopTowerIcon,
  StarIcon,
  UploadSimpleIcon,
  UserIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import {
  categories,
  systemName,
  systemOptions,
  systems,
  today,
  type Category,
  type RecordItem,
} from './data';
import { useDemo } from './store';
import { PageTitle, StatusDot } from './ui';

const icons: Record<Category, ReactNode> = {
  access: <LinkIcon />,
  accounts: <UserIcon />,
  servers: <DesktopTowerIcon />,
  resources: <DatabaseIcon />,
  services: <RocketLaunchIcon />,
  operations: <WrenchIcon />,
  documents: <FileTextIcon />,
};

function download(filename: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function LedgerPage() {
  const { data, setData, parts, go, create, help, copy, locked, setLocked } = useDemo();
  const category = (categories.some((c) => c.key === parts[1]) ? parts[1] : 'access') as Category;
  const system = parts[2] || 'orders',
    activeSystem = systems.find((s) => s.id === system) ?? systems[0];
  const meta = categories.find((c) => c.key === category)!;
  const [query, setQuery] = useState(''),
    [env, setEnv] = useState('all'),
    [tag, setTag] = useState('all');
  const [selected, setSelected] = useState<React.Key[]>([]),
    [config, setConfig] = useState(false);
  const [exporting, setExporting] = useState(false),
    [includeSecrets, setIncludeSecrets] = useState(false);
  const [bulk, setBulk] = useState(false),
    [bulkText, setBulkText] = useState(''),
    [bulkError, setBulkError] = useState('');
  const { message, modal } = App.useApp();
  const record = data.records.find((r) => r.id === parts[3]);
  const all = data.records.filter((r) => r.system === activeSystem.id && r.category === category);
  const rows = all.filter(
    (r) =>
      (!query ||
        `${r.name}${r.address}${r.product}${r.notes}`
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (env === 'all' || r.env.includes(env)) &&
      (tag === 'all' || r.tags.includes(tag)),
  );
  useEffect(() => {
    setSelected([]);
    setQuery('');
    setEnv('all');
    setTag('all');
  }, [category, system]);
  const favorite = (id: string) =>
    setData((s) => ({
      ...s,
      favorites: s.favorites.includes(id)
        ? s.favorites.filter((f) => f !== id)
        : [...s.favorites, id],
    }));
  const secretCopy = () => {
    if (locked)
      modal.confirm({
        title: '解锁演示凭据',
        content: '这里复制的是示例密码 Demo-Only-2026!，不包含真实凭据。',
        okText: '解锁并复制',
        onOk: async () => {
          setLocked(false);
          await copy('Demo-Only-2026!');
        },
      });
    else void copy('Demo-Only-2026!');
  };
  const runExport = () => {
    const chosen = selected.length ? rows.filter((r) => selected.includes(r.id)) : rows;
    download(
      `${activeSystem.name}-${meta.label}-演示资料.md`,
      `# ${activeSystem.name} · ${meta.label}\n\n> UI Demo 示例资料，不是恢复备份。\n\n` +
        chosen
          .map(
            (r) =>
              `## ${r.name}\n\n- 环境：${r.env.join('、')}\n- 地址：${r.address}\n- 类型：${r.product}\n- 账号：${r.username || '未关联'}\n${includeSecrets ? '- 示例密码：Demo-Only-2026!\n' : ''}\n${r.notes}\n`,
          )
          .join('\n'),
    );
    setExporting(false);
    message.success('演示资料包已导出');
  };
  const importBulk = () => {
    const lines = bulkText.trim().split('\n').filter(Boolean);
    if (!bulkText.trim()) return setBulkError('请先粘贴至少一行资料。');
    const items = lines.map((line) => line.split(/\t|,/).map((v) => v.trim()));
    if (items.some((cells) => !cells[0])) return setBulkError('每行第一列需要填写名称。');
    setData((s) => ({
      ...s,
      records: [
        ...items.map((cells) => ({
          id: crypto.randomUUID(),
          category,
          system: activeSystem.id,
          name: cells[0],
          address: cells[1] || '',
          product: cells[2] || '',
          username: '',
          env: ['生产'],
          tags: [],
          notes: cells[3] || '',
          status: '在用' as const,
          updated: `${today} 10:30`,
        })),
        ...s.records,
      ],
    }));
    setBulk(false);
    setBulkText('');
    message.success(`已录入 ${items.length} 条演示资料`);
  };
  return (
    <div className="page ledger-page">
      <PageTitle
        title="技术台账"
        description="系统资料集中管理，查找、复制和维护更顺手。"
        extra={
          <>
            <Button icon={<UploadSimpleIcon />} onClick={() => setBulk(true)}>
              批量录入
            </Button>
            <Button icon={<DownloadSimpleIcon />} onClick={() => setExporting(true)}>
              导出资料
            </Button>
            <Button
              type="primary"
              icon={<PlusIcon />}
              onClick={() =>
                create(category === 'documents' ? 'document' : category, activeSystem.id)
              }
            >
              新增{meta.singular}
            </Button>
          </>
        }
      />
      <div className="system-context">
        <Flex align="center" gap={12}>
          <Avatar
            size={42}
            shape="square"
            style={{ background: `${activeSystem.color}15`, color: activeSystem.color }}
          >
            {activeSystem.short}
          </Avatar>
          <div>
            <Select
              className="system-select"
              aria-label="选择系统"
              variant="borderless"
              value={activeSystem.id}
              options={systemOptions}
              onChange={(value) => go(`ledger/${category}/${value}`)}
            />
            <Typography.Text className="system-subtitle" type="secondary">
              {activeSystem.project}
              <Divider orientation="vertical" />
              {activeSystem.notes}
            </Typography.Text>
          </div>
        </Flex>
        <Space>
          <Tooltip title="新建系统">
            <Button
              type="text"
              aria-label="新建系统"
              icon={<PlusIcon />}
              onClick={() => create('system')}
            />
          </Tooltip>
          <Button type="text" icon={<GearSixIcon />} onClick={() => setConfig(true)}>
            系统配置
          </Button>
        </Space>
      </div>
      <Tabs
        activeKey={category}
        onChange={(key) => go(`ledger/${key}/${activeSystem.id}`)}
        items={categories.map((c) => ({ key: c.key, label: c.label, icon: icons[c.key] }))}
      />
      <div className="section-toolbar">
        <Flex gap={8} wrap>
          <Input.Search
            aria-label="搜索台账"
            allowClear
            placeholder={`搜索${meta.label}的名称、地址或说明`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ width: 310 }}
          />
          <Select
            aria-label="筛选环境"
            value={env}
            style={{ width: 125 }}
            options={[
              { value: 'all', label: '全部环境' },
              ...['生产', '测试', '开发', '通用'].map((value) => ({ value, label: value })),
            ]}
            onChange={setEnv}
          />
          <Select
            aria-label="筛选标签"
            value={tag}
            style={{ width: 125 }}
            options={[
              { value: 'all', label: '全部标签' },
              { value: '核心业务', label: '核心业务' },
              { value: '重点关注', label: '重点关注' },
            ]}
            onChange={setTag}
          />
        </Flex>
        <Button type="text" icon={<BookLabel />} onClick={() => help(meta.label)}>
          使用指引
        </Button>
      </div>
      <Flex justify="space-between" align="center" className="table-summary">
        <Typography.Text type="secondary">
          共 {rows.length} 条资料{selected.length ? ` · 已选 ${selected.length} 项` : ''}
        </Typography.Text>
        {selected.length > 0 ? (
          <Space>
            <Button
              size="small"
              icon={<CopyIcon />}
              onClick={() =>
                void copy(
                  rows
                    .filter((r) => selected.includes(r.id))
                    .map((r) => `${r.name}\t${r.address}\t${r.username}`)
                    .join('\n'),
                )
              }
            >
              复制所选
            </Button>
            <Button size="small" onClick={() => setExporting(true)}>
              导出所选
            </Button>
            <Button type="text" size="small" onClick={() => setSelected([])}>
              取消选择
            </Button>
          </Space>
        ) : (
          <Typography.Text type="secondary">{meta.hint}</Typography.Text>
        )}
      </Flex>
      <Table<RecordItem>
        className="ledger-table"
        rowKey="id"
        dataSource={rows}
        size="middle"
        pagination={
          rows.length > 8 ? { pageSize: 8, showTotal: (total) => `共 ${total} 条` } : false
        }
        scroll={{ x: 830 }}
        rowSelection={{ selectedRowKeys: selected, onChange: setSelected, columnWidth: 42 }}
        locale={{
          emptyText: (
            <Empty description="还没有符合条件的资料" image={Empty.PRESENTED_IMAGE_SIMPLE}>
              <Button
                onClick={() =>
                  create(category === 'documents' ? 'document' : category, activeSystem.id)
                }
              >
                新增{meta.singular}
              </Button>
            </Empty>
          ),
        }}
        columns={[
          {
            title: '名称',
            dataIndex: 'name',
            width: 255,
            sorter: (a, b) => a.name.localeCompare(b.name),
            render: (_, r) => (
              <Flex gap={10} align="center">
                <Avatar
                  shape="square"
                  size={33}
                  className={`record-avatar ${category}`}
                  icon={icons[category]}
                />
                <div className="record-name">
                  <Button
                    type="link"
                    className="name-link"
                    onClick={() => go(`ledger/${category}/${activeSystem.id}/${r.id}`)}
                  >
                    {r.name}
                  </Button>
                  <Typography.Text type="secondary">{r.product || '信息待补充'}</Typography.Text>
                </div>
              </Flex>
            ),
          },
          {
            title:
              category === 'accounts'
                ? '账号 / 归属'
                : category === 'operations'
                  ? '执行计划'
                  : '地址 / 连接',
            dataIndex: 'address',
            width: 270,
            render: (value, r) => (
              <div className="address-cell">
                <Typography.Text className="mono" ellipsis={{ tooltip: value }}>
                  {category === 'accounts' ? r.username : value || '未填写'}
                </Typography.Text>
                {category === 'accounts' ? (
                  <Button
                    size="small"
                    type="text"
                    aria-label={`复制${r.name}账号`}
                    icon={<CopyIcon />}
                    onClick={() => void copy(r.username)}
                  />
                ) : (
                  <Button
                    size="small"
                    type="text"
                    aria-label={`复制${r.name}地址`}
                    icon={<CopyIcon />}
                    onClick={() => void copy(value)}
                  />
                )}
              </div>
            ),
          },
          {
            title: '环境',
            dataIndex: 'env',
            width: 90,
            render: (values) => (
              <Space size={4} wrap>
                {values.map((v: string) => (
                  <Tag key={v} color={v === '生产' ? 'blue' : v === '测试' ? 'orange' : 'default'}>
                    {v}
                  </Tag>
                ))}
              </Space>
            ),
          },
          {
            title: '说明',
            dataIndex: 'notes',
            ellipsis: true,
            render: (value) => (
              <Typography.Text type="secondary" ellipsis={{ tooltip: value }}>
                {value || '暂无说明'}
              </Typography.Text>
            ),
          },
          {
            title: '操作',
            key: 'action',
            width: 124,
            fixed: 'right',
            render: (_, r) => (
              <Space size={0}>
                <Tooltip title={data.favorites.includes(r.id) ? '取消收藏' : '收藏'}>
                  <Button
                    type="text"
                    aria-label={`收藏${r.name}`}
                    icon={
                      <StarIcon
                        weight={data.favorites.includes(r.id) ? 'fill' : 'regular'}
                        color={data.favorites.includes(r.id) ? '#faad14' : undefined}
                      />
                    }
                    onClick={() => favorite(r.id)}
                  />
                </Tooltip>
                {category === 'accounts' && (
                  <Tooltip title="复制演示密码">
                    <Button
                      type="text"
                      aria-label={`复制${r.name}密码`}
                      icon={<LockKeyIcon />}
                      onClick={secretCopy}
                    />
                  </Tooltip>
                )}
                <Button
                  type="text"
                  aria-label={`查看${r.name}`}
                  icon={<ArrowRightIcon />}
                  onClick={() => go(`ledger/${category}/${activeSystem.id}/${r.id}`)}
                />
              </Space>
            ),
          },
        ]}
      />
      <div className="page-footnote">
        <StatusDot>资料保存在本地工作空间</StatusDot>
        <Typography.Text type="secondary">
          最近更新 {today.replaceAll('-', '.')}
          <Divider orientation="vertical" />
          按系统身份持续积累
        </Typography.Text>
      </div>
      <Drawer
        title={
          <Space>
            {icons[category]}
            {record?.name}
          </Space>
        }
        open={Boolean(record)}
        onClose={() => go(`ledger/${category}/${activeSystem.id}`)}
        size={580}
        extra={
          record && (
            <Button
              type="text"
              icon={<StarIcon weight={data.favorites.includes(record.id) ? 'fill' : 'regular'} />}
              onClick={() => favorite(record.id)}
              aria-label="收藏当前资料"
            />
          )
        }
        destroyOnHidden
      >
        {record && (
          <RecordDetail
            key={record.id}
            record={record}
            onClose={() => go(`ledger/${category}/${activeSystem.id}`)}
          />
        )}
      </Drawer>
      <Modal
        title="系统配置"
        open={config}
        onCancel={() => setConfig(false)}
        footer={null}
        width={720}
        destroyOnHidden
      >
        {config && <SystemConfiguration system={activeSystem.id} />}
      </Modal>
      <Modal
        title="导出系统资料"
        open={exporting}
        onCancel={() => setExporting(false)}
        onOk={runExport}
        okText="导出演示资料"
        width={520}
      >
        <Alert
          title="资料包用于阅读与交接"
          description="本 Demo 导出 Markdown 示例资料，不作为恢复备份。"
          type="info"
          showIcon
          style={{ marginBottom: 20 }}
        />
        <Descriptions
          column={1}
          items={[
            { key: 1, label: '系统', children: activeSystem.name },
            {
              key: 2,
              label: '范围',
              children: `${meta.label} · ${selected.length || rows.length} 条资料`,
            },
            { key: 3, label: '格式', children: 'Markdown (.md)' },
          ]}
        />
        <Checkbox
          checked={includeSecrets}
          onChange={(e) => {
            if (e.target.checked && locked)
              modal.confirm({
                title: '解锁演示凭据',
                content: '只会加入固定的示例密码。',
                onOk: () => {
                  setLocked(false);
                  setIncludeSecrets(true);
                },
              });
            else setIncludeSecrets(e.target.checked);
          }}
        >
          包含示例凭据
        </Checkbox>
      </Modal>
      <Modal
        title={`批量录入${meta.label}`}
        open={bulk}
        onCancel={() => {
          setBulk(false);
          setBulkError('');
        }}
        onOk={importBulk}
        okText="确认录入"
        width={690}
      >
        <Typography.Paragraph type="secondary">
          每行一条资料，列之间使用制表符或逗号：名称、地址、类型、说明。
        </Typography.Paragraph>
        <Input.TextArea
          aria-label="批量资料"
          value={bulkText}
          rows={8}
          onChange={(e) => setBulkText(e.target.value)}
          placeholder={'应用服务器 03\t10.24.16.23\tUbuntu 24.04\t扩容节点'}
        />
        {bulkError && <Alert title={bulkError} type="error" showIcon style={{ marginTop: 12 }} />}
        <Divider />
        <Table
          size="small"
          pagination={false}
          rowKey="id"
          columns={[
            { title: '名称', dataIndex: 'name' },
            { title: '地址', dataIndex: 'address' },
            { title: '类型', dataIndex: 'product' },
          ]}
          dataSource={
            bulkText.trim()
              ? bulkText
                  .trim()
                  .split('\n')
                  .slice(0, 4)
                  .map((line, i) => {
                    const cells = line.split(/\t|,/);
                    return { id: i, name: cells[0], address: cells[1], product: cells[2] };
                  })
              : []
          }
          locale={{ emptyText: '粘贴后显示前四行预览' }}
        />
      </Modal>
    </div>
  );
}

function BookLabel() {
  return <FileTextIcon size={15} />;
}

function RecordDetail({ record, onClose }: { record: RecordItem; onClose: () => void }) {
  const { data, setData, go, locked, setLocked, copy, create } = useDemo();
  const [editing, setEditing] = useState(false),
    [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const save = async () => {
    const values = await form.validateFields();
    setData((s) => ({
      ...s,
      records: s.records.map((r) =>
        r.id === record.id ? { ...r, ...values, updated: `${today} 10:30` } : r,
      ),
    }));
    setEditing(false);
    message.success('演示资料已保存');
  };
  return (
    <>
      <Flex justify="space-between" align="center" style={{ marginBottom: 20 }}>
        <Space>
          <Tag color="blue">{systemName(record.system)}</Tag>
          <Badge status="success" text={record.status} />
        </Space>
        <Button icon={<PencilSimpleIcon />} onClick={() => setEditing(!editing)}>
          {editing ? '取消编辑' : '编辑资料'}
        </Button>
      </Flex>
      <Tabs
        items={[
          {
            key: 'info',
            label: '基本资料',
            children: editing ? (
              <Form form={form} layout="vertical" initialValues={record}>
                <Form.Item label="名称" name="name" rules={[{ required: true, whitespace: true }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="地址 / 连接信息" name="address">
                  <Input />
                </Form.Item>
                <Form.Item label="类型 / 产品" name="product">
                  <Input />
                </Form.Item>
                <Form.Item label="适用环境" name="env">
                  <Select
                    mode="multiple"
                    options={['生产', '测试', '开发', '通用'].map((value) => ({ value }))}
                  />
                </Form.Item>
                <Form.Item label="标签" name="tags">
                  <Select mode="tags" />
                </Form.Item>
                <Form.Item label="状态" name="status">
                  <Select options={['在用', '停用', '待确认'].map((value) => ({ value }))} />
                </Form.Item>
                <Form.Item label="说明" name="notes">
                  <Input.TextArea rows={4} />
                </Form.Item>
                <Button type="primary" onClick={() => void save().catch(() => {})}>
                  保存修改
                </Button>
              </Form>
            ) : (
              <>
                <Descriptions
                  column={1}
                  layout="vertical"
                  size="middle"
                  items={[
                    { key: 1, label: '名称', children: record.name },
                    {
                      key: 2,
                      label: '地址 / 连接信息',
                      children: (
                        <Typography.Text copyable={{ text: record.address }} className="mono">
                          {record.address || '未填写'}
                        </Typography.Text>
                      ),
                    },
                    { key: 3, label: '类型 / 产品', children: record.product || '未填写' },
                    {
                      key: 4,
                      label: '适用环境',
                      children: record.env.map((e) => <Tag key={e}>{e}</Tag>),
                    },
                    {
                      key: 5,
                      label: '标签',
                      children: record.tags.map((t) => <Tag key={t}>{t}</Tag>),
                    },
                    { key: 6, label: '说明', children: record.notes || '暂无说明' },
                  ]}
                />
                {record.category === 'resources' && (
                  <>
                    <Divider>连接信息</Divider>
                    <Table
                      size="small"
                      pagination={false}
                      columns={[
                        { title: '连接名称', dataIndex: 'name' },
                        { title: '角色', dataIndex: 'role' },
                        { title: '地址', dataIndex: 'address' },
                      ]}
                      dataSource={[
                        { key: 1, name: '业务连接', role: '主节点', address: record.address },
                        { key: 2, name: '管理连接', role: '管理', address: '10.24.16.31' },
                      ]}
                    />
                  </>
                )}
                <Divider />
                <StatusDot>最近更新 {record.updated}</StatusDot>
              </>
            ),
          },
          {
            key: 'accounts',
            label: '关联账号',
            children: (
              <>
                <Alert
                  title={locked ? '凭据已锁定' : '正在显示演示凭据'}
                  description="账号可以查阅，显示与复制密码需要解锁。全部为虚构示例。"
                  type={locked ? 'info' : 'success'}
                  showIcon
                  style={{ marginBottom: 20 }}
                />
                <Descriptions
                  column={1}
                  items={[
                    {
                      key: 1,
                      label: '用户名',
                      children: (
                        <Typography.Text copyable>{record.username || 'deploy'}</Typography.Text>
                      ),
                    },
                    {
                      key: 2,
                      label: '密码',
                      children: (
                        <Space>
                          <Typography.Text code>
                            {locked ? '••••••••••••' : 'Demo-Only-2026!'}
                          </Typography.Text>
                          <Button
                            type="text"
                            icon={locked ? <LockKeyIcon /> : <CopyIcon />}
                            onClick={() =>
                              locked ? setLocked(false) : void copy('Demo-Only-2026!')
                            }
                          >
                            {locked ? '解锁演示' : '复制'}
                          </Button>
                        </Space>
                      ),
                    },
                    { key: 3, label: '用途', children: '只用于展示凭据控件与保护状态。' },
                  ]}
                />
                <Button icon={<PlusIcon />} onClick={() => create('accounts', record.system)}>
                  关联新账号
                </Button>
              </>
            ),
          },
          {
            key: 'related',
            label: '相关工作',
            children: (
              <Space orientation="vertical" style={{ width: '100%' }} size={14}>
                <Typography.Text type="secondary">同一系统的任务与文档</Typography.Text>
                {data.tasks
                  .filter((t) => t.system === record.system && !t.deleted)
                  .slice(0, 3)
                  .map((t) => (
                    <Button
                      block
                      className="related-button"
                      key={t.id}
                      onClick={() => go(`tasks/${t.id}`)}
                    >
                      {t.title}
                      <ArrowRightIcon />
                    </Button>
                  ))}
                <Divider />
                {data.documents
                  .filter((d) => d.system === record.system && !d.deleted)
                  .map((d) => (
                    <Button
                      block
                      className="related-button"
                      key={d.id}
                      icon={<FileTextIcon />}
                      onClick={() => go(`documents/${d.id}`)}
                    >
                      {d.title}
                      <ArrowRightIcon />
                    </Button>
                  ))}
              </Space>
            ),
          },
        ]}
      />
      <Divider />
      <Flex justify="space-between">
        <Popconfirm
          title="移除这条演示资料？"
          description="仅影响当前预览中的示例数据。"
          onConfirm={() => {
            setData((s) => ({ ...s, records: s.records.filter((r) => r.id !== record.id) }));
            onClose();
            message.success('已移除演示资料');
          }}
        >
          <Button danger>移除资料</Button>
        </Popconfirm>
        <Button
          onClick={() =>
            modal.info({
              title: '资料历史',
              content: (
                <Timeline
                  items={[
                    { content: `${record.updated} 更新连接与说明` },
                    { content: '2026-11-10 14:30 录入系统台账' },
                  ]}
                />
              ),
            })
          }
        >
          查看变更记录
        </Button>
      </Flex>
    </>
  );
}

function SystemConfiguration({ system }: { system: string }) {
  const { data, setData, create } = useDemo();
  const item = systems.find((s) => s.id === system)!;
  const [envs, setEnvs] = useState(['生产', '测试', '开发']),
    [newEnv, setNewEnv] = useState('');
  const { message } = App.useApp();
  return (
    <Tabs
      items={[
        {
          key: 'basic',
          label: '基本信息',
          children: (
            <Form
              layout="vertical"
              initialValues={{ name: item.name, notes: item.notes, project: item.project }}
              onFinish={(values) => {
                Object.assign(item, values);
                const option = systemOptions.find((s) => s.value === system);
                if (option) option.label = values.name;
                setData((s) => ({ ...s }));
                message.success('系统配置已更新');
              }}
            >
              <Form.Item label="系统名称" name="name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item label="当前项目" name="project">
                <Select
                  options={data.projects
                    .filter((p) => !p.archived)
                    .map((p) => ({ value: p.name, label: p.name }))}
                />
              </Form.Item>
              <Form.Item label="系统说明" name="notes">
                <Input.TextArea rows={3} />
              </Form.Item>
              <Button type="primary" htmlType="submit">
                保存配置
              </Button>
              <Divider>项目沿革</Divider>
              <Timeline
                items={data.projects
                  .filter((p) => p.systems.includes(system))
                  .map((p) => ({
                    color: p.archived ? 'gray' : 'blue',
                    content: (
                      <Space>
                        {p.name}
                        <Tag>{p.archived ? '历史项目' : '当前项目'}</Tag>
                        <Typography.Text type="secondary">{p.period}</Typography.Text>
                      </Space>
                    ),
                  }))}
              />
            </Form>
          ),
        },
        {
          key: 'envs',
          label: '环境管理',
          children: (
            <>
              <Typography.Paragraph type="secondary">
                按实际部署划分环境，同一份资料可适用于多个环境。
              </Typography.Paragraph>
              <Table
                pagination={false}
                size="small"
                rowKey="name"
                dataSource={envs.map((name) => ({ name }))}
                columns={[
                  {
                    title: '环境名称',
                    dataIndex: 'name',
                    render: (name) => (
                      <Tag color={name === '生产' ? 'blue' : 'default'}>{name}</Tag>
                    ),
                  },
                  {
                    title: '说明',
                    render: (_, r) => (r.name === '生产' ? '正式业务环境' : '研发与验证环境'),
                  },
                  {
                    title: '操作',
                    render: (_, r) => (
                      <Popconfirm
                        title="移除此演示环境？"
                        onConfirm={() => setEnvs((e) => e.filter((v) => v !== r.name))}
                      >
                        <Button type="text" danger>
                          移除
                        </Button>
                      </Popconfirm>
                    ),
                  },
                ]}
              />
              <Space.Compact style={{ marginTop: 20, width: '100%' }}>
                <Input
                  aria-label="新增环境名称"
                  value={newEnv}
                  onChange={(e) => setNewEnv(e.target.value)}
                  placeholder="环境名称，例如预生产"
                />
                <Button
                  type="primary"
                  disabled={!newEnv.trim() || envs.includes(newEnv.trim())}
                  onClick={() => {
                    setEnvs((e) => [...e, newEnv.trim()]);
                    setNewEnv('');
                  }}
                >
                  新增环境
                </Button>
              </Space.Compact>
            </>
          ),
        },
        {
          key: 'projects',
          label: '项目档案',
          children: (
            <>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={data.projects.filter((p) => p.systems.includes(system))}
                columns={[
                  { title: '项目', dataIndex: 'name' },
                  { title: '时间', dataIndex: 'period' },
                  {
                    title: '状态',
                    render: (_, p) => (
                      <Tag color={p.archived ? 'default' : 'processing'}>
                        {p.archived ? '已归档' : '进行中'}
                      </Tag>
                    ),
                  },
                ]}
              />
              <Button
                style={{ marginTop: 16 }}
                icon={<PlusIcon />}
                onClick={() => create('project', system)}
              >
                新建项目
              </Button>
            </>
          ),
        },
      ]}
    />
  );
}
