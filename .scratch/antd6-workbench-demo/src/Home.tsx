import {
  App,
  Avatar,
  Badge,
  Button,
  Card,
  Checkbox,
  Col,
  Empty,
  Flex,
  Input,
  Row,
  Space,
  Statistic,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  FileTextIcon,
  MagnifyingGlassIcon,
  PlusIcon,
  StackIcon,
  StarIcon,
  WrenchIcon,
} from '@phosphor-icons/react';
import { useState } from 'react';
import { systemName, systems, today, toolInfo } from './data';
import { useDemo } from './store';
import { PageTitle, StatusDot } from './ui';

export function HomePage() {
  const { data, setData, go, create, help, copy } = useDemo();
  const [quick, setQuick] = useState(''),
    { message } = App.useApp();
  const pending = data.tasks.filter((t) => !t.done && !t.deleted);
  const urgent = pending.filter((t) => t.due && t.due < `${today} 23:59`);
  const add = () => {
    if (!quick.trim()) return;
    setData((s) => ({
      ...s,
      tasks: [
        {
          id: crypto.randomUUID(),
          title: quick.trim(),
          system: '',
          due: '',
          started: today,
          completed: '',
          done: false,
          deleted: false,
          tags: [],
          content: '',
        },
        ...s.tasks,
      ],
    }));
    setQuick('');
    message.success('任务已记录');
  };
  return (
    <div className="page home-page">
      <PageTitle
        title="让今天的工作，井然有序。"
        description="11 月 16 日，星期一 · 你的资料与进展，都在这里。"
        extra={
          <Button icon={<PlusIcon />} onClick={() => create('task')}>
            记录一件事
          </Button>
        }
      />
      <Row gutter={[18, 18]} className="overview-stats">
        {[
          {
            title: '待办任务',
            value: pending.length,
            suffix: '项',
            icon: <ClockIcon />,
            note: `${urgent.length} 项需要优先关注`,
            color: '#fa8c16',
            go: 'tasks',
          },
          {
            title: '管理系统',
            value: systems.length,
            suffix: '个',
            icon: <StackIcon />,
            note: `${data.records.length} 条技术台账`,
            color: '#1677ff',
            go: 'ledger',
          },
          {
            title: '技术文档',
            value: data.documents.filter((d) => !d.deleted).length,
            suffix: '篇',
            icon: <FileTextIcon />,
            note: '记录经验，让解决方案可复用',
            color: '#13a8a8',
            go: 'documents',
          },
        ].map((s) => (
          <Col xs={24} md={8} key={s.title}>
            <Card size="small" className="overview-card" onClick={() => go(s.go)} hoverable>
              <Flex justify="space-between" align="start">
                <Statistic
                  title={s.title}
                  value={s.value}
                  suffix={<Typography.Text type="secondary">{s.suffix}</Typography.Text>}
                />
                <Avatar
                  shape="square"
                  style={{ background: `${s.color}12`, color: s.color }}
                  icon={s.icon}
                />
              </Flex>
              <Typography.Text type="secondary">{s.note}</Typography.Text>
            </Card>
          </Col>
        ))}
      </Row>
      <Row gutter={[22, 22]}>
        <Col xs={24} xl={15}>
          <Card
            title={
              <Space>
                待办工作
                <Badge count={pending.length} color="blue" />
              </Space>
            }
            extra={
              <Button type="link" size="small" onClick={() => go('tasks')}>
                全部任务
                <ArrowRightIcon />
              </Button>
            }
            className="todo-card"
          >
            <Input
              className="quick-task"
              aria-label="快速记录任务"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onPressEnter={add}
              prefix={<PlusIcon color="#1677ff" size={18} />}
              placeholder="记下一件事，回车即可保存"
              suffix={
                <Button type="text" size="small" disabled={!quick.trim()} onClick={add}>
                  ↵
                </Button>
              }
            />
            {pending.slice(0, 5).map((t) => (
              <div className="home-task" key={t.id}>
                <Checkbox
                  aria-label={`完成${t.title}`}
                  onChange={() =>
                    setData((s) => ({
                      ...s,
                      tasks: s.tasks.map((v) =>
                        v.id === t.id ? { ...v, done: true, completed: today } : v,
                      ),
                    }))
                  }
                />
                <div>
                  <Button type="text" onClick={() => go(`tasks/${t.id}`)}>
                    {t.title}
                  </Button>
                  <Space size={8} wrap>
                    <Typography.Text type="secondary">{systemName(t.system)}</Typography.Text>
                    {t.due && (
                      <Typography.Text type={t.due < today ? 'danger' : 'secondary'}>
                        <ClockIcon size={12} /> {t.due < today ? '已逾期 · ' : ''}
                        {t.due.slice(5)}
                      </Typography.Text>
                    )}
                    {t.tags.slice(0, 1).map((tag) => (
                      <Tag key={tag}>{tag}</Tag>
                    ))}
                  </Space>
                </div>
                <Button
                  type="text"
                  icon={<ArrowRightIcon />}
                  aria-label={`打开任务${t.title}`}
                  onClick={() => go(`tasks/${t.id}`)}
                />
              </div>
            ))}
            {pending.length === 0 && (
              <Empty description="所有任务都已完成" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>
          <Card
            className="recent-docs"
            title="最近更新的文档"
            extra={
              <Button type="link" size="small" onClick={() => go('documents')}>
                全部文档
                <ArrowRightIcon />
              </Button>
            }
          >
            {data.documents
              .filter((d) => !d.deleted)
              .slice(0, 3)
              .map((d) => (
                <div className="recent-document" key={d.id}>
                  <Avatar
                    shape="square"
                    icon={<FileTextIcon />}
                    style={{ background: '#1677ff0c', color: '#1677ff' }}
                  />
                  <div>
                    <Button type="text" onClick={() => go(`documents/${d.id}`)}>
                      {d.title}
                    </Button>
                    <Typography.Text type="secondary">
                      {systemName(d.system)} · {d.category}
                    </Typography.Text>
                  </div>
                  <Typography.Text type="secondary">
                    {d.updated.slice(5, 10).replace('-', ' 月 ')} 日
                  </Typography.Text>
                </div>
              ))}
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card
            title="常用入口"
            extra={
              <Button type="link" size="small" onClick={() => go('ledger')}>
                管理收藏
              </Button>
            }
          >
            <Flex vertical gap={6}>
              {data.records
                .filter((r) => data.favorites.includes(r.id))
                .map((r) => (
                  <div className="favorite-row" key={r.id}>
                    <Avatar shape="square" size={34} icon={<StackIcon />} className="blue-avatar" />
                    <div>
                      <Button
                        type="text"
                        onClick={() => go(`ledger/${r.category}/${r.system}/${r.id}`)}
                      >
                        {r.name}
                      </Button>
                      <Typography.Text type="secondary">{systemName(r.system)}</Typography.Text>
                    </div>
                    <Tooltip title="复制地址">
                      <Button
                        type="text"
                        aria-label={`复制收藏${r.name}`}
                        icon={<CopyIcon />}
                        onClick={() => void copy(r.address)}
                      />
                    </Tooltip>
                  </div>
                ))}
              {toolInfo
                .filter((t) => data.favorites.includes(`tool:${t.id}`))
                .map((t) => (
                  <div className="favorite-row" key={t.id}>
                    <Avatar
                      shape="square"
                      size={34}
                      icon={<WrenchIcon />}
                      className="cyan-avatar"
                    />
                    <div>
                      <Button type="text" onClick={() => go(`tools/${t.id}`)}>
                        {t.title}
                      </Button>
                      <Typography.Text type="secondary">{t.group}</Typography.Text>
                    </div>
                    <Button
                      type="text"
                      aria-label={`打开${t.title}`}
                      icon={<ArrowRightIcon />}
                      onClick={() => go(`tools/${t.id}`)}
                    />
                  </div>
                ))}
            </Flex>
            <Button
              block
              className="add-favorite"
              type="dashed"
              icon={<StarIcon />}
              onClick={() => go('tools')}
            >
              发现更多实用工具
            </Button>
          </Card>
          <Card title="我的系统" className="systems-card">
            {systems.map((s) => (
              <div className="system-row" key={s.id}>
                <Avatar shape="square" style={{ background: `${s.color}12`, color: s.color }}>
                  {s.short}
                </Avatar>
                <div>
                  <Button type="text" onClick={() => go(`ledger/access/${s.id}`)}>
                    {s.name}
                  </Button>
                  <Typography.Text type="secondary">{s.project}</Typography.Text>
                </div>
                <Button
                  type="text"
                  aria-label={`进入${s.name}`}
                  icon={<ArrowRightIcon />}
                  onClick={() => go(`ledger/access/${s.id}`)}
                />
              </div>
            ))}
          </Card>
          <div className="help-note">
            <BookOpenIcon size={21} />
            <div>
              <Typography.Text strong>把经验留在自己的工作空间</Typography.Text>
              <Typography.Paragraph type="secondary">
                从一次排障、一份配置或一个访问入口开始。
              </Typography.Paragraph>
              <Button type="link" size="small" onClick={() => help('快速开始')}>
                查看使用指引
                <ArrowRightIcon />
              </Button>
            </div>
          </div>
        </Col>
      </Row>
      <div className="page-footnote">
        <StatusDot>所有示例资料仅在当前预览中使用</StatusDot>
        <Typography.Text type="secondary">Clever Workbench · 个人技术工作台</Typography.Text>
      </div>
    </div>
  );
}
