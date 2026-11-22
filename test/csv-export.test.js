import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, parseCsvRows, ADMIN, ALICE, BOB } from './helpers.js';

const EXPECTED_HEADER = ['id', 'timestamp', 'projectId', 'projectName', 'operatorId', 'operatorName', 'action', 'target', 'detail'];

test('导出返回 CSV 文件响应头', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const res = await s.get('/api/audit-logs/export?operatorId=u-alice', ADMIN);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /text\/csv/);
  assert.match(res.headers.get('content-disposition') ?? '', /attachment;\s*filename="audit-logs-.*\.csv"/);

  const text = await res.text();
  const rows = parseCsvRows(text);
  assert.deepEqual(rows[0], EXPECTED_HEADER);
});

test('导出内容与筛选条件一致（按操作人）', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const res = await s.get('/api/audit-logs/export?operatorId=u-alice', ADMIN);
  const rows = parseCsvRows(await res.text());
  const dataRows = rows.slice(1);
  assert.equal(dataRows.length, 5); // 李明共 5 条
  const operatorCol = EXPECTED_HEADER.indexOf('operatorId');
  assert.ok(dataRows.every((row) => row[operatorCol] === 'u-alice'));
});

test('导出内容与筛选条件一致（按操作人 + 项目 + 时间）', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const res = await s.get('/api/audit-logs/export?operatorId=u-alice&projectId=proj-beta&from=2026-11-21&to=2026-11-30', ADMIN);
  const rows = parseCsvRows(await res.text());
  const dataRows = rows.slice(1);
  assert.equal(dataRows.length, 1);
  assert.equal(dataRows[0][EXPECTED_HEADER.indexOf('id')], 'al-0012');
});

test('CSV 正确转义含逗号、引号、换行的字段', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  // al-0004 的 detail 含多行文本、双引号和逗号
  const res = await s.get('/api/audit-logs/export?projectId=proj-alpha&operatorId=u-alice&action=export_data', ADMIN);
  const raw = await res.text();
  const rows = parseCsvRows(raw);
  const dataRows = rows.slice(1);
  assert.equal(dataRows.length, 1);

  const detail = dataRows[0][EXPECTED_HEADER.indexOf('detail')];
  assert.match(detail, /第一行：包含 3 个看板/);
  assert.match(detail, /含引号 "Q4"，逗号, 以及制表符/);
  // 原始文本中该字段必须以引号包裹且内部引号翻倍（seed 中的换行是 LF，原样保留在引号内）
  assert.ok(raw.includes('"导出周报，多行说明：\n第一行：包含 3 个看板\n第二行：含引号 ""Q4""，逗号, 以及制表符"'));
});

test('CSV 带 UTF-8 BOM，便于 Excel 打开中文', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const res = await s.get('/api/audit-logs/export', ADMIN);
  const bytes = new Uint8Array(await res.arrayBuffer());
  // UTF-8 BOM: EF BB BF
  assert.equal(bytes[0], 0xef);
  assert.equal(bytes[1], 0xbb);
  assert.equal(bytes[2], 0xbf);
});

test('导出包含项目名称列', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  const res = await s.get('/api/audit-logs/export?projectId=proj-gamma', ADMIN);
  const rows = parseCsvRows(await res.text());
  const dataRows = rows.slice(1);
  assert.ok(dataRows.length > 0);
  assert.ok(dataRows.every((row) => row[EXPECTED_HEADER.indexOf('projectName')] === 'Gamma 项目'));
});

test('普通成员导出同样受数据范围限制', async (t) => {
  const s = await startServer();
  t.after(() => s.close());

  // bob 只属于 proj-beta：不带 projectId 导出时只能拿到 proj-beta 的 4 条
  const res = await s.get('/api/audit-logs/export', BOB);
  const rows = parseCsvRows(await res.text());
  const dataRows = rows.slice(1);
  assert.equal(dataRows.length, 4);
  assert.ok(dataRows.every((row) => row[EXPECTED_HEADER.indexOf('projectId')] === 'proj-beta'));
});
