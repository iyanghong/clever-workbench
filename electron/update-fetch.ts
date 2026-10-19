import { net } from 'electron';

// Electron net.fetch rejects a manual redirect instead of returning its 3xx.
// Expose one hop to the coordinator so it can validate the destination and drop auth.
export const fetchUpdate: typeof fetch = async (input, init) => {
  if (init?.redirect !== 'manual')
    return net.fetch(input instanceof URL ? input.href : input, init);
  const specification = new Request(input, init);
  if (specification.method !== 'GET') throw Error('更新下载仅支持 GET 请求。');
  return new Promise<Response>((resolve, reject) => {
    const request = net.request({
      url: specification.url,
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      headers: Object.fromEntries(specification.headers),
    });
    let settled = false,
      finished = false,
      body: ReadableStreamDefaultController<Uint8Array> | undefined;
    const cleanup = () => specification.signal.removeEventListener('abort', abort);
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      if (body) body.error(error);
      else if (!settled) reject(error);
    };
    const abort = () => {
      fail(Error('更新下载已取消或超时，请重试。'));
      request.abort();
    };
    request.on('error', () => fail(Error('下载更新失败，请检查网络后重试。')));
    request.on('abort', () => fail(Error('更新下载已取消，请重试。')));
    request.on('redirect', (status, _method, destination, values) => {
      if (finished) return;
      const headers = new Headers();
      for (const [name, list] of Object.entries(values))
        for (const value of list) headers.append(name, value);
      headers.set('location', destination);
      finished = true;
      settled = true;
      cleanup();
      resolve(new Response(null, { status, headers }));
      // Never follow here. The next request must be built without API credentials.
      request.abort();
    });
    request.on('response', (response) => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(response.headers))
        for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          body = controller;
          // Electron requires the end handler to be registered before data.
          response.on('end', () => {
            if (finished) return;
            finished = true;
            cleanup();
            controller.close();
          });
          response.on('error', () => fail(Error('更新下载中断，请重试。')));
          response.on('aborted', () => fail(Error('更新下载中断，请重试。')));
          response.on('data', (chunk) => {
            if (!finished) controller.enqueue(chunk);
          });
        },
        cancel() {
          finished = true;
          cleanup();
          request.abort();
        },
      });
      settled = true;
      resolve(
        new Response([204, 205, 304].includes(response.statusCode) ? null : stream, {
          status: response.statusCode,
          headers,
        }),
      );
    });
    if (specification.signal.aborted) abort();
    else {
      specification.signal.addEventListener('abort', abort, { once: true });
      request.end();
    }
  });
};
