import { useState } from 'react';
import { CopyValue } from '../../../src/shared/CopyValue';
import { PageHeading } from '../../../src/shared/WorkspaceUI';
import { defaultTextOptions, transformText, type TextOperation, type TextOptions } from '../logic';

const labels: Record<TextOperation, string> = {
  trim: '清理每行首尾空白',
  'remove-empty': '移除空行',
  dedupe: '按行去重',
  'sort-asc': '按行升序（识别数字）',
  'sort-desc': '按行降序（识别数字）',
  'prefix-suffix': '每行添加前后缀',
  columns: '按分隔符提取列',
  'regex-extract': '正则提取（优先第一捕获组）',
  'regex-replace': '正则替换',
  join: '用连接符合并所有行',
};

export default function TextTransformPage() {
  const [input, setInput] = useState(''),
    [output, setOutput] = useState(''),
    [operation, setOperation] = useState<TextOperation>('trim'),
    [options, setOptions] = useState<TextOptions>(defaultTextOptions),
    [stats, setStats] = useState(''),
    [error, setError] = useState('');
  const update = <K extends keyof TextOptions>(key: K, value: TextOptions[K]) =>
    setOptions((current) => ({ ...current, [key]: value }));
  const process = () => {
    try {
      const result = transformText(input, operation, options);
      setOutput(result.text);
      setStats(
        `${result.inputLines} 行 → ${result.outputLines} 行；${result.inputCharacters} 字符 → ${result.outputCharacters} 字符`,
      );
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
        title="批量文本处理"
        description="处理结果只保留在当前页面，可复制后继续编辑或粘贴到其他工具。"
      />
      <div className="utility-toolbar">
        <label className="utility-grow">
          处理方式
          <select
            aria-label="文本处理方式"
            value={operation}
            onChange={(event) => {
              setOperation(event.target.value as TextOperation);
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
        <button type="button" onClick={process}>
          处理文本
        </button>
      </div>
      {operation === 'prefix-suffix' && (
        <div className="utility-parameters">
          <label>
            前缀
            <input
              aria-label="每行前缀"
              value={options.prefix}
              onChange={(event) => update('prefix', event.target.value)}
            />
          </label>
          <label>
            后缀
            <input
              aria-label="每行后缀"
              value={options.suffix}
              onChange={(event) => update('suffix', event.target.value)}
            />
          </label>
        </div>
      )}
      {operation === 'columns' && (
        <div className="utility-parameters">
          <label>
            分隔符
            <input
              aria-label="列分隔符"
              value={options.delimiter}
              onChange={(event) => update('delimiter', event.target.value)}
            />
          </label>
          <label>
            列号（逗号分隔）
            <input
              aria-label="提取列号"
              value={options.columns}
              onChange={(event) => update('columns', event.target.value)}
              placeholder="1,3"
            />
          </label>
        </div>
      )}
      {(operation === 'regex-extract' || operation === 'regex-replace') && (
        <div className="utility-parameters">
          <label>
            正则表达式
            <input
              aria-label="文本正则表达式"
              value={options.pattern}
              onChange={(event) => update('pattern', event.target.value)}
              spellCheck={false}
            />
          </label>
          <label>
            标志
            <input
              aria-label="正则标志"
              value={options.flags}
              onChange={(event) => update('flags', event.target.value)}
              spellCheck={false}
              placeholder="g、i、m"
            />
          </label>
          {operation === 'regex-replace' && (
            <label>
              替换为
              <input
                aria-label="正则替换内容"
                value={options.replacement}
                onChange={(event) => update('replacement', event.target.value)}
              />
            </label>
          )}
        </div>
      )}
      {operation === 'join' && (
        <div className="utility-parameters">
          <label>
            连接符
            <input
              aria-label="文本连接符"
              value={options.separator}
              onChange={(event) => update('separator', event.target.value)}
            />
          </label>
        </div>
      )}
      <div className="utility-grid">
        <label className="utility-panel">
          <span>输入文本</span>
          <textarea
            aria-label="批量文本输入"
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setOutput('');
              setStats('');
            }}
            spellCheck={false}
          />
        </label>
        <section className="utility-panel">
          <div className="utility-panel-heading">
            <span>处理结果</span>
            <CopyValue value={output} label="文本处理结果" onError={setError} />
          </div>
          <textarea aria-label="批量文本输出" value={output} readOnly spellCheck={false} />
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
