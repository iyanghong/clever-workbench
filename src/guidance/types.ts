/** Declarative, packaged guidance. This contract has no Electron or renderer dependency. */
export type GuidancePlatform = 'darwin' | 'win32' | 'linux';
export type GuideImage = { src: string; alt: string; caption?: string };
export type GuideStep = {
  id: string;
  title: string;
  action: string;
  expectedResult: string;
  image?: GuideImage;
};
export type FeatureGuide = {
  schemaVersion: 1;
  kind: 'feature';
  id: string;
  revision: number;
  title: string;
  platforms: GuidancePlatform[];
  placements: string[];
  purpose: string;
  prerequisites: { items: string[]; notApplicableReason: string };
  entry: { label: string; target: string };
  steps: GuideStep[];
  completion: string;
  faq: { items: { question: string; answer: string }[]; notApplicableReason: string };
};
export type GuidanceReview = {
  status: 'pending' | 'completed' | 'completed-with-gaps';
  reviewer: string;
  checkedAt: string;
  source: string;
  environment: string;
  checks: {
    guideId: string;
    stepIds: string[];
    result: 'passed' | 'failed' | 'not-verified' | 'not-applicable';
    evidence: string;
  }[];
  knownGaps: string[];
};
export type ReleaseChange = { id: string; summary: string; guideIds: string[] };
export type ReleaseDraft = {
  schemaVersion: 1;
  kind: 'release-draft';
  operationChange: 'changed' | 'none';
  summary: string;
  noOperationReason?: string;
  changes: ReleaseChange[];
  review?: GuidanceReview;
};
/** Source SHA is the selected business source; the tag's commit SHA belongs in build evidence. */
export type ReleaseGuide = Omit<ReleaseDraft, 'kind'> & {
  kind: 'release';
  version: string;
  tag: string;
  sourceSha: string;
  /** Current running version may show its own pending record; only confirmed published records enter historical upgrade ranges. */
  publication: 'published' | 'pending';
};
export type GuidanceWarning = {
  code: string;
  file: string;
  field: string;
  message: string;
  suggestion: string;
};
export type GuidanceSource = { file: string; text: string };
export type GuidanceCatalog = {
  features: FeatureGuide[];
  releases: ReleaseGuide[];
  drafts: ReleaseDraft[];
  warnings: GuidanceWarning[];
};
export type GuidanceAvailability = { available: boolean; reason?: string };
export type GuidanceDeviceState = {
  firstVersion: string | null;
  lastStartedVersion: string | null;
  shownThrough: string | null;
  /** False means session deduplication only; the next launch may prompt again. */
  persisted: boolean;
  warning?: string;
};
export type GuidanceVersions = { currentVersion: string; releases: ReleaseGuide[] };
