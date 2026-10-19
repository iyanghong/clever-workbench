import { useState } from 'react';
import { CopyIcon, CheckIcon } from '@phosphor-icons/react';

export function CopyValue({
  value,
  label,
  onError,
  resolveValue,
}: {
  value: string;
  label: string;
  onError: (message: string) => void;
  resolveValue?: () => Promise<string>;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`复制${label}`}
      title={copied ? '已复制' : `复制${label}`}
      disabled={!value}
      onBlur={() => setCopied(false)}
      onClick={async () => {
        try {
          await window.desktop.copyText(resolveValue ? await resolveValue() : value);
          setCopied(true);
        } catch (cause) {
          onError(`复制失败：${String(cause)}`);
        }
      }}
    >
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
    </button>
  );
}
