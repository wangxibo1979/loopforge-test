import { createApp } from '../src/app.js';

/** 启动测试服务器（随机端口），返回带便捷请求方法的对象。 */
export async function startServer() {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;

  async function get(path, token) {
    const headers = token ? { authorization: `Bearer ${token}` } : {};
    return fetch(`${base}${path}`, { headers });
  }
  async function json(path, token) {
    const res = await get(path, token);
    return { status: res.status, body: await res.json() };
  }

  return {
    server,
    base,
    get,
    json,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const ADMIN = 'tok-admin-001'; // 管理员，全部项目
export const ALICE = 'tok-alice-002'; // 普通成员：proj-alpha、proj-beta
export const BOB = 'tok-bob-003'; // 普通成员：proj-beta

/** 极简 CSV 行解析（按 RFC 4180 处理引号），用于导出内容断言。 */
export function parseCsvRows(text) {
  const content = text.startsWith('﻿') ? text.slice(1) : text;
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}
