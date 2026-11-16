import { useState } from 'react';
import {
  App,
  Badge,
  Button,
  Card,
  Checkbox,
  Collapse,
  DatePicker,
  Divider,
  Empty,
  Flex,
  Form,
  Input,
  Modal,
  Popconfirm,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowCounterClockwiseIcon,
  ArrowsOutSimpleIcon,
  CheckCircleIcon,
  ClockIcon,
  FileTextIcon,
  GearSixIcon,
  PlusIcon,
  TrashIcon,
  XIcon,
} from '@phosphor-icons/react';
import dayjs from 'dayjs';
import { systemName, systemOptions, today, type Task } from './data';
import { useDemo } from './store';
import { Editor, PageTitle, StatusDot } from './ui';

export function TasksPage() {
  const { data, setData, parts, go, create } = useDemo();
  const [filter, setFilter] = useState('pending'),
    [system, setSystem] = useState('all'),
    [query, setQuery] = useState(''),
    [group, setGroup] = useState('created');
  const [tag, setTag] = useState<string[]>([]),
    [compact, setCompact] = useState(false),
    [tagManager, setTagManager] = useState(false),
    [newTag, setNewTag] = useState('');
  const [extraTags, setExtraTags] = useState<string[]>([]),
    [expanded, setExpanded] = useState(false);
  const { message } = App.useApp();
  const all = data.tasks.filter((t) => !t.deleted),
    pending = all.filter((t) => !t.done).length;
  const rows = all
    .filter(
      (t) =>
        (filter === 'all' || t.done === (filter === 'completed')) &&
        (system === 'all' || t.system === system) &&
        (!query || t.title.toLowerCase().includes(query.toLowerCase())) &&
        (!tag.length || tag.some((v) => t.tags.includes(v))),
    )
    .sort((a, b) =>
      group === 'due'
        ? (a.due || '9999').localeCompare(b.due || '9999')
        : group === 'system'
          ? a.system.localeCompare(b.system)
          : b.started.localeCompare(a.started),
    );
  const selected = all.find((t) => t.id === parts[1]);
  const tags = [...new Set([...all.flatMap((t) => t.tags), ...extraTags])];
  const patch = (id: string, value: Partial<Task>) =>
    setData((s) => ({ ...s, tasks: s.tasks.map((t) => (t.id === id ? { ...t, ...value } : t)) }));
  const toggle = (t: Task) => {
    patch(t.id, { done: !t.done, completed: t.done ? '' : today });
    message.success(t.done ? '任务已重新打开' : '任务已完成');
  };
  const detail = selected && (
    <Card
      className="task-detail"
      title={
        <Space>
          <Badge status={selected.done ? 'success' : 'processing'} />
          任务详情
        </Space>
      }
      extra={
        <Space size={0}>
          <Tooltip title={expanded ? '还原详情' : '展开详情'}>
            <Button
              type="text"
              aria-label="展开任务详情"
              icon={<ArrowsOutSimpleIcon />}
              onClick={() => setExpanded(!expanded)}
            />
          </Tooltip>
          <Button
            type="text"
            aria-label="关闭任务详情"
            icon={<XIcon />}
            onClick={() => go('tasks')}
          />
        </Space>
      }
    >
      <div className="task-detail-body">
        <Input
          className="task-title-input"
          aria-label="任务标题"
          variant="borderless"
          value={selected.title}
          onChange={(e) => patch(selected.id, { title: e.target.value })}
        />
        <div className="detail-context">
          <Typography.Text type="secondary">所属系统</Typography.Text>
          <Select
            aria-label="任务所属系统"
            variant="borderless"
            value={selected.system}
            onChange={(system) => patch(selected.id, { system })}
            options={[{ value: '', label: '未关联系统' }, ...systemOptions]}
          />
        </div>
        <Collapse
          ghost
          size="small"
          items={[
            {
              key: 'plan',
              label: (
                <Space>
                  <ClockIcon />
                  计划与标签
                  {selected.due && (
                    <Tag color={selected.due < today && !selected.done ? 'error' : 'default'}>
                      {selected.due.slice(5)}
                    </Tag>
                  )}
                </Space>
              ),
              children: (
                <Form layout="vertical">
                  <Flex gap={12} wrap>
                    <Form.Item label="开始日期">
                      <DatePicker
                        aria-label="任务开始日期"
                        value={dayjs(selected.started)}
                        onChange={(v) =>
                          v && patch(selected.id, { started: v.format('YYYY-MM-DD') })
                        }
                      />
                    </Form.Item>
                    <Form.Item label="预计完成">
                      <DatePicker
                        aria-label="任务预计完成"
                        showTime={{ format: 'HH:mm' }}
                        format="MM-DD HH:mm"
                        value={selected.due ? dayjs(selected.due) : null}
                        onChange={(v) =>
                          patch(selected.id, { due: v?.format('YYYY-MM-DD HH:mm') || '' })
                        }
                      />
                    </Form.Item>
                  </Flex>
                  <Form.Item label="分类标签">
                    <Select
                      mode="multiple"
                      aria-label="任务分类标签"
                      value={selected.tags}
                      options={tags.map((value) => ({ value }))}
                      onChange={(values) => patch(selected.id, { tags: values })}
                    />
                  </Form.Item>
                </Form>
              ),
            },
          ]}
        />
        <Divider style={{ margin: '12px 0' }} />
        <Editor
          value={selected.content}
          onChange={(content) => patch(selected.id, { content })}
          label="任务正文"
        />
        <div className="task-detail-footer">
          <StatusDot>已保存到本次演示</StatusDot>
          <Space>
            <Popconfirm
              title="移到回收站？"
              onConfirm={() => {
                patch(selected.id, { deleted: true });
                go('tasks');
              }}
            >
              <Button aria-label="删除任务" icon={<TrashIcon />} />
            </Popconfirm>
            <Button
              type={selected.done ? 'default' : 'primary'}
              icon={selected.done ? <ArrowCounterClockwiseIcon /> : <CheckCircleIcon />}
              onClick={() => toggle(selected)}
            >
              {selected.done ? '重新打开' : '标记完成'}
            </Button>
          </Space>
        </div>
      </div>
    </Card>
  );
  return (
    <div className={`page tasks-page ${selected ? 'has-detail' : ''}`}>
      <PageTitle
        title="工作任务"
        description="快速记录，持续推进，让每一步都有着落。"
        count={all.length}
        extra={
          <>
            <Button icon={<GearSixIcon />} onClick={() => setTagManager(true)}>
              管理标签
            </Button>
            <Button type="primary" icon={<PlusIcon />} onClick={() => create('task')}>
              新建任务
            </Button>
          </>
        }
      />
      <div className={`task-layout ${expanded && selected ? 'detail-expanded' : ''}`}>
        <div className="task-list-panel">
          <div className="section-toolbar">
            <Segmented
              value={filter}
              onChange={setFilter}
              aria-label="任务状态"
              options={[
                { value: 'pending', label: `未完成 ${pending}` },
                { value: 'completed', label: `已完成 ${all.length - pending}` },
                { value: 'all', label: '全部' },
              ]}
            />
            <Tooltip title="紧凑列表">
              <Checkbox checked={compact} onChange={(e) => setCompact(e.target.checked)}>
                紧凑
              </Checkbox>
            </Tooltip>
          </div>
          <Flex wrap gap={8} className="task-filters">
            <Input.Search
              aria-label="搜索任务"
              placeholder="搜索任务标题"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              allowClear
              style={{ flex: '1 1 170px' }}
            />
            <Select
              aria-label="任务系统筛选"
              value={system}
              onChange={setSystem}
              style={{ width: 145 }}
              options={[{ value: 'all', label: '全部系统' }, ...systemOptions]}
            />
            <Select
              aria-label="任务排序"
              value={group}
              onChange={setGroup}
              style={{ width: 130 }}
              options={[
                { value: 'created', label: '按创建日期' },
                { value: 'due', label: '按预计完成' },
                { value: 'system', label: '按所属系统' },
              ]}
            />
          </Flex>
          <Select
            mode="multiple"
            aria-label="筛选任务标签"
            placeholder="按标签筛选"
            value={tag}
            onChange={setTag}
            options={tags.map((value) => ({ value }))}
            allowClear
            style={{ minWidth: 160, marginBottom: 18 }}
          />
          <Table<Task>
            className="task-table"
            rowKey="id"
            dataSource={rows}
            showHeader={false}
            pagination={false}
            size={compact ? 'small' : 'middle'}
            rowClassName={(t) => (selected?.id === t.id ? 'selected-task-row' : '')}
            locale={{
              emptyText: (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有符合条件的任务">
                  <Button onClick={() => create('task')}>记录新任务</Button>
                </Empty>
              ),
            }}
            columns={[
              {
                key: 'done',
                width: 38,
                render: (_, t) => (
                  <Checkbox
                    aria-label={`完成${t.title}`}
                    checked={t.done}
                    onChange={() => toggle(t)}
                  />
                ),
              },
              {
                key: 'task',
                render: (_, t) => (
                  <div className="task-cell">
                    <Button
                      type="text"
                      className={`task-link ${t.done ? 'completed-title' : ''}`}
                      onClick={() => go(`tasks/${t.id}`)}
                    >
                      {t.title}
                    </Button>
                    <Flex gap={8} wrap align="center">
                      <Typography.Text type="secondary">{systemName(t.system)}</Typography.Text>
                      {t.tags.map((v) => (
                        <Tag key={v} variant="filled">
                          {v}
                        </Tag>
                      ))}
                    </Flex>
                  </div>
                ),
              },
              {
                key: 'due',
                width: compact ? 110 : 130,
                render: (_, t) =>
                  t.done ? (
                    <Tag icon={<CheckCircleIcon />} color="success">
                      已完成
                    </Tag>
                  ) : t.due ? (
                    <div className="due-cell">
                      <Typography.Text type={t.due < today ? 'danger' : 'secondary'}>
                        <ClockIcon /> {t.due.slice(5)}
                      </Typography.Text>
                      <Typography.Text type="secondary">
                        {t.due < today
                          ? '已逾期'
                          : t.due.startsWith(today)
                            ? '今天到期'
                            : '预计完成'}
                      </Typography.Text>
                    </div>
                  ) : (
                    <Typography.Text type="secondary">未设计划</Typography.Text>
                  ),
              },
            ]}
          />
          <Button
            type="dashed"
            block
            icon={<PlusIcon />}
            className="add-task-row"
            onClick={() => create('task')}
          >
            记录下一件事
          </Button>
          <div className="page-footnote">
            <StatusDot>修改即时保留在当前演示</StatusDot>
          </div>
        </div>
        {detail}
      </div>
      <Modal
        title="管理任务标签"
        open={tagManager}
        onCancel={() => setTagManager(false)}
        footer={
          <Button type="primary" onClick={() => setTagManager(false)}>
            完成
          </Button>
        }
      >
        <Typography.Paragraph type="secondary">
          标签用于分类，紧迫程度由预计完成时间单独判断。
        </Typography.Paragraph>
        <Flex wrap gap={10}>
          {tags.map((t, i) => (
            <Tag
              key={t}
              color={['blue', 'green', 'orange', 'purple', 'cyan'][i % 5]}
              closable
              onClose={() => {
                setExtraTags((v) => v.filter((x) => x !== t));
                setData((s) => ({
                  ...s,
                  tasks: s.tasks.map((task) => ({
                    ...task,
                    tags: task.tags.filter((x) => x !== t),
                  })),
                }));
              }}
            >
              {t}
            </Tag>
          ))}
        </Flex>
        <Space.Compact style={{ width: '100%', marginTop: 24 }}>
          <Input
            aria-label="新标签名称"
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder="输入标签名称"
          />
          <Button
            type="primary"
            disabled={!newTag.trim() || tags.includes(newTag.trim())}
            onClick={() => {
              setExtraTags((v) => [...v, newTag.trim()]);
              setNewTag('');
            }}
          >
            新增标签
          </Button>
        </Space.Compact>
      </Modal>
    </div>
  );
}
