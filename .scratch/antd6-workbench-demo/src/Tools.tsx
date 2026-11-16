import { useEffect, useState, type ReactNode } from 'react';
import {
  Alert,
  App,
  Avatar,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Divider,
  Flex,
  Form,
  Input,
  InputNumber,
  Radio,
  Row,
  Segmented,
  Select,
  Space,
  Steps,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  Upload,
} from 'antd';
import {
  ArchiveIcon,
  ArrowLeftIcon,
  ArrowRightIcon,
  BracketsCurlyIcon,
  CheckCircleIcon,
  ClockIcon,
  CopyIcon,
  DownloadSimpleIcon,
  FileArrowUpIcon,
  FileTextIcon,
  FolderOpenIcon,
  GitBranchIcon,
  GitDiffIcon,
  PlayIcon,
  PlusIcon,
  StarIcon,
  TableIcon,
  TextTIcon,
  UploadSimpleIcon,
} from '@phosphor-icons/react';
import {
  compareConfigurations,
  type DiffMode,
  type DiffResult,
} from '../../../tools/config-diff/logic';
import { processJson, type JsonOperation } from '../../../tools/data-format/logic';
import { describeCron, formatDateInput, nextCronRuns } from '../../../tools/time-cron/logic';
import {
  defaultTextOptions,
  transformText,
  type TextOperation,
} from '../../../tools/text-transform/logic';
import { convertTable, type Delimiter, type TableDirection } from '../../../tools/table-data/logic';
import { today, toolInfo } from './data';
import { useDemo } from './store';
import { PageTitle, saveText, StatusDot } from './ui';

const toolIcons: Record<string, ReactNode> = {
  'zip-text': <ArchiveIcon />,
  'config-diff': <GitDiffIcon />,
  'data-format': <BracketsCurlyIcon />,
  'time-cron': <ClockIcon />,
  'text-transform': <TextTIcon />,
  'table-data': <TableIcon />,
};

export function ToolsPage() {
  const { data, setData, parts, go, help } = useDemo();
  const [query, setQuery] = useState(''),
    [group, setGroup] = useState('全部工具');
  const tool = toolInfo.find((t) => t.id === parts[1]);
  const toggleFavorite = (id: string) =>
    setData((s) => ({
      ...s,
      favorites: s.favorites.includes(`tool:${id}`)
        ? s.favorites.filter((f) => f !== `tool:${id}`)
        : [...s.favorites, `tool:${id}`],
    }));
  if (tool)
    return (
      <div className="page tool-page">
        <Button
          type="text"
          className="back-button"
          icon={<ArrowLeftIcon />}
          onClick={() => go('tools')}
        >
          全部工具
        </Button>
        <PageTitle
          title={tool.title}
          description={tool.description}
          extra={
            <>
              <Button
                icon={
                  <StarIcon
                    weight={data.favorites.includes(`tool:${tool.id}`) ? 'fill' : 'regular'}
                  />
                }
                onClick={() => toggleFavorite(tool.id)}
              >
                {data.favorites.includes(`tool:${tool.id}`) ? '已收藏' : '收藏到工作台'}
              </Button>
              <Button onClick={() => help(tool.title)}>使用指引</Button>
            </>
          }
        />
        <div key={tool.id}>
          {tool.id === 'config-diff' ? (
            <DiffTool />
          ) : tool.id === 'data-format' ? (
            <JsonTool />
          ) : tool.id === 'time-cron' ? (
            <TimeTool />
          ) : tool.id === 'text-transform' ? (
            <TextTool />
          ) : tool.id === 'table-data' ? (
            <TableTool />
          ) : (
            <ZipTool />
          )}
        </div>
      </div>
    );
  const visible = toolInfo.filter(
    (t) =>
      (group === '全部工具' || t.group === group) && `${t.title}${t.description}`.includes(query),
  );
  return (
    <div className="page">
      <PageTitle
        title="内置工具"
        description="常用操作，就在手边。所有处理都在本地完成。"
        count={toolInfo.length}
        extra={
          <Input.Search
            aria-label="搜索工具"
            placeholder="搜索工具"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            allowClear
            style={{ width: 260 }}
          />
        }
      />
      <Segmented
        aria-label="工具分类"
        value={group}
        onChange={setGroup}
        options={['全部工具', '开发调试', '文件处理', '内容处理']}
        style={{ marginBottom: 24 }}
      />
      <Row gutter={[20, 20]}>
        {visible.map((t) => (
          <Col xs={24} md={12} xl={8} key={t.id}>
            <Card className="tool-directory-card">
              <Flex align="start" justify="space-between">
                <Avatar
                  size={43}
                  shape="square"
                  className={`tool-icon ${t.color}`}
                  icon={toolIcons[t.id]}
                />
                <Tooltip
                  title={data.favorites.includes(`tool:${t.id}`) ? '取消收藏' : '收藏到工作台'}
                >
                  <Button
                    type="text"
                    aria-label={`收藏${t.title}`}
                    icon={
                      <StarIcon
                        weight={data.favorites.includes(`tool:${t.id}`) ? 'fill' : 'regular'}
                        color={data.favorites.includes(`tool:${t.id}`) ? '#faad14' : undefined}
                      />
                    }
                    onClick={() => toggleFavorite(t.id)}
                  />
                </Tooltip>
              </Flex>
              <Typography.Title level={5}>{t.title}</Typography.Title>
              <Typography.Paragraph type="secondary">{t.description}</Typography.Paragraph>
              <Flex justify="space-between" align="center">
                <Tag variant="filled">{t.group}</Tag>
                <Button type="link" onClick={() => go(`tools/${t.id}`)}>
                  打开工具
                  <ArrowRightIcon />
                </Button>
              </Flex>
            </Card>
          </Col>
        ))}
      </Row>
      <div className="page-footnote">
        <StatusDot>资料处理留在本地</StatusDot>
        <Typography.Text type="secondary">点击星标，将工具加入工作台。</Typography.Text>
      </div>
    </div>
  );
}

function TextPanels({
  source,
  setSource,
  output,
  sourceTitle = '原始内容',
  outputTitle = '处理结果',
}: {
  source: string;
  setSource: (value: string) => void;
  output: string;
  sourceTitle?: string;
  outputTitle?: string;
}) {
  const { copy } = useDemo(),
    { message } = App.useApp();
  return (
    <Row gutter={[18, 18]} className="text-panels">
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={sourceTitle}
          extra={
            <Upload
              showUploadList={false}
              accept=".txt,.json,.csv,.tsv,.env,.yaml,.yml,.md"
              beforeUpload={async (file) => {
                if (file.size > 2 * 1024 * 1024) {
                  message.error('演示工具单次最多读取 2 MB 文本');
                  return Upload.LIST_IGNORE;
                }
                setSource(await file.text());
                return false;
              }}
            >
              <Button type="text" size="small" icon={<FileArrowUpIcon />}>
                读取文本
              </Button>
            </Upload>
          }
        >
          <Input.TextArea
            aria-label={sourceTitle}
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="tool-textarea"
            rows={17}
            spellCheck={false}
          />
          <Flex justify="space-between" style={{ marginTop: 12 }}>
            <Typography.Text type="secondary">
              {source.split('\n').length} 行 · {source.length} 字符
            </Typography.Text>
            <Button type="text" size="small" onClick={() => setSource('')}>
              清空
            </Button>
          </Flex>
        </Card>
      </Col>
      <Col xs={24} lg={12}>
        <Card
          size="small"
          title={outputTitle}
          extra={
            <Space size={0}>
              <Button
                type="text"
                size="small"
                icon={<CopyIcon />}
                onClick={() => void copy(output)}
                disabled={!output}
              >
                复制
              </Button>
              <Button
                type="text"
                size="small"
                aria-label="下载处理结果"
                icon={<DownloadSimpleIcon />}
                onClick={() => saveText('处理结果.txt', output)}
                disabled={!output}
              />
            </Space>
          }
        >
          <Input.TextArea
            aria-label={outputTitle}
            value={output}
            readOnly
            className="tool-textarea result-textarea"
            rows={17}
            spellCheck={false}
          />
          <Typography.Text type="secondary" style={{ display: 'block', marginTop: 12 }}>
            {output
              ? `${output.split('\n').length} 行 · ${output.length} 字符`
              : '处理结果将在这里显示'}
          </Typography.Text>
        </Card>
      </Col>
    </Row>
  );
}

const jsonSample =
  '{"service":"order-api","version":"2.8.3","database":{"host":"mysql.orders.internal","port":3306},"features":["支付回调","订单查询"],"replicas":2}';
function JsonTool() {
  const [source, setSource] = useState(jsonSample),
    [operation, setOperation] = useState<JsonOperation>('format'),
    [path, setPath] = useState('$.database'),
    [indent, setIndent] = useState(2);
  const [output, setOutput] = useState(() => processJson(jsonSample, 'format')),
    [error, setError] = useState('');
  const run = () => {
    try {
      setOutput(processJson(source, operation, path, indent));
      setError('');
    } catch (e) {
      setError(String(e));
      setOutput('');
    }
  };
  return (
    <>
      <Card size="small" className="tool-controls">
        <Flex gap={12} align="center" wrap>
          <Typography.Text>操作</Typography.Text>
          <Select
            aria-label="JSON 操作"
            value={operation}
            onChange={setOperation}
            style={{ width: 170 }}
            options={[
              { value: 'format', label: '格式化 JSON' },
              { value: 'minify', label: '压缩 JSON' },
              { value: 'sort', label: '字段排序' },
              { value: 'query', label: '路径提取' },
              { value: 'escape', label: '转义文本' },
              { value: 'unescape', label: '取消转义' },
            ]}
          />
          {operation === 'query' ? (
            <Input
              value={path}
              aria-label="JSON 路径"
              onChange={(e) => setPath(e.target.value)}
              style={{ width: 200 }}
            />
          ) : (
            <Select
              aria-label="JSON 缩进"
              value={indent}
              onChange={setIndent}
              options={[
                { value: 2, label: '2 空格缩进' },
                { value: 4, label: '4 空格缩进' },
              ]}
            />
          )}
          <Button type="primary" icon={<PlayIcon />} onClick={run}>
            开始处理
          </Button>
          <Button
            type="text"
            onClick={() => {
              setSource(jsonSample);
              setOutput(processJson(jsonSample, 'format'));
              setError('');
            }}
          >
            载入示例
          </Button>
        </Flex>
      </Card>
      {error && (
        <Alert
          type="error"
          title="无法处理输入内容"
          description={error}
          showIcon
          closable
          onClose={() => setError('')}
          style={{ marginBottom: 16 }}
        />
      )}
      <TextPanels
        source={source}
        setSource={setSource}
        output={output}
        sourceTitle="JSON / 文本输入"
        outputTitle="JSON 处理结果"
      />
    </>
  );
}

const diffLeft =
  'APP_ENV=production\nAPP_PORT=8080\nDB_HOST=mysql.orders.internal\nDB_POOL_SIZE=20\nLOG_LEVEL=info\nFEATURE_PAYMENT=true';
const diffRight =
  'APP_ENV=production\nAPP_PORT=8080\nDB_HOST=mysql.orders.internal\nDB_POOL_SIZE=40\nLOG_LEVEL=warn\nFEATURE_PAYMENT=true\nCACHE_TTL=300';
function DiffTool() {
  const [left, setLeft] = useState(diffLeft),
    [right, setRight] = useState(diffRight),
    [mode, setMode] = useState<DiffMode>('env'),
    [ignore, setIgnore] = useState(false);
  const [result, setResult] = useState<DiffResult>(() =>
      compareConfigurations(diffLeft, diffRight, 'env'),
    ),
    [error, setError] = useState('');
  const run = () => {
    try {
      setResult(compareConfigurations(left, right, mode, ignore));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      <Card size="small" className="tool-controls">
        <Flex gap={14} wrap align="center">
          <Segmented
            aria-label="配置格式"
            value={mode}
            onChange={(v) => setMode(v as DiffMode)}
            options={[
              { value: 'text', label: '纯文本' },
              { value: 'json', label: 'JSON' },
              { value: 'env', label: '.env' },
            ]}
          />
          <Checkbox checked={ignore} onChange={(e) => setIgnore(e.target.checked)}>
            忽略空白差异
          </Checkbox>
          <Button type="primary" icon={<GitDiffIcon />} onClick={run}>
            开始对比
          </Button>
          <Space>
            <Tag color="success">+ {result.added} 新增</Tag>
            <Tag color="error">− {result.removed} 删除</Tag>
            <Tag>{result.same} 相同</Tag>
          </Space>
        </Flex>
      </Card>
      <Row gutter={[18, 18]}>
        <Col xs={24} lg={12}>
          <Card size="small" title="原配置">
            <Input.TextArea
              className="tool-textarea"
              aria-label="原配置"
              rows={7}
              value={left}
              onChange={(e) => setLeft(e.target.value)}
            />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="新配置">
            <Input.TextArea
              className="tool-textarea"
              aria-label="新配置"
              rows={7}
              value={right}
              onChange={(e) => setRight(e.target.value)}
            />
          </Card>
        </Col>
      </Row>
      {error && <Alert type="error" title={error} showIcon style={{ marginTop: 16 }} />}
      <Card className="diff-result" size="small" title="差异结果" style={{ marginTop: 18 }}>
        <Table
          pagination={false}
          size="small"
          rowKey="key"
          showHeader={false}
          dataSource={result.rows.map((r, i) => ({ ...r, key: i }))}
          rowClassName={(r) => `diff-${r.type}`}
          columns={[
            { dataIndex: 'left', width: 50 },
            { dataIndex: 'right', width: 50 },
            {
              width: 30,
              render: (_, r) => (r.type === 'added' ? '+' : r.type === 'removed' ? '−' : ''),
            },
            { dataIndex: 'text', render: (text) => <code>{text || ' '}</code> },
          ]}
        />
      </Card>
    </>
  );
}

function TextTool() {
  const [source, setSource] = useState(
    '  order-api\npayment-worker\norder-api\n\n  order-web\nredis-cache\npayment-worker',
  );
  const [operation, setOperation] = useState<TextOperation>('dedupe'),
    [options, setOptions] = useState(defaultTextOptions),
    [error, setError] = useState('');
  const [output, setOutput] = useState(
    '  order-api\npayment-worker\norder-api\n\n  order-web\nredis-cache',
  );
  const labels: [TextOperation, string][] = [
    ['trim', '移除首尾空格'],
    ['remove-empty', '移除空行'],
    ['dedupe', '逐行去重'],
    ['sort-asc', '升序排列'],
    ['sort-desc', '降序排列'],
    ['prefix-suffix', '添加前后缀'],
    ['columns', '提取指定列'],
    ['regex-extract', '正则提取'],
    ['regex-replace', '正则替换'],
    ['join', '合并为一行'],
  ];
  const run = () => {
    try {
      setOutput(transformText(source, operation, options).text);
      setError('');
    } catch (e) {
      setError(String(e));
      setOutput('');
    }
  };
  const optionField = (key: keyof typeof options, placeholder: string) => (
    <Input
      key={key}
      aria-label={placeholder}
      placeholder={placeholder}
      value={options[key]}
      onChange={(e) => setOptions((s) => ({ ...s, [key]: e.target.value }))}
      style={{ width: 150 }}
    />
  );
  return (
    <>
      <Card size="small" className="tool-controls">
        <Flex gap={10} wrap align="center">
          <Select
            aria-label="文本操作"
            value={operation}
            onChange={setOperation}
            options={labels.map(([value, label]) => ({ value, label }))}
            style={{ width: 170 }}
          />
          {operation === 'prefix-suffix' && (
            <>
              {optionField('prefix', '前缀')}
              {optionField('suffix', '后缀')}
            </>
          )}
          {operation === 'columns' && (
            <>
              {optionField('delimiter', '列分隔符')}
              {optionField('columns', '列号，如 1,3')}
            </>
          )}
          {operation.startsWith('regex') && (
            <>
              {optionField('pattern', '正则表达式')}
              {optionField('flags', '匹配标记')}
              {operation === 'regex-replace' && optionField('replacement', '替换为')}
            </>
          )}
          {operation === 'join' && optionField('separator', '连接分隔符')}
          <Button type="primary" icon={<PlayIcon />} onClick={run}>
            处理文本
          </Button>
          <Typography.Text type="secondary">按当前输入实时计算，无需上传。</Typography.Text>
        </Flex>
      </Card>
      {error && <Alert title={error} type="error" showIcon style={{ marginBottom: 16 }} />}
      <TextPanels
        source={source}
        setSource={setSource}
        output={output}
        sourceTitle="原始文本"
        outputTitle="文本处理结果"
      />
    </>
  );
}

const tableSample =
  'name,environment,address\norder-app-01,生产,10.24.16.21\norder-app-02,生产,10.24.16.22\norder-staging-01,测试,10.24.32.11';
function TableTool() {
  const [source, setSource] = useState(tableSample),
    [direction, setDirection] = useState<TableDirection>('csv-json'),
    [delimiter, setDelimiter] = useState<Delimiter | 'auto'>('auto'),
    [header, setHeader] = useState(true);
  const [result, setResult] = useState(() => convertTable(tableSample, 'csv-json')),
    [error, setError] = useState('');
  const run = () => {
    try {
      setResult(convertTable(source, direction, delimiter, header));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };
  const changeDirection = (value: string | number) => {
    const next = value as TableDirection;
    setDirection(next);
    const sample =
      next === 'csv-json'
        ? tableSample
        : '[{"name":"order-app-01","environment":"生产","address":"10.24.16.21"}]';
    setSource(sample);
    setResult(convertTable(sample, next));
    setError('');
  };
  return (
    <>
      <Card size="small" className="tool-controls">
        <Flex gap={12} wrap align="center">
          <Segmented
            aria-label="表格转换方向"
            value={direction}
            onChange={changeDirection}
            options={[
              { value: 'csv-json', label: 'CSV → JSON' },
              { value: 'json-csv', label: 'JSON → CSV' },
            ]}
          />
          <Select
            aria-label="列分隔符"
            value={delimiter}
            onChange={setDelimiter}
            options={[
              { value: 'auto', label: '自动识别分隔符' },
              { value: ',', label: '逗号 (,)' },
              { value: '\t', label: '制表符 (Tab)' },
              { value: ';', label: '分号 (;)' },
            ]}
          />
          {direction === 'csv-json' && (
            <Checkbox checked={header} onChange={(e) => setHeader(e.target.checked)}>
              首行为表头
            </Checkbox>
          )}
          <Button type="primary" icon={<ArrowRightIcon />} onClick={run}>
            开始转换
          </Button>
          <Tag>
            {result.rows} 行 · {result.columns} 列
          </Tag>
        </Flex>
      </Card>
      {error && <Alert title={error} type="error" showIcon style={{ marginBottom: 16 }} />}
      <TextPanels
        source={source}
        setSource={setSource}
        output={result.text}
        sourceTitle={direction === 'csv-json' ? 'CSV / TSV 输入' : 'JSON 数组输入'}
        outputTitle="表格转换结果"
      />
    </>
  );
}

function TimeTool() {
  const [input, setInput] = useState('2026-11-16T09:30:00+08:00'),
    [expression, setExpression] = useState('0 2 * * *'),
    [error, setError] = useState('');
  const [time, setTime] = useState(() =>
      formatDateInput(input, new Date(`${today}T09:30:00+08:00`)),
    ),
    [runs, setRuns] = useState(() => nextCronRuns(expression, new Date(`${today}T09:30:00+08:00`))),
    [description, setDescription] = useState('每天 02:00 执行');
  const convert = () => {
    try {
      setTime(formatDateInput(input, new Date(`${today}T09:30:00+08:00`)));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };
  const cron = () => {
    try {
      setRuns(nextCronRuns(expression, new Date(`${today}T09:30:00+08:00`)));
      setDescription(describeCron(expression));
      setError('');
    } catch (e) {
      setError(String(e));
    }
  };
  return (
    <>
      {error && <Alert title={error} type="error" showIcon style={{ marginBottom: 18 }} />}
      <Tabs
        items={[
          {
            key: 'timestamp',
            label: '时间戳转换',
            children: (
              <Row gutter={[20, 20]}>
                <Col xs={24} lg={11}>
                  <Card title="输入时间" size="small">
                    <Form layout="vertical">
                      <Form.Item
                        label="时间戳或日期时间"
                        extra="支持秒、毫秒时间戳或带时区的日期时间。"
                      >
                        <Input
                          aria-label="时间转换输入"
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onPressEnter={convert}
                        />
                      </Form.Item>
                      <Space>
                        <Button type="primary" onClick={convert}>
                          转换时间
                        </Button>
                        <Button onClick={() => setInput(new Date().toISOString())}>
                          填入当前时间
                        </Button>
                      </Space>
                    </Form>
                  </Card>
                </Col>
                <Col xs={24} lg={13}>
                  <Card title="转换结果" size="small">
                    <Descriptions
                      column={1}
                      items={[
                        {
                          key: 1,
                          label: '本地时间',
                          children: <Typography.Text copyable>{time.local}</Typography.Text>,
                        },
                        {
                          key: 2,
                          label: 'ISO 8601',
                          children: <Typography.Text copyable>{time.iso}</Typography.Text>,
                        },
                        {
                          key: 3,
                          label: '秒时间戳',
                          children: <Typography.Text copyable>{time.seconds}</Typography.Text>,
                        },
                        {
                          key: 4,
                          label: '毫秒时间戳',
                          children: <Typography.Text copyable>{time.milliseconds}</Typography.Text>,
                        },
                        { key: 5, label: '相对演示日期', children: time.relative },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            ),
          },
          {
            key: 'cron',
            label: 'Cron 执行计划',
            children: (
              <Row gutter={[20, 20]}>
                <Col xs={24} lg={11}>
                  <Card title="Cron 表达式" size="small">
                    <Input
                      size="large"
                      className="mono"
                      aria-label="Cron 表达式"
                      value={expression}
                      onChange={(e) => setExpression(e.target.value)}
                      onPressEnter={cron}
                    />
                    <Typography.Paragraph type="secondary" style={{ margin: '12px 0 20px' }}>
                      分钟　小时　日期　月份　星期
                    </Typography.Paragraph>
                    <Flex gap={8} wrap>
                      {['0 2 * * *', '*/15 * * * *', '0 9 * * 1-5'].map((s) => (
                        <Tag key={s} onClick={() => setExpression(s)} style={{ cursor: 'pointer' }}>
                          {s}
                        </Tag>
                      ))}
                    </Flex>
                    <Button type="primary" style={{ marginTop: 24 }} onClick={cron}>
                      解析执行计划
                    </Button>
                  </Card>
                </Col>
                <Col xs={24} lg={13}>
                  <Card title="接下来的执行时间" size="small">
                    <Alert title={description} type="info" showIcon style={{ marginBottom: 18 }} />
                    <Table
                      size="small"
                      pagination={false}
                      rowKey="key"
                      dataSource={runs.map((r, i) => ({
                        key: i,
                        index: i + 1,
                        time: r.toLocaleString('zh-CN', { hour12: false }),
                        zone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                      }))}
                      columns={[
                        { title: '序号', dataIndex: 'index', width: 60 },
                        { title: '执行时间', dataIndex: 'time' },
                        { title: '本机时区', dataIndex: 'zone' },
                      ]}
                    />
                  </Card>
                </Col>
              </Row>
            ),
          },
        ]}
      />
    </>
  );
}

function ZipTool() {
  const [mode, setMode] = useState('pack'),
    [files, setFiles] = useState<string[]>([]),
    [done, setDone] = useState(false),
    [password, setPassword] = useState('');
  const [branch, setBranch] = useState('main'),
    [checked, setChecked] = useState<React.Key[]>(['src/api.ts', 'config/application.yml']);
  const gitFiles = ['src/api.ts', 'config/application.yml', 'src/payment.ts', 'docs/release.md'];
  const { message } = App.useApp();
  useEffect(() => {
    setDone(false);
    setFiles([]);
  }, [mode]);
  const restoring = mode === 'restore' || mode === 'paste';
  return (
    <>
      <Alert
        title="归档与还原流程演示"
        description="本页展示桌面文件选择、Git 筛选、加密归档与还原的完整界面；不会执行真实 ZIP 加密或写入文件系统。"
        type="info"
        showIcon
        style={{ marginBottom: 24 }}
      />
      <Tabs
        activeKey={mode}
        onChange={setMode}
        items={[
          { key: 'pack', label: '归档文件' },
          { key: 'git', label: 'Git 筛选归档' },
          { key: 'restore', label: '目录还原' },
          { key: 'paste', label: '剪贴板还原' },
        ]}
      />
      <Row gutter={[22, 22]}>
        <Col xs={24} xl={15}>
          <Card title={restoring ? '选择还原来源' : '选择归档来源'}>
            <Form layout="vertical">
              {mode === 'paste' ? (
                <Form.Item label="粘贴文本分片">
                  <Input.TextArea
                    aria-label="归档分片文本"
                    rows={7}
                    placeholder="粘贴 ZTXT1 文本分片，或使用右侧示例"
                    onChange={(e) => setFiles(e.target.value ? ['粘贴的示例分片'] : [])}
                  />
                </Form.Item>
              ) : (
                <>
                  <Upload.Dragger
                    multiple
                    directory={mode === 'git'}
                    beforeUpload={(file) => {
                      setFiles((v) => [...new Set([...v, file.name])]);
                      return false;
                    }}
                    showUploadList={false}
                  >
                    <p className="ant-upload-drag-icon">
                      <FolderOpenIcon size={38} color="#1677ff" />
                    </p>
                    <Typography.Title level={5}>
                      {mode === 'git'
                        ? '选择项目目录'
                        : restoring
                          ? '选择文本分片'
                          : '选择文件或拖放到这里'}
                    </Typography.Title>
                    <Typography.Text type="secondary">
                      {restoring ? '接受 .txt 格式的示例分片' : '文件仅用于预览名称，不会上传'}
                    </Typography.Text>
                  </Upload.Dragger>
                  <Flex justify="space-between" align="center" style={{ margin: '12px 0 20px' }}>
                    <Typography.Text type="secondary">已选择 {files.length} 项</Typography.Text>
                    <Button
                      type="link"
                      onClick={() =>
                        setFiles(
                          mode === 'git'
                            ? ['order-service/']
                            : restoring
                              ? ['orders.part001.txt', 'orders.part002.txt']
                              : ['application.yml', 'deployment.md', 'api-config.json'],
                        )
                      }
                    >
                      使用示例文件
                    </Button>
                  </Flex>
                </>
              )}
              {mode === 'git' && (
                <>
                  <Flex gap={12}>
                    <Form.Item label="分支" style={{ flex: 1 }}>
                      <Select
                        aria-label="Git 分支"
                        value={branch}
                        onChange={setBranch}
                        options={['main', 'release/v2.8', 'develop'].map((value) => ({ value }))}
                      />
                    </Form.Item>
                    <Form.Item label="时间范围" style={{ flex: 2 }}>
                      <DatePicker.RangePicker />
                    </Form.Item>
                  </Flex>
                  <Table
                    size="small"
                    pagination={false}
                    rowKey="file"
                    rowSelection={{ selectedRowKeys: checked, onChange: setChecked }}
                    dataSource={gitFiles.map((file, i) => ({
                      file,
                      change: i % 2 ? '新增' : '修改',
                    }))}
                    columns={[
                      { title: '变更文件', dataIndex: 'file' },
                      {
                        title: '变更',
                        dataIndex: 'change',
                        render: (value) => (
                          <Tag color={value === '新增' ? 'success' : 'blue'}>{value}</Tag>
                        ),
                      },
                    ]}
                  />
                </>
              )}
              <Divider />
              <Flex gap={16} wrap>
                <Form.Item
                  label={restoring ? '归档密码' : '设置归档密码'}
                  style={{ flex: '1 1 180px' }}
                >
                  <Input.Password
                    aria-label="演示归档密码"
                    placeholder="请勿输入真实密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Form.Item>
                {!restoring && (
                  <Form.Item label="分片大小 (MB)">
                    <InputNumber min={1} max={200} defaultValue={10} />
                  </Form.Item>
                )}
              </Flex>
              <Button
                type="primary"
                size="large"
                icon={restoring ? <DownloadSimpleIcon /> : <ArchiveIcon />}
                disabled={!files.length || !password || (mode === 'git' && !checked.length)}
                onClick={() => {
                  setDone(true);
                  message.success('演示流程已完成，未生成真实归档');
                }}
              >
                {restoring ? '演示还原' : '演示生成归档'}
              </Button>
            </Form>
          </Card>
        </Col>
        <Col xs={24} xl={9}>
          <Card title="处理过程">
            <Steps
              orientation="vertical"
              current={done ? 3 : files.length ? 1 : 0}
              items={[
                {
                  title: '选择来源',
                  content: restoring ? '读取文本分片' : '文件或 Git 变更列表',
                },
                {
                  title: restoring ? '校验分片' : '整理文件',
                  content: `${files.length} 项示例文件`,
                },
                {
                  title: restoring ? '解密与还原' : '压缩、加密与分片',
                  content: '展示桌面处理流程',
                },
                { title: '完成', content: done ? '流程演示完成' : '等待开始' },
              ]}
            />
          </Card>
          {done && (
            <Card title="演示结果" style={{ marginTop: 18 }}>
              <Alert type="success" title="已完成流程预览" showIcon />
              <Typography.Paragraph type="secondary" style={{ marginTop: 16 }}>
                正式应用将在这里显示分片位置、校验结果和可恢复的输出文件。
              </Typography.Paragraph>
              <Table
                size="small"
                pagination={false}
                rowKey="name"
                dataSource={[
                  { name: restoring ? 'application.yml' : 'orders.part001.txt', state: '示例' },
                  { name: restoring ? 'deployment.md' : 'orders.part002.txt', state: '示例' },
                ]}
                columns={[
                  { title: '文件', dataIndex: 'name' },
                  { title: '状态', dataIndex: 'state' },
                ]}
              />
            </Card>
          )}
        </Col>
      </Row>
    </>
  );
}
