import { useState, type ReactNode } from 'react';
import {
  Button,
  Flex,
  Input,
  Segmented,
  Space,
  Table,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import {
  CheckCircleIcon,
  CodeIcon,
  EyeIcon,
  ListBulletsIcon,
  TextBIcon,
  TextHIcon,
  CopyIcon,
} from '@phosphor-icons/react';
import { marked, type Token, type Tokens } from 'marked';
import { useDemo } from './store';

export function PageTitle({
  title,
  description,
  extra,
  count,
}: {
  title: string;
  description?: string;
  extra?: ReactNode;
  count?: number;
}) {
  return (
    <div className="page-title">
      <div>
        <Space size={10}>
          <Typography.Title level={3}>{title}</Typography.Title>
          {count !== undefined && <Tag>{count}</Tag>}
        </Space>
        {description && <Typography.Paragraph type="secondary">{description}</Typography.Paragraph>}
      </div>
      {extra && (
        <Flex gap={8} wrap align="center">
          {extra}
        </Flex>
      )}
    </div>
  );
}

function inline(text: string): ReactNode[] {
  return marked
    .lexer(text)
    .flatMap((token) => ('tokens' in token && token.tokens ? token.tokens : [token]))
    .map((token, i) => {
      if (token.type === 'strong') return <strong key={i}>{token.text}</strong>;
      if (token.type === 'em') return <em key={i}>{token.text}</em>;
      if (token.type === 'codespan') return <code key={i}>{token.text}</code>;
      if (token.type === 'link')
        return (
          <Typography.Text key={i} type="secondary">
            {token.text}
          </Typography.Text>
        );
      return <span key={i}>{'text' in token ? String(token.text) : ''}</span>;
    });
}

function renderToken(token: Token, index: number): ReactNode {
  if (token.type === 'heading') {
    const level = Math.min(5, token.depth + 1) as 1 | 2 | 3 | 4 | 5;
    return (
      <Typography.Title key={index} id={`heading-${index}`} level={level}>
        {inline(token.text)}
      </Typography.Title>
    );
  }
  if (token.type === 'code')
    return (
      <pre key={index} className="code-block">
        <code>{token.text}</code>
      </pre>
    );
  if (token.type === 'list')
    return (
      <ul key={index}>
        {(token as Tokens.List).items.map((item, i) => (
          <li key={i}>
            {item.task && <CheckCircleIcon size={15} weight={item.checked ? 'fill' : 'regular'} />}{' '}
            {inline(item.text)}
          </li>
        ))}
      </ul>
    );
  if (token.type === 'table') {
    const table = token as Tokens.Table;
    return (
      <Table
        key={index}
        size="small"
        pagination={false}
        rowKey="key"
        columns={table.header.map((cell, i) => ({ title: cell.text, dataIndex: `c${i}` }))}
        dataSource={table.rows.map((row, i) => ({
          key: i,
          ...Object.fromEntries(row.map((cell, j) => [`c${j}`, cell.text])),
        }))}
      />
    );
  }
  if (token.type === 'blockquote') return <blockquote key={index}>{inline(token.text)}</blockquote>;
  if (token.type === 'paragraph')
    return <Typography.Paragraph key={index}>{inline(token.text)}</Typography.Paragraph>;
  return null;
}

export function MarkdownView({ value }: { value: string }) {
  return <article className="markdown-view">{marked.lexer(value).map(renderToken)}</article>;
}

export function Editor({
  value,
  onChange,
  label = '文档内容',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [mode, setMode] = useState('阅读');
  const { copy } = useDemo();
  const append = (text: string) => onChange(`${value}\n\n${text}`);
  return (
    <div className="editor">
      <Flex className="editor-toolbar" justify="space-between" gap={8} wrap>
        <Space size={0}>
          <Tooltip title="插入标题">
            <Button
              type="text"
              aria-label="插入标题"
              icon={<TextHIcon />}
              onClick={() => {
                append('## 新标题');
                setMode('Markdown');
              }}
            />
          </Tooltip>
          <Tooltip title="插入粗体">
            <Button
              type="text"
              aria-label="插入粗体"
              icon={<TextBIcon />}
              onClick={() => {
                append('**重点内容**');
                setMode('Markdown');
              }}
            />
          </Tooltip>
          <Tooltip title="插入清单">
            <Button
              type="text"
              aria-label="插入清单"
              icon={<ListBulletsIcon />}
              onClick={() => {
                append('- [ ] 待办事项');
                setMode('Markdown');
              }}
            />
          </Tooltip>
          <Tooltip title="复制 Markdown">
            <Button
              type="text"
              aria-label="复制 Markdown"
              icon={<CopyIcon />}
              onClick={() => void copy(value)}
            />
          </Tooltip>
        </Space>
        <Segmented
          aria-label="编辑器模式"
          value={mode}
          onChange={setMode}
          options={[
            { value: '阅读', icon: <EyeIcon />, label: '阅读' },
            { value: 'Markdown', icon: <CodeIcon />, label: 'Markdown' },
          ]}
        />
      </Flex>
      {mode === '阅读' ? (
        <MarkdownView value={value} />
      ) : (
        <Input.TextArea
          className="markdown-input"
          aria-label={label}
          value={value}
          autoSize={{ minRows: 14 }}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

export function StatusDot({ children }: { children: ReactNode }) {
  const { token } = theme.useToken();
  return (
    <Space size={6}>
      <CheckCircleIcon color={token.colorSuccess} weight="fill" size={14} />
      <Typography.Text type="secondary" style={{ fontSize: 12 }}>
        {children}
      </Typography.Text>
    </Space>
  );
}

export function saveText(filename: string, content: string, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
