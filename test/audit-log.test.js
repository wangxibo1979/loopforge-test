'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { createStore, defaultSeed } = require('../src/store');
const { CSV_HEADER } = require('../src/csv');
const { startServer, baseUrl, close, parseCsvLine, splitCsvRows } = require('./helpers');

/** 建立带凭证的请求。 */
async function api(server, path, token) {
  const res = await fetch(`${baseUrl(server)}${path}`, {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
  return res;
}

/* ---------------- A 组：按操作人筛选 ---------------- */

test('AC-A1 按 operator=U1 筛选，结果只含 U1 的记录', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const res = await api(server, '/api/audit-logs?operator=u1&pageSize=100', 'u1');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.ok(body.total > 0, '应命中至少一条');
  for (const item of body.items) {
    assert.equal(item.operatorId, 'u1');
  }
});

test('AC-A1-扩展 操作人筛选在管理员视角同样精确（含其他人的日志在库时互不串）', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const res = await api(server, '/api/audit-logs?operator=u2&pageSize=100', 'admin');
  const body = await res.json();
  assert.equal(body.total, 2); // log-3、log-4
  assert.ok(body.items.every((i) => i.operatorId === 'u2'));
});

test('AC-A2 不存在的操作人返回 200 + 空列表，不报错也不回退为不过滤', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const res = await api(server, '/api/audit-logs?operator=ghost-user', 'admin');
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.total, 0);
  assert.deepEqual(body.items, []);
});

test('AC-A3 不传操作人条件走默认查询，权限裁剪范围内全部可见（不隐含“只看自己”）', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const res = await api(server, '/api/audit-logs?pageSize=100', 'u1');
  const body = await res.json();
  // u1 属于 p1：p1 内 log-1/2/5（含系统触发的 log-5）均可见
  assert.equal(body.total, 3);
  assert.deepEqual(body.items.map((i) => i.id).sort(), ['log-1', 'log-2', 'log-5']);
});

test('AC-A4 操作人与时间范围组合为 AND（结果 ≤ 任一单条件）', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const onlyOp = await (await api(server, '/api/audit-logs?operator=u1&pageSize=100', 'u1')).json();
  const onlyTime = await (await api(server, '/api/audit-logs?from=2026-01-01T11:00:00Z&to=2026-01-01T11:30:00Z&pageSize=100', 'u1')).json();
  const both = await (await api(server, '/api/audit-logs?operator=u1&from=2026-01-01T11:00:00Z&to=2026-01-01T11:30:00Z&pageSize=100', 'u1')).json();
  assert.equal(both.total, 1); // log-2
  assert.ok(both.total <= onlyOp.total);
  assert.ok(both.total <= onlyTime.total);
  assert.equal(both.items[0].id, 'log-2');
});

test('B6 多操作人逗号分隔语义为 OR（命中任一即返回）', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const res = await api(server, '/api/audit-logs?operator=u1,u2&pageSize=100', 'admin');
  const body = await res.json();
  assert.equal(body.total, 4); // log-1/2 + log-3/4
  assert.ok(body.items.every((i) => ['u1', 'u2'].includes(i.operatorId)));
});

/* ---------------- B 组：CSV 导出 ---------------- */

test('AC-B1/B2 导出行数与查询 total 一致，跨多页时导出全量且内容逐条一致', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const query = await (await api(server, '/api/audit-logs?pageSize=2&page=1', 'admin')).json();
  assert.equal(query.total, 5);
  assert.equal(query.items.length, 2, '验证确实处于多页场景');
  const queryAll = await (await api(server, '/api/audit-logs?pageSize=100', 'admin')).json();

  const res = await api(server, '/api/audit-logs/export?pageSize=2&page=1', 'admin'); // 分页参数不影响导出全量
  const text = await res.text();
  const rows = splitCsvRows(text);
  assert.equal(rows.length, 1 + query.total, '表头 1 行 + 全量命中行');
  const data = rows.slice(1).map(parseCsvLine);
  for (let i = 0; i < queryAll.total; i++) {
    const expected = queryAll.items[i];
    const row = data[i];
    assert.equal(row[0], expected.createdAt, `第 ${i} 行时间一致`);
    assert.equal(row[1], expected.operatorName, `第 ${i} 行操作人一致`);
    assert.equal(row[2], expected.action, `第 ${i} 行操作类型一致`);
  }
});

test('AC-B3 首行为表头，字段数与数据行一致', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const text = await (await api(server, '/api/audit-logs/export', 'admin')).text();
  const rows = splitCsvRows(text);
  const header = parseCsvLine(rows[0]);
  assert.deepEqual(header, CSV_HEADER);
  for (const row of rows.slice(1)) {
    assert.equal(parseCsvLine(row).length, header.length);
  }
});

test('AC-B4 含逗号/引号/换行的字段按 RFC4180 转义，解析后内容还原', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const text = await (await api(server, '/api/audit-logs/export?operator=u1', 'admin')).text();
  const rows = splitCsvRows(text).slice(1).map(parseCsvLine);
  const withComma = rows.find((r) => r[5].includes('逗号'));
  assert.equal(withComma[5], '普通详情, 含逗号');
  const tricky = rows.find((r) => r[2] === 'build.run');
  assert.equal(tricky[5], '带引号"的内容\n换行');
});

test('AC-B5 导出带 UTF-8 BOM；=、@ 开头内容被转义防公式注入', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const res = await api(server, '/api/audit-logs/export?operator=u2', 'admin');
  const buf = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...buf.subarray(0, 3)], [0xEF, 0xBB, 0xBF], 'UTF-8 BOM');
  const text = buf.toString('utf8');
  assert.ok(text.includes("'=1+1"), '以 = 开头的单元格加前缀转义');
  assert.ok(text.includes("'@cmd /c calc"), '以 @ 开头的单元格加前缀转义');
  assert.ok(!text.includes('\n=1+1') && !text.includes('\n@cmd'), '转义后不再以公式字符起行');
});

test('AC-B6 命中 0 条时导出仅含表头行', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const text = await (await api(server, '/api/audit-logs/export?operator=nobody', 'admin')).text();
  const rows = splitCsvRows(text);
  assert.equal(rows.length, 1);
  assert.deepEqual(parseCsvLine(rows[0]), CSV_HEADER);
});

/* ---------------- C 组：数据权限（一票否决） ---------------- */

test('AC-C1 普通成员默认查询：结果中不存在任何非所属项目(P2)的日志', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const body = await (await api(server, '/api/audit-logs?pageSize=100', 'u1')).json();
  assert.ok(body.total > 0);
  assert.ok(body.items.every((i) => i.projectId === 'p1'));
});

test('AC-C2 操作人筛选叠加权限：U2 在 P1/P2 均有日志，成员只看到 P1 部分', async (t) => {
  // 专用种子：成员 m 属于 p1；操作人 u2 在 p1、p2 均有日志
  const store = createStore({
    users: [
      { id: 'admin', name: '管理员', role: 'admin' },
      { id: 'm', name: '成员甲', role: 'member' },
      { id: 'u2', name: '操作人乙', role: 'member' },
    ],
    projects: [{ id: 'p1', name: '项目一' }, { id: 'p2', name: '项目二' }],
    memberships: [{ userId: 'm', projectId: 'p1' }],
    auditLogs: [
      { id: 'l1', operatorId: 'u2', projectId: 'p1', action: 'a', result: 'success', detail: 'in-p1', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'l2', operatorId: 'u2', projectId: 'p2', action: 'a', result: 'success', detail: 'in-p2', createdAt: '2026-01-02T00:00:00Z' },
    ],
  });
  const server = await startServer(store);
  t.after(() => close(server));

  const adminView = await (await api(server, '/api/audit-logs?operator=u2&pageSize=100', 'admin')).json();
  assert.equal(adminView.total, 2, '管理员可见两个项目');

  const mView = await (await api(server, '/api/audit-logs?operator=u2&pageSize=100', 'm')).json();
  assert.equal(mView.total, 1);
  assert.equal(mView.items[0].projectId, 'p1');
  assert.equal(mView.items[0].detail, 'in-p1');
});

test('AC-C3 与 AC-C2 相同条件导出：CSV 中不出现 P2 的日志行（导出与查询同权）', async (t) => {
  const store = createStore({
    users: [
      { id: 'admin', name: '管理员', role: 'admin' },
      { id: 'm', name: '成员甲', role: 'member' },
      { id: 'u2', name: '操作人乙', role: 'member' },
    ],
    projects: [{ id: 'p1', name: '项目一' }, { id: 'p2', name: '项目二' }],
    memberships: [{ userId: 'm', projectId: 'p1' }],
    auditLogs: [
      { id: 'l1', operatorId: 'u2', projectId: 'p1', action: 'a', result: 'success', detail: 'in-p1', createdAt: '2026-01-01T00:00:00Z' },
      { id: 'l2', operatorId: 'u2', projectId: 'p2', action: 'a', result: 'success', detail: 'in-p2', createdAt: '2026-01-02T00:00:00Z' },
    ],
  });
  const server = await startServer(store);
  t.after(() => close(server));

  const text = await (await api(server, '/api/audit-logs/export?operator=u2', 'm')).text();
  const rows = splitCsvRows(text).slice(1);
  assert.equal(rows.length, 1);
  const cells = parseCsvLine(rows[0]);
  assert.equal(cells[3], '项目一');
  assert.equal(cells[5], 'in-p1');
  assert.ok(!text.includes('in-p2'), 'P2 数据不得出现在导出文件中');
});

test('AC-C4 显式传入无权访问的 projectId：查询与导出均被 403 拒绝（非静默清空）', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const q = await api(server, '/api/audit-logs?projectId=p2', 'u1');
  assert.equal(q.status, 403);
  const qBody = await q.json();
  assert.equal(qBody.error, 'FORBIDDEN');
  const e = await api(server, '/api/audit-logs/export?projectId=p2', 'u1');
  assert.equal(e.status, 403);
  const eBody = await e.json();
  assert.equal(eBody.error, 'FORBIDDEN');
});

test('AC-C5 管理员按其角色范围可正常查询与导出（权限收紧不误伤）', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const q = await (await api(server, '/api/audit-logs?projectId=p2&pageSize=100', 'admin')).json();
  assert.equal(q.total, 2);
  const text = await (await api(server, '/api/audit-logs/export?projectId=p2', 'admin')).text();
  assert.equal(splitCsvRows(text).length, 3); // 表头 + 2 行
});

test('AC-C6 未登录调用查询与导出均被 401 拒绝，不返回任何数据行', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const q = await api(server, '/api/audit-logs');
  assert.equal(q.status, 401);
  assert.equal((await q.json()).error, 'UNAUTHORIZED');
  const e = await api(server, '/api/audit-logs/export');
  assert.equal(e.status, 401);
});

/* ---------------- 其他边界 ---------------- */

test('B10 操作人注销后历史日志仍可筛出，展示名为“已注销”', async (t) => {
  const store = createStore(defaultSeed());
  store.getUser('u1').deleted = true;
  const server = await startServer(store);
  t.after(() => close(server));
  const body = await (await api(server, '/api/audit-logs?operator=u1&pageSize=100', 'admin')).json();
  assert.equal(body.total, 2);
  assert.ok(body.items.every((i) => i.operatorName === '已注销'));
});

test('B11 无操作人（系统触发）日志：按操作人筛选时被排除，默认查询中正常展示', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const filtered = await (await api(server, '/api/audit-logs?operator=u1&pageSize=100', 'admin')).json();
  assert.ok(filtered.items.every((i) => i.operatorId !== null));
  const all = await (await api(server, '/api/audit-logs?pageSize=100', 'admin')).json();
  const sys = all.items.find((i) => i.id === 'log-5');
  assert.equal(sys.operatorName, '系统');
});

test('B1/B2 组合：非法时间格式与非法 result 值返回 400，不影响正常筛选', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  assert.equal((await api(server, '/api/audit-logs?from=not-a-date', 'admin')).status, 400);
  assert.equal((await api(server, '/api/audit-logs?result=weird', 'admin')).status, 400);
  assert.equal((await api(server, '/api/audit-logs?result=failure', 'admin')).status, 200);
});

test('§6 规则 5 导出行为本身写入审计日志', async (t) => {
  const server = await startServer(createStore(defaultSeed()));
  t.after(() => close(server));
  const before = await (await api(server, '/api/audit-logs?pageSize=1', 'admin')).json();
  await api(server, '/api/audit-logs/export?operator=u2', 'admin');
  const after = await (await api(server, '/api/audit-logs?pageSize=100', 'admin')).json();
  assert.equal(after.total, before.total + 1);
  const exportLog = after.items.find((i) => i.action === 'audit_log.export');
  assert.ok(exportLog, '存在导出动作的审计记录');
  assert.equal(exportLog.operatorId, 'admin');
});
