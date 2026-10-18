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
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [result, setResult] = useState<SystemExportResult | null>(null);
  const vault = useVault();
  const accounts = snapshot.accounts.filter((account) => account.systemId === systemId);
  const count = (kind: SecretKind) =>
    accounts.filter((account) => account.secretKinds.includes(kind)).length;
  const documents = snapshot.documents.filter(
    (item) => item.systemId === systemId && item.deletedAt === null,
  ).length;
  const tasks = snapshot.tasks.filter(
    (item) => item.systemId === systemId && item.deletedAt === null,
  ).length;
  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(null);
    try {
      if (secretKinds.some((kind) => count(kind) > 0) && !(await vault.ensureUnlocked())) return;
      setResult(await window.desktop.exportSystem({ systemId, formats, secretKinds }));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog title="导出系统资料" error={error} onClose={() => !busy && onClose()}>
      <p>
        {snapshot.systems.find((system) => system.id === systemId)?.name}的完整台账，包含{' '}
        {documents} 份文档和 {tasks} 项任务。每份文档独立成文件，另附系统总览。
      </p>
      <fieldset className="export-options" disabled={busy}>
        <legend>文件格式</legend>
        {(Object.keys(exportFormatLabels) as ExportFormat[]).map((format) => (
          <label key={format} className="secret-show">
            <input
              type="checkbox"
              aria-label={exportFormatLabels[format]}
              checked={formats.includes(format)}
              onChange={(event) =>
                setFormats(
                  event.target.checked
                    ? [...formats, format]
                    : formats.filter((item) => item !== format),
                )
              }
            />
            {exportFormatLabels[format]}
          </label>
        ))}
      </fieldset>
      <fieldset className="export-options" disabled={busy}>
        <legend>账号秘密</legend>
        {(Object.keys(secretLabels) as SecretKind[]).map((kind) => (
          <label key={kind} className="secret-show">
            <input
              type="checkbox"
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
            />
            {secretLabels[kind]} · {count(kind)}
          </label>
        ))}
      </fieldset>
      {secretKinds.some((kind) => count(kind)) && (
        <p className="field-hint">所选秘密会以明文写入文件，请妥善保存和交接资料包。</p>
      )}
      {result && (
        <div role="status" className="export-result">
          系统资料包已导出，共 {result.files} 个文件。
          <br />
          {result.path}
        </div>
      )}
      <div className="modal-actions">
        <button className="secondary-button" disabled={busy} onClick={onClose}>
          {result ? '完成' : '取消'}
        </button>
        <button
          className="primary-button"
          disabled={busy || !formats.length}
          onClick={() => void submit()}
        >
          {busy ? '正在整理资料…' : '导出资料包'}
        </button>
      </div>
    </Dialog>
  );
}
