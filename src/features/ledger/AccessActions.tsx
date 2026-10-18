import { useState } from 'react';
import { ArrowUpRightIcon } from '@phosphor-icons/react';
import type { AccessEntry } from '../../ledger-types';
import type { Snapshot } from '../../types';
import { CopyValue } from '../../shared/CopyValue';
import { SecretCopyButton } from '../vault/SecretCopyButton';

export function AccessActions({
  entry,
  snapshot,
  onError,
}: {
  entry: AccessEntry;
  snapshot: Snapshot;
  onError: (message: string) => void;
}) {
  const [addressId, setAddressId] = useState(entry.preferredAddressId),
    [accountId, setAccountId] = useState(entry.preferredAccountId);
  const address =
    entry.addresses.find((a) => a.id === addressId) ??
    entry.addresses.find((a) => a.id === entry.preferredAddressId) ??
    entry.addresses[0];
  const accounts = snapshot.accounts.filter((a) => a.accessId === entry.id);
  const account =
    accounts.find((a) => a.id === accountId) ??
    accounts.find((a) => a.id === entry.preferredAccountId) ??
    accounts[0];
  return (
    <div className="access-shortcuts">
      {address ? (
        <div className="access-shortcut-line">
          {entry.addresses.length > 1 && (
            <select
              aria-label={`${entry.name} 快捷地址`}
              value={address.id}
              onChange={(event) => setAddressId(event.target.value)}
            >
              {entry.addresses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
          <button
            className="text-button"
            aria-label={`打开 ${entry.name} ${address.label}`}
            title={address.url}
            onClick={() =>
              void window.desktop.openExternal(address.url).catch((cause) => onError(String(cause)))
            }
          >
            <ArrowUpRightIcon size={16} />
            {address.label}
          </button>
          <CopyValue
            value={address.url}
            label={`地址 ${entry.name} ${address.label}`}
            onError={onError}
          />
        </div>
      ) : (
        <span className="secondary-copy">尚未记录地址</span>
      )}
      {account && (
        <div className="access-shortcut-line">
          {accounts.length > 1 ? (
            <select
              aria-label={`${entry.name} 快捷账号`}
              value={account.id}
              onChange={(event) => setAccountId(event.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.username || '无用户名'}
                </option>
              ))}
            </select>
          ) : (
            <span>
              {account.name} · {account.username || '无用户名'}
            </span>
          )}
          <CopyValue
            value={account.username}
            label={`用户名 ${entry.name} ${account.name}`}
            onError={onError}
          />
          {account.secretKinds.map((kind) => (
            <SecretCopyButton
              key={kind}
              accountId={account.id}
              kind={kind}
              name={`${entry.name} / ${account.name} / ${account.username || '无用户名'}`}
              onError={onError}
            />
          ))}
        </div>
      )}
    </div>
  );
}
