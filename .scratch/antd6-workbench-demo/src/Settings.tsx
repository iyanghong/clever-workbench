import { useEffect, useState, type ReactNode } from 'react';
import {
  App,
  Alert,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  Descriptions,
  Divider,
  Flex,
  Form,
  Input,
  Modal,
  Progress,
  Radio,
  Result,
  Row,
  Segmented,
  Select,
  Space,
  Steps,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  Upload,
} from 'antd';
import {
  ArrowRightIcon,
  BookOpenIcon,
  CheckCircleIcon,
  DatabaseIcon,
  DesktopIcon,
  DownloadSimpleIcon,
  FolderOpenIcon,
  InfoIcon,
  LockKeyIcon,
  MoonIcon,
  ShieldCheckIcon,
  SquaresFourIcon,
  SunIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react';
import { initialData, today } from './data';
import { useDemo } from './store';
import { PageTitle, saveText } from './ui';

function SettingRow({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="setting-row">
      <div>
        <Typography.Text strong>{title}</Typography.Text>
        <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>
      </div>
      <div>{children}</div>
    </div>
  );
}

export function SettingsPage() {
  const { parts, go } = useDemo();
  const current = ['appearance', 'vault', 'backup', 'about', 'guidance'].includes(parts[1])
    ? parts[1]
    : 'appearance';
  return (
    <div className="page settings-page">
      <PageTitle title="设置" description="让工作空间适合你的习惯，也让资料始终可恢复。" />
      <Tabs
        activeKey={current}
        onChange={(key) => go(`settings/${key}`)}
        items={[
          { key: 'appearance', label: '外观', icon: <SunIcon />, children: <AppearanceSettings /> },
          { key: 'vault', label: '凭据保护', icon: <LockKeyIcon />, children: <VaultSettings /> },
          {
            key: 'backup',
            label: '备份与恢复',
            icon: <DatabaseIcon />,
            children: <BackupSettings />,
          },
          { key: 'about', label: '关于与更新', icon: <InfoIcon />, children: <AboutSettings /> },
          {
            key: 'guidance',
            label: '使用指引',
            icon: <BookOpenIcon />,
            children: <GuidanceSettings />,
          },
        ]}
      />
    </div>
  );
}

function AppearanceSettings() {
  const { preferences, setPreferences } = useDemo();
  return (
    <div className="settings-sections">
      <Card title="界面外观">
        <SettingRow title="界面主题" description="选择固定主题，或跟随系统外观。">
          <Segmented
            aria-label="界面主题"
            value={preferences.theme}
            onChange={(value) => setPreferences((p) => ({ ...p, theme: value as typeof p.theme }))}
            options={[
              { value: 'light', label: '浅色', icon: <SunIcon /> },
              { value: 'dark', label: '深色', icon: <MoonIcon /> },
              { value: 'system', label: '系统', icon: <DesktopIcon /> },
            ]}
          />
        </SettingRow>
        <SettingRow title="界面密度" description="在舒适阅读和紧凑信息之间选择。">
          <Radio.Group
            value={preferences.compact}
            onChange={(e) => setPreferences((p) => ({ ...p, compact: e.target.value }))}
            optionType="button"
            options={[
              { value: false, label: '标准' },
              { value: true, label: '紧凑' },
            ]}
          />
        </SettingRow>
        <SettingRow title="增强对比" description="加深次要文字与控件边框，让信息更清楚。">
          <Switch
            aria-label="增强对比"
            checked={preferences.contrast}
            onChange={(value) => setPreferences((p) => ({ ...p, contrast: value }))}
          />
        </SettingRow>
        <SettingRow title="减少动态效果" description="关闭组件过渡和动画，保留即时反馈。">
          <Switch
            aria-label="减少动态效果"
            checked={preferences.reduceMotion}
            onChange={(value) => setPreferences((p) => ({ ...p, reduceMotion: value }))}
          />
        </SettingRow>
        <SettingRow title="减少透明度" description="工作区使用稳定的实色表面。">
          <Switch
            aria-label="减少透明度"
            checked={preferences.reduceTransparency}
            onChange={(value) => setPreferences((p) => ({ ...p, reduceTransparency: value }))}
          />
        </SettingRow>
      </Card>
      <Card title="效果预览">
        <Row gutter={[20, 20]}>
          <Col xs={24} md={12}>
            <Typography.Title level={5}>工作空间中的统一控件</Typography.Title>
            <Typography.Paragraph type="secondary">
              按钮、表单、标签与列表保持一致的颜色和尺寸。
            </Typography.Paragraph>
            <Space wrap>
              <Button type="primary">主要操作</Button>
              <Button>次要操作</Button>
              <Tag color="success">已保存</Tag>
            </Space>
          </Col>
          <Col xs={24} md={12}>
            <Space orientation="vertical" style={{ width: '100%' }}>
              <Input aria-label="控件预览" placeholder="搜索名称或地址" />
              <Select
                aria-label="环境控件预览"
                defaultValue="production"
                style={{ width: '100%' }}
                options={[
                  { value: 'production', label: '生产环境' },
                  { value: 'test', label: '测试环境' },
                ]}
              />
              <Checkbox defaultChecked>显示辅助信息</Checkbox>
            </Space>
          </Col>
        </Row>
      </Card>
    </div>
  );
}

function VaultSettings() {
  const { locked, setLocked } = useDemo();
  const [mode, setMode] = useState('password'),
    [dialog, setDialog] = useState(''),
    [form] = Form.useForm();
  const { message, modal } = App.useApp();
  return (
    <div className="settings-sections">
      <Alert
        title="演示凭据保护流程"
        description="所有账号与密码都是示例。本页不操作系统钥匙串，也不执行真实密码加密。"
        type="info"
        showIcon
      />
      <Card title="凭据保护">
        <Flex align="center" gap={14} className="vault-status">
          <Avatar
            size={48}
            shape="square"
            className="blue-avatar"
            icon={<ShieldCheckIcon size={26} />}
          />
          <div>
            <Typography.Title level={5}>
              {mode === 'password' ? '应用主密码保护' : '系统账户加密保护'}
            </Typography.Title>
            <Typography.Text type="secondary">
              密码、Token 与私钥通过专门的凭据边界管理。
            </Typography.Text>
          </div>
          <Tag color={locked ? 'default' : 'success'} style={{ marginLeft: 'auto' }}>
            {locked ? '凭据已锁定' : '演示已解锁'}
          </Tag>
        </Flex>
        <SettingRow
          title="当前状态"
          description={
            locked
              ? '普通资料可以浏览，显示和复制凭据需要解锁。'
              : '演示凭据已解锁，可以查看固定的示例密码。'
          }
        >
          <Button
            icon={<LockKeyIcon />}
            onClick={() => {
              setLocked(!locked);
              message.success(locked ? '演示凭据已解锁' : '凭据已锁定');
            }}
          >
            {locked ? '解锁演示' : '立即锁定'}
          </Button>
        </SettingRow>
        <SettingRow title="应用主密码" description="按需启用主密码，和独立备份密码分别管理。">
          <Space>
            <Button
              onClick={() => {
                form.resetFields();
                setDialog(mode === 'password' ? '更改主密码' : '启用主密码');
              }}
            >
              {mode === 'password' ? '更改主密码' : '启用主密码'}
            </Button>
            {mode === 'password' && (
              <Button
                danger
                onClick={() =>
                  modal.confirm({
                    title: '演示关闭主密码？',
                    content: '正式应用会迁移到系统账户保护，本次只切换界面状态。',
                    onOk: () => {
                      setMode('system');
                      setLocked(true);
                    },
                  })
                }
              >
                关闭主密码
              </Button>
            )}
          </Space>
        </SettingRow>
        <SettingRow title="自动锁定" description="演示配置，切换只影响当前预览。">
          <Select
            defaultValue={15}
            style={{ width: 140 }}
            options={[
              { value: 5, label: '5 分钟' },
              { value: 15, label: '15 分钟' },
              { value: 30, label: '30 分钟' },
            ]}
          />
        </SettingRow>
      </Card>
      <Card title="保护范围">
        <Descriptions
          column={1}
          items={[
            { key: 1, label: '凭据', children: '密码、Token、私钥按专门接口保护。' },
            { key: 2, label: '普通资料', children: '系统台账、技术文档和本地图片与凭据分别管理。' },
            { key: 3, label: '完整备份', children: '使用生成时的独立备份密码，用于跨设备迁移。' },
          ]}
        />
      </Card>
      <Modal
        title={dialog}
        open={Boolean(dialog)}
        onCancel={() => setDialog('')}
        onOk={() =>
          void form
            .validateFields()
            .then(() => {
              setMode('password');
              setLocked(true);
              setDialog('');
              message.success('主密码设置流程演示完成');
            })
            .catch(() => {})
        }
        okText="确认演示设置"
        destroyOnHidden
      >
        <Alert type="warning" title="请勿输入真实密码" showIcon style={{ marginBottom: 20 }} />
        <Form form={form} layout="vertical">
          <Form.Item
            label="新演示密码"
            name="password"
            rules={[{ required: true, min: 6, message: '请输入至少 6 位演示密码' }]}
          >
            <Input.Password />
          </Form.Item>
          <Form.Item
            label="确认演示密码"
            name="confirm"
            dependencies={['password']}
            rules={[
              { required: true },
              ({ getFieldValue }) => ({
                validator: (_, value) =>
                  value === getFieldValue('password')
                    ? Promise.resolve()
                    : Promise.reject(Error('两次密码不一致')),
              }),
            ]}
          >
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}

function BackupSettings() {
  const { data } = useDemo();
  const [auto, setAuto] = useState(true),
    [passwordDialog, setPasswordDialog] = useState(false),
    [backupDialog, setBackupDialog] = useState(false),
    [restore, setRestore] = useState(-1),
    [backupDone, setBackupDone] = useState(false);
  const { message } = App.useApp();
  return (
    <div className="settings-sections">
      <Card title="备份设置">
        <SettingRow
          title="独立备份密码"
          description="完整备份使用生成时的独立密码，与本机主密码分别管理。"
        >
          <Space>
            <Tag color="success">演示已配置</Tag>
            <Button onClick={() => setPasswordDialog(true)}>更改备份密码</Button>
          </Space>
        </SettingRow>
        <SettingRow
          title="自动加密备份"
          description="正式应用有变更时每日备份一次，保留最近 7 份。"
        >
          <Switch aria-label="自动备份" checked={auto} onChange={setAuto} />
        </SettingRow>
        <SettingRow title="备份位置" description="~/Documents/Clever Workbench/Backups">
          <Button
            icon={<FolderOpenIcon />}
            onClick={() => message.info('本地目录选择为桌面能力，此处展示位置预览。')}
          >
            查看位置
          </Button>
        </SettingRow>
        <SettingRow
          title="最近备份"
          description={backupDone ? '刚刚完成演示备份流程' : '2026-11-16 08:30 · 自动备份'}
        >
          <Space>
            <Tag color="success">成功</Tag>
            <Button onClick={() => setBackupDialog(true)}>立即备份</Button>
          </Space>
        </SettingRow>
      </Card>
      <Card title="迁移与恢复">
        <Typography.Paragraph type="secondary">
          将项目、台账、账号、任务、文档和图片整体迁移到另一台设备。
        </Typography.Paragraph>
        <Space wrap>
          <Button
            type="primary"
            icon={<DownloadSimpleIcon />}
            onClick={() => setBackupDialog(true)}
          >
            导出完整备份
          </Button>
          <Button icon={<UploadSimpleIcon />} onClick={() => setRestore(0)}>
            从备份恢复
          </Button>
        </Space>
        <Alert
          style={{ marginTop: 22 }}
          title="本页为备份流程演示"
          description="可以下载 JSON 格式的演示资料快照；它没有加密，不能作为正式应用的恢复文件。"
          type="info"
          showIcon
        />
      </Card>
      <Card title="备份记录">
        <Table
          size="small"
          pagination={false}
          rowKey="name"
          scroll={{ x: 540 }}
          dataSource={[
            { name: '自动备份 · 11 月 16 日', time: '2026-11-16 08:30', size: '12.8 MB' },
            { name: '自动备份 · 11 月 15 日', time: '2026-11-15 08:30', size: '12.6 MB' },
            { name: '更新前备份', time: '2026-11-14 14:12', size: '12.4 MB' },
          ]}
          columns={[
            { title: '备份', dataIndex: 'name' },
            { title: '生成时间', dataIndex: 'time' },
            { title: '大小（示例）', dataIndex: 'size' },
            { title: '状态', render: () => <Tag color="success">可用</Tag> },
          ]}
        />
      </Card>
      <Modal
        title="更改独立备份密码"
        open={passwordDialog}
        onCancel={() => setPasswordDialog(false)}
        onOk={() => {
          setPasswordDialog(false);
          message.success('备份密码流程演示完成');
        }}
        okText="确认演示设置"
        destroyOnHidden
      >
        <Typography.Paragraph>
          旧备份继续使用各自生成时的密码。本次只展示设置流程，请勿输入真实密码。
        </Typography.Paragraph>
        <Form layout="vertical">
          <Form.Item label="新的演示备份密码">
            <Input.Password />
          </Form.Item>
          <Form.Item label="再次输入">
            <Input.Password />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title="导出演示备份资料"
        open={backupDialog}
        onCancel={() => setBackupDialog(false)}
        onOk={() => {
          saveText(
            'clever-workbench-demo-snapshot.json',
            JSON.stringify({ demo: true, encrypted: false, date: today, data }, null, 2),
            'application/json',
          );
          setBackupDone(true);
          setBackupDialog(false);
          message.success('未加密的演示快照已下载');
        }}
        okText="下载演示快照"
      >
        <Alert
          type="info"
          showIcon
          title="JSON 演示快照，不是加密备份"
          style={{ marginBottom: 18 }}
        />
        <Descriptions
          column={1}
          items={[
            { key: 1, label: '技术台账', children: `${data.records.length} 条` },
            { key: 2, label: '工作任务', children: `${data.tasks.length} 项` },
            { key: 3, label: '技术文档', children: `${data.documents.length} 篇` },
            { key: 4, label: '包含真实资料', children: '否，全部为演示样例' },
          ]}
        />
      </Modal>
      <Modal
        title="从备份恢复 · 流程演示"
        open={restore >= 0}
        onCancel={() => setRestore(-1)}
        footer={
          restore === 2 ? (
            <Button type="primary" onClick={() => setRestore(-1)}>
              完成
            </Button>
          ) : (
            <Space>
              <Button onClick={() => setRestore(-1)}>取消</Button>
              <Button type="primary" onClick={() => setRestore(restore + 1)}>
                {restore === 0 ? '演示校验备份' : '演示确认恢复'}
              </Button>
            </Space>
          )
        }
        width={640}
        destroyOnHidden
      >
        <Steps
          size="small"
          current={restore}
          items={[{ title: '选择与校验' }, { title: '确认资料' }, { title: '完成' }]}
          style={{ margin: '20px 0 28px' }}
        />
        {restore === 0 ? (
          <Form layout="vertical">
            <Upload beforeUpload={() => false} maxCount={1}>
              <Button icon={<UploadSimpleIcon />}>选择示例备份文件</Button>
            </Upload>
            <Form.Item label="该文件的备份密码" style={{ marginTop: 20 }}>
              <Input.Password placeholder="演示密码，无需真实校验" />
            </Form.Item>
            <Alert title="也可以不选择文件，直接体验演示流程。" type="info" />
          </Form>
        ) : restore === 1 ? (
          <>
            <Alert
              title="示例备份校验结果"
              description="此处展示正式恢复前的确认信息，不执行解密或修改当前资料。"
              type="info"
              showIcon
              style={{ marginBottom: 18 }}
            />
            <Descriptions
              column={1}
              items={[
                { key: 1, label: '生成时间', children: '2026-11-15 08:30' },
                { key: 2, label: '备份版本', children: 'v0.1.23 · 示例' },
                { key: 3, label: '包含资料', children: '3 个系统、25 条台账、9 项任务、5 篇文档' },
                {
                  key: 4,
                  label: '恢复保护',
                  children: '正式应用会先保留当前资料副本，再切换资料代次。',
                },
              ]}
            />
          </>
        ) : (
          <Result
            status="success"
            title="恢复流程演示完成"
            subTitle="当前示例资料保持原样，未执行真实恢复。"
          />
        )}
      </Modal>
    </div>
  );
}

function AboutSettings() {
  const [update, setUpdate] = useState<'idle' | 'available' | 'downloading' | 'ready'>('idle'),
    [progress, setProgress] = useState(0);
  const { help } = useDemo(),
    { message, modal } = App.useApp();
  useEffect(() => {
    if (update !== 'downloading') return;
    const timer = setInterval(() => setProgress((p) => Math.min(100, p + 20)), 240);
    return () => clearInterval(timer);
  }, [update]);
  useEffect(() => {
    if (progress === 100) setUpdate('ready');
  }, [progress]);
  return (
    <div className="settings-sections">
      <Card>
        <Flex gap={20} align="center">
          <Avatar
            shape="square"
            size={64}
            style={{ background: '#1677ff' }}
            icon={<SquaresFourIcon size={42} weight="fill" />}
          />
          <div>
            <Typography.Title level={3}>Clever Workbench</Typography.Title>
            <Space>
              <Typography.Text type="secondary">版本 0.1.23</Typography.Text>
              <Tag color="blue">Ant Design 6 Demo</Tag>
            </Space>
            <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
              面向技术负责人的个人本地工作台。
            </Typography.Paragraph>
          </div>
        </Flex>
        <Divider />
        <SettingRow
          title="检查更新"
          description="演示手动检查、下载和待安装状态，不访问真实更新服务。"
        >
          <Button
            onClick={() => {
              setUpdate('available');
              setProgress(0);
              message.success('演示检查完成');
            }}
          >
            检查更新
          </Button>
        </SettingRow>
        {update !== 'idle' && (
          <Card
            size="small"
            title={
              <Space>
                新版本 0.1.24<Tag color="processing">演示版本</Tag>
              </Space>
            }
          >
            <Typography.Paragraph>
              本次更新优化了资料查找、台账展示和任务操作反馈。
            </Typography.Paragraph>
            <ul>
              <li>统一表单、表格与浮层控件。</li>
              <li>改善窄窗口与深色主题的可读性。</li>
              <li>保留自动保存和资料恢复边界。</li>
            </ul>
            {update === 'downloading' && (
              <Progress percent={progress} size="small" format={(p) => `演示进度 ${p}%`} />
            )}
            <Space>
              <Button
                type="primary"
                disabled={update === 'downloading'}
                onClick={() =>
                  update === 'ready'
                    ? modal.info({
                        title: '安装流程演示',
                        content:
                          '正式应用会保存编辑、创建备份、退出并安装新版本。本 Demo 不执行安装。',
                      })
                    : setUpdate('downloading')
                }
              >
                {update === 'ready'
                  ? '演示安装流程'
                  : update === 'downloading'
                    ? '演示下载中'
                    : '演示下载更新'}
              </Button>
              <Button onClick={() => help('版本更新')}>版本操作指引</Button>
            </Space>
          </Card>
        )}
      </Card>
      <Card title="这份 Demo 覆盖了什么">
        <Descriptions
          column={1}
          items={[
            {
              key: 1,
              label: '页面',
              children:
                '工作台、技术台账、工作任务、技术文档、内置工具、工作回顾、项目档案、回收站、设置。',
            },
            {
              key: 2,
              label: '台账',
              children:
                '访问入口、账号、服务器、数据库与中间件、应用部署、运行维护、关联文档，以及系统与环境配置。',
            },
            {
              key: 3,
              label: '工具',
              children: 'ZIP 文本归档、配置对比、数据格式、时间与 Cron、批量文本、表格数据转换。',
            },
            {
              key: 4,
              label: '组件',
              children:
                'Ant Design 6.7.0：Layout、Menu、Table、Form、Input、Select、DatePicker、Tabs、Modal、Drawer、Card、Tree、Steps、Calendar 等。',
            },
            {
              key: 5,
              label: '资料',
              children:
                '全部使用虚构样例，刷新页面后重置。真实备份、安装更新和 ZIP 原生能力采用流程演示。',
            },
          ]}
        />
      </Card>
    </div>
  );
}

function GuidanceSettings() {
  const { help } = useDemo();
  const groups = [
    { title: '开始使用', guides: ['快速开始', '工作台与收藏', '全局搜索与快捷新建'] },
    {
      title: '日常工作',
      guides: ['系统与环境', '台账录入与复制', '工作任务', '技术文档', '工作回顾'],
    },
    { title: '维护与迁移', guides: ['凭据保护', '独立备份密码', '完整备份与恢复', '应用更新'] },
    {
      title: '本地工具',
      guides: [
        'ZIP 文本归档',
        '配置对比',
        '数据格式助手',
        '时间与 Cron',
        '批量文本处理',
        '表格数据转换',
      ],
    },
  ];
  return (
    <div className="settings-sections">
      <Alert showIcon title="操作指引随应用提供，离线也可以查阅。" type="info" />
      <Row gutter={[18, 18]}>
        {groups.map((g) => (
          <Col xs={24} lg={12} key={g.title}>
            <Card title={g.title}>
              {g.guides.map((guide) => (
                <Button
                  key={guide}
                  type="text"
                  block
                  className="guide-link"
                  icon={<BookOpenIcon />}
                  onClick={() => help(guide)}
                >
                  {guide}
                  <ArrowRightIcon />
                </Button>
              ))}
            </Card>
          </Col>
        ))}
      </Row>
    </div>
  );
}
