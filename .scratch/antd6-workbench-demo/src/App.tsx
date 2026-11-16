import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  App,
  Avatar,
  Badge,
  Breadcrumb,
  Button,
  ConfigProvider,
  Descriptions,
  Divider,
  Dropdown,
  Empty,
  Flex,
  Form,
  Input,
  Layout,
  Menu,
  Modal,
  Select,
  Space,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import {
  ArchiveIcon,
  ArrowRightIcon,
  BookOpenIcon,
  CaretDownIcon,
  ChartBarHorizontalIcon,
  CheckCircleIcon,
  CommandIcon,
  DesktopIcon,
  FileTextIcon,
  FolderIcon,
  GearSixIcon,
  InfoIcon,
  LockKeyIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  PlusIcon,
  SidebarSimpleIcon,
  SquaresFourIcon,
  StackIcon,
  SunIcon,
  TrashIcon,
  TrayIcon,
  WrenchIcon,
  XIcon,
} from '@phosphor-icons/react';
import {
  categories,
  initialData,
  systemName,
  systemOptions,
  systems,
  toolInfo,
  today,
  type Category,
  type DemoData,
} from './data';
import { DemoContext, type Preferences } from './store';
import { LedgerPage } from './Ledger';
import { HomePage, TasksPage, DocumentsPage, ReviewPage, ArchivePage, TrashPage } from './Work';
import { ToolsPage } from './Tools';
import { SettingsPage } from './Settings';

const navigation = [
  { key: 'home', label: '工作台', icon: <SquaresFourIcon /> },
  { key: 'ledger', label: '技术台账', icon: <StackIcon /> },
  { key: 'tasks', label: '工作任务', icon: <TrayIcon /> },
  { key: 'documents', label: '技术文档', icon: <FileTextIcon /> },
  { key: 'tools', label: '内置工具', icon: <WrenchIcon /> },
  { key: 'review', label: '工作回顾', icon: <ChartBarHorizontalIcon /> },
];
const utilities = [
  { key: 'archive', label: '项目档案', icon: <ArchiveIcon /> },
  { key: 'trash', label: '回收站', icon: <TrashIcon /> },
  { key: 'settings', label: '设置', icon: <GearSixIcon /> },
];
const createItems = [
  { key: 'task', label: '新任务', icon: <TrayIcon /> },
  { key: 'document', label: '新文档', icon: <FileTextIcon /> },
  { type: 'divider' as const },
  ...categories
    .filter((c) => c.key !== 'documents')
    .map((c) => ({ key: c.key, label: `新${c.singular}`, icon: <StackIcon /> })),
  { type: 'divider' as const },
  { key: 'system', label: '新系统', icon: <FolderIcon /> },
  { key: 'project', label: '新项目', icon: <ArchiveIcon /> },
];

export function Workbench({
  preferences,
  setPreferences,
  dark,
}: {
  preferences: Preferences;
  setPreferences: Dispatch<SetStateAction<Preferences>>;
  dark: boolean;
}) {
  const [data, setData] = useState<DemoData>(() => structuredClone(initialData));
  const [path, setPath] = useState(location.hash.slice(2) || 'home');
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false),
    [query, setQuery] = useState('');
  const [createKind, setCreateKind] = useState(''),
    [createSystem, setCreateSystem] = useState('orders');
  const [helpTopic, setHelpTopic] = useState(''),
    [previewInfo, setPreviewInfo] = useState(false);
  const [locked, setLocked] = useState(true),
    [unlock, setUnlock] = useState(false);
  const [form] = Form.useForm();
  const { message, modal } = App.useApp(),
    { token } = theme.useToken();
  const parts = path.split('/'),
    page = parts[0];
  const go = (next: string) => {
    location.hash = `/${next}`;
    setSearchOpen(false);
  };
  const create = (kind: string, system = 'orders') => {
    form.resetFields();
    setCreateSystem(system);
    setCreateKind(kind);
  };
  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      message.success('已复制');
    } catch {
      modal.info({
        title: '请手动复制',
        content: <Input.TextArea value={value} readOnly autoSize />,
      });
    }
  };
  useEffect(() => {
    const changed = () => setPath(location.hash.slice(2) || 'home');
    window.addEventListener('hashchange', changed);
    return () => window.removeEventListener('hashchange', changed);
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  }, []);
  const submitCreate = async () => {
    const values = await form.validateFields();
    const id = crypto.randomUUID(),
      stamp = `${today} 10:30`,
      system = values.system || '';
    if (createKind === 'task') {
      setData((s) => ({
        ...s,
        tasks: [
          {
            id,
            title: values.name,
            system,
            tags: values.tags ?? [],
            due: '',
            started: today,
            completed: '',
            done: false,
            deleted: false,
            content: values.notes || '## 处理记录\n\n',
          },
          ...s.tasks,
        ],
      }));
      go(`tasks/${id}`);
    } else if (createKind === 'document') {
      setData((s) => ({
        ...s,
        documents: [
          {
            id,
            title: values.name,
            system,
            category: '未分类',
            updated: stamp,
            markdown: `# ${values.name}\n\n${values.notes ?? ''}`,
            deleted: false,
          },
          ...s.documents,
        ],
      }));
      go(`documents/${id}`);
    } else if (createKind === 'project') {
      setData((s) => ({
        ...s,
        projects: [
          {
            id,
            name: values.name,
            period: '2026.11 — 至今',
            systems: system ? [system] : [],
            archived: false,
            notes: values.notes || '',
          },
          ...s.projects,
        ],
      }));
      go('archive');
    } else if (createKind === 'system') {
      systems.push({
        id,
        name: values.name,
        short: values.name.slice(0, 1),
        color: '#1677ff',
        project: '未关联项目',
        notes: values.notes || '',
      });
      systemOptions.push({ value: id, label: values.name });
      go(`ledger/access/${id}`);
    } else {
      setData((s) => ({
        ...s,
        records: [
          {
            id,
            category: createKind as Category,
            system,
            name: values.name,
            address: values.address || '',
            product: values.product || '',
            username: values.username || '',
            notes: values.notes || '',
            env: values.env || [],
            tags: values.tags || [],
            status: '在用',
            updated: stamp,
          },
          ...s.records,
        ],
      }));
      go(`ledger/${createKind}/${system}`);
    }
    setCreateKind('');
    message.success('已添加到本次演示');
  };
  const searchResults = [
    ...systems.map((s) => ({
      title: s.name,
      sub: '系统',
      path: `ledger/access/${s.id}`,
      icon: <StackIcon />,
    })),
    ...data.records.map((r) => ({
      title: r.name,
      sub: `${systemName(r.system)} · ${categories.find((c) => c.key === r.category)?.label}`,
      path: `ledger/${r.category}/${r.system}/${r.id}`,
      icon: <StackIcon />,
    })),
    ...data.tasks
      .filter((t) => !t.deleted)
      .map((t) => ({
        title: t.title,
        sub: `工作任务 · ${systemName(t.system)}`,
        path: `tasks/${t.id}`,
        icon: <TrayIcon />,
      })),
    ...data.documents
      .filter((d) => !d.deleted)
      .map((d) => ({
        title: d.title,
        sub: `技术文档 · ${systemName(d.system)}`,
        path: `documents/${d.id}`,
        icon: <FileTextIcon />,
      })),
    ...toolInfo.map((t) => ({
      title: t.title,
      sub: `工具 · ${t.group}`,
      path: `tools/${t.id}`,
      icon: <WrenchIcon />,
    })),
  ]
    .filter((r) => `${r.title}${r.sub}`.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 12);
  const currentNav = [...navigation, ...utilities].find((n) => n.key === page);
  const kindLabel =
    createKind === 'task'
      ? '任务'
      : createKind === 'document'
        ? '文档'
        : createKind === 'system'
          ? '系统'
          : createKind === 'project'
            ? '项目'
            : (categories.find((c) => c.key === createKind)?.singular ?? '资料');
  const content =
    page === 'ledger' ? (
      <LedgerPage />
    ) : page === 'tasks' ? (
      <TasksPage />
    ) : page === 'documents' ? (
      <DocumentsPage />
    ) : page === 'review' ? (
      <ReviewPage />
    ) : page === 'tools' ? (
      <ToolsPage />
    ) : page === 'settings' ? (
      <SettingsPage />
    ) : page === 'archive' ? (
      <ArchivePage />
    ) : page === 'trash' ? (
      <TrashPage />
    ) : (
      <HomePage />
    );
  return (
    <DemoContext.Provider
      value={{
        data,
        setData,
        parts,
        go,
        create,
        help: (topic = '快速开始') => setHelpTopic(topic),
        copy,
        locked,
        setLocked,
        preferences,
        setPreferences,
      }}
    >
      <div
        className={`workbench ${dark ? 'dark' : ''} ${preferences.reduceMotion ? 'reduce-motion' : ''}`}
        style={
          {
            '--demo-border': token.colorBorderSecondary,
            '--demo-bg': token.colorBgLayout,
            '--demo-panel': token.colorBgContainer,
            '--demo-text': token.colorText,
            '--demo-muted': token.colorTextSecondary,
            '--demo-hover': token.colorFillQuaternary,
            '--demo-primary': token.colorPrimary,
            '--demo-selected': token.controlItemBgActive,
          } as React.CSSProperties
        }
      >
        <Layout className="app-layout">
          <Layout.Sider
            width={214}
            collapsedWidth={68}
            breakpoint="lg"
            onBreakpoint={setCollapsed}
            collapsed={collapsed}
            className="app-sidebar"
            theme={dark ? 'dark' : 'light'}
          >
            <div className="brand">
              <Avatar
                shape="square"
                size={34}
                style={{ background: token.colorPrimary }}
                icon={<SquaresFourIcon weight="fill" size={23} />}
              />
              {!collapsed && (
                <div>
                  <strong>Clever Workbench</strong>
                  <Typography.Text type="secondary">个人技术工作台</Typography.Text>
                </div>
              )}
            </div>
            {!collapsed && <div className="nav-section-label">工作空间</div>}
            <Menu
              mode="inline"
              selectedKeys={[page]}
              items={navigation}
              onClick={(e) => go(e.key)}
            />
            <div className="sidebar-bottom">
              <Tooltip title={locked ? '解锁演示凭据' : '锁定凭据'}>
                <Button
                  type="text"
                  block
                  icon={<LockKeyIcon />}
                  onClick={() => (locked ? setUnlock(true) : setLocked(true))}
                >
                  {!collapsed && (locked ? '凭据已锁定' : '凭据已解锁')}
                </Button>
              </Tooltip>
              {!collapsed && (
                <div className="local-status">
                  <Badge status="success" text="本地工作空间" />
                  <Typography.Text type="secondary">离线可用</Typography.Text>
                </div>
              )}
              <Divider style={{ margin: '10px 0' }} />
              <Menu
                mode="inline"
                selectedKeys={[page]}
                items={utilities}
                onClick={(e) => go(e.key)}
              />
              {!collapsed && (
                <Button
                  className="demo-label"
                  type="text"
                  size="small"
                  icon={<InfoIcon />}
                  onClick={() => setPreviewInfo(true)}
                >
                  Ant Design 6 · 交互演示
                </Button>
              )}
            </div>
          </Layout.Sider>
          <Layout className="workspace-layout">
            <Layout.Header className="global-header">
              <Flex align="center" gap={8} className="global-header-start">
                <Button
                  type="text"
                  aria-label="收起或展开导航"
                  icon={<SidebarSimpleIcon size={19} />}
                  onClick={() => setCollapsed(!collapsed)}
                />
                <Button
                  className="global-search"
                  onClick={() => {
                    setQuery('');
                    setSearchOpen(true);
                  }}
                  icon={<MagnifyingGlassIcon size={17} />}
                >
                  <span>搜索系统、资料、任务与文档</span>
                  <kbd>⌘ K</kbd>
                </Button>
              </Flex>
              <Space size={8}>
                <Tooltip title={dark ? '切换浅色' : '切换深色'}>
                  <Button
                    type="text"
                    aria-label="切换主题"
                    icon={dark ? <SunIcon size={19} /> : <MoonIcon size={19} />}
                    onClick={() =>
                      setPreferences((p) => ({ ...p, theme: dark ? 'light' : 'dark' }))
                    }
                  />
                </Tooltip>
                <Button
                  type="text"
                  className="header-help"
                  icon={<BookOpenIcon />}
                  onClick={() => setHelpTopic('快速开始')}
                >
                  使用指引
                </Button>
                <Dropdown
                  menu={{ items: createItems, onClick: (e) => create(e.key) }}
                  trigger={['click']}
                >
                  <Button type="primary" icon={<PlusIcon />}>
                    新建
                    <CaretDownIcon size={12} />
                  </Button>
                </Dropdown>
              </Space>
            </Layout.Header>
            <div className="location-bar">
              <Breadcrumb
                items={[
                  {
                    title: (
                      <Space size={6}>
                        {currentNav?.icon}
                        <span>个人工作空间</span>
                      </Space>
                    ),
                  },
                  { title: currentNav?.label ?? '工作台' },
                  ...(parts[1] && page === 'tools'
                    ? [{ title: toolInfo.find((t) => t.id === parts[1])?.title ?? '' }]
                    : []),
                ]}
              />
              <Tag color="default" variant="filled">
                示例资料
              </Tag>
            </div>
            <Layout.Content className="workspace-content" key={page}>
              {content}
            </Layout.Content>
          </Layout>
        </Layout>
        <Modal
          title="搜索工作空间"
          open={searchOpen}
          onCancel={() => setSearchOpen(false)}
          footer={null}
          width={640}
          destroyOnHidden
        >
          <Input
            autoFocus
            size="large"
            prefix={<MagnifyingGlassIcon />}
            placeholder="输入名称、系统或关键词"
            aria-label="全局搜索"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            allowClear
          />
          <div className="search-results">
            {searchResults.length ? (
              searchResults.map((r, i) => (
                <Button
                  type="text"
                  block
                  className="search-result"
                  key={`${r.path}-${i}`}
                  onClick={() => go(r.path)}
                >
                  <Avatar shape="square" size={32} icon={r.icon} />
                  <div>
                    <strong>{r.title}</strong>
                    <Typography.Text type="secondary">{r.sub}</Typography.Text>
                  </div>
                  <ArrowRightIcon />
                </Button>
              ))
            ) : (
              <Empty description="没有找到相关资料" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </div>
          <Typography.Text type="secondary">搜索当前演示资料 · 按 Esc 关闭</Typography.Text>
        </Modal>
        <Modal
          title={`新建${kindLabel}`}
          open={Boolean(createKind)}
          onCancel={() => setCreateKind('')}
          onOk={() => void submitCreate().catch(() => {})}
          okText={`创建${kindLabel}`}
          destroyOnHidden
        >
          <Form
            form={form}
            layout="vertical"
            initialValues={{ system: createSystem, env: ['生产'], tags: [] }}
            key={`${createKind}-${createSystem}`}
          >
            <Form.Item
              label={`${kindLabel}名称`}
              name="name"
              rules={[{ required: true, whitespace: true, message: `请填写${kindLabel}名称` }]}
            >
              <Input autoFocus placeholder={`为${kindLabel}起个名字`} />
            </Form.Item>
            {!['system'].includes(createKind) && (
              <Form.Item label={createKind === 'project' ? '关联系统' : '所属系统'} name="system">
                <Select allowClear placeholder="暂不关联" options={systemOptions} />
              </Form.Item>
            )}
            {categories.some((c) => c.key === createKind) && (
              <>
                <Form.Item label="适用环境" name="env">
                  <Select
                    mode="multiple"
                    options={['生产', '测试', '开发', '通用'].map((value) => ({ value }))}
                  />
                </Form.Item>
                <Form.Item
                  label={createKind === 'operations' ? '执行计划 / 地址' : '地址 / 连接信息'}
                  name="address"
                >
                  <Input placeholder={createKind === 'servers' ? '例如 10.24.16.21' : '按需填写'} />
                </Form.Item>
                <Flex gap={16}>
                  <Form.Item label="类型 / 产品" name="product" style={{ flex: 1 }}>
                    <Input placeholder="可选" />
                  </Form.Item>
                  <Form.Item label="关联账号" name="username" style={{ flex: 1 }}>
                    <Input placeholder="可选" />
                  </Form.Item>
                </Flex>
                {createKind === 'accounts' && (
                  <Form.Item
                    label="演示密码"
                    name="password"
                    extra="仅使用示例凭据，本 Demo 不进行真实加密存储。"
                  >
                    <Input.Password placeholder="可选" />
                  </Form.Item>
                )}
              </>
            )}
            {createKind === 'task' && (
              <Form.Item label="标签" name="tags">
                <Select
                  mode="tags"
                  options={['本周', '发布', '排障', '联调'].map((value) => ({ value }))}
                />
              </Form.Item>
            )}
            <Form.Item label="说明" name="notes">
              <Input.TextArea rows={3} placeholder="其他信息可以之后补充" />
            </Form.Item>
            <Typography.Text type="secondary">
              名称即可起步。资料仅保留在本次演示中。
            </Typography.Text>
          </Form>
        </Modal>
        <Modal
          title="解锁演示凭据"
          open={unlock}
          onCancel={() => setUnlock(false)}
          onOk={() => {
            setLocked(false);
            setUnlock(false);
            message.success('演示凭据已解锁');
          }}
          okText="解锁演示"
          destroyOnHidden
        >
          <Typography.Paragraph>
            这里展示凭据保护的交互。所有账号和密码都是示例，请勿输入真实密码。
          </Typography.Paragraph>
          <Input.Password aria-label="演示解锁密码" placeholder="任意演示密码，无需真实验证" />
        </Modal>
        <Modal
          title={`${helpTopic} · 使用指引`}
          open={Boolean(helpTopic)}
          onCancel={() => setHelpTopic('')}
          footer={
            <Button type="primary" onClick={() => setHelpTopic('')}>
              知道了
            </Button>
          }
          width={620}
        >
          <Space orientation="vertical" size={20} style={{ width: '100%' }}>
            <Typography.Paragraph>
              从当前对象出发完成记录、查找和整理，让资料在需要时触手可及。
            </Typography.Paragraph>
            <Descriptions
              column={1}
              items={[
                {
                  key: 1,
                  label: '查找资料',
                  children: '使用左侧导航进入模块，或按 ⌘ / Ctrl + K 搜索整个工作空间。',
                },
                {
                  key: 2,
                  label: '快速记录',
                  children: '点击新建，填写名称即可开始；系统与环境按需补充。',
                },
                {
                  key: 3,
                  label: '编辑与保存',
                  children: '打开详情直接编辑。本演示中的修改保存在内存，刷新会重置。',
                },
                {
                  key: 4,
                  label: '复制与导出',
                  children: '表格操作就近放置。演示凭据需先解锁，导出为示例资料。',
                },
              ]}
            />
            <Tag color="blue">覆盖工作台、台账、任务、文档、工具与维护流程</Tag>
          </Space>
        </Modal>
        <Modal
          title="Ant Design 6 全页面演示"
          open={previewInfo}
          onCancel={() => setPreviewInfo(false)}
          footer={
            <Button type="primary" onClick={() => setPreviewInfo(false)}>
              开始体验
            </Button>
          }
        >
          <Typography.Paragraph>
            这是一套独立的 UI Demo，展示全部模块的统一控件、页面布局和主要交互。
          </Typography.Paragraph>
          <Typography.Paragraph>
            使用模拟资料，修改仅在当前页面会话中生效，刷新恢复初始状态。文本、JSON、配置对比、时间与表格转换使用项目现有逻辑；ZIP、真实加密备份、安装更新为流程演示。
          </Typography.Paragraph>
          <Button
            icon={<ArrowRightIcon />}
            onClick={() => {
              setPreviewInfo(false);
              go('settings/about');
            }}
          >
            查看页面覆盖与组件说明
          </Button>
        </Modal>
      </div>
    </DemoContext.Provider>
  );
}
