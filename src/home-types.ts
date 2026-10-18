export type Favorite = { kind: 'system' | 'account'; id: string };
export type FavoriteCommand =
  | (Favorite & { type: 'favorite.set'; pinned: boolean })
  | (Favorite & { type: 'favorite.move'; direction: -1 | 1 });
