import { useEffect, useRef, useState } from 'react';
import { CopyIcon, CheckIcon } from '@phosphor-icons/react';
import { secretLabels, type SecretKind } from '../../vault-types';
import { useVault } from './VaultProvider';
export function SecretCopyButton({
  accountId,
  kind,
  name,
  onError,
}: {
  accountId: string;
  kind: SecretKind;
  name: string;
  onError: (message: string) => void;
}) {
  const vault = useVault(),
    generation = useRef(0);
  const [copied, setCopied] = useState(false);
  useEffect(
    () =>
      window.desktop.onVaultStatus((status) => {
        if (!status.unlocked) {
          generation.current++;
          setCopied(false);
        }
      }),
    [],
  );
  useEffect(
    () => () => {
      generation.current++;
    },
    [],
  );
  return (
    <button
      className="icon-button"
      aria-label={`复制${secretLabels[kind]} ${name}`}
      title={
        copied
          ? '已复制 · 30 秒后清理'
          : `复制${secretLabels[kind]}${vault.status.unlocked ? '' : ' · 需解锁'}`
      }
      onBlur={() => setCopied(false)}
      onClick={async () => {
        try {
          if (!(await vault.ensureUnlocked())) return;
          const request = generation.current;
          await window.desktop.copySecret(accountId, kind);
          if (request === generation.current) setCopied(true);
        } catch (cause) {
          onError(String(cause));
        }
      }}
    >
      {copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
    </button>
  );
}
