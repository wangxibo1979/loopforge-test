/**
 * CSV 序列化（RFC 4180）。
 */

/**
 * 转义单个字段：包含逗号、引号、换行时加引号包裹，内部引号翻倍。
 * null/undefined 输出空字符串。
 */
export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replaceAll('"', '""')}"`;
  }
  return str;
}

/**
 * 将行数组序列化为 CSV 文本（\r\n 行结束符）。
 * @param {string[]} header 表头
 * @param {Array<Array<*>>} rows 数据行
 * @returns {string}
 */
export function toCsv(header, rows) {
  const lines = [header, ...rows].map((row) => row.map(csvEscape).join(','));
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * 完整 CSV 文件内容：UTF-8 BOM（便于 Excel 识别中文）+ 正文。
 */
export function toCsvFile(header, rows) {
  return `﻿${toCsv(header, rows)}`;
}
