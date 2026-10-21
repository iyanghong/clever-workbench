import { describe, expect, it } from 'vitest';
import { loadGuidanceCatalog } from '../src/guidance/catalog';

const feature = {
  schemaVersion: 1,
  kind: 'feature',
  id: 'application-update',
  revision: 1,
  title: '检查与安装应用更新',
  platforms: ['darwin'],
  placements: ['settings-about'],
  purpose: '检查正式版本并选择重启时间。',
  prerequisites: { items: ['使用正式安装版。'], notApplicableReason: '' },
  entry: { label: '设置 → 关于', target: 'settings-about' },
  steps: [
    {
      id: 'check',
      title: '检查更新',
      action: '点击检查更新。',
      expectedResult: '显示当前版本状态。',
    },
  ],
  completion: '新版完成健康启动。',
  faq: { items: [], notApplicableReason: '本步骤没有额外问题。' },
};

describe('操作指引内容契约', () => {
  it('坏文件不影响有效指引，未知格式、占位内容与重复身份不会被选中', () => {
    const source = (file: string, value: unknown) => ({ file, text: JSON.stringify(value) });
    const result = loadGuidanceCatalog([
      source('features/update.json', feature),
      { file: 'features/broken.json', text: '{ broken' },
      source('features/future.json', { ...feature, id: 'future', schemaVersion: 20 }),
      source('features/template.json', {
        ...feature,
        id: 'template',
        purpose: '请说明用户能完成什么',
      }),
      source('features/a.json', { ...feature, id: 'duplicate' }),
      source('features/b.json', { ...feature, id: 'duplicate' }),
    ]);
    expect(result.features.map((guide) => guide.id)).toEqual(['application-update']);
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining([
        'invalid-json',
        'unsupported-schema',
        'invalid-content',
        'duplicate-id',
      ]),
    );
    expect(
      result.warnings.every((warning) => warning.file && warning.field && warning.suggestion),
    ).toBe(true);
  });
  it('图片路径不会越界，缺图和失效入口仍保留有效文字', () => {
    const result = loadGuidanceCatalog(
      [
        {
          file: 'features/readable.json',
          text: JSON.stringify({
            ...feature,
            entry: { label: '旧功能入口', target: 'javascript:alert(1)' },
            steps: [
              { ...feature.steps[0], image: { src: '../private.png', alt: '越界图片' } },
              {
                ...feature.steps[0],
                id: 'missing',
                image: {
                  src: 'assets/missing.png',
                  alt: '设置中的更新区域',
                  caption: { unsafe: true },
                },
              },
            ],
          }),
        },
      ],
      { assets: [] },
    );
    expect(result.features).toHaveLength(1);
    expect(result.features[0].steps[0].image).toBeUndefined();
    expect(result.features[0].steps[1].image).toEqual({
      src: 'assets/missing.png',
      alt: '设置中的更新区域',
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['unknown-target', 'invalid-image', 'missing-image']),
    );
  });

  it('保留版本与来源、明确无变化原因，缺失引用只警告且不伪造无新增操作', () => {
    const draft = {
      schemaVersion: 1,
      kind: 'release-draft',
      operationChange: 'changed',
      summary: '新增可离线查看的指引。',
      changes: [{ id: 'guidance', summary: '从设置查看功能指引。', guideIds: ['missing'] }],
    };
    const sources = [
      { file: 'pending.json', text: JSON.stringify(draft) },
      {
        file: 'releases/1.2.0.json',
        text: JSON.stringify({
          ...draft,
          kind: 'release',
          version: '1.2.0',
          tag: 'v1.2.0',
          sourceSha: 'a'.repeat(40),
          publication: 'pending',
        }),
      },
      {
        file: 'releases/1.2.1.json',
        text: JSON.stringify({
          ...draft,
          kind: 'release',
          operationChange: 'none',
          changes: [],
          version: '1.2.1',
          tag: 'v1.2.1',
          sourceSha: 'b'.repeat(40),
          publication: 'published',
        }),
      },
    ];
    const result = loadGuidanceCatalog(sources);
    expect(result.drafts[0].operationChange).toBe('changed');
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0]).toMatchObject({
      version: '1.2.0',
      sourceSha: 'a'.repeat(40),
      publication: 'pending',
    });
    expect(result.warnings.map((warning) => warning.code)).toEqual(
      expect.arrayContaining(['missing-guide', 'missing-review', 'invalid-content']),
    );
  });
});
