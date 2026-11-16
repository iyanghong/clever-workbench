import { useState } from 'react';
import {
  App,
  Anchor,
  Avatar,
  Button,
  Card,
  Divider,
  Dropdown,
  Empty,
  Flex,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Timeline,
  Tooltip,
  Tree,
  Typography,
} from 'antd';
import {
  ArrowLeftIcon,
  ArrowsInSimpleIcon,
  ArrowsOutSimpleIcon,
  ClockCounterClockwiseIcon,
  DownloadSimpleIcon,
  FileTextIcon,
  FolderOpenIcon,
  ListBulletsIcon,
  PlusIcon,
  TrashIcon,
} from '@phosphor-icons/react';
import { marked } from 'marked';
import { systemName, systemOptions, today, type DocumentItem } from './data';
import { useDemo } from './store';
import { Editor, PageTitle, saveText, StatusDot } from './ui';

export function DocumentsPage() {
  const { data, setData, parts, go, create } = useDemo();
  const [query, setQuery] = useState(''),
    [scope, setScope] = useState('all'),
    [category, setCategory] = useState('all'),
    [focus, setFocus] = useState(false),
    [outline, setOutline] = useState(true);
  const { message, modal } = App.useApp();
  const visible = data.documents.filter(
    (d) =>
      !d.deleted &&
      (scope === 'all' || d.system === scope) &&
      (category === 'all' || d.category === category) &&
      `${d.title}${d.markdown}`.toLowerCase().includes(query.toLowerCase()),
  );
  const doc = data.documents.find((d) => d.id === parts[1] && !d.deleted) ?? visible[0];
  const groups = [...new Set(data.documents.filter((d) => !d.deleted).map((d) => d.category))];
  const patch = (value: Partial<DocumentItem>) =>
    doc &&
    setData((s) => ({
      ...s,
      documents: s.documents.map((d) =>
        d.id === doc.id ? { ...d, ...value, updated: `${today} 10:30` } : d,
      ),
    }));
  const headings = doc
    ? marked
        .lexer(doc.markdown)
        .flatMap((token, i) =>
          token.type === 'heading'
            ? [
                {
                  key: `heading-${i}`,
                  title: token.text,
                  href: `#heading-${i}`,
                  depth: token.depth,
                },
              ]
            : [],
        )
    : [];
  return (
    <div
      className={`page documents-page ${focus ? 'document-focus' : ''} ${parts[1] ? 'document-selected' : ''}`}
    >
      <PageTitle
        title="技术文档"
        description="记录排障过程，沉淀可以复用的解决方案。"
        count={data.documents.filter((d) => !d.deleted).length}
        extra={
          <>
            <Button
              icon={<FolderOpenIcon />}
              onClick={() => {
                setScope('');
                setCategory('all');
              }}
            >
              通用知识
            </Button>
            <Button
              type="primary"
              icon={<PlusIcon />}
              onClick={() => create('document', scope === 'all' ? '' : scope)}
            >
              新建文档
            </Button>
          </>
        }
      />
      <div className="documents-layout">
        <aside className="documents-browser">
          <Input.Search
            aria-label="搜索文档"
            placeholder="搜索标题或正文"
            allowClear
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Select
            aria-label="文档所属筛选"
            style={{ width: '100%', margin: '12px 0' }}
            value={scope}
            options={[
              { value: 'all', label: '全部文档' },
              { value: '', label: '通用知识' },
              ...systemOptions,
            ]}
            onChange={(value) => {
              setScope(value);
              go('documents');
            }}
          />
          <Tree
            className="document-tree"
            blockNode
            selectedKeys={[category]}
            onSelect={(keys) => {
              setCategory(String(keys[0] ?? 'all'));
              go('documents');
            }}
            treeData={[
              {
                key: 'all',
                title: `全部资料 · ${data.documents.filter((d) => !d.deleted).length}`,
                children: groups.map((g) => ({
                  key: g,
                  title: `${g} · ${data.documents.filter((d) => !d.deleted && d.category === g).length}`,
                })),
              },
            ]}
            defaultExpandAll
          />
          <Divider style={{ margin: '16px 0' }} />
          <Typography.Text type="secondary">{visible.length} 篇文档</Typography.Text>
          <div className="document-list">
            {visible.map((d) => (
              <Button
                type="text"
                className={`document-list-item ${d.id === doc?.id ? 'active' : ''}`}
                key={d.id}
                onClick={() => go(`documents/${d.id}`)}
              >
                <FileTextIcon size={18} />
                <div>
                  <strong>{d.title}</strong>
                  <Typography.Text type="secondary">
                    {systemName(d.system)} · {d.updated.slice(5, 10)}
                  </Typography.Text>
                </div>
              </Button>
            ))}
            {!visible.length && (
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有找到文档" />
            )}
          </div>
        </aside>
        {doc ? (
          <Card
            className="document-editor"
            title={
              <Space>
                <Button
                  className="document-back"
                  type="text"
                  aria-label="返回文档清单"
                  icon={<ArrowLeftIcon />}
                  onClick={() => go('documents')}
                />
                <Tag color="blue">{systemName(doc.system)}</Tag>
                <Tag>{doc.category}</Tag>
              </Space>
            }
            extra={
              <Space size={0}>
                <Tooltip title="文档历史">
                  <Button
                    type="text"
                    aria-label="文档历史"
                    icon={<ClockCounterClockwiseIcon />}
                    onClick={() =>
                      modal.info({
                        title: '文档更新记录',
                        content: (
                          <Timeline
                            items={[
                              { content: `${doc.updated} 更新内容` },
                              { content: '2026-11-12 15:30 补充验证与回滚步骤' },
                              { content: '2026-11-10 09:00 创建文档' },
                            ]}
                          />
                        ),
                      })
                    }
                  />
                </Tooltip>
                <Tooltip title="导出 Markdown">
                  <Button
                    type="text"
                    aria-label="导出文档"
                    icon={<DownloadSimpleIcon />}
                    onClick={() => {
                      saveText(`${doc.title}.md`, doc.markdown);
                      message.success('文档已导出');
                    }}
                  />
                </Tooltip>
                <Tooltip title="显示或隐藏大纲">
                  <Button
                    type={outline ? 'link' : 'text'}
                    aria-label="切换文档大纲"
                    icon={<ListBulletsIcon />}
                    onClick={() => setOutline(!outline)}
                  />
                </Tooltip>
                <Tooltip title={focus ? '退出专注' : '专注阅读'}>
                  <Button
                    type="text"
                    aria-label="切换专注阅读"
                    icon={focus ? <ArrowsInSimpleIcon /> : <ArrowsOutSimpleIcon />}
                    onClick={() => setFocus(!focus)}
                  />
                </Tooltip>
              </Space>
            }
          >
            <div className="document-edit-layout">
              <div className="document-reading">
                <Input
                  aria-label="文档标题"
                  className="document-title-input"
                  variant="borderless"
                  value={doc.title}
                  onChange={(e) => patch({ title: e.target.value })}
                />
                <Flex className="document-metadata" align="center" gap={12} wrap>
                  <Select
                    aria-label="文档所属系统"
                    variant="borderless"
                    value={doc.system}
                    options={[{ value: '', label: '通用知识' }, ...systemOptions]}
                    onChange={(system) => patch({ system })}
                  />
                  <Typography.Text type="secondary">更新于 {doc.updated}</Typography.Text>
                </Flex>
                <Editor value={doc.markdown} onChange={(markdown) => patch({ markdown })} />
                <div className="page-footnote">
                  <StatusDot>已保存到本次演示</StatusDot>
                  <Popconfirm
                    title="将文档移到回收站？"
                    onConfirm={() => {
                      patch({ deleted: true });
                      go('documents');
                    }}
                  >
                    <Button type="text" danger size="small" icon={<TrashIcon />}>
                      移到回收站
                    </Button>
                  </Popconfirm>
                </div>
              </div>
              {outline && (
                <aside className="document-outline">
                  <Typography.Text type="secondary">文档大纲</Typography.Text>
                  <Tree
                    blockNode
                    showLine
                    selectedKeys={[]}
                    treeData={headings.map((h) => ({ key: h.key, title: h.title }))}
                    onSelect={(keys) =>
                      document
                        .getElementById(String(keys[0]))
                        ?.scrollIntoView({ block: 'start', behavior: 'smooth' })
                    }
                  />
                  <Divider />
                  <Typography.Text type="secondary">
                    {doc.markdown.length.toLocaleString()} 字符
                  </Typography.Text>
                </aside>
              )}
            </div>
          </Card>
        ) : (
          <Card>
            <Empty description="这里还没有文档">
              <Button type="primary" onClick={() => create('document')}>
                创建第一篇文档
              </Button>
            </Empty>
          </Card>
        )}
      </div>
    </div>
  );
}
