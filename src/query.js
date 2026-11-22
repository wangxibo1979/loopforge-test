'use strict';

const { visibleProjectIds } = require('./permissions');

/**
 * 审计日志查询核心：筛选条件的唯一实现。
 * 列表查询与 CSV 导出共用同一份 buildMatcher + listAuditLogs，
 * 保证“界面看到什么、导出就是什么”（FR-B / AC-B1、AC-B2）。
 */

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 200;
/** 同步导出行数上限（需求 B4，可通过环境变量配置）。 */
const MAX_EXPORT_ROWS = Number(process.env.AUDIT_EXPORT_MAX_ROWS || 50000);

const SORT_FIELD_ALLOWLIST = new Set(['createdAt', 'id']);
const RESULT_ALLOWLIST = new Set(['success', 'failure']);

/**
 * 解析并校验查询参数。抛出 HttpError 表示参数非法。
 * 返回 { operators, projectId, action, result, from, to, page, pageSize }。
 *
 * - 不传 operator = 不按操作人过滤（B2），不会隐含“只看自己”。
 * - operator 支持逗号分隔多值，语义为“命中任一”（OR，B6）。
 * - 不存在的操作人 ID 不会回退为不过滤：匹配集合里只有该 ID，自然得到空集（B1）。
 */
function parseFilters(searchParams) {
  const rawOperator = (searchParams.get('operator') || '').trim();
  const operators = rawOperator
    ? rawOperator.split(',').map((s) => s.trim()).filter(Boolean)
    : [];

  const projectId = (searchParams.get('projectId') || '').trim() || null;
  const action = (searchParams.get('action') || '').trim() || null;

  const rawResult = (searchParams.get('result') || '').trim();
  if (rawResult && !RESULT_ALLOWLIST.has(rawResult)) {
    throw Object.assign(new Error(`非法的 result 值: ${rawResult}`), { status: 400, code: 'INVALID_RESULT' });
  }
  const result = rawResult || null;

  const from = (searchParams.get('from') || '').trim() || null;
  const to = (searchParams.get('to') || '').trim() || null;
  for (const [label, v] of [['from', from], ['to', to]]) {
    if (v && Number.isNaN(Date.parse(v))) {
      throw Object.assign(new Error(`非法的时间格式 ${label}=${v}`), { status: 400, code: 'INVALID_TIME' });
    }
  }

  const sortField = SORT_FIELD_ALLOWLIST.has(searchParams.get('sortField')) ? searchParams.get('sortField') : 'createdAt';
  const sortOrder = searchParams.get('sortOrder') === 'asc' ? 'asc' : 'desc';

  let page = parseInt(searchParams.get('page') || '1', 10);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let pageSize = parseInt(searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE), 10);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = DEFAULT_PAGE_SIZE;
  pageSize = Math.min(pageSize, MAX_PAGE_SIZE);

  return { operators, projectId, action, result, from, to, page, pageSize, sortField, sortOrder };
}

/**
 * 构建谓词：所有条件为 AND（B5）。
 * projectId 越权由 assertProjectAccess 在上游显式拒绝，这里不重复处理。
 */
function buildMatcher(filters) {
  return (log) => {
    if (filters.operators.length > 0 && !filters.operators.includes(log.operatorId)) return false;
    if (filters.projectId && log.projectId !== filters.projectId) return false;
    if (filters.action && log.action !== filters.action) return false;
    if (filters.result && log.result !== filters.result) return false;
    if (filters.from && new Date(log.createdAt) < new Date(filters.from)) return false;
    if (filters.to && new Date(log.createdAt) > new Date(filters.to)) return false;
    return true;
  };
}

/** 单条日志可见性：项目归属在可见集合内；无项目归属（全局动作，如跨项目导出记录）仅管理员可见。 */
function isLogVisible(visibleProjects, user, log) {
  if (log.projectId === null || log.projectId === undefined) {
    return user.role === 'admin';
  }
  return visibleProjects.has(log.projectId);
}

/**
 * 服务端裁剪后的全量命中集（已按权限范围过滤、已排序）。
 * 列表分页与导出全量都从这里取数，条数与顺序天然一致。
 */
function listAuditLogs(store, user, filters) {
  const visible = visibleProjectIds(store, user); // 唯一权限路径（§6 规则 2）
  const matcher = buildMatcher(filters);
  const matched = store.getAuditLogs()
    .filter((log) => isLogVisible(visible, user, log) && matcher(log))
    .sort((a, b) => {
      const da = a[filters.sortField];
      const db = b[filters.sortField];
      const cmp = da < db ? -1 : da > db ? 1 : 0;
      return filters.sortOrder === 'asc' ? cmp : -cmp;
    });
  return matched;
}

/** 列表查询：分页 + total（total 为权限裁剪后的命中总数，导出据此核对 AC-B1/B2）。 */
function queryAuditLogs(store, user, filters) {
  const matched = listAuditLogs(store, user, filters);
  const start = (filters.page - 1) * filters.pageSize;
  return {
    total: matched.length,
    page: filters.page,
    pageSize: filters.pageSize,
    items: matched.slice(start, start + filters.pageSize).map(serializeLog.bind(null, store)),
  };
}

/**
 * 展示序列化：查询接口与 CSV 导出共用同一脱敏/摘要规则（B9，不得因导出放大可见范围）。
 */
function serializeLog(store, log) {
  return {
    id: log.id,
    createdAt: log.createdAt,
    operatorId: log.operatorId,
    operatorName: store.displayName(log.operatorId),
    projectId: log.projectId,
    projectName: log.projectId ? (store.getProject(log.projectId) || {}).name || log.projectId : null,
    action: log.action,
    result: log.result,
    detail: summarizeDetail(log.detail),
  };
}

/** 详情摘要：截断 + 对疑似凭证字段脱敏（与界面展示同一规则）。 */
function summarizeDetail(detail) {
  if (detail === null || detail === undefined) return '';
  let text = String(detail);
  text = text.replace(/(token|password|secret|authorization)["']?\s*[:=]\s*\S+/gi, '$1=***');
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}

module.exports = {
  parseFilters,
  listAuditLogs,
  queryAuditLogs,
  serializeLog,
  summarizeDetail,
  MAX_EXPORT_ROWS,
};
