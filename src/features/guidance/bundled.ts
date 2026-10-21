import { loadGuidanceCatalog, safeGuidanceImagePath } from '../../guidance/catalog';

// Raw imports deliberately defer JSON interpretation: a malformed document must not break a build.
const sources = import.meta.glob('../../../content/guidance/**/*.json', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const images = import.meta.glob('../../../content/guidance/assets/**/*.{png,jpg,jpeg,webp,gif}', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>;
const relative = (file: string) => file.split('content/guidance/')[1];
const assets = Object.fromEntries(
  Object.entries(images).map(([file, url]) => [relative(file), url]),
);
export const bundledGuidance = loadGuidanceCatalog(
  Object.entries(sources).map(([file, text]) => ({ file: relative(file), text })),
  { assets: Object.keys(assets) },
);
export const guidanceImage = (source: string) =>
  safeGuidanceImagePath(source) && Object.hasOwn(assets, source) ? assets[source] : undefined;
