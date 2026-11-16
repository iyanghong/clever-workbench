import { useState } from 'react';
import {
  App,
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Drawer,
  Empty,
  Flex,
  Input,
  Popconfirm,
  Segmented,
  Space,
  Table,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import {
  ArchiveIcon,
  ArrowCounterClockwiseIcon,
  ArrowRightIcon,
  FileTextIcon,
  PlusIcon,
  TrashIcon,
  TrayIcon,
} from '@phosphor-icons/react';
import { useDemo } from './store';
import { systemName, type Project } from './data';
import { PageTitle } from './ui';

export function ArchivePage() {
  const { data, setData, go, create } = useDemo();
  const [filter, setFilter] = useState('archived'),
    [query, setQuery] = useState(''),
    [selected, setSelected] = useState<Project | null>(null);
  const { message } = App.useApp();
  const rows = data.projects.filter(
    (p) => (filter === 'all' || p.archived === (filter === 'archived')) && p.name.includes(query),
  );
  return (
    <div className="page">
      <PageTitle
        title="项目档案"
        description="保留项目沿革，系统身份与资料归属持续稳定。"
        extra={
          <Button type="primary" icon={<PlusIcon />} onClick={() => create('project')}>
            新建项目
          </Button>
        }
      />
      <Alert
        showIcon
        type="info"
        title="归档项目后，相关系统和历史资料仍可正常使用。"
        style={{ marginBottom: 24 }}
      />
      <div className="section-toolbar">
        <Segmented
          aria-label="项目状态"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: 'archived',
              label: `已归档 ${data.projects.filter((p) => p.archived).length}`,
            },
            { value: 'active', label: '进行中' },
            { value: 'all', label: '全部项目' },
          ]}
        />
        <Input.Search
          aria-label="搜索项目"
          placeholder="搜索项目名称"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: 250 }}
          allowClear
        />
      </div>
      <Table<Project>
        rowKey="id"
        dataSource={rows}
        pagination={false}
        scroll={{ x: 680 }}
        columns={[
          {
            title: '项目名称',
            dataIndex: 'name',
            render: (name, p) => (
              <Space>
                <Avatar shape="square" icon={<ArchiveIcon />} className="blue-avatar" />
                <Button type="link" onClick={() => setSelected(p)}>
                  {name}
                </Button>
              </Space>
            ),
          },
          { title: '项目周期', dataIndex: 'period' },
          {
            title: '相关系统',
            render: (_, p) => (
              <Space wrap>
                {p.systems.map((s) => (
                  <Tag
                    key={s}
                    onClick={() => go(`ledger/access/${s}`)}
                    style={{ cursor: 'pointer' }}
                  >
                    {systemName(s)}
                  </Tag>
                ))}
              </Space>
            ),
          },
          {
            title: '状态',
            render: (_, p) => (
              <Tag color={p.archived ? 'default' : 'processing'}>
                {p.archived ? '已归档' : '进行中'}
              </Tag>
            ),
          },
          {
            title: '操作',
            render: (_, p) => (
              <Popconfirm
                title={p.archived ? '重新打开此项目？' : '归档此项目？'}
                onConfirm={() => {
                  setData((s) => ({
                    ...s,
                    projects: s.projects.map((v) =>
                      v.id === p.id ? { ...v, archived: !v.archived } : v,
                    ),
                  }));
                  message.success(p.archived ? '项目已重新打开' : '项目已归档');
                }}
              >
                <Button
                  type="text"
                  icon={p.archived ? <ArrowCounterClockwiseIcon /> : <ArchiveIcon />}
                >
                  {p.archived ? '重新打开' : '归档'}
                </Button>
              </Popconfirm>
            ),
          },
        ]}
      />
      <Drawer
        title="项目档案"
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size={520}
      >
        {selected && (
          <>
            <Typography.Title level={3}>{selected.name}</Typography.Title>
            <Descriptions
              column={1}
              items={[
                { key: 1, label: '项目周期', children: selected.period },
                { key: 2, label: '说明', children: selected.notes },
                {
                  key: 3,
                  label: '相关系统',
                  children: selected.systems.map((s) => (
                    <Button type="link" key={s} onClick={() => go(`ledger/access/${s}`)}>
                      {systemName(s)}
                      <ArrowRightIcon />
                    </Button>
                  )),
                },
              ]}
            />
            <Typography.Title level={5}>项目沿革</Typography.Title>
            <Timeline
              items={[
                { content: '项目立项，建立系统与基础资料' },
                { content: '核心功能验收，运维资料持续补充' },
                {
                  color: selected.archived ? 'gray' : 'blue',
                  content: selected.archived ? '项目归档，相关系统继续保留使用' : '项目持续推进中',
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}

export function TrashPage() {
  const { data, setData } = useDemo();
  const [filter, setFilter] = useState('all'),
    { message } = App.useApp();
  const rows = [
    ...data.tasks
      .filter((t) => t.deleted)
      .map((t) => ({ id: t.id, name: t.title, kind: 'task', type: '工作任务', system: t.system })),
    ...data.documents
      .filter((d) => d.deleted)
      .map((d) => ({
        id: d.id,
        name: d.title,
        kind: 'document',
        type: '技术文档',
        system: d.system,
      })),
  ].filter((r) => filter === 'all' || r.kind === filter);
  const restore = (id: string) => {
    setData((s) => ({
      ...s,
      tasks: s.tasks.map((t) => (t.id === id ? { ...t, deleted: false } : t)),
      documents: s.documents.map((d) => (d.id === id ? { ...d, deleted: false } : d)),
    }));
    message.success('资料已恢复');
  };
  const remove = (id: string) => {
    setData((s) => ({
      ...s,
      tasks: s.tasks.filter((t) => t.id !== id),
      documents: s.documents.filter((d) => d.id !== id),
    }));
    message.success('演示资料已永久移除');
  };
  return (
    <div className="page">
      <PageTitle
        title="回收站"
        description="误删的任务与文档可以在这里找回。"
        count={rows.length}
        extra={
          <Popconfirm
            title="清空演示回收站？"
            description="只影响当前 Demo 中的示例资料。"
            onConfirm={() =>
              setData((s) => ({
                ...s,
                tasks: s.tasks.filter((t) => !t.deleted),
                documents: s.documents.filter((d) => !d.deleted),
              }))
            }
          >
            <Button danger disabled={!rows.length} icon={<TrashIcon />}>
              清空回收站
            </Button>
          </Popconfirm>
        }
      />
      <div className="section-toolbar">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: '全部资料' },
            { value: 'task', label: '工作任务' },
            { value: 'document', label: '技术文档' },
          ]}
        />
        <Typography.Text type="secondary">恢复后保留原有的系统归属</Typography.Text>
      </div>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={rows}
        locale={{
          emptyText: (
            <Empty
              description={
                <>
                  <Typography.Title level={5}>回收站是空的</Typography.Title>
                  <Typography.Text type="secondary">
                    从任务或文档中删除一条示例资料，即可体验恢复流程。
                  </Typography.Text>
                </>
              }
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          ),
        }}
        columns={[
          {
            title: '名称',
            render: (_, r) => (
              <Space>
                {r.kind === 'task' ? <TrayIcon /> : <FileTextIcon />}
                {r.name}
              </Space>
            ),
          },
          { title: '类型', dataIndex: 'type' },
          { title: '所属系统', render: (_, r) => systemName(r.system) },
          {
            title: '操作',
            render: (_, r) => (
              <Space>
                <Button
                  type="link"
                  icon={<ArrowCounterClockwiseIcon />}
                  onClick={() => restore(r.id)}
                >
                  恢复
                </Button>
                <Popconfirm title="永久移除这条演示资料？" onConfirm={() => remove(r.id)}>
                  <Button type="text" danger>
                    永久移除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
    </div>
  );
}
