'use strict';

// 该文件在独立进程中运行：先设置导出上限，再加载被测模块，验证 B4 / AC-B7。
process.env.AUDIT_EXPORT_MAX_ROWS = '2';

const { test } = require('node:test');
const assert = require('node:assert');
const { createStore, defaultSeed } = require('../src/store');
const { MAX_EXPORT_ROWS } = require('../src/query');
const { startServer, baseUrl, close, splitCsvRows } = require('./helpers');

async function api(server, path, token) {
  return fetch(`${baseUrl(server)}${path}`, { headers: { authorization: `Bearer ${token}` } });
}

test('AC-B7 命中行数超过导出上限时请求被拒绝，不静默截断', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  assert.equal(MAX_EXPORT_ROWS, 2, '环境变量生效');

  const res = await api(server, '/api/audit-logs/export', 'admin'); // 命中 5 行 > 上限 2
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error, 'EXPORT_LIMIT_EXCEEDED');
  assert.ok(body.message.includes('请缩小筛选范围'), '明确提示缩小范围');

  // 缩小范围后恢复可导出
  const ok = await api(server, '/api/audit-logs/export?operator=u2', 'admin');
  assert.equal(ok.status, 200);
  assert.equal(splitCsvRows(await ok.text()).length, 3); // 表头 + 2 行
});
