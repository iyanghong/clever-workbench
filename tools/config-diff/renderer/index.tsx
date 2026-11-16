import { markNewRecordChanged } from '../../../src/shared/new-record';
import { Button, Checkbox, Input, Select, Card, Table } from 'antd';
import { useState } from 'react';
import { PageHeading } from '../../../src/shared/WorkspaceUI';
import { compareConfigurations, type DiffMode, type DiffResult } from '../logic';

export default function ConfigDiffPage() {
  const [left, setLeft] = useState(''),
    [right, setRight] = useState(''),
    [mode, setMode] = useState<DiffMode>('text'),
    [ignoreWhitespace, setIgnoreWhitespace] = useState(false),
    [showSame, setShowSame] = useState(false),
    [result, setResult] = useState<DiffResult | null>(null),
    [error, setError] = useState('');
  const change = (action: () => void) => {
    action();
    setResult(null);
    setError('');
  };
  const compare = () => {
    try {
      setResult(compareConfigurations(left, right, mode, ignoreWhitespace));
      setError('');
    } catch (cause) {
      setResult(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <div className="utility-tool">
      <PageHeading
        eyebrow="本地工具"
        title="配置对比"
        description="对比文本、JSON 或 .env；结构化模式会忽略键顺序、注释和空行。"
      />
      <div className="utility-toolbar">
        <label>
          对比格式
          <Select
            aria-label="对比格式"
            value={mode}
            onChange={(event) => {
              markNewRecordChanged();
              return change(() => setMode(event as DiffMode));
            }}
          >
            <Select.Option data-value={String('text')} value="text">
              纯文本
            </Select.Option>
            <Select.Option data-value={String('json')} value="json">
              JSON（键排序）
            </Select.Option>
            <Select.Option data-value={String('env')} value="env">
              .env（按键排序）
            </Select.Option>
          </Select>
        </label>
        {mode === 'text' && (
          <Checkbox
            className="utility-check"
            checked={ignoreWhitespace}
            onChange={(event) => change(() => setIgnoreWhitespace(event.target.checked))}
          >
            忽略首尾及连续空白
          </Checkbox>
        )}
        <Button type="text" htmlType="button" onClick={compare}>
          开始对比
        </Button>
        <Button
          type="default"
          htmlType="button"
          className="secondary-button"
          onClick={() =>
            change(() => {
              setLeft(right);
              setRight(left);
            })
          }
        >
          交换两侧
        </Button>
      </div>
      <div className="utility-grid">
        <Card className="utility-panel">
          <span>原始配置</span>
          <Input.TextArea
            aria-label="原始配置"
            value={left}
            onChange={(event) => change(() => setLeft(event.target.value))}
            spellCheck={false}
            placeholder="粘贴变更前的配置"
          />
        </Card>
        <Card className="utility-panel">
          <span>对比配置</span>
          <Input.TextArea
            aria-label="对比配置"
            value={right}
            onChange={(event) => change(() => setRight(event.target.value))}
            spellCheck={false}
            placeholder="粘贴变更后的配置"
          />
        </Card>
      </div>
      {error && (
        <p className="tool-error" role="alert">
          {error}
        </p>
      )}
      {result && (
        <section className="utility-result" aria-label="配置对比结果">
          <div className="utility-result-heading">
            <strong>
              {result.added || result.removed
                ? `新增 ${result.added} 行，删除 ${result.removed} 行，相同 ${result.same} 行`
                : '两侧配置一致'}
            </strong>
            <Checkbox
              className="utility-check"
              checked={showSame}
              onChange={(event) => setShowSame(event.target.checked)}
            >
              显示相同行
            </Checkbox>
          </div>
          <div className="utility-table-wrap">
            <Table
              className="diff-table"
              dataSource={result.rows.filter((row) => showSame || row.type !== 'same')}
              rowKey={(_row, index) => String(index)}
              rowClassName={(row) => `diff-${row.type}`}
              pagination={false}
              size="small"
              scroll={{ y: 470 }}
              columns={[
                { title: '原行', dataIndex: 'left', width: 65 },
                { title: '新行', dataIndex: 'right', width: 65 },
                { title: '内容', dataIndex: 'text', render: (text) => <code>{text || ' '}</code> },
              ]}
            />
          </div>
        </section>
      )}
    </div>
  );
}
