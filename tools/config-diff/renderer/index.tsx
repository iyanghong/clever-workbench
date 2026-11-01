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
          <select
            aria-label="对比格式"
            value={mode}
            onChange={(event) => change(() => setMode(event.target.value as DiffMode))}
          >
            <option value="text">纯文本</option>
            <option value="json">JSON（键排序）</option>
            <option value="env">.env（按键排序）</option>
          </select>
        </label>
        {mode === 'text' && (
          <label className="utility-check">
            <input
              type="checkbox"
              checked={ignoreWhitespace}
              onChange={(event) => change(() => setIgnoreWhitespace(event.target.checked))}
            />
            忽略首尾及连续空白
          </label>
        )}
        <button type="button" onClick={compare}>
          开始对比
        </button>
        <button
          type="button"
          className="secondary-button"
          onClick={() =>
            change(() => {
              setLeft(right);
              setRight(left);
            })
          }
        >
          交换两侧
        </button>
      </div>
      <div className="utility-grid">
        <label className="utility-panel">
          <span>原始配置</span>
          <textarea
            aria-label="原始配置"
            value={left}
            onChange={(event) => change(() => setLeft(event.target.value))}
            spellCheck={false}
            placeholder="粘贴变更前的配置"
          />
        </label>
        <label className="utility-panel">
          <span>对比配置</span>
          <textarea
            aria-label="对比配置"
            value={right}
            onChange={(event) => change(() => setRight(event.target.value))}
            spellCheck={false}
            placeholder="粘贴变更后的配置"
          />
        </label>
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
            <label className="utility-check">
              <input
                type="checkbox"
                checked={showSame}
                onChange={(event) => setShowSame(event.target.checked)}
              />
              显示相同行
            </label>
          </div>
          <div className="utility-table-wrap">
            <table className="utility-table diff-table">
              <thead>
                <tr>
                  <th>原行</th>
                  <th>新行</th>
                  <th>内容</th>
                </tr>
              </thead>
              <tbody>
                {result.rows
                  .filter((row) => showSame || row.type !== 'same')
                  .map((row, index) => (
                    <tr key={index} className={`diff-${row.type}`}>
                      <td>{row.left}</td>
                      <td>{row.right}</td>
                      <td>
                        <code>{row.text || ' '}</code>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
