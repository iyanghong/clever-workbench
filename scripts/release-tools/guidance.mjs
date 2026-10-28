import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { loadGuidanceCatalog, safeGuidanceImagePath } from '../../src/guidance/catalog.ts';

const prefix = 'content/guidance/';

/** Build only confirmed history and the current pending binding in the disposable checkout. */
export async function bindOperationGuidance(
  directory,
  { tag, sourceSha, history = { records: [], warnings: [] } },
) {
  const report = await inspectOperationGuidance(directory, { sourceSha });
  report.warnings.push(...history.warnings);
  const files = [];
  const desired = new Map(history.records.map((record) => [`${record.version}.json`, record]));
  if (report.content)
    desired.set(`${tag.slice(1)}.json`, {
      ...report.content,
      kind: 'release',
      version: tag.slice(1),
      tag,
      sourceSha,
      publication: 'pending',
    });
  const folder = path.join(directory, prefix, 'releases');
  const warn = (file) =>
    report.warnings.push({
      code: 'binding-unavailable',
      file,
      field: '$',
      message: '操作说明无法写入安全的绑定目录。',
      suggestion: '检查内容目录权限和普通文件；本次继续发布但不宣称已有完整指引。',
    });
  try {
    for (const relative of ['content', 'content/guidance', 'content/guidance/releases']) {
      const target = path.join(directory, relative);
      await fs.mkdir(target, { recursive: false }).catch((error) => {
        if (error.code !== 'EEXIST') throw error;
      });
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink())
        throw Object.assign(Error('内容输出目录不是普通目录。'), { code: 'UNSAFE_CONTENT' });
    }
    const names = new Set([
      ...(await fs.readdir(folder)).filter((name) =>
        /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.json$/.test(name),
      ),
      ...desired.keys(),
    ]);
    for (const name of names) {
      const file = `${prefix}releases/${name}`,
        target = path.join(folder, name);
      try {
        if (!desired.has(name)) {
          await fs.unlink(target);
          files.push(file);
          report.warnings.push({
            code: 'unconfirmed-history-excluded',
            file,
            field: 'publication',
            message: '没有匹配的正式 Release 与固定 tag 记录，此记录不进入新包历史。',
            suggestion: '保留原源码和失败 tag 供调查，不把草稿或未确认版本写成已发布历史。',
          });
          continue;
        }
        const text = JSON.stringify(desired.get(name), null, 2) + '\n';
        const temporary = `${target}.${randomUUID()}.tmp`;
        try {
          await fs.writeFile(temporary, text, { flag: 'wx' });
          await fs.rename(temporary, target);
        } finally {
          await fs.rm(temporary, { force: true });
        }
        files.push(file);
      } catch (error) {
        if (!error.code) throw error;
        warn(file);
      }
    }
  } catch (error) {
    if (!error.code) throw error;
    warn(`${prefix}releases/`);
  }
  return { report, files };
}

/** Read the selected checkout only. Authored files are data, never imported as JavaScript/JSON modules. */
export async function inspectOperationGuidance(directory, { sourceSha, releaseTag } = {}) {
  const sources = [],
    assets = [],
    warnings = [];
  const warn = (code, file, message, suggestion) =>
    warnings.push({
      code,
      file,
      field: '$',
      message,
      suggestion,
    });
  async function visit(relative = '') {
    const target = path.join(directory, prefix, relative);
    let entries;
    try {
      const stat = await fs.lstat(target);
      if (!stat.isDirectory() || stat.isSymbolicLink()) {
        warn(
          'unsafe-content-path',
          prefix + relative,
          '内容目录不是仓库内普通目录。',
          '使用随源码提交的普通目录，不使用符号链接。',
        );
        return;
      }
      entries = await fs.readdir(target, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT' && !relative) return;
      warn(
        'unreadable-content',
        prefix + relative,
        '内容目录无法读取。',
        '检查目录与读取权限；其他有效内容继续保留。',
      );
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const file = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isSymbolicLink()) {
        warn(
          'unsafe-content-path',
          prefix + file,
          '不读取符号链接指向的内容。',
          '将实际文件提交到受控内容目录。',
        );
      } else if (entry.isDirectory()) await visit(file);
      else if (entry.isFile()) {
        if (safeGuidanceImagePath(file)) assets.push(file);
        if (file.endsWith('.json')) {
          try {
            sources.push({ file, text: await fs.readFile(path.join(target, entry.name), 'utf8') });
          } catch {
            warn(
              'unreadable-content',
              prefix + file,
              '内容文件无法读取。',
              '检查文件权限后重新核对。',
            );
          }
        }
      }
    }
  }
  await visit();
  const catalog = loadGuidanceCatalog(sources, { assets });
  warnings.push(
    ...catalog.warnings.map((warning) => ({ ...warning, file: prefix + warning.file })),
  );
  let content;
  if (releaseTag) content = catalog.releases.find((release) => release.tag === releaseTag);
  else if (catalog.drafts.length === 1)
    content = loadGuidanceCatalog(
      sources.filter((source) => source.file === 'pending.json'),
      { assets },
    ).drafts[0];
  if (!content)
    warn(
      'missing-release-guidance',
      releaseTag ? `${prefix}releases/${releaseTag.slice(1)}.json` : `${prefix}pending.json`,
      releaseTag ? '本次版本没有有效的绑定操作说明。' : '没有唯一有效的待发布操作说明。',
      '编写本次操作变化及功能引用，或明确无新增操作的原因；缺失不能推断为无新增操作。',
    );
  if (releaseTag && content && sourceSha && content.sourceSha !== sourceSha) {
    warnings.push({
      code: 'binding-source-mismatch',
      file: `${prefix}releases/${releaseTag.slice(1)}.json`,
      field: 'sourceSha',
      message: '绑定记录与本次业务源码不一致，不能作为本版操作说明。',
      suggestion: '从实际业务源码重新准备新的版本；固定 tag 不能改写。',
    });
    content = undefined;
  }
  if (content?.review?.source && sourceSha && content.review.source !== sourceSha)
    warnings.push({
      code: 'review-source-mismatch',
      file: releaseTag ? `${prefix}releases/${releaseTag.slice(1)}.json` : `${prefix}pending.json`,
      field: 'review.source',
      message: `核对来源 ${content.review.source} 与计划源码 ${sourceSha} 不同。`,
      suggestion: '核对两者差异并记录实际证据，不自动改写已有核对来源。',
    });
  return {
    schemaVersion: 1,
    sourceSha,
    releaseTag,
    content: content ?? null,
    catalog,
    assets,
    warnings,
  };
}

export function formatOperationGuidance(report) {
  const lines = ['操作指引检查（仅警告，不阻止发布）'];
  if (report.sourceSha) lines.push(`检查源码：${report.sourceSha}`);
  if (report.releaseTag) lines.push(`绑定版本：${report.releaseTag}`);
  if (report.content) {
    lines.push(`操作说明：${report.content.summary}`);
    if (report.content.operationChange === 'none')
      lines.push(`无新增操作：${report.content.noOperationReason}`);
    else
      for (const change of report.content.changes)
        lines.push(`  ${change.summary}（指引：${change.guideIds.join('、')}）`);
    lines.push(
      `人工核对：${report.content.review?.status ?? '未提供'}；已知缺项 ${report.content.review?.knownGaps.length ?? 0} 项`,
    );
    for (const gap of report.content.review?.knownGaps ?? []) lines.push(`  已知缺项：${gap}`);
  } else lines.push('操作说明缺失或无效；不会自动标记为“无新增操作”。');
  lines.push(
    `可用功能指引 ${report.catalog.features.length} 项，版本记录 ${report.catalog.releases.length} 项，警告 ${report.warnings.length} 项。`,
  );
  for (const warning of report.warnings)
    lines.push(
      `警告 [${warning.code}] ${warning.file}#${warning.field}：${warning.message}\n  修正建议：${warning.suggestion}`,
    );
  return lines.join('\n');
}
