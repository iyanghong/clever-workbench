import { StarIcon } from '@phosphor-icons/react';
import type { Favorite } from '../../home-types';
import type { Snapshot } from '../../types';
export function FavoriteButton({
  item,
  snapshot,
  onSnapshot,
  onError,
}: {
  item: Favorite;
  snapshot: Snapshot;
  onSnapshot: (value: Snapshot) => void;
  onError: (message: string) => void;
}) {
  const pinned = snapshot.favorites.some(
    (favorite) => favorite.kind === item.kind && favorite.id === item.id,
  );
  return (
    <button
      className="icon-button"
      aria-label={`${pinned ? '移出' : '设为'}常用${item.kind === 'tool' ? '工具' : item.kind === 'system' ? '系统' : item.kind === 'access' ? '访问入口' : '账号'}`}
      title={pinned ? '移出常用' : '设为常用'}
      onClick={async () => {
        try {
          onSnapshot(
            (await window.desktop.mutate({ type: 'favorite.set', ...item, pinned: !pinned }))
              .snapshot,
          );
        } catch (cause) {
          onError(String(cause));
        }
      }}
    >
      <StarIcon
        size={17}
        weight={pinned ? 'fill' : 'regular'}
        color={pinned ? 'var(--accent)' : 'currentColor'}
      />
    </button>
  );
}
