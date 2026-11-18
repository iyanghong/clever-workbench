import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import {
  localImportModels,
  type LocalImportModel,
  type OllamaState,
} from '../src/ledger-import-types';

export const localInferenceProfile =
  '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))';
export function modelDownloadProgress(
  previous: { digest: string; completed: number; total: number },
  update: { digest?: unknown; completed?: unknown; total?: unknown },
) {
  const digest = typeof update.digest === 'string' ? update.digest : previous.digest;
  const total =
    Number.isSafeInteger(update.total) && Number(update.total) >= 0
      ? Number(update.total)
      : previous.total;
  const completed =
    Number.isSafeInteger(update.completed) && Number(update.completed) >= 0
      ? Number(update.completed)
      : digest !== previous.digest
        ? 0
        : previous.completed;
  return { digest, total, completed: Math.min(completed, total) };
}

export class LocalOllama {
  private child: ChildProcess | null = null;
  private port = 0;
  private starting: Promise<void> | null = null;
  private mode: 'prepare' | 'analysis' | null = null;
  private downloadController: AbortController | null = null;
  private value: OllamaState = {
    phase: 'stopped',
    version: null,
    models: [],
    download: null,
    error: null,
  };
  constructor(
    private directory: string,
    private changed: () => void = () => {},
  ) {}
  snapshot(): OllamaState {
    return structuredClone(this.value);
  }
  get downloading() {
    return this.downloadController !== null;
  }
  private update(value: Partial<OllamaState>) {
    Object.assign(this.value, value);
    this.changed();
  }
  private async binary() {
    const executable = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
    const candidates = [
      '/Applications/Ollama.app/Contents/Resources/ollama',
      path.join(os.homedir(), 'Applications/Ollama.app/Contents/Resources/ollama'),
      ...(process.env.LOCALAPPDATA
        ? [path.join(process.env.LOCALAPPDATA, 'Programs/Ollama/ollama.exe')]
        : []),
      ...(process.env.PATH ?? '')
        .split(path.delimiter)
        .filter(Boolean)
        .map((entry) => path.join(entry, executable)),
    ];
    for (const filename of [...new Set(candidates)]) {
      try {
        await fs.access(filename, process.platform === 'win32' ? constants.F_OK : constants.X_OK);
        if ((await fs.stat(filename)).isFile()) return filename;
      } catch {
        /* Try the next standard installation location. */
      }
    }
    return null;
  }
  async detect() {
    if (!this.child && !this.starting)
      this.update({ phase: (await this.binary()) ? 'stopped' : 'missing' });
    return this.snapshot();
  }
  async start(mode: 'prepare' | 'analysis' = 'prepare') {
    if (this.starting) await this.starting;
    if (this.child && this.port && this.mode === mode) return;
    this.starting = (async () => {
      if (this.child) {
        const child = this.child;
        this.child = null;
        this.port = 0;
        await new Promise<void>((resolve) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 3000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill();
        });
      }
      await this.launch(mode);
    })();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }
  private async launch(mode: 'prepare' | 'analysis') {
    const binary = await this.binary();
    if (!binary) {
      this.update({ phase: 'missing', error: '未找到 Ollama，请先从官网安装，再重试。' });
      throw new Error(this.value.error!);
    }
    this.update({ phase: 'starting', error: null });
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    this.port = await new Promise<number>((resolve, reject) => {
      const listener = net.createServer();
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', () => {
        const address = listener.address();
        if (!address || typeof address === 'string') {
          listener.close();
          reject(new Error('无法准备本地模型端口。'));
          return;
        }
        listener.close((error) => (error ? reject(error) : resolve(address.port)));
      });
    });
    const environment = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          !key.startsWith('OLLAMA_') &&
          (mode !== 'analysis' || !/^(?:https?|all|no)_proxy$/i.test(key)),
      ),
    );
    const isolated = mode === 'analysis' && process.platform === 'darwin';
    const child = spawn(
      isolated ? '/usr/bin/sandbox-exec' : binary,
      isolated ? ['-p', localInferenceProfile, binary, 'serve'] : ['serve'],
      {
        env: {
          ...environment,
          OLLAMA_HOST: `127.0.0.1:${this.port}`,
          OLLAMA_MODELS: this.directory,
          OLLAMA_NO_CLOUD: '1',
          OLLAMA_CONTEXT_LENGTH: '16384',
          OLLAMA_NUM_PARALLEL: '1',
          OLLAMA_MAX_LOADED_MODELS: '1',
          OLLAMA_KEEP_ALIVE: '0',
          OLLAMA_DEBUG: '0',
        },
        stdio: 'ignore',
        windowsHide: true,
      },
    );
    this.mode = mode;
    this.child = child;
    let failed = false;
    child.once('error', () => {
      failed = true;
    });
    child.once('exit', () => {
      failed = true;
      if (this.child === child) {
        this.child = null;
        this.port = 0;
        this.mode = null;
        this.downloadController?.abort();
        this.update({ phase: 'stopped', version: null, download: null, models: [] });
      }
    });
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (failed) throw new Error('Ollama 启动失败，请确认系统版本和安装完整性后重试。');
        try {
          const response = await this.json(
            'GET',
            '/api/version',
            undefined,
            AbortSignal.timeout(1000),
          );
          if (typeof response.version !== 'string') throw new Error('版本信息无效。');
          this.update({ phase: 'ready', version: response.version, error: null });
          await this.refreshModels();
          return;
        } catch {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
      throw new Error('Ollama 启动超时，请重试或重新安装。');
    } catch (error) {
      this.stop();
      this.update({
        phase: 'failed',
        error: error instanceof Error ? error.message : 'Ollama 无法启动。',
      });
      throw error;
    }
  }
  private async request(
    method: string,
    pathname: string,
    body: unknown,
    signal: AbortSignal,
    receive?: (chunk: string) => void,
  ) {
    if (!this.child || !this.port) throw new Error('请先启动本地模型服务。');
    const data = body === undefined ? undefined : JSON.stringify(body);
    return new Promise<string>((resolve, reject) => {
      let size = 0,
        result = '';
      const request = http.request(
        {
          hostname: '127.0.0.1',
          port: this.port,
          path: pathname,
          method,
          signal,
          headers: data
            ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
            : {},
        },
        (response) => {
          if (response.statusCode !== 200) {
            response.resume();
            reject(
              new Error(
                response.statusCode === 404
                  ? '模型未准备好，请下载所选本地模型。'
                  : '本地模型请求失败，请重试或检查安装。',
              ),
            );
            return;
          }
          response.setEncoding('utf8');
          response.on('data', (chunk: string) => {
            size += Buffer.byteLength(chunk);
            if (size > 4 * 1024 ** 2) {
              response.destroy();
              request.destroy();
              reject(new Error('模型响应超过安全大小，请缩小文件后重试。'));
              return;
            }
            if (receive) receive(chunk);
            else result += chunk;
          });
          response.once('error', () => reject(new Error('本地模型连接中断，请重试。')));
          response.once('end', () => resolve(result));
        },
      );
      request.once('error', () =>
        reject(
          new Error(signal.aborted ? '本地模型操作已取消。' : '无法连接本地模型服务，请重新启动。'),
        ),
      );
      request.end(data);
    });
  }
  private async json(
    method: string,
    pathname: string,
    body?: unknown,
    signal = AbortSignal.timeout(15_000),
  ) {
    const text = await this.request(method, pathname, body, signal);
    try {
      return JSON.parse(text);
    } catch {
      throw new Error('本地模型返回无效响应，请重试。');
    }
  }
  private model(model: unknown): asserts model is LocalImportModel {
    if (!localImportModels.includes(model as LocalImportModel))
      throw new Error('请选择列表中的本地模型。');
  }
  async refreshModels() {
    const response = await this.json('GET', '/api/tags');
    this.update({
      models: Array.isArray(response.models)
        ? response.models
            .filter(
              (item: any) =>
                localImportModels.includes(item.name) && Number.isSafeInteger(item.size),
            )
            .map((item: any) => ({ name: item.name, size: item.size }))
        : [],
    });
  }
  download(model: unknown) {
    this.model(model);
    if (this.downloadController) throw new Error('已有模型正在下载，请先等待或取消。');
    if (this.value.phase !== 'ready') throw new Error('请先启动本地模型服务。');
    const controller = new AbortController();
    this.downloadController = controller;
    this.update({
      phase: 'downloading',
      error: null,
      download: { model, completed: 0, total: 0, message: '正在准备下载' },
    });
    void this.pull(model, controller);
  }
  private async pull(model: LocalImportModel, controller: AbortController) {
    let pending = '',
      last = 0;
    let progress = { digest: '', completed: 0, total: 0 };
    let failed = false;
    try {
      await this.start('prepare');
      if (controller.signal.aborted) throw new Error('模型下载已取消。');
      this.update({ phase: 'downloading' });
      await this.request(
        'POST',
        '/api/pull',
        { model, stream: true },
        controller.signal,
        (chunk) => {
          pending += chunk;
          for (;;) {
            const end = pending.indexOf('\n');
            if (end < 0) break;
            const line = pending.slice(0, end);
            pending = pending.slice(end + 1);
            let value;
            try {
              value = JSON.parse(line);
            } catch {
              failed = true;
              controller.abort();
              return;
            }
            if (value.error) {
              failed = true;
              controller.abort();
              return;
            }
            progress = modelDownloadProgress(progress, value);
            if (Date.now() - last < 150 && value.status !== 'success') continue;
            last = Date.now();
            this.update({
              download: {
                model,
                completed: progress.completed,
                total: progress.total,
                message:
                  value.status === 'success'
                    ? '下载完成'
                    : value.status?.startsWith('verifying')
                      ? '正在校验模型'
                      : '正在下载模型',
              },
            });
          }
        },
      );
      if (controller.signal.aborted) throw new Error('模型下载已取消，可稍后继续。');
      await this.refreshModels();
      if (!this.value.models.some((item) => item.name === model))
        throw new Error('模型未下载完整，请重试。');
      this.update({ phase: 'ready', download: null, error: null });
    } catch (error) {
      this.update({
        phase: this.child ? 'ready' : 'stopped',
        download: null,
        error: failed
          ? '模型下载或校验失败，请重试；未改动已有台账。'
          : controller.signal.aborted
            ? '模型下载已取消，可稍后继续。'
            : error instanceof Error
              ? error.message
              : '模型下载失败，请重试。',
      });
    } finally {
      if (this.downloadController === controller) this.downloadController = null;
    }
  }
  cancelDownload() {
    this.downloadController?.abort();
  }
  async chat(
    model: LocalImportModel,
    messages: { role: 'system' | 'user'; content: string }[],
    format: unknown,
    signal: AbortSignal,
  ) {
    this.model(model);
    if (this.downloadController) throw new Error('请先等待模型下载完成。');
    await this.start('analysis');
    if (this.value.phase !== 'ready' || !this.value.models.some((item) => item.name === model))
      throw new Error('请先准备好所选本地模型。');
    const response = await this.json(
      'POST',
      '/api/chat',
      {
        model,
        messages,
        format,
        stream: false,
        think: false,
        keep_alive: 0,
        options: { temperature: 0, seed: 0, num_ctx: 16384, num_predict: 8192 },
      },
      AbortSignal.any([signal, AbortSignal.timeout(600_000)]),
    );
    if (response.done_reason === 'length')
      throw new Error('模型输出未完成，请缩小文件范围后重试。');
    if (typeof response.message?.content !== 'string')
      throw new Error('模型没有返回可读取的台账，请重试。');
    return {
      content: response.message.content,
      seconds: Number(response.total_duration ?? 0) / 1e9,
      inputTokens: Number(response.prompt_eval_count ?? 0),
      outputTokens: Number(response.eval_count ?? 0),
    };
  }
  stop() {
    this.downloadController?.abort();
    const child = this.child;
    this.child = null;
    this.port = 0;
    this.mode = null;
    child?.kill();
    this.update({ phase: 'stopped', version: null, download: null, models: [] });
  }
}
