import { BrowserWindow, nativeImage, session } from 'electron';
import { randomUUID } from 'node:crypto';
import { exportImageNames } from './export-markdown';
import { renderDocx, renderHtml, type ExportImages } from './export-documents';
import type { DocumentRenderer } from './system-export';
import { restorePdfLinks } from './export-pdf-links';

export const exportScheme = 'workbench-export';

export const renderExportDocument: DocumentRenderer = async (
  format,
  markdown,
  assets,
  bundleLinks = new Map(),
) => {
  const images: ExportImages = new Map();
  for (const name of exportImageNames(markdown)) {
    const bytes = assets.get(name);
    if (!bytes) throw new Error('正文图片缺失，无法导出。');
    const image = nativeImage.createFromBuffer(bytes);
    if (image.isEmpty()) throw new Error('正文图片无法解码，请检查图片。');
    const size = image.getSize();
    images.set(`workbench-asset://image/${name}`, { bytes: image.toPNG(), ...size });
  }
  if (format === 'docx') return renderDocx(markdown, images, bundleLinks);
  const printLinks = new Map<string, string>(),
    targets = new Map<string, string>();
  for (const [source, target] of bundleLinks) {
    const placeholder = `https://workbench-export.invalid/${targets.size}/${'x'.repeat(1024)}`;
    printLinks.set(source, placeholder);
    targets.set(placeholder, decodeURIComponent(target));
  }
  const html = renderHtml(markdown, images, printLinks);
  const printSession = session.fromPartition(`workbench-export-${randomUUID()}`, { cache: false });
  const url = `${exportScheme}://document/index.html`;
  printSession.webRequest.onBeforeRequest((details, callback) =>
    callback({ cancel: details.url !== url && !details.url.startsWith('data:image/') }),
  );
  printSession.protocol.handle(exportScheme, (request) =>
    request.url === url
      ? new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
      : new Response('', { status: 404 }),
  );
  const window = new BrowserWindow({
    show: false,
    webPreferences: {
      session: printSession,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      javascript: false,
      webSecurity: true,
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, destination) => {
    if (destination !== url) event.preventDefault();
  });
  try {
    await window.loadURL(url);
    const pdf = await window.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      generateDocumentOutline: true,
      generateTaggedPDF: true,
    });
    return restorePdfLinks(pdf, targets);
  } finally {
    window.destroy();
    printSession.protocol.unhandle(exportScheme);
    await printSession.clearStorageData();
  }
};
