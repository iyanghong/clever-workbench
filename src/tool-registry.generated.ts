// 由 scripts/generate-tools.mjs 生成，请勿手动修改。
import type { State as zipTextState } from '../tools/zip-text/contract.ts';
import type { Command as zipTextCommand } from '../tools/zip-text/contract.ts';
export const toolCatalog = [
  {
    id: "config-diff",
    title: "配置对比",
    description: "对比文本、JSON 和 .env 配置，快速定位新增、删除与修改。",
    guidance: null,
  },
  {
    id: "data-format",
    title: "数据格式助手",
    description: "格式化、压缩、排序和提取 JSON，处理转义文本。",
    guidance: null,
  },
  {
    id: "table-data",
    title: "表格数据转换",
    description: "在 CSV 与 JSON 之间转换，支持表头、制表符和引号。",
    guidance: null,
  },
  {
    id: "text-transform",
    title: "批量文本处理",
    description: "批量清理、去重、排序、提取列，以及正则查找替换。",
    guidance: null,
  },
  {
    id: "time-cron",
    title: "时间与 Cron",
    description: "转换时间戳、计算相对时间，解释 Cron 并预测执行时间。",
    guidance: null,
  },
  {
    id: "zip-text",
    title: "ZIP 文本归档",
    description: "将文件加密为文本分片，或从分片还原文件。支持 Git 文件筛选。",
    guidance: "zip-text-archive",
  },
] as const;
export interface ToolStates {
  'zip-text': zipTextState;
}
export interface ToolCommands {
  'zip-text': zipTextCommand;
}
