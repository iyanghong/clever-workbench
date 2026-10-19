import { net } from 'electron';

// Electron net.fetch rejects a manual redirect instead of returning its 3xx.
// Expose one hop to the coordinator so it can validate the destination and drop auth.
export const fetchUpdate: typeof fetch = async (input, init) => {
  if (init?.redirect !== 'manual')
    return net.fetch(input instanceof URL ? input.href : input, init);
  const specification = new Request(input, init);
  if (specification.method !== 'GET') throw Error('更新下载仅支持 GET 请求。');
  const redirect = await new Promise<Response | undefined>((resolve, reject) => {
    const request = net.request({
      url: specification.url,
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      cache: 'no-store',
      headers: Object.fromEntries(specification.headers),
    });
    let finished = false;
    const cleanup = () => specification.signal.removeEventListener('abort', abort);
    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
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
      cleanup();
      resolve(new Response(null, { status, headers }));
      // Never follow here. The next request must be built without API credentials.
      request.abort();
    });
    request.on('response', (response) => {
      // IncomingMessage has no public pause/resume. Probe only the headers, then
      // use fetch's stream for the body rather than building an unbounded queue.
      response.on('error', () => {});
      finished = true;
      cleanup();
      resolve(undefined);
      request.abort();
    });
    if (specification.signal.aborted) abort();
    else {
      specification.signal.addEventListener('abort', abort, { once: true });
      request.end();
    }
  });
  if (redirect) return redirect;
  try {
    return await net.fetch(specification.url, {
      ...init,
      headers: specification.headers,
      signal: specification.signal,
      redirect: 'error',
      credentials: 'omit',
      cache: 'no-store',
    });
  } catch {
    throw Error('下载更新失败，请检查网络后重试。');
  }
};
