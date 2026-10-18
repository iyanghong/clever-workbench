import { useEffect, useRef, useState } from 'react';
import {
  GearSixIcon,
  SunIcon,
  MoonIcon,
  DesktopIcon,
  DownloadSimpleIcon,
  UploadSimpleIcon,
  CheckCircleIcon,
  XIcon,
  LockKeyIcon,
} from '@phosphor-icons/react';
import type { ModuleProps } from '../../app/modules';
import type { BackupInfo, BackupSelection, Command, Snapshot } from '../../types';
import { dateLabel } from '../../domain';
import { useVault } from '../vault/VaultProvider';
import { Dialog } from '../../shared/Dialog';
import { PasswordChange } from './PasswordChange';
const message = (cause: unknown) =>
  String(cause).replace(/^Error: Error invoking remote method '[^']+': Error: /, '');
export function SettingsPage({ setContext }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);
  const [selection, setSelection] = useState<BackupSelection | null>(null),
    [password, setPassword] = useState(''),
    [preview, setPreview] = useState<BackupInfo | null>(null),
    [dialogError, setDialogError] = useState('');
  const activeTokens = useRef(new Set<string>()),
    working = useRef(false),
    vault = useVault();
  useEffect(() => {
    setContext({});
    const unsubscribe = window.desktop.onSettingsChange((settings) => {
      setSnapshot((previous) => (previous ? { ...previous, settings } : previous));
    });
    void window.desktop
      .snapshot()
      .then(setSnapshot)
      .catch((cause) => setError(message(cause)));
    return () => {
      unsubscribe();
      for (const token of activeTokens.current)
        void window.desktop.discardBackup(token).catch(() => {});
      activeTokens.current.clear();
    };
  }, []);
  async function run(label: string, operation: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await operation();
    } catch (cause) {
      setError(message(cause));
    } finally {
      working.current = false;
      setBusy('');
    }
  }
  async function update(command: Extract<Command, { type: 'settings' }>) {
    setError('');
    const { type, ...patch } = command;
    setSnapshot((previous) =>
      previous ? { ...previous, settings: { ...previous.settings, ...patch } } : previous,
    );
    try {
      setSnapshot((await window.desktop.mutate(command)).snapshot);
    } catch (cause) {
      setError(message(cause));
      try {
        setSnapshot(await window.desktop.snapshot());
      } catch {
        /* Keep the error visible. */
      }
    }
  }
  async function exportBackup() {
    await run('正在生成加密备份…', async () => {
      if (!(await window.desktop.vaultStatus()).initialized && !(await vault.ensureUnlocked()))
        return;
      const file = await window.desktop.backup();
      if (file) setNotice(`备份已保存：${file}`);
      setSnapshot(await window.desktop.snapshot());
    });
  }
  async function chooseBackup() {
    await run('', async () => {
      const selected = await window.desktop.chooseBackup();
      if (selected) {
        activeTokens.current.add(selected.token);
        setSelection(selected);
        setPassword('');
        setDialogError('');
      }
    });
  }
  async function cancelBackup() {
    if (working.current) return;
    const tokens = [selection?.token, preview?.token].filter((token): token is string =>
      Boolean(token),
    );
    setSelection(null);
    setPreview(null);
    setPassword('');
    setDialogError('');
    for (const token of tokens) {
      activeTokens.current.delete(token);
      try {
        await window.desktop.discardBackup(token);
      } catch (cause) {
        setError(message(cause));
      }
    }
  }
  async function inspect() {
    if (!selection || working.current) return;
    working.current = true;
    setBusy('正在解密并校验备份…');
    setDialogError('');
    try {
      const info = await window.desktop.inspectBackup(selection.token, password);
      activeTokens.current.delete(selection.token);
      activeTokens.current.add(info.token);
      setPreview(info);
      setSelection(null);
      setPassword('');
    } catch (cause) {
      setDialogError(message(cause));
    } finally {
      working.current = false;
      setBusy('');
    }
  }
  async function restore() {
    if (!preview || working.current) return;
    working.current = true;
    setBusy('正在保留当前副本并恢复…');
    setDialogError('');
    try {
      const next = await window.desktop.restoreBackup(preview.token);
      activeTokens.current.delete(preview.token);
      setSnapshot(next);
      setPreview(null);
      setNotice('恢复完成，资料与附件已就位。');
    } catch (cause) {
      setDialogError(message(cause));
    } finally {
      working.current = false;
      setBusy('');
    }
  }
  return (
    <main className="main">
      <header className="window-toolbar">
        <div className="breadcrumb">
          <GearSixIcon size={17} />
          <span>设置</span>
        </div>
      </header>
      <section className="settings-page">
        <span className="eyebrow">CLEVER WORKBENCH</span>
        <h1>你的工作空间</h1>
        <p className="page-description">外观、秘密保护和本地资料备份。</p>
        {snapshot && (
          <>
            <h3>外观</h3>
            <div className="setting-row">
              <div>
                <strong>界面主题</strong>
                <p>跟随系统，或选择固定外观</p>
              </div>
              <div className="segmented">
                {(
                  [
                    { id: 'light', name: '浅色', Icon: SunIcon },
                    { id: 'dark', name: '深色', Icon: MoonIcon },
                    { id: 'system', name: '系统', Icon: DesktopIcon },
                  ] as const
                ).map((theme) => (
                  <button
                    key={theme.id}
                    aria-pressed={snapshot.settings.theme === theme.id}
                    className={snapshot.settings.theme === theme.id ? 'active' : ''}
                    disabled={Boolean(busy)}
                    onClick={() => void update({ type: 'settings', theme: theme.id })}
                  >
                    <theme.Icon size={16} />
                    {theme.name}
                  </button>
                ))}
              </div>
            </div>
            <h3>秘密保护</h3>
            <div className="setting-row">
              <div>
                <strong>{vault.status.initialized ? '主密码已设置' : '尚未设置主密码'}</strong>
                <p>普通资料可直接查看，秘密按需解锁。</p>
              </div>
              <button
                className="secondary-button"
                onClick={() =>
                  void (vault.status.unlocked ? vault.lock() : vault.ensureUnlocked()).catch(
                    (cause) => setError(message(cause)),
                  )
                }
              >
                <LockKeyIcon size={15} />
                {vault.status.unlocked
                  ? '立即锁定'
                  : vault.status.initialized
                    ? '解锁秘密'
                    : '设置主密码'}
              </button>
            </div>
            {vault.status.initialized && (
              <div className="setting-row">
                <div>
                  <strong>更改主密码</strong>
                  <p>当前资料使用新密码，已有备份保留原密码。</p>
                </div>
                <button
                  className="secondary-button"
                  disabled={Boolean(busy)}
                  onClick={() => {
                    setNotice('');
                    setError('');
                    setChangingPassword(true);
                  }}
                >
                  更改主密码
                </button>
              </div>
            )}
            <h3>备份与迁移</h3>
            <div className="setting-row">
              <div>
                <strong>自动加密备份</strong>
                <p>
                  {vault.status.initialized
                    ? '有变更时每日备份一次，保留最近 7 份。锁定秘密时也可运行。'
                    : '未启用：设置主密码后，才能生成完整加密备份。'}
                </p>
              </div>
              <input
                role="switch"
                aria-label="自动备份"
                type="checkbox"
                disabled={!vault.status.initialized || Boolean(busy)}
                checked={vault.status.initialized && snapshot.settings.autoBackup}
                onChange={(event) =>
                  void update({ type: 'settings', autoBackup: event.target.checked })
                }
              />
            </div>
            <div className="setting-row">
              <div>
                <strong>备份位置</strong>
                <p className="path-text">{snapshot.settings.backupDir}</p>
              </div>
              <button
                className="secondary-button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void run('', async () => {
                    const next = await window.desktop.backupDirectory();
                    if (next) setSnapshot(next);
                  })
                }
              >
                更改目录
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>最近自动备份</strong>
                <p>
                  {snapshot.settings.lastBackupAt
                    ? dateLabel(snapshot.settings.lastBackupAt, true)
                    : vault.status.initialized
                      ? '尚未生成，应用运行时会自动检查。'
                      : '尚未启用'}
                </p>
                {snapshot.settings.lastBackupError && (
                  <p className="error-text">{snapshot.settings.lastBackupError}</p>
                )}
              </div>
              {vault.status.initialized && (
                <button
                  className="secondary-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void run('正在重试自动备份…', async () => {
                      const next = await window.desktop.retryBackup();
                      setSnapshot(next);
                      if (next.settings.lastBackupError)
                        throw new Error(next.settings.lastBackupError);
                      setNotice('自动备份已完成。');
                    })
                  }
                >
                  立即备份
                </button>
              )}
            </div>
            <div className="backup-actions">
              <button
                className="primary-button"
                disabled={Boolean(busy)}
                onClick={() => void exportBackup()}
              >
                <DownloadSimpleIcon size={17} />
                导出完整备份
              </button>
              <button
                className="secondary-button"
                disabled={Boolean(busy)}
                onClick={() => void chooseBackup()}
              >
                <UploadSimpleIcon size={17} />
                从备份恢复
              </button>
            </div>
            <p className="backup-note">
              项目历史、台账、账号、任务、文档、草稿和引用图片整体加密。换机使用备份生成时的主密码；导出不需要解锁秘密。
            </p>
            <h3>关于</h3>
            <div className="about-row">
              <div>
                <strong>Clever Workbench</strong>
                <p>版本 0.1.0 · 本地个人工作台</p>
              </div>
            </div>
          </>
        )}
      </section>
      {changingPassword && (
        <PasswordChange
          onClose={() => setChangingPassword(false)}
          onSuccess={() => {
            setChangingPassword(false);
            setNotice('主密码已更改，秘密已锁定。已有备份仍使用原密码。');
          }}
        />
      )}
      {selection && (
        <Dialog title="输入备份密码" onClose={() => void cancelBackup()} error={dialogError}>
          <p>{selection.name}</p>
          <p>请输入生成这份备份时的主密码。校验不会修改当前资料。</p>
          <label>
            备份密码
            <input
              type="password"
              aria-label="备份密码"
              autoFocus
              autoComplete="off"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.nativeEvent.isComposing) void inspect();
              }}
            />
          </label>
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={Boolean(busy)}
              onClick={() => void cancelBackup()}
            >
              取消
            </button>
            <button
              className="primary-button"
              disabled={!password || Boolean(busy)}
              onClick={() => void inspect()}
            >
              {busy ? '校验中…' : '校验备份'}
            </button>
          </div>
        </Dialog>
      )}
      {preview && (
        <Dialog title="恢复这份备份" onClose={() => void cancelBackup()} error={dialogError}>
          <p>{new Date(preview.createdAt).toLocaleString('zh-CN')}</p>
          <div className="backup-preview">
            <p>
              {preview.tasks} 条任务 · {preview.documents} 份文档 · {preview.images} 张图片
            </p>
            <p>
              {preview.projects} 个项目 · {preview.systems} 个系统 · {preview.resources} 个资源
            </p>
            <p>
              {preview.accounts} 个账号 · {preview.secrets} 项秘密
            </p>
          </div>
          <p>将替换当前资料、草稿与回收站。替换前会保留一份当前资料的加密副本。</p>
          <div className="modal-actions">
            <button
              className="secondary-button"
              disabled={Boolean(busy)}
              onClick={() => void cancelBackup()}
            >
              取消
            </button>
            <button
              className="primary-button"
              disabled={Boolean(busy)}
              onClick={() => void restore()}
            >
              {busy ? '恢复中…' : '恢复备份'}
            </button>
          </div>
        </Dialog>
      )}
      {busy && !selection && !preview && (
        <div className="busy-overlay" role="status">
          <span className="spinner" />
          {busy}
        </div>
      )}
      {notice && (
        <div className="toast" role="status">
          <CheckCircleIcon size={18} />
          <span>{notice}</span>
        </div>
      )}
      {error && (
        <div className="error-banner" role="alert">
          <span>{error}</span>
          <button aria-label="关闭提示" onClick={() => setError('')}>
            <XIcon />
          </button>
        </div>
      )}
    </main>
  );
}
