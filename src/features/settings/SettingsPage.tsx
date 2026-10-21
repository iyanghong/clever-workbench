import { SettingsGuidance } from '../guidance/Guidance';
import { PageHeading, SegmentedControl } from '../../shared/WorkspaceUI';
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
import { AboutUpdate } from './AppUpdate';
const message = (cause: unknown) =>
  String(cause).replace(/^Error: Error invoking remote method '[^']+': Error: /, '');
export function SettingsPage({ setContext, route }: ModuleProps) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState('');
  const [changingPassword, setChangingPassword] = useState<'change' | 'disable' | null>(null);
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
  useEffect(() => {
    if (
      !snapshot ||
      !route.section ||
      !['appearance', 'vault', 'backup', 'about', 'guidance'].includes(route.section)
    )
      return;
    document.getElementById(`settings-${route.section}`)?.scrollIntoView({ block: 'start' });
  }, [snapshot !== null, route.section]);
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
      if (!(await vault.ensureBackup())) return;
      const file = await window.desktop.backup();
      if (file) setNotice(`备份已保存：${file}`);
      setSnapshot(await window.desktop.snapshot());
    });
  }
  async function automaticBackup(enabled: boolean) {
    try {
      if (enabled && !vault.status.backupConfigured && !(await vault.ensureBackup())) return;
      await update({ type: 'settings', autoBackup: enabled });
    } catch (cause) {
      setError(message(cause));
    }
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
      if (vault.status.mode === 'password' && !(await vault.ensureUnlocked())) return;
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
    <main className="main" aria-busy={!snapshot || !!busy}>
      <header className="window-toolbar">
        <div className="breadcrumb">
          <GearSixIcon size={17} />
          <span>设置</span>
        </div>
      </header>
      <section className="settings-page">
        <PageHeading
          title="你的工作空间"
          eyebrow="CLEVER WORKBENCH"
          description="外观、秘密保护和本地资料备份。"
        />
        {snapshot && (
          <>
            <h3 id="settings-appearance">外观</h3>
            <div className="setting-row">
              <div>
                <strong>界面主题</strong>
                <p>跟随系统，或选择固定外观</p>
              </div>
              <SegmentedControl
                label="界面主题"
                value={snapshot.settings.theme}
                disabled={Boolean(busy)}
                options={[
                  {
                    value: 'light',
                    label: (
                      <>
                        <SunIcon size={16} />
                        浅色
                      </>
                    ),
                  },
                  {
                    value: 'dark',
                    label: (
                      <>
                        <MoonIcon size={16} />
                        深色
                      </>
                    ),
                  },
                  {
                    value: 'system',
                    label: (
                      <>
                        <DesktopIcon size={16} />
                        系统
                      </>
                    ),
                  },
                ]}
                onChange={(theme) => void update({ type: 'settings', theme })}
              />
            </div>
            <h3>可访问性</h3>
            {(
              [
                {
                  key: 'reduceTransparency',
                  title: '减少透明度',
                  description: '使用实色导航和工具栏，让文字背景更稳定。',
                },
                {
                  key: 'highContrast',
                  title: '增强对比',
                  description: '加深次要文字与分隔线，突出操作焦点。',
                },
                {
                  key: 'reduceMotion',
                  title: '减少动态效果',
                  description: '关闭过渡和动画，保留即时状态反馈。',
                },
              ] as const
            ).map((preference) => (
              <div className="setting-row" key={preference.key}>
                <div>
                  <strong>{preference.title}</strong>
                  <p>{preference.description}</p>
                </div>
                <input
                  role="switch"
                  type="checkbox"
                  aria-label={preference.title}
                  checked={snapshot.settings[preference.key]}
                  disabled={Boolean(busy)}
                  onChange={(event) =>
                    void update({ type: 'settings', [preference.key]: event.target.checked })
                  }
                />
              </div>
            ))}
            <p className="backup-note">系统启用的可访问性偏好也会自动生效。</p>
            <h3 id="settings-vault">秘密保护</h3>
            <div className="setting-row">
              <div>
                <strong>{vault.status.initialized ? '主密码已设置' : '系统加密保护'}</strong>
                <p>
                  {vault.status.initialized
                    ? '普通资料可直接查看，秘密按需解锁。'
                    : '凭据由当前系统账户加密保管，日常无需应用主密码。'}
                </p>
              </div>
              {vault.status.initialized && (
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
              )}
              {!vault.status.initialized && (
                <button
                  className="secondary-button"
                  disabled={Boolean(busy)}
                  onClick={() =>
                    void vault.enableMaster().catch((cause) => setError(message(cause)))
                  }
                >
                  启用主密码
                </button>
              )}
            </div>
            {vault.status.initialized && (
              <div className="setting-row">
                <div>
                  <strong>更改主密码</strong>
                  <p>只更改本机解锁密码，独立备份密码保持不变。</p>
                </div>
                <div className="setting-actions">
                  <button
                    className="secondary-button"
                    disabled={Boolean(busy)}
                    onClick={() => {
                      setNotice('');
                      setError('');
                      setChangingPassword('change');
                    }}
                  >
                    更改主密码
                  </button>
                  <button
                    className="secondary-button"
                    disabled={Boolean(busy)}
                    onClick={() => setChangingPassword('disable')}
                  >
                    关闭主密码
                  </button>
                </div>
              </div>
            )}
            <h3 id="settings-backup">备份与迁移</h3>
            <div className="setting-row">
              <div>
                <strong>独立备份密码</strong>
                <p>配置一次，恢复时使用。与本机主密码分别管理。</p>
              </div>
              <button
                className="secondary-button"
                disabled={Boolean(busy)}
                onClick={() =>
                  void vault.ensureBackup(true).catch((cause) => setError(message(cause)))
                }
              >
                {vault.status.backupConfigured ? '更改备份密码' : '设置备份密码'}
              </button>
            </div>
            <div className="setting-row">
              <div>
                <strong>自动加密备份</strong>
                <p>
                  {vault.status.backupConfigured
                    ? '有变更时每日备份一次，保留最近 7 份。锁定秘密时也可运行。'
                    : '未启用：首次备份时设置独立备份密码。'}
                </p>
              </div>
              <input
                role="switch"
                aria-label="自动备份"
                type="checkbox"
                disabled={Boolean(busy)}
                checked={Boolean(vault.status.backupConfigured && snapshot.settings.autoBackup)}
                onChange={(event) => void automaticBackup(event.target.checked)}
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
                    : vault.status.backupConfigured
                      ? '尚未生成，应用运行时会自动检查。'
                      : '尚未启用'}
                </p>
                {snapshot.settings.lastBackupError && (
                  <p className="error-text">{snapshot.settings.lastBackupError}</p>
                )}
              </div>
              {vault.status.backupConfigured && (
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
              项目历史、台账、账号、任务、文档、草稿和引用图片整体加密。换机使用该备份的独立备份密码；旧备份继续使用生成时的密码。
            </p>
            <SettingsGuidance />
            <h3 id="settings-about">关于</h3>
            <AboutUpdate />
          </>
        )}
      </section>
      {changingPassword && (
        <PasswordChange
          disable={changingPassword === 'disable'}
          onClose={() => setChangingPassword(null)}
          onSuccess={() => {
            setChangingPassword(null);
            setNotice(
              changingPassword === 'disable'
                ? '主密码已关闭，凭据由系统加密保护。'
                : '主密码已更改，秘密已锁定。备份密码保持不变。',
            );
          }}
        />
      )}
      {selection && (
        <Dialog title="输入备份密码" onClose={() => void cancelBackup()} error={dialogError}>
          <p>{selection.name}</p>
          <p>请输入这份文件的备份密码；旧格式使用生成时的主密码。校验不会修改当前资料。</p>
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
              {preview.projects} 个项目 · {preview.systems} 个系统 · {preview.resources} 个资源 ·{' '}
              {preview.accessEntries} 个访问入口
            </p>
            <p>
              {preview.accounts} 个账号 · {preview.secrets} 项秘密
            </p>
          </div>
          <p>将替换当前资料、草稿与回收站。替换前会保留一份当前资料的加密副本。</p>
          {!vault.status.backupConfigured && (
            <p>当前尚未设置备份密码，恢复前副本使用本次导入文件的备份密码。</p>
          )}
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
