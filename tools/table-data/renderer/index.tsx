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
          <select
            aria-label="表格转换方向"
            value={direction}
            onChange={(event) => {
              setDirection(event.target.value as TableDirection);
              setOutput('');
              setStats('');
            }}
          >
            <option value="csv-json">CSV → JSON</option>
            <option value="json-csv">JSON → CSV</option>
          </select>
        </label>
        <label>
          分隔符
          <select
            aria-label="表格分隔符"
            value={delimiter}
            onChange={(event) => setDelimiter(event.target.value as Delimiter | 'auto')}
          >
            <option value="auto">自动识别</option>
            <option value=",">逗号</option>
            <option value={'\t'}>制表符</option>
            <option value=";">分号</option>
          </select>
        </label>
        {direction === 'csv-json' && (
          <label className="utility-check">
            <input
              type="checkbox"
              checked={hasHeader}
              onChange={(event) => setHasHeader(event.target.checked)}
            />
            第一行是表头
          </label>
        )}
        <button type="button" onClick={convert}>
          转换数据
        </button>
      </div>
      <div className="utility-grid">
        <label className="utility-panel">
          <span>输入数据</span>
          <textarea
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
        </label>
        <section className="utility-panel">
          <div className="utility-panel-heading">
            <span>转换结果</span>
            <CopyValue value={output} label="表格转换结果" onError={setError} />
          </div>
          <textarea aria-label="表格数据输出" value={output} readOnly spellCheck={false} />
        </section>
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
