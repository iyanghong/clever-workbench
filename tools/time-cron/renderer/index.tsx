import { useState } from 'react';
import { PageHeading } from '../../../src/shared/WorkspaceUI';
import { describeCron, formatDateInput, nextCronRuns } from '../logic';

export default function TimeCronPage() {
  const [dateInput, setDateInput] = useState(() => String(Math.floor(Date.now() / 1000))),
    [dateResult, setDateResult] = useState<ReturnType<typeof formatDateInput> | null>(null),
    [cron, setCron] = useState('*/15 * * * *'),
    [cronDescription, setCronDescription] = useState(''),
    [runs, setRuns] = useState<Date[]>([]),
    [error, setError] = useState('');
  const convertDate = () => {
    try {
      setDateResult(formatDateInput(dateInput));
      setError('');
    } catch (cause) {
      setDateResult(null);
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  const calculateCron = () => {
    try {
      setCronDescription(describeCron(cron));
      setRuns(nextCronRuns(cron));
      setError('');
    } catch (cause) {
      setRuns([]);
      setCronDescription('');
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };
  return (
    <div className="utility-tool">
      <PageHeading
        eyebrow="本地工具"
        title="时间与 Cron"
        description="时间戳自动识别秒或毫秒；Cron 使用本机时区，支持 *、列表、范围和步长。"
      />
      <div className="utility-grid utility-grid-tools">
        <section className="utility-panel utility-form-panel">
          <h2>时间转换</h2>
          <label className="utility-field">
            <span>时间戳或日期时间</span>
            <input
              aria-label="时间戳或日期时间"
              value={dateInput}
              onChange={(event) => {
                setDateInput(event.target.value);
                setDateResult(null);
              }}
              placeholder="1710000000、1710000000000 或 ISO 日期"
            />
          </label>
          <div className="utility-actions">
            <button type="button" onClick={convertDate}>
              转换时间
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                setDateInput(String(Date.now()));
                setDateResult(null);
              }}
            >
              使用当前时间
            </button>
          </div>
          {dateResult && (
            <dl className="utility-definition">
              <div>
                <dt>本地时间</dt>
                <dd>{dateResult.local}</dd>
              </div>
              <div>
                <dt>ISO 时间</dt>
                <dd>{dateResult.iso}</dd>
              </div>
              <div>
                <dt>Unix 秒</dt>
                <dd>{dateResult.seconds}</dd>
              </div>
              <div>
                <dt>Unix 毫秒</dt>
                <dd>{dateResult.milliseconds}</dd>
              </div>
              <div>
                <dt>相对现在</dt>
                <dd>{dateResult.relative}</dd>
              </div>
            </dl>
          )}
        </section>
        <section className="utility-panel utility-form-panel">
          <h2>Cron 执行时间</h2>
          <label className="utility-field">
            <span>五段 Cron 表达式</span>
            <input
              aria-label="Cron 表达式"
              value={cron}
              onChange={(event) => {
                setCron(event.target.value);
                setRuns([]);
                setCronDescription('');
              }}
              spellCheck={false}
              placeholder="分 时 日 月 星期"
            />
          </label>
          <div className="utility-actions">
            <button type="button" onClick={calculateCron}>
              解释并预测
            </button>
          </div>
          {cronDescription && (
            <p className="utility-note" role="status">
              {cronDescription}
            </p>
          )}
          {runs.length > 0 && (
            <ol className="utility-list" aria-label="未来执行时间">
              {runs.map((run) => (
                <li key={run.getTime()}>
                  <time dateTime={run.toISOString()}>
                    {run.toLocaleString('zh-CN', { hour12: false })}
                  </time>
                </li>
              ))}
            </ol>
          )}
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
