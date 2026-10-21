import type { GuidanceDeviceState, GuidanceVersions, ReleaseGuide } from './types.ts';

export const isGuidanceVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{1,9}\.\d{1,9}\.\d{1,9}$/.test(value);
export function compareGuidanceVersions(a: string, b: string) {
  const left = a.split('.').map(Number),
    right = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return left[i] - right[i];
  return 0;
}
/** Current package may describe itself before publication; unconfirmed old tags are not history. */
export function visibleGuidanceVersions({ currentVersion, releases }: GuidanceVersions) {
  return releases
    .filter(
      (record) =>
        record.version === currentVersion ||
        (record.publication === 'published' &&
          compareGuidanceVersions(record.version, currentVersion) < 0),
    )
    .sort((a, b) => compareGuidanceVersions(b.version, a.version));
}
export function planVersionGuidance(
  runtime: GuidanceVersions,
  state: GuidanceDeviceState,
): ReleaseGuide[] {
  if (!isGuidanceVersion(runtime.currentVersion)) return [];
  const first = state.firstVersion ?? runtime.currentVersion;
  if (
    state.shownThrough &&
    compareGuidanceVersions(runtime.currentVersion, state.shownThrough) <= 0
  )
    return [];
  return visibleGuidanceVersions(runtime).filter(
    (record) =>
      compareGuidanceVersions(record.version, first) >= 0 &&
      (!state.shownThrough || compareGuidanceVersions(record.version, state.shownThrough) > 0),
  );
}
/** One feature entry preserves distinct changes, including later edits to a stable change ID. */
export function groupVersionChanges(records: ReleaseGuide[]) {
  const groups = new Map<
    string,
    { guideId: string; changes: { id: string; summary: string; versions: string[] }[] }
  >();
  for (const record of records)
    for (const change of record.changes)
      for (const guideId of new Set(change.guideIds)) {
        let group = groups.get(guideId);
        if (!group) {
          group = { guideId, changes: [] };
          groups.set(guideId, group);
        }
        const existing = group.changes.find(
          (item) => item.id === change.id && item.summary === change.summary,
        );
        if (existing) {
          if (!existing.versions.includes(record.version)) existing.versions.push(record.version);
        } else
          group.changes.push({
            id: change.id,
            summary: change.summary,
            versions: [record.version],
          });
      }
  return [...groups.values()];
}
