import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { spawn } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import { MAX_TEXT_SIZE, decodePart, parsePart, type Report, type Own } from './zip-archive';
import type { TextPart } from '../../src/tool-types';

// Read CF_UNICODETEXT in bounded blocks in a child process; never send a full clipboard string over IPC.
const windowsClipboard = `
Add-Type -TypeDefinition @'
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;
public static class WorkbenchClipboard {
 [DllImport("user32.dll")] static extern bool OpenClipboard(IntPtr h);
 [DllImport("user32.dll")] static extern bool CloseClipboard();
 [DllImport("user32.dll")] static extern IntPtr GetClipboardData(uint f);
 [DllImport("kernel32.dll")] static extern IntPtr GlobalLock(IntPtr h);
 [DllImport("kernel32.dll")] static extern bool GlobalUnlock(IntPtr h);
 [DllImport("kernel32.dll")] static extern UIntPtr GlobalSize(IntPtr h);
 public static void Copy() {
  bool opened = false; IntPtr handle = IntPtr.Zero, pointer = IntPtr.Zero;
  try {
   for(int i=0;i<20 && !opened;i++){ opened=OpenClipboard(IntPtr.Zero); if(!opened) Thread.Sleep(50); }
   if(!opened) throw new Exception("Clipboard is busy");
   handle=GetClipboardData(13); if(handle==IntPtr.Zero) throw new Exception("Clipboard has no text");
   pointer=GlobalLock(handle); if(pointer==IntPtr.Zero) throw new Exception("Cannot read clipboard");
   long length=(long)GlobalSize(handle).ToUInt64(); byte[] block=new byte[1048576]; Stream output=Console.OpenStandardOutput();
   for(long offset=0;offset<length;offset+=block.Length){
    int count=(int)Math.Min(block.Length,length-offset); Marshal.Copy(new IntPtr(pointer.ToInt64()+offset),block,0,count);
    bool end=false; for(int i=0;i+1<count;i+=2) if(block[i]==0 && block[i+1]==0){count=i;end=true;break;}
    output.Write(block,0,count); if(end) break;
   }
  } finally { if(pointer!=IntPtr.Zero) GlobalUnlock(handle); if(opened) CloseClipboard(); }
 }
}
'@
try { [WorkbenchClipboard]::Copy() } catch { [Console]::Error.WriteLine($_.Exception.Message); exit 1 }
`;
export async function* clipboardChunks(): AsyncGenerator<Buffer> {
  if (!['darwin', 'win32'].includes(process.platform))
    throw new Error('剪贴板分片目前支持 macOS 与 Windows。');
  const child =
    process.platform === 'darwin'
      ? spawn('/usr/bin/pbpaste', [], { stdio: ['ignore', 'pipe', 'pipe'] })
      : spawn(
          'powershell.exe',
          [
            '-NoProfile',
            '-NonInteractive',
            '-STA',
            '-EncodedCommand',
            Buffer.from(windowsClipboard, 'utf16le').toString('base64'),
          ],
          { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
        );
  let detail = '';
  child.stderr.on('data', (chunk) => {
    detail = (detail + chunk.toString()).slice(0, 2000);
  });
  const done = new Promise<void>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`无法读取剪贴板文本：${detail}`)),
    );
  });
  void done.catch(() => {});
  const timer = setTimeout(() => child.kill(), 120_000);
  const decoder = process.platform === 'win32' ? new StringDecoder('utf16le') : null;
  try {
    for await (const chunk of child.stdout)
      yield decoder ? Buffer.from(decoder.write(chunk as Buffer), 'utf8') : (chunk as Buffer);
    if (decoder) yield Buffer.from(decoder.end(), 'utf8');
    await done;
  } finally {
    clearTimeout(timer);
    if (child.exitCode === null) child.kill();
  }
}
export async function storePart(
  chunks: AsyncIterable<Buffer>,
  target: string,
  report: Report,
  own: Own = () => {},
): Promise<Omit<TextPart, 'id'>> {
  const output = await fs.open(target, 'wx', 0o600);
  own(target);
  let pending = Buffer.alloc(0),
    size = 0;
  try {
    for await (const chunk of chunks) {
      // Filter bytes, not Unicode whitespace: disk and clipboard inputs have different rules.
      const clean = Buffer.allocUnsafe(chunk.length);
      let length = 0;
      for (const byte of chunk) if (![32, 9, 13, 10].includes(byte)) clean[length++] = byte;
      if (!length) continue;
      const block = Buffer.concat([pending, clean.subarray(0, length)]);
      pending = Buffer.from(block.subarray(-1));
      size += block.length - 1;
      if (size > MAX_TEXT_SIZE) throw new Error('去除空白后每片最多 200 MB。');
      await output.writeFile(block.subarray(0, -1));
      report({ phase: '读取剪贴板分片', processed: size, total: null });
    }
    if (pending.length && pending[0] !== 0) {
      size++;
      await output.writeFile(pending);
    }
    if (!size || size > MAX_TEXT_SIZE) throw new Error('分片不能为空，去除空白后每片最多 200 MB。');
  } catch (error) {
    await output.close();
    await fs.rm(target, { force: true });
    throw error;
  }
  await output.close();
  try {
    let preview = '',
      meta: ReturnType<typeof parsePart> | undefined;
    // 1 MiB is divisible by four, so intermediate blocks must be complete unpadded Base64.
    let previous: Buffer | null = null;
    const check = (block: Buffer, final: boolean) => {
      if (!final && block.includes(61))
        throw new Error('分片中间出现 Base64 结束符，请每次仅加入一个完整分片。');
      // decodePart validates a header, so only the first block uses it.
      const text = block.toString('latin1');
      if (text.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(text))
        throw new Error('不是有效 Base64，请复制完整的单个分片。');
      if (!meta) {
        meta = parsePart(decodePart(block));
        preview = text.slice(0, 512);
      }
    };
    for await (const chunk of createReadStream(target, { highWaterMark: 1024 * 1024 })) {
      if (previous) check(previous, false);
      previous = chunk as Buffer;
    }
    if (previous) check(previous, true);
    if (!meta) throw new Error('分片内容不完整。');
    return { ...meta, preview, size };
  } catch (error) {
    await fs.rm(target, { force: true });
    throw error;
  }
}
export function collectionStatus(parts: TextPart[]) {
  if (!parts.length) return { ready: false, description: '请从剪贴板加入完整文本分片。' };
  const { identity, count } = parts[0];
  if (parts.some((p) => p.identity !== identity || p.count !== count))
    return { ready: false, description: '分片来自不同归档，请删除或替换错误片。' };
  const indices = new Set(parts.map((p) => p.index));
  if (indices.size !== parts.length)
    return { ready: false, description: '存在重复分片，请删除或替换重复片。' };
  if (indices.size !== count) {
    const missing: number[] = [];
    for (let i = 1; i <= count && missing.length < 10; i++) if (!indices.has(i)) missing.push(i);
    return {
      ready: false,
      description: `已收到 ${parts.length} / ${count} 片，缺少第 ${missing.join('、')}${count - indices.size > 10 ? '等' : ''} 片。`,
    };
  }
  return {
    ready: true,
    description: `已收齐 ${count} 片 · ${(parts.reduce((sum, p) => sum + p.size, 0) / 1_000_000).toFixed(2)} MB · 可开始还原`,
  };
}
