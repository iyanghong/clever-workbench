import type { JSONContent } from '@tiptap/core';
import Vditor from 'vditor';
import 'vditor/dist/index.css';
import { ImageIcon, TextAaIcon } from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import {
  loadMarkdown,
  writeMarkdown,
  markdownSourceReason,
  markdownMeaning,
} from '../shared/markdown';
import { emptyContent } from '../domain';
import type { Asset } from '../types';

export function Editor({
  markdown,
  onChange,
  onError,
  readOnly = false,
  pendingRef,
  flushRef,
}: {
  markdown: string;
  onChange: (content: JSONContent, markdown: string) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  pendingRef: React.MutableRefObject<Promise<void>>;
  flushRef: React.MutableRefObject<() => void>;
}) {
  const [initial] = useState(() => {
    const reason = markdownSourceReason(markdown);
    return { mode: reason ? ('source' as const) : ('rich' as const), reason };
  });
  const [mode, setMode] = useState(initial.mode),
    [source, setSource] = useState(markdown),
    [notice, setNotice] = useState(initial.reason ?? ''),
    [formatting, setFormatting] = useState(false),
    [importing, setImporting] = useState(false),
    [ready, setReady] = useState(false),
    [preview, setPreview] = useState<string | null>(null);
  const host = useRef<HTMLDivElement>(null),
    sourceInput = useRef<HTMLTextAreaElement>(null),
    previewDialog = useRef<HTMLDialogElement>(null),
    editor = useRef<Vditor | null>(null),
    latest = useRef(markdown),
    normalized = useRef(''),
    composing = useRef(false),
    importingRef = useRef(false),
    locked = useRef(readOnly),
    modeRef = useRef(mode),
    change = useRef(onChange),
    error = useRef(onError);
  change.current = onChange;
  error.current = onError;
  modeRef.current = mode;
  locked.current = readOnly;

  function changed(text: string, content = loadMarkdown(text).content) {
    latest.current = text;
    setSource(text);
    change.current(content, text);
  }
  function capture() {
    const current = editor.current;
    if (!current || modeRef.current !== 'rich' || composing.current || locked.current) return;
    const text = current.getValue();
    // Opening a record or moving its caret must not rewrite its original Markdown.
    if (text !== normalized.current) {
      normalized.current = text;
      changed(text);
    }
  }
  const captureRef = useRef(capture);
  captureRef.current = capture;
  flushRef.current = () => {
    if (composing.current) throw new Error('中文输入尚未完成，请先确认候选词。');
    captureRef.current();
  };
  useEffect(() => {
    if (preview) previewDialog.current?.showModal();
  }, [preview]);
  useEffect(() => {
    const current = editor.current;
    if (!current) return;
    if (readOnly || importing) current.disabled();
    else current.enable();
    current.vditor.ir!.element.setAttribute('aria-readonly', String(readOnly || importing));
    current.vditor.ir!.element.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      input.disabled = readOnly || importing;
    });
  }, [readOnly, importing, ready]);

  async function switchMode(next: 'rich' | 'source') {
    try {
      await pendingRef.current;
      flushRef.current();
      if (next === 'rich') {
        const reason = markdownSourceReason(latest.current);
        if (reason) return setNotice(reason);
      }
      setNotice('');
      setMode(next);
    } catch (cause) {
      error.current(cause instanceof Error ? cause.message : String(cause));
    }
  }
  function track(job: Promise<void>) {
    pendingRef.current = Promise.all([pendingRef.current, job]).then(() => undefined);
    return job;
  }
  async function insertImages(load: () => Promise<{ assets: Asset[]; errors: string[] }>) {
    if (locked.current || importingRef.current || composing.current) return;
    const current = editor.current;
    const selection = window.getSelection();
    const range =
      selection?.rangeCount && host.current?.contains(selection.anchorNode)
        ? selection.getRangeAt(0).cloneRange()
        : null;
    const start = sourceInput.current?.selectionStart ?? latest.current.length;
    const end = sourceInput.current?.selectionEnd ?? start;
    importingRef.current = true;
    setImporting(true);
    // Freeze this local import briefly so its insertion point cannot drift to another edit.
    current?.vditor.undo!.addToUndoStack(current.vditor);
    current?.disabled();
    try {
      const { assets, errors } = await load();
      if (assets.length) {
        const text = assets
          .map((asset) =>
            writeMarkdown({
              type: 'doc',
              content: [{ type: 'image', attrs: { src: asset.src, alt: asset.name } }],
            }),
          )
          .join('\n\n');
        if (modeRef.current === 'source') {
          changed(
            `${latest.current.slice(0, start)}\n\n${text}\n\n${latest.current.slice(end)}`,
            emptyContent(),
          );
        } else if (current && editor.current === current) {
          current.enable();
          current.focus();
          const insertion = range?.startContainer.isConnected ? range : document.createRange();
          if (insertion !== range) {
            insertion.selectNodeContents(current.vditor.ir!.element);
            insertion.collapse(false);
          }
          selection?.removeAllRanges();
          selection?.addRange(insertion);
          current.insertMD(`\n\n${text}\n\n`);
          captureRef.current();
        }
      }
      if (errors.length) error.current(errors.join('\n'));
    } catch (cause) {
      error.current(cause instanceof Error ? cause.message : String(cause));
    } finally {
      importingRef.current = false;
      if (!locked.current) current?.enable();
      setImporting(false);
    }
  }
  function importFiles(files: File[]) {
    return track(
      insertImages(async () => {
        const assets: Asset[] = [],
          errors: string[] = [];
        for (const file of files) {
          try {
            if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB');
            assets.push(
              await window.desktop.importImage(new Uint8Array(await file.arrayBuffer()), file.name),
            );
          } catch (cause) {
            errors.push(`${file.name}：${cause instanceof Error ? cause.message : String(cause)}`);
          }
        }
        return { assets, errors };
      }),
    );
  }
  const importRef = useRef(importFiles);
  importRef.current = importFiles;

  useEffect(() => {
    if (mode !== 'rich') return;
    const element = host.current!;
    const sharedIcons = document.getElementById('vditorIconScript');
    let disposed = false;
    const toolbarState = new MutationObserver(() => {
      element.querySelectorAll<HTMLButtonElement>('.vditor-toolbar button').forEach((button) => {
        button.disabled = button.classList.contains('vditor-menu--disabled');
        button.setAttribute(
          'aria-pressed',
          String(button.classList.contains('vditor-menu--current')),
        );
      });
    });
    setReady(false);
    const current = new Vditor(element, {
      value: latest.current,
      mode: 'ir',
      cdn: new URL('./editor-vendor', document.baseURI).href,
      cache: { enable: false },
      undoDelay: 200,
      minHeight: 280,
      placeholder: '写下过程、结论，或直接粘贴截图…',
      toolbar: [
        'headings',
        'bold',
        'italic',
        'strike',
        '|',
        'list',
        'ordered-list',
        'check',
        'quote',
        'code',
        'inline-code',
        'table',
        '|',
        'undo',
        { name: 'redo', hotkey: '⇧⌘Z' },
      ],
      toolbarConfig: { pin: false },
      preview: {
        hljs: { enable: false },
        theme: { current: '' },
        markdown: {
          autoSpace: false,
          fixTermTypo: false,
          sanitize: true,
          footnotes: false,
          toc: false,
          inlineMath: false,
          mathBlockPreview: false,
          codeBlockPreview: false,
        },
        render: { media: { enable: false } },
      },
      hint: { emoji: {}, parse: false },
      link: {
        isOpen: false,
        click: (element: Element) => {
          void window.desktop
            .openExternal(element.textContent ?? '')
            .catch((cause) => error.current(cause.message));
        },
      },
      image: { isPreview: false },
      input: () => {
        if (!disposed) captureRef.current();
      },
      after: () => {
        if (disposed) {
          dispose();
          return;
        }
        editor.current = current;
        normalized.current = current.getValue();
        if (markdownMeaning(latest.current) !== markdownMeaning(normalized.current)) {
          setNotice('转换会改变部分内容，已保留源码；可以继续编辑原文。');
          setMode('source');
          return;
        }
        current.clearStack();
        const input = current.vditor.ir!.element;
        input.setAttribute('aria-label', '工作内容');
        input.setAttribute('role', 'textbox');
        input.setAttribute('aria-multiline', 'true');
        input.setAttribute('spellcheck', 'false');
        const names: Record<string, string> = {
          headings: '标题',
          bold: '加粗',
          italic: '斜体',
          list: '无序列表',
          check: '清单',
          quote: '引用',
          code: '代码块',
          table: '插入表格',
          undo: '撤销',
          redo: '重做',
        };
        for (const [type, name] of Object.entries(names)) {
          const button = element.querySelector(`[data-type="${type}"]`);
          button?.setAttribute('aria-label', name);
          button?.setAttribute('title', name);
        }
        toolbarState.observe(current.vditor.toolbar!.element!, {
          subtree: true,
          attributes: true,
          attributeFilter: ['class'],
        });
        setReady(true);
        if (locked.current) current.disabled();
      },
    });
    function dispose() {
      toolbarState.disconnect();
      clearTimeout(current.vditor.ir?.processTimeoutId);
      clearTimeout(current.vditor.ir?.hlToolbarTimeoutId);
      current.destroy();
      if (sharedIcons && !sharedIcons.isConnected) document.head.appendChild(sharedIcons);
    }
    const input = () =>
      queueMicrotask(() => {
        if (!disposed) captureRef.current();
      });
    const startComposition = () => {
      composing.current = true;
    };
    const endComposition = () => {
      composing.current = false;
      input();
    };
    const paste = (event: ClipboardEvent) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (locked.current || importingRef.current) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        void importRef.current(files);
        return;
      }
      const text = event.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      const reason = markdownSourceReason(text);
      if (reason) {
        captureRef.current();
        changed(`${latest.current}${latest.current ? '\n\n' : ''}${text}`, emptyContent());
        setNotice(`${reason} 粘贴内容已放在源码末尾。`);
        setMode('source');
      } else {
        current.insertMD(text);
        captureRef.current();
      }
    };
    const drop = (event: DragEvent) => {
      if (!event.dataTransfer?.files.length) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (!locked.current) void importRef.current(Array.from(event.dataTransfer.files));
    };
    const click = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if ((locked.current || importingRef.current) && target.closest('input')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      const image = target.closest('img');
      if (image?.src.startsWith('workbench-asset://image/')) setPreview(image.src);
      const link = target.closest('a');
      if (link) {
        event.preventDefault();
        event.stopImmediatePropagation();
        void window.desktop.openExternal(link.href).catch((cause) => error.current(cause.message));
      }
      input();
    };
    const keydown = (event: KeyboardEvent) => {
      const node = window.getSelection()?.anchorNode;
      const cell = (node instanceof HTMLElement ? node : node?.parentElement)?.closest('td, th');
      if (cell && event.key === 'Enter' && event.shiftKey && !event.isComposing) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setNotice('表格单元格支持单段文字和行内格式；用 Tab 移动到下一格，多段内容请放在表格外。');
      }
      input();
    };
    element.addEventListener('input', input);
    element.addEventListener('compositionstart', startComposition, true);
    element.addEventListener('compositionend', endComposition);
    element.addEventListener('paste', paste, true);
    element.addEventListener('drop', drop, true);
    element.addEventListener('click', click, true);
    element.addEventListener('keydown', keydown, true);
    return () => {
      disposed = true;
      editor.current = null;
      composing.current = false;
      element.removeEventListener('input', input);
      element.removeEventListener('compositionstart', startComposition, true);
      element.removeEventListener('compositionend', endComposition);
      element.removeEventListener('paste', paste, true);
      element.removeEventListener('drop', drop, true);
      element.removeEventListener('click', click, true);
      element.removeEventListener('keydown', keydown, true);
      if (current.vditor?.ir) dispose();
    };
  }, [mode]);

  return (
    <div className={`editor-wrap ${formatting ? 'format-open' : ''}`}>
      <div className="editor-actions" role="group" aria-label="编辑模式">
        {mode === 'rich' && (
          <button
            type="button"
            aria-label="文字格式"
            aria-expanded={formatting}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setFormatting(!formatting)}
          >
            <TextAaIcon size={17} />
            格式
          </button>
        )}
        <button
          type="button"
          aria-label="插入图片"
          title="插入图片"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void track(insertImages(() => window.desktop.chooseImages()))}
          disabled={readOnly || importing || (mode === 'rich' && !ready)}
        >
          <ImageIcon size={17} />
        </button>
        <span className="spacer" />
        <button
          type="button"
          aria-pressed={mode === 'rich'}
          onClick={() => void switchMode('rich')}
        >
          即时排版
        </button>
        <button
          type="button"
          aria-pressed={mode === 'source'}
          onClick={() => void switchMode('source')}
        >
          Markdown 源码
        </button>
      </div>
      {notice && (
        <p className="editor-notice" role="status">
          {notice}
        </p>
      )}
      {mode === 'source' ? (
        <textarea
          ref={sourceInput}
          className="markdown-source"
          aria-label="Markdown 源码内容"
          value={source}
          spellCheck={false}
          readOnly={readOnly || importing}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onChange={(event) => {
            setNotice('');
            changed(event.target.value, emptyContent());
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length) {
              event.preventDefault();
              if (!readOnly) void importFiles(files);
            }
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault();
          }}
          onDrop={(event) => {
            const files = Array.from(event.dataTransfer.files);
            if (files.length) {
              event.preventDefault();
              if (!readOnly) void importFiles(files);
            }
          }}
        />
      ) : (
        <div ref={host} className="workbench-vditor" aria-busy={!ready} />
      )}
      {importing && (
        <div className="save-indicator" role="status">
          正在导入图片…
        </div>
      )}
      {preview && (
        <dialog
          ref={previewDialog}
          className="image-preview"
          onCancel={() => setPreview(null)}
          onClick={() => setPreview(null)}
        >
          <button aria-label="关闭图片" onClick={() => setPreview(null)}>
            关闭
          </button>
          <img src={preview} alt="图片原图" />
        </dialog>
      )}
    </div>
  );
}
