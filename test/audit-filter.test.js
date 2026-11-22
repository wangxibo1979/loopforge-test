import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, ADMIN } from './helpers.js';

test('按操作人筛选：只返回该操作人的记录', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/audit-logs?operatorId=u-alice', ADMIN);
  assert.equal(status, 200);
  assert.ok(body.total > 0);
  assert.ok(body.items.every((item) => item.operatorId === 'u-alice'));
  // 种子数据中李明（u-alice）共 5 条记录
  assert.equal(body.total, 5);
});

test('按操作人 + 项目组合筛选', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/audit-logs?operatorId=u-alice&projectId=proj-beta', ADMIN);
  assert.equal(status, 200);
  assert.equal(body.total, 2);
  assert.ok(body.items.every((i) => i.operatorId === 'u-alice' && i.projectId === 'proj-beta'));
  assert.deepEqual(body.items.map((i) => i.id), ['al-0012', 'al-0006']); // 时间倒序
});

test('按时间范围筛选（日期边界按东八区解释）', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/audit-logs?from=2026-11-19&to=2026-11-20', ADMIN);
  assert.equal(status, 200);
  // 19 日与 20 日各有若干条：al-0004/5/6（19 日）、al-0007/8/9（20 日）
  assert.equal(body.total, 6);
  assert.deepEqual(
    body.items.map((i) => i.id),
    ['al-0009', 'al-0008', 'al-0007', 'al-0006', 'al-0005', 'al-0004'],
  );
});

test('按操作类型筛选', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/audit-logs?action=export_data', ADMIN);
  assert.equal(status, 200);
  assert.equal(body.total, 2);
  assert.ok(body.items.every((i) => i.action === 'export_data'));
});

test('时间格式非法返回 400', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const bad = await s.json('/api/audit-logs?from=not-a-date', ADMIN);
  assert.equal(bad.status, 400);

  const badTo = await s.json('/api/audit-logs?to=2026-13-99', ADMIN);
  assert.equal(badTo.status, 400);
});

test('分页：page/pageSize 生效且总数不变', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const page1 = await s.json('/api/audit-logs?operatorId=u-alice&page=1&pageSize=2', ADMIN);
  assert.equal(page1.status, 200);
  assert.equal(page1.body.total, 5);
  assert.equal(page1.body.items.length, 2);

  const page3 = await s.json('/api/audit-logs?operatorId=u-alice&page=3&pageSize=2', ADMIN);
  assert.equal(page3.body.items.length, 1); // 5 条 → 第 3 页剩 1 条
});

test('page/pageSize 非法返回 400', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  assert.equal((await s.json('/api/audit-logs?page=0', ADMIN)).status, 400);
  assert.equal((await s.json('/api/audit-logs?pageSize=101', ADMIN)).status, 400);
  assert.equal((await s.json('/api/audit-logs?pageSize=abc', ADMIN)).status, 400);
});

test('默认按时间倒序排列', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { body } = await s.json('/api/audit-logs', ADMIN);
  const times = body.items.map((i) => Date.parse(i.timestamp));
  const sorted = [...times].sort((a, b) => b - a);
  assert.deepEqual(times, sorted);
  assert.equal(body.items[0].id, 'al-0012'); // 种子数据中最新一条
});
