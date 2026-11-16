import { Button, Checkbox, DatePicker, Radio, ConfigProvider } from 'antd';
import dayjs from 'dayjs';
import { systemDocuments } from '../../ledger-fields';
import { useState } from 'react';
import type { Snapshot } from '../../types';
import { exportFormatLabels, type ExportFormat, type SystemExportResult } from '../../export-types';
import { secretLabels, type SecretKind } from '../../vault-types';
import { Dialog } from '../../shared/Dialog';
import { useVault } from '../vault/VaultProvider';

export function SystemExportDialog({
  systemId,
  snapshot,
  onClose,
}: {
  systemId: string;
  snapshot: Snapshot;
  onClose: () => void;
}) {
  const [formats, setFormats] = useState<ExportFormat[]>(['markdown']);
  const [secretKinds, setSecretKinds] = useState<SecretKind[]>(['password']);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [includeTasks, setIncludeTasks] = useState(true);
  const [taskStartDate, setTaskStartDate] = useState('');
  const [taskEndDate, setTaskEndDate] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [result, setResult] = useState<SystemExportResult | null>(null);
  const vault = useVault();
  const accounts = snapshot.accounts.filter((account) => account.systemId === systemId);
  const count = (kind: SecretKind) =>
    accounts.filter((account) => account.secretKinds.includes(kind)).length;
  const documents = systemDocuments(snapshot, systemId).length;
  const tasks = snapshot.tasks.filter(
    (item) => item.systemId === systemId && item.deletedAt === null,
  ).length;
  const hasDocuments = includeDocuments && documents > 0;
  const FormatChoice = hasDocuments ? Checkbox : Radio;
  const selectedFormats = hasDocuments ? formats : [formats.at(-1) ?? 'markdown'];
  const dateError =
    includeTasks && taskStartDate && taskEndDate && taskStartDate > taskEndDate
      ? '开始日期不能晚于结束日期。'
      : '';
  async function submit() {
    if (busy || dateError) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      if (secretKinds.some((kind) => count(kind) > 0) && !(await vault.ensureUnlocked())) return;
      setResult(
        await window.desktop.exportSystem({
          systemId,
          formats: selectedFormats,
          secretKinds,
          includeDocuments,
          includeTasks,
          taskStartDate: includeTasks ? taskStartDate : '',
          taskEndDate: includeTasks ? taskEndDate : '',
        }),
      );
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="导出系统资料" error={dateError || error} onClose={onClose} closeDisabled={busy}>
      <p>
        导出{snapshot.systems.find((system) => system.id === systemId)?.name}的完整台账。
        任务合并到系统总览，文档独立成文件。
      </p>
      <ConfigProvider componentDisabled={busy}>
        <fieldset className="export-options" disabled={busy} onChange={() => setResult(null)}>
          <legend>附加内容</legend>
          <Checkbox
            className="secret-show"
            aria-label="导出文档"
            checked={includeDocuments}
            onChange={(event) => setIncludeDocuments(event.target.checked)}
          >
            文档 · {documents}
          </Checkbox>
          <Checkbox
            className="secret-show"
            aria-label="导出任务"
            checked={includeTasks}
            onChange={(event) => setIncludeTasks(event.target.checked)}
          >
            任务 · {tasks}
          </Checkbox>
        </fieldset>
      </ConfigProvider>
      {includeTasks && (
        <ConfigProvider componentDisabled={busy}>
          <fieldset className="export-options" disabled={busy} onChange={() => setResult(null)}>
            <legend>任务日期范围</legend>
            <div className="context-fields">
              <label>
                开始日期
                <DatePicker
                  aria-label="开始日期"
                  value={taskStartDate ? dayjs(taskStartDate) : null}
                  onChange={(value) => {
                    setTaskStartDate(value?.format('YYYY-MM-DD') ?? '');
                    setResult(null);
                  }}
                />
              </label>
              <label>
                结束日期
                <DatePicker
                  aria-label="结束日期"
                  value={taskEndDate ? dayjs(taskEndDate) : null}
                  onChange={(value) => {
                    setTaskEndDate(value?.format('YYYY-MM-DD') ?? '');
                    setResult(null);
                  }}
                />
              </label>
            </div>
            <span className="field-hint">
              默认全部任务。按任务开始日期筛选，包含首尾当天；留空不限。
            </span>
          </fieldset>
        </ConfigProvider>
      )}
      <ConfigProvider componentDisabled={busy}>
        <fieldset className="export-options" disabled={busy} onChange={() => setResult(null)}>
          <legend>文件格式</legend>
          {(Object.keys(exportFormatLabels) as ExportFormat[]).map((format) => (
            <FormatChoice
              key={format}
              className="secret-show"
              name="system-export-format"
              aria-label={exportFormatLabels[format]}
              checked={selectedFormats.includes(format)}
              onChange={(event) =>
                setFormats(
                  !hasDocuments
                    ? [format]
                    : event.target.checked
                      ? [...formats, format]
                      : formats.filter((item) => item !== format),
                )
              }
            >
              {exportFormatLabels[format]}
            </FormatChoice>
          ))}
        </fieldset>
      </ConfigProvider>
      <p className="field-hint">
        {hasDocuments
          ? '文档独立成文件，保存为 ZIP 资料包；可选择多种格式。'
          : '选择一种格式，直接保存一个文件，图片嵌入文件。'}
      </p>
      <ConfigProvider componentDisabled={busy}>
        <fieldset className="export-options" disabled={busy} onChange={() => setResult(null)}>
          <legend>账号秘密</legend>
          {(Object.keys(secretLabels) as SecretKind[]).map((kind) => (
            <Checkbox
              key={kind}
              className="secret-show"
              aria-label={`包含${secretLabels[kind]}`}
              disabled={!count(kind)}
              checked={secretKinds.includes(kind)}
              onChange={(event) =>
                setSecretKinds(
                  event.target.checked
                    ? [...secretKinds, kind]
                    : secretKinds.filter((item) => item !== kind),
                )
              }
            >
              {secretLabels[kind]} · {count(kind)}
            </Checkbox>
          ))}
        </fieldset>
      </ConfigProvider>
      {secretKinds.some((kind) => count(kind)) && (
        <p className="field-hint">所选秘密会以明文写入文件，请妥善保存和交接资料包。</p>
      )}
      {result && (
        <div role="status" className="export-result">
          系统资料已导出，共 {result.files} 个文件。
          <br />
          {result.path}
        </div>
      )}
      <div className="modal-actions">
        <Button
          htmlType="submit"
          type="default"
          className="secondary-button"
          disabled={busy}
          onClick={onClose}
        >
          {result ? '完成' : '取消'}
        </Button>
        <Button
          htmlType="submit"
          type="primary"
          className="primary-button"
          disabled={busy || !selectedFormats.length || !!dateError}
          onClick={() => void submit()}
        >
          {busy ? '正在整理资料…' : '导出资料'}
        </Button>
      </div>
    </Dialog>
  );
}
