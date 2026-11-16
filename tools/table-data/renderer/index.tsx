import { markNewRecordChanged } from '../../../src/shared/new-record';
import { Button, Checkbox, Input, Select, Card } from 'antd';
import { useState } from 'react';
import { CopyValue } from '../../../src/shared/CopyValue';
import { PageHeading } from '../../../src/shared/WorkspaceUI';
import { convertTable, type Delimiter, type TableDirection } from '../logic';

export default function TableDataPage() {
  const [input, setInput] = useState(''),
    [output, setOutput] = useState(''),
    [direction, setDirection] = useState<TableDirection>('csv-json'),
    [delimiter, setDelimiter] = useState<Delimiter | 'auto'>('auto'),
    [hasHeader, setHasHeader] = useState(true),
    [stats, setStats] = useState(''),
    [error, setError] = useState('');
  const convert = () => {
    try {
      const result = convertTable(input, direction, delimiter, hasHeader);
      setOutput(result.text);
      setStats(`${result.rows} 行数据，${result.columns} 列`);
      setError('');
    } catch (cause) {
      setOutput('');
      setStats('');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <div className="utility-tool">
      <PageHeading
        eyebrow="本地工具"
        title="表格数据转换"
        description="支持带引号、换行和转义双引号的 CSV；JSON 数组可使用对象或数组表示每一行。"
      />
      <div className="utility-toolbar">
        <label>
          转换方向
          <Select
            aria-label="表格转换方向"
            value={direction}
            onChange={(event) => {
              markNewRecordChanged();
              setDirection(event as TableDirection);
              setOutput('');
              setStats('');
            }}
          >
            <Select.Option data-value={String('csv-json')} value="csv-json">
              CSV → JSON
            </Select.Option>
            <Select.Option data-value={String('json-csv')} value="json-csv">
              JSON → CSV
            </Select.Option>
          </Select>
        </label>
        <label>
          分隔符
          <Select
            aria-label="表格分隔符"
            value={delimiter}
            onChange={(event) => {
              markNewRecordChanged();
              return setDelimiter(event as Delimiter | 'auto');
            }}
          >
            <Select.Option data-value={String('auto')} value="auto">
              自动识别
            </Select.Option>
            <Select.Option data-value={String(',')} value=",">
              逗号
            </Select.Option>
            <Select.Option data-value={String('\t')} value={'\t'}>
              制表符
            </Select.Option>
            <Select.Option data-value={String(';')} value=";">
              分号
            </Select.Option>
          </Select>
        </label>
        {direction === 'csv-json' && (
          <Checkbox
            className="utility-check"
            checked={hasHeader}
            onChange={(event) => setHasHeader(event.target.checked)}
          >
            第一行是表头
          </Checkbox>
        )}
        <Button type="text" htmlType="button" onClick={convert}>
          转换数据
        </Button>
      </div>
      <div className="utility-grid">
        <Card className="utility-panel">
          <span>输入数据</span>
          <Input.TextArea
            aria-label="表格数据输入"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setOutput('');
              setStats('');
            }}
            spellCheck={false}
            placeholder={
              direction === 'csv-json'
                ? 'name,address\n订单,127.0.0.1'
                : '[{"name":"订单","address":"127.0.0.1"}]'
            }
          />
        </Card>
        <Card className="utility-panel">
          <div className="utility-panel-heading">
            <span>转换结果</span>
            <CopyValue value={output} label="表格转换结果" onError={setError} />
          </div>
          <Input.TextArea aria-label="表格数据输出" value={output} readOnly spellCheck={false} />
        </Card>
      </div>
      {stats && (
        <p className="utility-note" role="status">
          {stats}
        </p>
      )}
      {error && (
        <p className="tool-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
