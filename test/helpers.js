'use strict';

/** 测试辅助：启动临时服务、独立 RFC4180 CSV 解析器（不复用被测实现，保证解析独立性）。 */
const { createServer } = require('../src/server');

function startServer(store) {
  return new Promise((resolve, reject) => {
    const server = createServer(store);
    server.listen(0, '127.0.0.1', () => resolve(server));
    server.on('error', reject);
  });
}

function baseUrl(server) {
  return `http://127.0.0.1:${server.address().port}`;
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

/** 独立实现的 RFC 4180 解析（含引号内逗号/引号/换行），用于校验导出内容还原。 */
function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      cells.push(cur); cur = '';
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

function splitCsvRows(text) {
  const body = text.startsWith('﻿') ? text.slice(1) : text;
  const rows = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') { inQuotes = !inQuotes; cur += ch; }
    else if (ch === '\n' && !inQuotes) { rows.push(cur.replace(/\r$/, '')); cur = ''; }
    else cur += ch;
  }
  if (cur !== '') rows.push(cur.replace(/\r$/, ''));
  return rows;
}

module.exports = { startServer, baseUrl, close, parseCsvLine, splitCsvRows };
