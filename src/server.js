'use strict';

const http = require('http');

const { createStore, defaultSeed } = require('./store');
const { HttpError, authenticate, assertProjectAccess } = require('./permissions');
const { parseFilters, listAuditLogs, queryAuditLogs, serializeLog, MAX_EXPORT_ROWS } = require('./query');
const { serializeCsv, logToCsvRow } = require('./csv');

/**
 * 审计日志查询接口：GET /api/audit-logs
 * 审计日志导出接口：GET /api/audit-logs/export
 *
 * 两条路由共享：authenticate -> assertProjectAccess -> parseFilters -> listAuditLogs，
 * 即“同一套权限判断、同一份筛选实现”，导出与查询同权（§6 规则 2）。
 */
function handleRequest(store, req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method !== 'GET') {
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', '仅支持 GET');
  }

  let user;
  try {
    user = authenticate(store, req); // AC-C6：未登录一律 401，先于任何数据访问
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(401, 'UNAUTHORIZED', '无效凭证');
  }

  let filters;
  if (url.pathname === '/api/audit-logs') {
    filters = parseFilters(url.searchParams);
    assertProjectAccess(store, user, filters.projectId); // AC-C4：越权 403，而非静默清空
    const payload = queryAuditLogs(store, user, filters);
    return sendJson(res, 200, payload);
  }

  if (url.pathname === '/api/audit-logs/export') {
    filters = parseFilters(url.searchParams);
    assertProjectAccess(store, user, filters.projectId);
    const matched = listAuditLogs(store, user, filters); // 与列表查询同一实现（导出全量，B3）
    if (matched.length > MAX_EXPORT_ROWS) {
      throw new HttpError(400, 'EXPORT_LIMIT_EXCEEDED',
        `命中 ${matched.length} 行，超出单次导出上限 ${MAX_EXPORT_ROWS} 行，请缩小筛选范围`);
    }
    const rows = matched.map((log) => logToCsvRow(serializeLog(store, log)));
    store.appendAuditLog({
      operatorId: user.id,
      projectId: filters.projectId,
      action: 'audit_log.export',
      result: 'success',
      detail: `导出 ${rows.length} 行; 筛选: operator=${filters.operators.join('|') || '-'} projectId=${filters.projectId || '-'}`,
    });
    const filename = `audit-logs-${new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14)}.csv`;
    res.writeHead(200, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    res.end(serializeCsv(rows));
    return undefined;
  }

  throw new HttpError(404, 'NOT_FOUND', `未知路径: ${url.pathname}`);
}

function sendJson(res, status, payload) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function createServer(store) {
  return http.createServer((req, res) => {
    let result;
    try {
      result = handleRequest(store, req, res);
    } catch (err) {
      const status = err instanceof HttpError ? err.status : (err.status || 500);
      const code = err.code || (err instanceof HttpError ? err.code : 'INTERNAL_ERROR');
      const message = status >= 500 ? '服务内部错误' : err.message;
      if (status >= 500) console.error(err);
      if (!res.headersSent) {
        sendJson(res, status, { error: code, message });
      } else {
        res.end();
      }
    }
    return result;
  });
}

const isMain = require.main === module;
if (isMain) {
  const port = Number(process.env.PORT || 3000);
  createServer(createStore(defaultSeed())).listen(port, () => {
    console.log(`audit-log server listening on :${port}`);
  });
}

module.exports = { createServer, handleRequest, defaultSeed, createStore };
