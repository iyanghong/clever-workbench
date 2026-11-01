import { useState } from 'react';
import { CopyValue } from '../../../src/shared/CopyValue';
import { PageHeading } from '../../../src/shared/WorkspaceUI';
import { processJson, type JsonOperation } from '../logic';

const labels: Record<JsonOperation, string> = {
  format: '格式化',
  minify: '压缩',
  sort: '递归按键排序',
  query: '按路径提取',
  escape: '转义为 JSON 字符串',
  unescape: '取消字符串转义',
};

export default function DataFormatPage() {
  const [input, setInput] = useState(''),
    [output, setOutput] = useState(''),
    [operation, setOperation] = useState<JsonOperation>('format'),
    [path, setPath] = useState('$'),
    [indent, setIndent] = useState(2),
    [error, setError] = useState('');
  const process = () => {
    try {
      setOutput(processJson(input, operation, path, indent));
      setError('');
    } catch (cause) {
      setOutput('');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <div className="utility-tool">
      <PageHeading
        eyebrow="本地工具"
        title="数据格式助手"
        description='在本地处理 JSON；路径示例：$.service.nodes[0].address 或 $["复杂键"]。'
      />
      <div className="utility-toolbar">
        <label>
          操作
          <select
            aria-label="JSON 操作"
            value={operation}
            onChange={(event) => {
              setOperation(event.target.value as JsonOperation);
              setOutput('');
              setError('');
            }}
          >
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {operation === 'query' && (
          <label className="utility-grow">
            JSON 路径
            <input
              aria-label="JSON 路径"
              value={path}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
        )}
        {!['minify', 'escape', 'unescape'].includes(operation) && (
          <label>
            缩进
            <select
              aria-label="JSON 缩进"
              value={indent}
              onChange={(event) => setIndent(Number(event.target.value))}
            >
              <option value={2}>2 个空格</option>
              <option value={4}>4 个空格</option>
            </select>
          </label>
        )}
        <button type="button" onClick={process}>
          处理数据
        </button>
      </div>
      <div className="utility-grid">
        <label className="utility-panel">
          <span>输入</span>
          <textarea
            aria-label="JSON 输入"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setOutput('');
              setError('');
            }}
            spellCheck={false}
            placeholder='例如：{"service":{"nodes":[{"address":"127.0.0.1"}]}}'
          />
        </label>
        <section className="utility-panel">
          <div className="utility-panel-heading">
            <span>处理结果</span>
            <CopyValue value={output} label="处理结果" onError={setError} />
          </div>
          <textarea
            aria-label="JSON 输出"
            value={output}
            readOnly
            spellCheck={false}
            placeholder="处理结果显示在这里"
          />
        </section>
      </div>
      {error && (
        <p className="tool-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
