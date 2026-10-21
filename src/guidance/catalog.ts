import { guidancePlacements, guidanceTarget } from './registry.ts';
import type {
  FeatureGuide,
  GuidanceCatalog,
  GuidanceSource,
  GuidanceWarning,
  ReleaseDraft,
  ReleaseGuide,
} from './types.ts';

const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const content = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.trim().length > 0 &&
  value.length <= 30000 &&
  !/replace-with-|请填写功能名称|请填写准备条件|请填写与界面一致的入口路径|请填写常见问题|请填写面向用户的更新摘要|请说明用户能完成什么|请用动词概括本步|请说明一个主要动作|请说明用户可以观察到的结果|请说明完成标志以及结果所在位置|请说明操作方式如何变化|请给出原因及用户可以执行的下一步/.test(
    value,
  );
const identifier = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z0-9]+(?:[.-][a-z0-9]+)*$/.test(value) && content(value);
export function safeGuidanceImagePath(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^assets\/(?:[a-zA-Z0-9_-]+\/)*[a-zA-Z0-9_.-]+\.(?:png|jpg|jpeg|webp|gif)$/i.test(value) &&
    !value.includes('..')
  );
}

/** Parse each authored file independently; content mistakes are warnings, never thrown errors. */
export function loadGuidanceCatalog(
  sources: GuidanceSource[],
  options: { assets?: string[] } = {},
): GuidanceCatalog {
  const result: GuidanceCatalog = { features: [], releases: [], drafts: [], warnings: [] };
  const candidates: { guide: FeatureGuide; file: string }[] = [];
  const releaseCandidates: { guide: ReleaseGuide; file: string }[] = [];
  const releaseFiles: { guide: ReleaseGuide | ReleaseDraft; file: string }[] = [];
  for (const { file, text } of sources) {
    const warn = (
      code: string,
      field: string,
      message: string,
      suggestion = '按照操作指引模板修正此字段。',
    ) => result.warnings.push({ code, file, field, message, suggestion });
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch {
      warn('invalid-json', '$', 'JSON 无法解析。', '检查引号、逗号和括号，保留其他有效文件。');
      continue;
    }
    if (!object(value) || value.schemaVersion !== 1) {
      warn(
        'unsupported-schema',
        'schemaVersion',
        '不支持的指引格式。',
        '使用 schemaVersion 1 的模板。',
      );
      continue;
    }
    if (value.kind === 'release' || value.kind === 'release-draft') {
      const changed = value.operationChange === 'changed';
      if (
        (!changed && value.operationChange !== 'none') ||
        !content(value.summary) ||
        !Array.isArray(value.changes) ||
        (!changed && (!content(value.noOperationReason) || value.changes.length !== 0))
      ) {
        warn(
          'invalid-content',
          'operationChange',
          '版本操作说明缺失或没有明确说明无新增操作的原因。',
        );
        continue;
      }
      const changes = value.changes.filter((change, index) => {
        const valid =
          object(change) &&
          identifier(change.id) &&
          content(change.summary) &&
          Array.isArray(change.guideIds) &&
          change.guideIds.length > 0 &&
          change.guideIds.every(identifier);
        if (!valid) warn('invalid-content', `changes.${index}`, '操作变化说明或功能引用不完整。');
        return valid;
      });
      const counts = new Map<string, number>();
      for (const change of changes) counts.set(change.id, (counts.get(change.id) ?? 0) + 1);
      value.changes = changes.filter((change) => {
        if (counts.get(change.id)! === 1) return true;
        warn('duplicate-id', 'changes.id', `操作变化标识重复：${change.id}`);
        return false;
      });
      if (changed && (value.changes as unknown[]).length === 0)
        warn(
          'empty-changes',
          'changes',
          '没有有效的操作变化条目。',
          '补充实际变化；不能将缺失内容改为无新增操作。',
        );
      const review = value.review;
      const reviewValid =
        object(review) &&
        ['pending', 'completed', 'completed-with-gaps'].includes(String(review.status)) &&
        typeof review.reviewer === 'string' &&
        typeof review.checkedAt === 'string' &&
        typeof review.source === 'string' &&
        typeof review.environment === 'string' &&
        Array.isArray(review.knownGaps) &&
        review.knownGaps.every(content) &&
        Array.isArray(review.checks) &&
        review.checks.every(
          (check) =>
            object(check) &&
            identifier(check.guideId) &&
            Array.isArray(check.stepIds) &&
            check.stepIds.every(identifier) &&
            ['passed', 'failed', 'not-verified', 'not-applicable'].includes(String(check.result)) &&
            content(check.evidence),
        );
      if (
        !reviewValid ||
        !content(review.reviewer) ||
        !content(review.checkedAt) ||
        !content(review.source) ||
        !content(review.environment) ||
        review.status === 'pending' ||
        (Array.isArray(review.checks) && review.checks.length === 0)
      )
        warn(
          'missing-review',
          'review',
          '未提供完整的人工核对记录。',
          '据实记录核对人、源码、环境、对应步骤、结果和缺项；这项警告不阻断发布。',
        );
      if (!reviewValid) delete value.review;
      if (value.kind === 'release') {
        if (file !== `releases/${value.version}.json`) {
          warn(
            'invalid-release-location',
            '$',
            '版本记录没有位于对应版本的固定位置。',
            '使用 releases/<版本号>.json，版本历史由发布准备从已确认的 tag 生成。',
          );
          continue;
        }
        if (
          typeof value.version !== 'string' ||
          !/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(value.version) ||
          value.tag !== `v${value.version}` ||
          typeof value.sourceSha !== 'string' ||
          !/^[a-f0-9]{40}$/i.test(value.sourceSha) ||
          !['published', 'pending'].includes(String(value.publication))
        ) {
          warn('invalid-content', 'version', '正式版本的版本号、标签、来源或发布状态无效。');
          continue;
        }
        releaseCandidates.push({ guide: value as ReleaseGuide, file });
      } else result.drafts.push(value as ReleaseDraft);
      releaseFiles.push({ guide: value as ReleaseGuide | ReleaseDraft, file });
      continue;
    }
    if (value.kind !== 'feature') {
      warn('unsupported-kind', 'kind', '不支持的指引类型。');
      continue;
    }
    let valid = true;
    const check = (condition: unknown, field: string) => {
      if (!condition) {
        valid = false;
        warn('invalid-content', field, '必填内容缺失、含占位文字或格式无效。');
      }
    };
    check(identifier(value.id), 'id');
    check(Number.isInteger(value.revision) && Number(value.revision) > 0, 'revision');
    for (const field of ['title', 'purpose', 'completion']) check(content(value[field]), field);
    check(
      Array.isArray(value.platforms) &&
        value.platforms.length > 0 &&
        value.platforms.every((p) => ['darwin', 'win32', 'linux'].includes(p)),
      'platforms',
    );
    check(
      Array.isArray(value.placements) && value.placements.every((p) => typeof p === 'string'),
      'placements',
    );
    if (Array.isArray(value.placements))
      for (const placement of value.placements) {
        if (!(guidancePlacements as readonly unknown[]).includes(placement))
          warn(
            'unknown-placement',
            'placements',
            `展示位置未登记：${String(placement)}`,
            '使用已登记位置；有效指引仍可在设置查阅。',
          );
      }
    const prerequisites = value.prerequisites;
    check(
      object(prerequisites) &&
        Array.isArray(prerequisites.items) &&
        prerequisites.items.every(content) &&
        (prerequisites.items.length > 0 || content(prerequisites.notApplicableReason)),
      'prerequisites',
    );
    check(
      object(value.entry) && content(value.entry.label) && content(value.entry.target),
      'entry',
    );
    if (
      object(value.entry) &&
      typeof value.entry.target === 'string' &&
      !guidanceTarget(value.entry.target)
    )
      warn(
        'unknown-target',
        'entry.target',
        '功能入口未登记或已经移除。',
        '使用当前有效入口；用户仍可阅读正文。',
      );
    check(Array.isArray(value.steps) && value.steps.length > 0, 'steps');
    if (Array.isArray(value.steps)) {
      const ids = new Set<string>();
      for (const [index, step] of value.steps.entries()) {
        check(
          object(step) &&
            identifier(step.id) &&
            !ids.has(step.id) &&
            content(step.title) &&
            content(step.action) &&
            content(step.expectedResult),
          `steps.${index}`,
        );
        if (!object(step)) continue;
        if (typeof step.id === 'string') ids.add(step.id);
        if (
          object(step.image) &&
          step.image.caption !== undefined &&
          !content(step.image.caption)
        ) {
          warn('invalid-image', `steps.${index}.image.caption`, '图片说明无效。');
          delete step.image.caption;
        }
        if (
          step.image !== undefined &&
          (!object(step.image) ||
            !safeGuidanceImagePath(step.image.src) ||
            !content(step.image.alt))
        ) {
          warn(
            'invalid-image',
            `steps.${index}.image`,
            '图片路径或替代文字无效。',
            '使用 assets 下的本地 PNG、JPEG、WebP 或 GIF，并填写替代文字。',
          );
          delete step.image;
        } else if (
          object(step.image) &&
          options.assets &&
          !options.assets.includes(String(step.image.src))
        ) {
          warn(
            'missing-image',
            `steps.${index}.image.src`,
            '图片文件不存在。',
            '补充对应图片；正文及替代文字仍可阅读。',
          );
        }
      }
    }
    const faq = value.faq;
    check(
      object(faq) &&
        Array.isArray(faq.items) &&
        faq.items.every((item) => object(item) && content(item.question) && content(item.answer)) &&
        (faq.items.length > 0 || content(faq.notApplicableReason)),
      'faq',
    );
    if (valid) candidates.push({ guide: value as FeatureGuide, file });
  }
  const counts = new Map<string, number>();
  for (const { guide } of candidates) counts.set(guide.id, (counts.get(guide.id) ?? 0) + 1);
  for (const { guide, file } of candidates) {
    if (counts.get(guide.id)! > 1)
      result.warnings.push({
        code: 'duplicate-id',
        file,
        field: 'id',
        message: `指引标识重复：${guide.id}`,
        suggestion: '为不同功能分配不同稳定标识；同一功能只保留一份当前内容。',
      });
    else result.features.push(guide);
  }
  for (const { guide, file } of releaseCandidates) {
    if (releaseCandidates.filter((item) => item.guide.version === guide.version).length > 1)
      result.warnings.push({
        code: 'duplicate-id',
        file,
        field: 'version',
        message: `版本记录重复：${guide.version}`,
        suggestion: '每个正式版本仅保留一份绑定记录。',
      });
    else result.releases.push(guide);
  }
  for (const { guide, file } of releaseFiles) {
    for (const change of guide.changes) {
      for (const guideId of change.guideIds)
        if (!result.features.some((feature) => feature.id === guideId))
          result.warnings.push({
            code: 'missing-guide',
            file,
            field: `changes.${change.id}.guideIds`,
            message: `功能指引不存在或无效：${guideId}`,
            suggestion: '补充有效功能指引或更正引用；保留可读版本摘要。',
          });
    }
    const review = guide.review;
    if (!review) continue;
    const warn = (code: string, field: string, message: string, suggestion: string) =>
      result.warnings.push({ code, file, field, message, suggestion });
    if (
      review.status === 'completed' &&
      (review.knownGaps.length > 0 ||
        review.checks.some((check) => ['failed', 'not-verified'].includes(check.result)))
    )
      warn(
        'review-status-conflict',
        'review.status',
        '整体通过状态与失败、未验证结果或已知缺项冲突。',
        '保留真实单项结果，并将整体状态改为 pending 或 completed-with-gaps。',
      );
    if (
      review.checkedAt &&
      (!/^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(review.checkedAt) ||
        !Number.isFinite(Date.parse(review.checkedAt)))
    )
      warn(
        'invalid-review-time',
        'review.checkedAt',
        '核对时间缺少有效日期和时区。',
        '记录实际核对时间及当地时区，不自动补造时间。',
      );
    for (const [index, check] of review.checks.entries()) {
      const feature = result.features.find((item) => item.id === check.guideId);
      if (!feature)
        warn(
          'unknown-review-guide',
          `review.checks.${index}.guideId`,
          `核对记录引用的功能指引不存在或无效：${check.guideId}`,
          '修正引用，保留原始核对结果，必要时重新核对。',
        );
      else
        for (const stepId of check.stepIds)
          if (!feature.steps.some((step) => step.id === stepId))
            warn(
              'unknown-review-step',
              `review.checks.${index}.stepIds`,
              `核对记录引用的步骤不存在：${check.guideId}/${stepId}`,
              '核对当前步骤后更新记录，不将旧结果自动视为通过。',
            );
      if (['failed', 'not-verified'].includes(check.result))
        warn(
          'review-gap',
          `review.checks.${index}.result`,
          `核对尚未通过：${check.guideId}（${check.result}）。`,
          `保留并处理核对证据：${check.evidence}`,
        );
    }
    for (const guideId of new Set(guide.changes.flatMap((change) => change.guideIds))) {
      const feature = result.features.find((item) => item.id === guideId);
      if (!feature) continue;
      for (const step of feature.steps)
        if (
          !review.checks.some(
            (check) => check.guideId === guideId && check.stepIds.includes(step.id),
          )
        )
          warn(
            'unreviewed-step',
            'review.checks',
            `操作变化关联步骤尚无核对记录：${guideId}/${step.id}`,
            '为实际核对的步骤记录结果、环境和证据；未验证时明确记录未验证。',
          );
    }
  }
  return result;
}
export type { GuidanceWarning };
