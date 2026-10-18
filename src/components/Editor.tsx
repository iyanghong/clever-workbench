import { useEditor, EditorContent, type JSONContent } from '@tiptap/react';
import { Markdown } from '@tiptap/markdown';
import Placeholder from '@tiptap/extension-placeholder';
import {
  TextBIcon,
  TextItalicIcon,
  ListBulletsIcon,
  ListChecksIcon,
  CodeIcon,
  ImageIcon,
  QuotesIcon,
  TextHOneIcon,
  TableIcon,
} from '@phosphor-icons/react';
import { useEffect, useRef, useState } from 'react';
import { loadMarkdown, markdownExtensions, writeMarkdown } from '../shared/markdown';
import { emptyContent } from '../domain';
import type { Asset } from '../types';

export function Editor({
  markdown,
  onChange,
  onError,
  readOnly = false,
  pendingRef,
}: {
  markdown: string;
  onChange: (content: JSONContent, markdown: string) => void;
  onError: (message: string) => void;
  readOnly?: boolean;
  pendingRef: React.MutableRefObject<Promise<void>>;
}) {
  const [initial] = useState(() => loadMarkdown(markdown));
  const [mode, setMode] = useState(initial.mode),
    [source, setSource] = useState(markdown),
    [notice, setNotice] = useState(initial.reason ?? '');
  const latest = useRef(markdown),
    modeRef = useRef(mode),
    sourceInput = useRef<HTMLTextAreaElement>(null);
  modeRef.current = mode;
  const [preview, setPreview] = useState<string | null>(null),
    [importing, setImporting] = useState(0);
  const previewDialog = useRef<HTMLDialogElement>(null);
  const change = useRef(onChange),
    error = useRef(onError);
  change.current = onChange;
  error.current = onError;
  useEffect(() => {
    if (preview) previewDialog.current?.showModal();
  }, [preview]);
  function changed(content: JSONContent, text: string) {
    latest.current = text;
    setSource(text);
    change.current(content, text);
  }
  function changeSource(text: string) {
    changed(emptyContent(), text);
  }
  const editor = useEditor({
    extensions: [
      ...markdownExtensions(),
      Markdown,
      Placeholder.configure({
        placeholder: '写下过程、结论，或直接粘贴截图…\n支持 Markdown、表格和勾选清单。',
      }),
    ],
    content: initial.content,
    editable: !readOnly,
    onUpdate: ({ editor }) => {
      try {
        changed(editor.getJSON(), writeMarkdown(editor.getJSON()));
      } catch {
        error.current('无法转换当前排版，请保留编辑窗口并重试。');
      }
    },
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': '工作内容',
        'aria-multiline': 'true',
        spellcheck: 'false',
      },
      handlePaste: (_view, event) => {
        if (readOnly) return true;
        const files = Array.from(event.clipboardData?.files ?? []);
        if (files.length) {
          event.preventDefault();
          void importFiles(files);
          return true;
        }
        const raw = event.clipboardData?.getData('text/plain') ?? '';
        if (!raw) return Boolean(event.clipboardData?.getData('text/html'));
        event.preventDefault();
        const parsed = loadMarkdown(raw);
        if (parsed.mode === 'rich') editor?.commands.insertContent(parsed.content.content ?? []);
        else {
          const body = `${latest.current}${latest.current ? '\n\n' : ''}${raw}`;
          changeSource(body);
          setMode('source');
          setNotice(`${parsed.reason} 粘贴内容已放在源码末尾。`);
        }
        return true;
      },
      handleDrop: (_view, event, _slice, moved) => {
        if (readOnly) return true;
        if (moved) return false;
        const files = Array.from(event.dataTransfer?.files ?? []);
        if (files.length) {
          event.preventDefault();
          void importFiles(files);
          return true;
        }
        return false;
      },
      handleClick: (_view, _pos, event) => {
        const image = (event.target as HTMLElement).closest('img');
        if (image) {
          setPreview(image.src);
          return false;
        }
        const link = (event.target as HTMLElement).closest('a');
        if (link) {
          event.preventDefault();
          void window.desktop
            .openExternal(link.href)
            .catch((cause) => error.current(cause.message));
          return true;
        }
        return false;
      },
    },
  });
  useEffect(() => {
    editor?.setEditable(!readOnly, false);
  }, [editor, readOnly]);
  async function switchMode(next: 'rich' | 'source') {
    try {
      await pendingRef.current;
      if (next === 'rich') {
        const parsed = loadMarkdown(latest.current);
        if (parsed.mode === 'source') {
          setNotice(parsed.reason!);
          return;
        }
        editor?.commands.setContent(parsed.content, { emitUpdate: false });
      }
      setNotice('');
      setMode(next);
    } catch (cause) {
      error.current(String(cause));
    }
  }
  function insertAsset(asset: Asset) {
    if (modeRef.current === 'source') {
      const start = sourceInput.current?.selectionStart ?? latest.current.length,
        end = sourceInput.current?.selectionEnd ?? start;
      const image = writeMarkdown({
        type: 'doc',
        content: [{ type: 'image', attrs: { src: asset.src, alt: asset.name } }],
      });
      changeSource(`${latest.current.slice(0, start)}\n\n${image}\n\n${latest.current.slice(end)}`);
    } else if (editor && !editor.isDestroyed)
      editor.chain().focus().setImage({ src: asset.src, alt: asset.name }).run();
  }
  function track(job: Promise<void>) {
    pendingRef.current = Promise.all([pendingRef.current, job]).then(() => undefined);
    return job;
  }
  function importFiles(files: File[]) {
    return track(importBatch(files));
  }
  async function importBatch(files: File[]) {
    if (readOnly) return;
    setImporting((count) => count + files.length);
    for (const file of files) {
      try {
        if (file.size > 20 * 1024 * 1024) throw new Error('单张图片不能超过 20 MB');
        insertAsset(
          await window.desktop.importImage(new Uint8Array(await file.arrayBuffer()), file.name),
        );
      } catch (cause) {
        error.current(`${file.name}：${cause instanceof Error ? cause.message : String(cause)}`);
      } finally {
        setImporting((count) => count - 1);
      }
    }
  }
  async function pickBatch() {
    if (readOnly) return;
    setImporting((count) => count + 1);
    try {
      const { assets, errors } = await window.desktop.chooseImages();
      assets.forEach(insertAsset);
      if (errors.length) error.current(errors.join('\n'));
    } catch (cause) {
      error.current(String(cause));
    } finally {
      setImporting((count) => count - 1);
    }
  }
  if (!editor) return null;
  const tools = [
    {
      name: '标题',
      icon: TextHOneIcon,
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      active: editor.isActive('heading'),
    },
    {
      name: '加粗',
      icon: TextBIcon,
      action: () => editor.chain().focus().toggleBold().run(),
      active: editor.isActive('bold'),
    },
    {
      name: '斜体',
      icon: TextItalicIcon,
      action: () => editor.chain().focus().toggleItalic().run(),
      active: editor.isActive('italic'),
    },
    {
      name: '无序列表',
      icon: ListBulletsIcon,
      action: () => editor.chain().focus().toggleBulletList().run(),
      active: editor.isActive('bulletList'),
    },
    {
      name: '清单',
      icon: ListChecksIcon,
      action: () => editor.chain().focus().toggleTaskList().run(),
      active: editor.isActive('taskList'),
    },
    {
      name: '引用',
      icon: QuotesIcon,
      action: () => editor.chain().focus().toggleBlockquote().run(),
      active: editor.isActive('blockquote'),
    },
    {
      name: '代码块',
      icon: CodeIcon,
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      active: editor.isActive('codeBlock'),
    },
    {
      name: '插入表格',
      icon: TableIcon,
      action: () =>
        editor.chain().focus().insertTable({ rows: 3, cols: 2, withHeaderRow: true }).run(),
      active: editor.isActive('table'),
    },
  ];
  return (
    <div className="editor-wrap">
      <div className="editor-mode" role="group" aria-label="编辑模式">
        <button aria-pressed={mode === 'rich'} onClick={() => void switchMode('rich')}>
          即时排版
        </button>
        <button aria-pressed={mode === 'source'} onClick={() => void switchMode('source')}>
          Markdown 源码
        </button>
      </div>
      {notice && (
        <p className="editor-notice" role="status">
          {notice}
        </p>
      )}
      <div className="editor-tools" role="toolbar" aria-label="文字格式">
        {mode === 'rich' &&
          tools.map((item) => (
            <button
              key={item.name}
              type="button"
              title={item.name}
              aria-label={item.name}
              aria-pressed={item.active}
              disabled={readOnly}
              onClick={item.action}
            >
              <item.icon size={17} />
            </button>
          ))}
        {mode === 'rich' && <i />}
        {mode === 'rich' && editor.isActive('image') && (
          <button
            title="移除图片"
            aria-label="移除图片"
            disabled={readOnly}
            onClick={() => editor.chain().focus().deleteSelection().run()}
          >
            ×
          </button>
        )}
        <button
          title="插入图片"
          aria-label="插入图片"
          onClick={() => void track(pickBatch())}
          disabled={readOnly}
        >
          <ImageIcon size={18} />
        </button>
        <span className="editor-format">
          {mode === 'source' ? '图片会插入本地引用' : 'Markdown'}
        </span>
      </div>
      {mode === 'rich' && editor.isActive('table') && !readOnly && (
        <div className="table-tools" role="toolbar" aria-label="表格操作">
          <button onClick={() => editor.chain().focus().addRowAfter().run()}>添加行</button>
          <button onClick={() => editor.chain().focus().addColumnAfter().run()}>添加列</button>
          <button onClick={() => editor.chain().focus().deleteRow().run()}>删除行</button>
          <button onClick={() => editor.chain().focus().deleteColumn().run()}>删除列</button>
          <button onClick={() => editor.chain().focus().deleteTable().run()}>删除表格</button>
        </div>
      )}
      {mode === 'rich' && editor.isActive('codeBlock') && (
        <div className="code-language">
          <label>
            代码语言{' '}
            <select
              aria-label="代码语言"
              disabled={readOnly}
              value={editor.getAttributes('codeBlock').language ?? ''}
              onChange={(event) =>
                editor
                  .chain()
                  .focus()
                  .updateAttributes('codeBlock', { language: event.target.value })
                  .run()
              }
            >
              <option value="">纯文本</option>
              {[
                'javascript',
                'typescript',
                'json',
                'css',
                'html',
                'python',
                'bash',
                'sql',
                'rust',
                'go',
              ].map((language) => (
                <option key={language}>{language}</option>
              ))}
            </select>
          </label>
          <button
            onClick={() =>
              void window.desktop
                .copyText(editor.state.selection.$from.parent.textContent)
                .catch((cause) => error.current(cause.message))
            }
          >
            复制代码
          </button>
        </div>
      )}
      {mode === 'source' ? (
        <textarea
          ref={sourceInput}
          className="markdown-source"
          aria-label="Markdown 源码内容"
          value={source}
          spellCheck={false}
          readOnly={readOnly}
          onChange={(event) => {
            setNotice('');
            changeSource(event.target.value);
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.length && !readOnly) {
              event.preventDefault();
              void importFiles(files);
            }
          }}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes('Files')) event.preventDefault();
          }}
          onDrop={(event) => {
            const files = Array.from(event.dataTransfer.files);
            if (files.length && !readOnly) {
              event.preventDefault();
              void importFiles(files);
            }
          }}
        />
      ) : (
        <EditorContent editor={editor} />
      )}
      {importing > 0 && (
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
