// shortcut: Chromium 打印使用未压缩的链接动作；若输出格式改变，需调整适配并通过真实 PDF 回归。
export function restorePdfLinks(bytes: Buffer, targets: ReadonlyMap<string, string>) {
  let pdf = bytes.toString('latin1');
  for (const [placeholder, target] of targets) {
    if (!/^文档\/[^/\\]+\.pdf$/.test(target)) throw new Error('资料包文档路径无效。');
    const unicode = 'FEFF' + Buffer.from(target, 'utf16le').swap16().toString('hex');
    const action = `/S /GoToR\n/F << /Type /Filespec /F <${unicode}> /UF <${unicode}> >>\n/D [0 /Fit]\n/NewWindow true`;
    const uri = `/URI (${placeholder})`;
    let count = 0,
      offset = 0;
    for (;;) {
      const at = pdf.indexOf(uri, offset);
      if (at < 0) break;
      const start = pdf.lastIndexOf('/S /URI', at);
      const end = at + uri.length;
      if (start < 0 || at - start > 64 || action.length > end - start)
        throw new Error('PDF 文档链接格式不兼容。');
      // 保持字节长度不变，保留 Chromium 生成的对象偏移和交叉引用表。
      pdf = pdf.slice(0, start) + action.padEnd(end - start, ' ') + pdf.slice(end);
      count++;
      offset = end;
    }
    if (!count) throw new Error('PDF 文档链接未生成，请重新导出。');
  }
  return Buffer.from(pdf, 'latin1');
}
