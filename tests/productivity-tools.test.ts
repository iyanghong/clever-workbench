import { describe, expect, test } from 'vitest';
import { compareConfigurations } from '../tools/config-diff/logic';
import { processJson } from '../tools/data-format/logic';
import { describeCron, formatDateInput, nextCronRuns } from '../tools/time-cron/logic';
import { defaultTextOptions, transformText } from '../tools/text-transform/logic';
import { convertTable, parseCsv } from '../tools/table-data/logic';

describe('配置对比', () => {
  test('JSON 忽略键顺序，文本报告增删行', () => {
    expect(compareConfigurations('{"b":2,"a":1}', '{ "a": 1, "b": 2 }', 'json')).toMatchObject({
      added: 0,
      removed: 0,
    });
    expect(compareConfigurations('a=1\nkeep', 'a=2\nkeep', 'text')).toMatchObject({
      added: 1,
      removed: 1,
      same: 1,
    });
  });
  test('.env 忽略注释并按键排序，非法行有明确错误', () => {
    const result = compareConfigurations('# comment\nB=2\nA=1', 'export A=1\nB=3', 'env');
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(() => compareConfigurations('not valid', '', 'env')).toThrow('KEY=value');
  });
});

describe('数据格式助手', () => {
  test('递归排序、路径提取和字符串转义', () => {
    expect(processJson('{"z":1,"a":{"b":2}}', 'sort')).toContain('"a": {\n    "b": 2');
    expect(processJson('{"a":[{"b":"值"}]}', 'query', '$.a[0].b')).toBe('"值"');
    expect(processJson('{"复杂键":3}', 'query', '$["复杂键"]')).toBe('3');
    expect(processJson('a\nb', 'escape')).toBe('"a\\nb"');
    expect(processJson('"a\\nb"', 'unescape')).toBe('a\nb');
  });
  test('无效路径和 JSON 会失败而不返回旧结果', () => {
    expect(() => processJson('{"a":1}', 'query', '$.b')).toThrow('不存在');
    expect(() => processJson('{', 'format')).toThrow();
  });
});

describe('时间与 Cron', () => {
  test('自动识别秒和毫秒并输出 ISO 与 Unix 时间', () => {
    expect(formatDateInput('0')).toMatchObject({
      iso: '1970-01-01T00:00:00.000Z',
      seconds: 0,
      milliseconds: 0,
    });
    expect(formatDateInput('1000').milliseconds).toBe(1_000_000);
    expect(formatDateInput('1000000000000').milliseconds).toBe(1_000_000_000_000);
  });
  test('Cron 计算本地下次执行时间并拒绝非法范围', () => {
    const from = new Date(2026, 0, 2, 8, 50);
    const runs = nextCronRuns('0 9 * * *', from, 2);
    expect(runs[0].getFullYear()).toBe(2026);
    expect(runs[0].getDate()).toBe(2);
    expect(runs[0].getHours()).toBe(9);
    expect(runs[1].getDate()).toBe(3);
    expect(nextCronRuns('*/15 * * * *', from, 1)[0].getMinutes()).toBe(0);
    expect(describeCron('0 9 * * *')).toBe('每天 09:00 执行');
    expect(() => nextCronRuns('61 * * * *')).toThrow('0 到 59');
  });
});

describe('批量文本处理', () => {
  test('去重、数字排序、列提取和前后缀', () => {
    expect(transformText('b\na\na', 'dedupe', defaultTextOptions).text).toBe('b\na');
    expect(transformText('10\n2\n1', 'sort-asc', defaultTextOptions).text).toBe('1\n2\n10');
    expect(
      transformText('a,b,c\n1,2,3', 'columns', {
        ...defaultTextOptions,
        columns: '1,3',
      }).text,
    ).toBe('a,c\n1,3');
    expect(
      transformText('a\nb', 'prefix-suffix', {
        ...defaultTextOptions,
        prefix: '[',
        suffix: ']',
      }).text,
    ).toBe('[a]\n[b]');
  });
  test('正则提取捕获组并执行替换', () => {
    expect(
      transformText('ip=1.1.1.1\nip=2.2.2.2', 'regex-extract', {
        ...defaultTextOptions,
        pattern: 'ip=(\\d+\\.\\d+\\.\\d+\\.\\d+)',
      }).text,
    ).toBe('1.1.1.1\n2.2.2.2');
    expect(
      transformText('a1a2', 'regex-replace', {
        ...defaultTextOptions,
        pattern: '\\d',
        replacement: '',
      }).text,
    ).toBe('aa');
  });
});

describe('表格数据转换', () => {
  test('CSV 支持引号、双引号转义和字段内换行', () => {
    const input = 'name,note\n订单,"第一行\n第二行"\n测试,"a""b"';
    expect(parseCsv(input)).toEqual([
      ['name', 'note'],
      ['订单', '第一行\n第二行'],
      ['测试', 'a"b'],
    ]);
    const json = convertTable(input, 'csv-json');
    expect(json.rows).toBe(2);
    expect(convertTable(json.text, 'json-csv').text).toBe(input);
  });
  test('JSON 对象并集字段和数组行均可转换', () => {
    expect(convertTable('[{"a":1},{"b":2}]', 'json-csv').text).toBe('a,b\n1,\n,2');
    expect(convertTable('[[1,2],[3,4]]', 'json-csv')).toMatchObject({ rows: 2, columns: 2 });
    expect(() => convertTable('a,b\n1', 'csv-json')).toThrow('列数不一致');
    expect(() => parseCsv('a,"b')).toThrow('未闭合');
  });
});
