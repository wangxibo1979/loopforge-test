import { Router } from 'express';
import * as store from './auditStore.js';
import { toCsvFile } from './csv.js';
import { HttpError } from './errors.js';
import { accessibleProjectIds, assertProjectAccess, isAdmin } from './permissions.js';
import { projectNames } from '../data/seed.js';

const CSV_COLUMNS = ['id', 'timestamp', 'projectId', 'projectName', 'operatorId', 'operatorName', 'action', 'target', 'detail'];

/**
 * 解析并校验查询参数（查询与导出共用）。
 * 越权的 projectId 在这里直接拒绝（403）；其余字段非法返回 400。
 */
function parseFilters(query, user) {
  const filters = {};

  if (query.operatorId !== undefined && query.operatorId !== '') {
    filters.operatorId = String(query.operatorId);
  }
  if (query.action !== undefined && query.action !== '') {
    filters.action = String(query.action);
  }
  if (query.projectId !== undefined && query.projectId !== '') {
    filters.projectId = String(query.projectId);
    assertProjectAccess(user, filters.projectId); // 403：普通成员越权访问其他项目
  }

  if (query.from !== undefined && query.from !== '') {
    if (!store.isValidTime(query.from)) {
      throw new HttpError(400, `from 不是有效时间：${query.from}`);
    }
    filters.from = String(query.from);
  }
  if (query.to !== undefined && query.to !== '') {
    if (!store.isValidTime(query.to)) {
      throw new HttpError(400, `to 不是有效时间：${query.to}`);
    }
    filters.to = String(query.to);
  }

  filters.page = query.page === undefined || query.page === '' ? 1 : Number(query.page);
  if (!Number.isInteger(filters.page) || filters.page < 1) {
    throw new HttpError(400, 'page 必须是大于等于 1 的整数');
  }
  filters.pageSize = query.pageSize === undefined || query.pageSize === '' ? 20 : Number(query.pageSize);
  if (!Number.isInteger(filters.pageSize) || filters.pageSize < 1 || filters.pageSize > 100) {
    throw new HttpError(400, 'pageSize 必须是 1-100 之间的整数');
  }

  // 数据范围：普通成员限定在自己所属项目内；管理员不限。
  filters.scopeProjectIds = accessibleProjectIds(user);
  return filters;
}

/** 构造 CSV 数据行（含项目名称，便于导出后阅读）。 */
function csvRows(items) {
  return items.map((entry) => [
    entry.id,
    entry.timestamp,
    entry.projectId,
    projectNames[entry.projectId] ?? entry.projectId,
    entry.operatorId,
    entry.operatorName,
    entry.action,
    entry.target,
    entry.detail,
  ]);
}

export function createAuditRouter() {
  const router = Router();

  /**
   * 查询审计日志。
   * GET /api/audit-logs?operatorId=&projectId=&action=&from=&to=&page=&pageSize=
   */
  router.get('/audit-logs', (req, res) => {
    const filters = parseFilters(req.query, req.user);
    const result = store.query(filters);
    res.json(result);
  });

  /**
   * 按当前筛选条件导出 CSV。
   * GET /api/audit-logs/export?operatorId=&projectId=&action=&from=&to=
   * 导出遵循与查询完全相同的数据范围与校验规则。
   */
  router.get('/audit-logs/export', (req, res) => {
    const filters = parseFilters(req.query, req.user);
    const { items } = store.query({ ...filters, page: 1, pageSize: Number.MAX_SAFE_INTEGER });
    const csv = toCsvFile(CSV_COLUMNS, csvRows(items));
    const stamp = new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${stamp}.csv"`);
    res.send(csv);
  });

  return router;
}

// 便于测试与复用：暴露内部判断逻辑
export const internals = { parseFilters, isAdmin };
