import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, ADMIN, ALICE, BOB } from './helpers.js';

test('未携带 Token 返回 401', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status } = await s.json('/api/audit-logs', undefined);
  assert.equal(status, 401);

  const badToken = await s.json('/api/audit-logs', 'tok-not-exist');
  assert.equal(badToken.status, 401);
});

test('普通成员不带 projectId 查询时，只返回自己所属项目的记录', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  // alice 属于 alpha + beta，共 9 条（不含 gamma 的 3 条）
  const { status, body } = await s.json('/api/audit-logs', ALICE);
  assert.equal(status, 200);
  assert.equal(body.total, 9);
  assert.ok(body.items.every((i) => i.projectId === 'proj-alpha' || i.projectId === 'proj-beta'));
  assert.ok(!body.items.some((i) => i.projectId === 'proj-gamma'));

  // bob 只属于 beta，共 4 条
  const bobView = await s.json('/api/audit-logs', BOB);
  assert.equal(bobView.status, 200);
  assert.equal(bobView.body.total, 4);
  assert.ok(bobView.body.items.every((i) => i.projectId === 'proj-beta'));
});

test('普通成员查询越权项目返回 403', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const { status, body } = await s.json('/api/audit-logs?projectId=proj-gamma', ALICE);
  assert.equal(status, 403);
  assert.match(body.error, /无权访问项目 proj-gamma/);
});

test('普通成员导出越权项目返回 403（导出不绕过权限）', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const res = await s.get('/api/audit-logs/export?projectId=proj-gamma', ALICE);
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.match(body.error, /无权访问项目 proj-gamma/);
});

test('普通成员在自己项目内按操作人筛选正常可用', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  // alice 在自己范围内筛选 bob 的操作记录（bob 只在 beta，属 alice 范围；bob 共 2 条操作）
  const { status, body } = await s.json('/api/audit-logs?operatorId=u-bob', ALICE);
  assert.equal(status, 200);
  assert.equal(body.total, 2);
  assert.ok(body.items.every((i) => i.operatorId === 'u-bob' && i.projectId === 'proj-beta'));

  // alice 筛选 carol（只在 gamma，超出 alice 范围）→ 范围裁剪后为空且不报错
  const scoped = await s.json('/api/audit-logs?operatorId=u-carol', ALICE);
  assert.equal(scoped.status, 200);
  assert.equal(scoped.body.total, 0);
});

test('普通成员导出同样只包含自己项目的数据', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  // alice 导出 beta 项目（自己所属）→ 200，4 条
  const res = await s.get('/api/audit-logs/export?projectId=proj-beta', ALICE);
  assert.equal(res.status, 200);
  const text = await res.text();
  assert.ok(text.split('\r\n').filter((line) => line.startsWith('al-')).length === 4);
});

test('管理员可访问任意项目', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const gamma = await s.json('/api/audit-logs?projectId=proj-gamma', ADMIN);
  assert.equal(gamma.status, 200);
  assert.equal(gamma.body.total, 3);

  const all = await s.json('/api/audit-logs', ADMIN);
  assert.equal(all.body.total, 12);
});
