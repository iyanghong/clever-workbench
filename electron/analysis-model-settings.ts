import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import type { ModelSettings, RemoteServiceDraft } from '../src/ledger-import-types';
import { validLocalModel } from '../src/ledger-import-types';
import type { LocalOllama } from './local-ollama';

type Service = NonNullable<ModelSettings['service']>;
type Stored = Omit<ModelSettings, 'service'> & {
  service: (Omit<Service, 'hasKey'> & { secret: string }) | null;
};
type Encryption = {
  encryptString: (s: string) => Buffer;
  decryptString: (b: Buffer) => string;
  isEncryptionAvailable: () => boolean;
};
const sample =
  '名称是样例门户，地址是 https://demo.example.invalid 。提取 name 和 address，返回 JSON。';
const schema = {
  type: 'object',
  properties: { name: { type: 'string' }, address: { type: 'string' } },
  required: ['name', 'address'],
};

export async function verifyAnalysisModel(
  runtime: Pick<LocalOllama, 'chat'>,
  model: string,
  signal: AbortSignal,
) {
  const reply = await runtime.chat(model, [{ role: 'user', content: sample }], schema, signal);
  let result;
  try {
    result = JSON.parse(reply.content);
  } catch {}
  if (
    result?.name !== '样例门户' ||
    !['https://demo.example.invalid', 'https://demo.example.invalid/'].includes(result.address)
  )
    throw new Error('虚构台账样例未通过：请检查模型是否支持结构化提取。');
}

export function compatibleChat(
  endpoint: string,
  key: string,
  send: typeof fetch,
): Pick<LocalOllama, 'chat'> {
  return {
    async chat(model, messages, format, signal) {
      const abort = AbortSignal.any([signal, AbortSignal.timeout(300_000)]);
      let response: Response;
      try {
        response = await send(endpoint + '/chat/completions', {
          method: 'POST',
          redirect: 'error',
          credentials: 'omit',
          signal: abort,
          headers: {
            'Content-Type': 'application/json',
            ...(key ? { Authorization: 'Bearer ' + key } : {}),
          },
          body: JSON.stringify({
            model,
            stream: false,
            messages: format
              ? [
                  {
                    role: 'system',
                    content: '仅返回符合以下结构的 JSON 对象：' + JSON.stringify(format),
                  },
                  ...messages,
                ]
              : messages,
            ...(format ? { response_format: { type: 'json_object' } } : {}),
          }),
        });
      } catch {
        throw new Error(
          abort.aborted ? '模型请求已取消或超时。' : '第三方服务连接失败，请检查地址与网络。',
        );
      }
      if (!response.ok || !response.body) {
        await response.body?.cancel();
        throw new Error(
          '第三方服务返回 HTTP ' + response.status + '，请检查接口地址、模型与凭据。',
        );
      }
      const reader = response.body.getReader();
      const buffers: Buffer[] = [];
      let size = 0;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 4 * 1024 * 1024) {
            await reader.cancel();
            throw new Error('模型响应过大，请缩小文件范围。');
          }
          buffers.push(Buffer.from(value));
        }
      } finally {
        reader.releaseLock();
      }
      let item;
      try {
        item = JSON.parse(Buffer.concat(buffers).toString('utf8')).choices?.[0];
      } catch {}
      if (typeof item?.message?.content !== 'string' || item.finish_reason === 'length')
        throw new Error('服务未返回完整的 Chat Completions 结果。');
      return { content: item.message.content, seconds: 0, inputTokens: 0, outputTokens: 0 };
    },
  };
}

export class AnalysisModelSettings {
  private data: Stored;
  private tested = '';
  private warning: string | undefined;
  constructor(
    private file: string,
    private crypto: Encryption,
    private send: typeof fetch,
  ) {
    this.data = { localModel: 'qwen3:8b', verified: {}, service: null };
    if (existsSync(file))
      try {
        const d = JSON.parse(readFileSync(file, 'utf8'));
        if (
          !validLocalModel(d.localModel) ||
          !d.verified ||
          typeof d.verified !== 'object' ||
          Array.isArray(d.verified) ||
          !Object.entries(d.verified).every(
            ([k, v]) => validLocalModel(k) && typeof v === 'string',
          ) ||
          !(
            d.service === null ||
            (d.service &&
              ['name', 'endpoint', 'model', 'secret', 'revision'].every(
                (k) => typeof d.service[k] === 'string',
              ))
          )
        )
          throw Error();
        this.data = { localModel: d.localModel, verified: d.verified, service: d.service };
      } catch {
        this.warning = '设备的模型设置无法读取，请重新配置服务。';
      }
  }
  state(): ModelSettings {
    const s = this.data.service;
    return {
      warning: this.warning,
      localModel: this.data.localModel,
      verified: { ...this.data.verified },
      service: s
        ? {
            name: s.name,
            endpoint: s.endpoint,
            model: s.model,
            revision: s.revision,
            hasKey: !!s.secret,
          }
        : null,
    };
  }
  private persist(data: Stored) {
    const tmp = this.file + '.tmp';
    writeFileSync(tmp, JSON.stringify(data), { mode: 0o600 });
    renameSync(tmp, this.file);
    this.data = data;
    this.warning = undefined;
    return this.state();
  }
  select(model: string, digest: string) {
    if (!validLocalModel(model) || !digest) throw new Error('请选择已下载验证的本机模型。');
    return this.persist({
      ...this.data,
      localModel: model,
      verified: { ...this.data.verified, [model]: digest },
    });
  }
  private draft(input: RemoteServiceDraft) {
    if (
      !input ||
      [input.name, input.model, input.endpoint].some(
        (s) => typeof s !== 'string' || !s.trim() || s.length > 2048 || /[\r\n\0]/.test(s),
      )
    )
      throw new Error('请填写服务名称、模型名及有效的接口地址。');
    const u = new URL(input.endpoint.trim());
    if (
      !(
        u.protocol === 'https:' ||
        (u.protocol === 'http:' && ['127.0.0.1', '[::1]', 'localhost'].includes(u.hostname))
      ) ||
      u.search ||
      u.hash ||
      u.username ||
      u.password
    )
      throw new Error('接口地址应使用 HTTPS，本机回环服务也可以使用 HTTP。请勿将密钥填入地址。');
    const endpoint = u.href.replace(/\/+$/, '');
    const old = this.data.service;
    const key =
      input.apiKey ??
      (old?.endpoint === endpoint && old.secret
        ? this.crypto.decryptString(Buffer.from(old.secret, 'base64'))
        : '');
    if (typeof key !== 'string' || key.length > 8192 || /[\r\n\0]/.test(key))
      throw new Error('API Key 格式无效。');
    return { endpoint, key, model: input.model.trim(), name: input.name.trim() };
  }
  async test(input: RemoteServiceDraft, stage: 'connect' | 'extract', guard: () => void) {
    const d = this.draft(input);
    const runtime = compatibleChat(d.endpoint, d.key, this.send);
    if (stage === 'connect')
      await runtime.chat(
        d.model,
        [{ role: 'user', content: 'Reply with OK.' }],
        null,
        AbortSignal.timeout(60000),
      );
    else if (stage === 'extract') {
      await verifyAnalysisModel(runtime, d.model, AbortSignal.timeout(90000));
      guard();
      this.tested = createHash('sha256').update(JSON.stringify(d)).digest('hex');
    } else throw new Error('测试类型无效。');
  }
  save(input: RemoteServiceDraft) {
    const d = this.draft(input);
    if (this.tested !== createHash('sha256').update(JSON.stringify(d)).digest('hex'))
      throw new Error('请先用当前配置测试台账提取。');
    if (d.key && !this.crypto.isEncryptionAvailable())
      throw new Error('系统加密不可用，无法保存 API Key。');
    const secret = d.key ? this.crypto.encryptString(d.key).toString('base64') : '';
    return this.persist({
      ...this.data,
      service: {
        name: d.name,
        endpoint: d.endpoint,
        model: d.model,
        revision: randomUUID(),
        secret,
      },
    });
  }
  remove() {
    this.tested = '';
    return this.persist({ ...this.data, service: null });
  }
  forFile(revision: unknown) {
    const s = this.data.service;
    if (!s || revision !== s.revision)
      throw new Error('服务配置已改变，请重新确认本文件的外发范围。');
    const key = s.secret ? this.crypto.decryptString(Buffer.from(s.secret, 'base64')) : '';
    return { runtime: compatibleChat(s.endpoint, key, this.send), model: s.model, name: s.name };
  }
}
