'use strict';

/**
 * CSV 生成（需求 B7/B8，AC-B3~B6）。
 * - UTF-8 BOM 开头，Excel 打开中文不乱码
 * - 换行符 \r\n
 * - RFC 4180：含逗号/双引号/CR/LF 的字段加引号，内部引号翻倍
 * - 公式注入防护：以 = + - @ Tab CR 开头的单元格前置单引号
 */

const BOM = '﻿';

const CSV_HEADER = ['时间', '操作人', '操作类型', '所属项目', '操作结果', '详情摘要'];

const FORMULA_PREFIX = new Set(['=', '+', '-', '@', '\t', '\r']);

function escapeCell(value) {
  let text = value === null || value === undefined ? '' : String(value);
  if (text.length > 0 && FORMULA_PREFIX.has(text[0])) {
    text = `'${text}`; // 防止 Excel 打开时按公式执行（B7）
  }
  if (/[",\r\n]/.test(text)) {
    text = `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function serializeCsv(rows) {
  const lines = [CSV_HEADER.map(escapeCell).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCell).join(','));
  }
  return BOM + lines.join('\r\n') + '\r\n';
}

/** 行对象 -> CSV 单元格数组（与 serializeLog 展示字段一一对应，AC-B3）。 */
function logToCsvRow(entry) {
  return [
    entry.createdAt,
    entry.operatorName,
    entry.action,
    entry.projectName || '',
    entry.result,
    entry.detail,
  ];
}

module.exports = { serializeCsv, logToCsvRow, CSV_HEADER, escapeCell, BOM };
