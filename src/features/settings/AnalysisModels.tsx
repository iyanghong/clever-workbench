import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Input, Progress, Select } from 'antd';
import { CpuIcon, PlugsConnectedIcon } from '@phosphor-icons/react';
import {
  localImportModels,
  validLocalModel,
  type ModelSettings,
  type OllamaState,
  type RemoteServiceDraft,
} from '../../ledger-import-types';
import './analysis-models.css';

const api = () => window.desktop.localLedgerImport;
export function AnalysisModels({ onBack }: { onBack?: () => void }) {
  const [settings, setSettings] = useState<ModelSettings | null>(null),
    [runtime, setRuntime] = useState<OllamaState | null>(null);
  const [tab, setTab] = useState<'local' | 'remote'>('local'),
    [busy, setBusy] = useState(''),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [tag, setTag] = useState('qwen3:8b'),
    [custom, setCustom] = useState(''),
    [waiting, setWaiting] = useState(false);
  const [draft, setDraft] = useState<RemoteServiceDraft>({ name: '', endpoint: '', model: '' }),
    [tested, setTested] = useState(0);
  useEffect(() => {
    let live = true;
    const refresh = () =>
      void api()
        .state()
        .then((s) => {
          if (live) setRuntime(s.runtime);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    void api()
      .settings()
      .then((s) => {
        if (live) {
          setSettings(s);
          setTag(s.localModel);
          if (s.service)
            setDraft({
              name: s.service.name,
              model: s.service.model,
              endpoint: s.service.endpoint,
            });
        }
      })
      .catch((e) => {
        if (live) setError(String(e));
      });
    refresh();
    const detect = () =>
      void api()
        .detectOllama()
        .then((s) => {
          if (live) setRuntime(s);
        })
        .catch((e) => {
          if (live) setError(String(e));
        });
    detect();
    window.addEventListener('focus', detect);
    const off = api().onChanged(refresh);
    const lock = window.desktop.onVaultStatus((s) => {
      if (!s.unlocked) {
        setDraft((d) => ({ ...d, apiKey: undefined }));
        setTested(0);
      }
    });
    return () => {
      live = false;
      off();
      lock();
      window.removeEventListener('focus', detect);
    };
  }, []);
  useEffect(() => {
    if (!waiting) return;
    let live = true,
      inFlight = false;
    const check = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const s = await api().detectOllama();
        if (live && s.phase === 'stopped') {
          await api().startOllama();
          if (live) {
            setWaiting(false);
            setNotice('已检测到 Ollama，请选择模型。');
          }
        }
      } catch (e) {
        if (live) {
          setWaiting(false);
          setError(String(e));
        }
      } finally {
        inFlight = false;
      }
    };
    const timer = setInterval(() => void check(), 2000);
    void check();
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [waiting]);
  async function run(label: string, fn: () => Promise<void>) {
    if (busy) return;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await fn();
    } catch (e) {
      setError(String(e).replace(/^Error: Error invoking remote method '[^']+': Error: /, ''));
    } finally {
      setBusy('');
    }
  }
  function patch(p: Partial<RemoteServiceDraft>) {
    setDraft({ ...draft, ...p });
    setTested(0);
    setNotice('');
  }
  const name = (tag === 'custom' ? custom : tag).trim(),
    present = runtime?.models.some((m) => m.name === name),
    download = runtime?.download;
  const ready = runtime?.phase === 'ready',
    loading = (n: string) => busy === n;
  const controls = !!busy || !!download;
  return (
    <section className="analysis-model-settings" aria-label="分析模型设置">
      <header>
        <div>
          <h2>分析模型</h2>
          <p>管理本机模型与文件提取服务</p>
        </div>
        {onBack && (
          <Button disabled={!!busy} onClick={onBack}>
            返回文件导入
          </Button>
        )}
      </header>
      {settings?.warning && <Alert type="warning" title={settings.warning} />}
      <div className="analysis-service-grid">
        <nav aria-label="模型服务">
          {(['local', 'remote'] as const).map((k) => (
            <Button
              key={k}
              disabled={!!busy}
              type={tab === k ? 'primary' : 'default'}
              onClick={() => {
                setTab(k);
                setError('');
                setNotice('');
              }}
            >
              {k === 'local' ? <CpuIcon /> : <PlugsConnectedIcon />}
              {k === 'local' ? '本机 Ollama' : '第三方服务'}
            </Button>
          ))}
        </nav>
        <div className="analysis-service-panel">
          {tab === 'local' ? (
            <>
              <h3>本机 Ollama</h3>
              <p>文件提取、语义比对均在本机运行。</p>
              {runtime?.phase === 'missing' ? (
                <>
                  <p>
                    {waiting ? '官方安装界面已打开，正在等待安装完成…' : '未检测到 Ollama 运行时。'}
                  </p>
                  <Button
                    type="primary"
                    disabled={!!busy || waiting}
                    loading={loading('install')}
                    onClick={() =>
                      void run('install', async () => {
                        await api().installOllama();
                        setWaiting(true);
                      })
                    }
                  >
                    安装 Ollama
                  </Button>
                  {runtime?.installer && (
                    <div role="status">
                      <span>
                        {runtime.installer.phase === 'verify'
                          ? '正在校验官方磁盘映像'
                          : '正在下载官方安装包'}
                      </span>
                      <Progress
                        percent={Math.floor(
                          (100 * runtime.installer.received) / runtime.installer.total,
                        )}
                      />
                    </div>
                  )}
                  <small>下载并校验官方 Ollama 0.40.16 安装包。完成 macOS 安装后将自动检测。</small>
                </>
              ) : (
                <>
                  <div className="analysis-actions">
                    <span>
                      {ready
                        ? '本地服务已就绪'
                        : download
                          ? '正在下载模型'
                          : runtime?.phase === 'starting'
                            ? '正在启动'
                            : '本地服务尚未启动'}
                    </span>
                    <Button
                      disabled={controls || runtime?.phase === 'starting'}
                      loading={loading('start')}
                      onClick={() =>
                        void run('start', async () => {
                          await api().startOllama();
                        })
                      }
                    >
                      {ready ? '检查本地服务' : '启动 Ollama'}
                    </Button>
                  </div>
                  <label>
                    分析模型
                    <Select
                      aria-label="配置本机模型"
                      disabled={controls}
                      value={tag}
                      onChange={setTag}
                      options={[
                        ...new Set([
                          ...localImportModels,
                          ...(runtime?.models.map((m) => m.name) ?? []),
                          ...(settings ? [settings.localModel] : []),
                        ]),
                      ]
                        .map((value) => ({
                          value,
                          label:
                            value +
                            (runtime?.models.some((m) => m.name === value) ? ' · 已下载' : ''),
                        }))
                        .concat([{ value: 'custom', label: '输入自定义模型名…' }])}
                    />
                  </label>
                  {tag === 'custom' && (
                    <label>
                      模型名与标签
                      <Input
                        disabled={controls}
                        aria-label="自定义模型标签"
                        value={custom}
                        onChange={(e) => setCustom(e.target.value)}
                        placeholder="模型名:标签"
                      />
                    </label>
                  )}
                  <div className="analysis-actions">
                    <Button
                      disabled={!ready || controls || !validLocalModel(name)}
                      onClick={() =>
                        void run('download', async () => {
                          await api().downloadModel(name);
                        })
                      }
                    >
                      {present ? '重新下载或校验' : '下载模型'}
                    </Button>
                    <Button
                      type="primary"
                      disabled={!present || !ready || controls}
                      loading={loading('verify')}
                      onClick={() =>
                        void run('verify', async () => {
                          setSettings(await api().selectModel(name));
                          setNotice('样例提取通过，已选用该模型。');
                        })
                      }
                    >
                      验证并选用
                    </Button>
                    {download && (
                      <Button
                        onClick={() =>
                          void api()
                            .cancelDownload()
                            .catch((e) => setError(String(e)))
                        }
                      >
                        取消下载
                      </Button>
                    )}
                  </div>
                  {download && (
                    <>
                      <span>
                        {download.message} · {download.model}
                      </span>
                      <Progress
                        percent={
                          download.total
                            ? Math.floor((100 * download.completed) / download.total)
                            : 0
                        }
                      />
                    </>
                  )}
                  <small>
                    当前选用：{settings?.localModel || '读取中'}。自定义模型需通过虚构台账样例验证。
                  </small>
                </>
              )}
              {runtime?.error && <Alert type="warning" title={runtime.error} />}
            </>
          ) : (
            <>
              <h3>第三方模型服务</h3>
              <p>OpenAI 兼容 · Chat Completions。仅用于已获准文件的提取。</p>
              <fieldset disabled={!!busy}>
                <label>
                  服务名称
                  <Input
                    aria-label="服务名称"
                    value={draft.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label>
                  接口地址（Base URL）
                  <Input
                    aria-label="模型接口地址"
                    placeholder="https://gateway.example.com/v1"
                    value={draft.endpoint}
                    onChange={(e) => patch({ endpoint: e.target.value })}
                  />
                </label>
                <label>
                  模型名
                  <Input
                    aria-label="远端模型名"
                    value={draft.model}
                    onChange={(e) => patch({ model: e.target.value })}
                  />
                </label>
                <label>
                  API Key（可选）
                  <Input.Password
                    autoComplete="new-password"
                    visibilityToggle={false}
                    value={draft.apiKey ?? ''}
                    placeholder={settings?.service?.hasKey ? '同一地址留空可沿用已保存密钥' : ''}
                    onChange={(e) => patch({ apiKey: e.target.value || undefined })}
                  />
                </label>
                {settings?.service?.hasKey && (
                  <Checkbox
                    checked={draft.apiKey === ''}
                    onChange={(e) => patch({ apiKey: e.target.checked ? '' : undefined })}
                  >
                    清除此连接的已保存密钥
                  </Checkbox>
                )}
              </fieldset>
              <div className="analysis-actions">
                <Button
                  loading={loading('connect')}
                  disabled={!!busy}
                  onClick={() =>
                    void run('connect', async () => {
                      setTested(0);
                      await api().testService(draft, 'connect');
                      setTested(1);
                      setNotice('连接和模型认证通过。');
                    })
                  }
                >
                  测试连接
                </Button>
                <Button
                  loading={loading('sample')}
                  disabled={!!busy || tested < 1}
                  onClick={() =>
                    void run('sample', async () => {
                      await api().testService(draft, 'extract');
                      setTested(2);
                      setNotice('虚构样例通过结构化输出校验。');
                    })
                  }
                >
                  测试台账提取
                </Button>
                <Button
                  type="primary"
                  disabled={!!busy || tested !== 2}
                  onClick={() =>
                    void run('save', async () => {
                      setSettings(await api().saveService(draft));
                      setDraft({ ...draft, apiKey: undefined });
                      setTested(0);
                      setNotice('服务配置已保存。');
                    })
                  }
                >
                  保存配置
                </Button>
                {settings?.service && (
                  <Button
                    disabled={!!busy}
                    onClick={() =>
                      void run('remove', async () => {
                        setSettings(await api().removeService());
                        setDraft({ name: '', endpoint: '', model: '' });
                        setTested(0);
                        setNotice('已移除服务及其凭据。');
                      })
                    }
                  >
                    移除连接
                  </Button>
                )}
              </div>
              <small>试连仅使用虚构资料。已有台账及字段旧值始终留在本机。</small>
            </>
          )}
          {error && <Alert type="error" role="alert" title={error} />}{' '}
          {notice && <p role="status">{notice}</p>}
        </div>
      </div>
    </section>
  );
}
