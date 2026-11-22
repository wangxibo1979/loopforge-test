'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { escapeCell, serializeCsv, logToCsvRow, CSV_HEADER, BOM } = require('../src/csv');

test('escapeCell：RFC4180 加引号与引号翻倍', () => {
  assert.equal(escapeCell('plain'), 'plain');
  assert.equal(escapeCell('a,b'), '"a,b"');
  assert.equal(escapeCell('he said "hi"'), '"he said ""hi"""');
  assert.equal(escapeCell('line1\nline2'), '"line1\nline2"');
  assert.equal(escapeCell(null), '');
  assert.equal(escapeCell(123), '123');
});

test('escapeCell：= + - @ Tab CR 开头的值加单引号前缀防公式注入', () => {
  assert.equal(escapeCell('=1+1'), "'=1+1");
  assert.equal(escapeCell('+86138'), "'+86138");
  assert.equal(escapeCell('-1.5'), "'-1.5");
  assert.equal(escapeCell('@cmd'), "'@cmd");
  assert.equal(escapeCell('\tTab'), "'\tTab");
  assert.equal(escapeCell('\rCR'), '"\'\rCR"', 'CR 前缀转义后仍含 CR，按 RFC4180 加引号');
  assert.equal(escapeCell('2026-01-01'), '2026-01-01', '普通日期值不做公式转义');
});

test('serializeCsv：BOM 开头、\\r\\n 换行、表头在首行', () => {
  const csv = serializeCsv([logToCsvRow({
    createdAt: '2026-01-01T00:00:00.000Z',
    operatorName: '张一',
    action: 'deploy.create',
    projectName: '项目一',
    result: 'success',
    detail: 'x,y"z',
  })]);
  assert.ok(csv.startsWith(BOM));
  const body = csv.slice(1);
  assert.ok(!body.replace(/\r\n/g, '').includes('\n'), '所有换行均为 \\r\\n');
  assert.ok(body.endsWith('\r\n'));
  const lines = body.split('\r\n').filter((l) => l !== '');
  assert.equal(lines[0], '时间,操作人,操作类型,所属项目,操作结果,详情摘要');
  assert.equal(lines[1], '2026-01-01T00:00:00.000Z,张一,deploy.create,项目一,success,"x,y""z"');
});

test('CSV_HEADER 覆盖验收要求的六个语义字段（AC-B3）', () => {
  assert.deepEqual(CSV_HEADER, ['时间', '操作人', '操作类型', '所属项目', '操作结果', '详情摘要']);
});
