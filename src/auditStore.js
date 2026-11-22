/**
 * 审计日志内存存储与查询逻辑（演示用，真实实现应替换为数据库查询）。
 */

/** @typedef {{id: string, timestamp: string, projectId: string, operatorId: string, operatorName: string, action: string, target: string, detail: string}} AuditEntry */

const entries = [
  {
    id: 'al-0001',
    timestamp: '2026-11-18T09:12:00+08:00',
    projectId: 'proj-alpha',
    operatorId: 'u-alice',
    operatorName: '李明',
    action: 'login',
    target: 'session',
    detail: '使用密码登录',
  },
  {
    id: 'al-0002',
    timestamp: '2026-11-18T10:03:30+08:00',
    projectId: 'proj-alpha',
    operatorId: 'u-admin',
    operatorName: '王喜博',
    action: 'update_config',
    target: 'project:proj-alpha',
    detail: '修改了项目名称：旧值 "Alpha-Old"，新值 "Alpha 项目"',
  },
  {
    id: 'al-0003',
    timestamp: '2026-11-18T14:45:12+08:00',
    projectId: 'proj-beta',
    operatorId: 'u-bob',
    operatorName: '赵雪',
    action: 'create_task',
    target: 'task:T-101',
    detail: '创建任务「整理审计字段定义」',
  },
  {
    id: 'al-0004',
    timestamp: '2026-11-19T09:30:00+08:00',
    projectId: 'proj-alpha',
    operatorId: 'u-alice',
    operatorName: '李明',
    action: 'export_data',
    target: 'report:weekly',
    detail: '导出周报，多行说明：\n第一行：包含 3 个看板\n第二行：含引号 "Q4"，逗号, 以及制表符',
  },
  {
    id: 'al-0005',
    timestamp: '2026-11-19T11:05:20+08:00',
    projectId: 'proj-gamma',
    operatorId: 'u-carol',
    operatorName: '陈晨',
    action: 'login',
    target: 'session',
    detail: 'SSO 登录',
  },
  {
    id: 'al-0006',
    timestamp: '2026-11-19T15:22:45+08:00',
    projectId: 'proj-beta',
    operatorId: 'u-alice',
    operatorName: '李明',
    action: 'update_config',
    target: 'project:proj-beta',
    detail: '开启审计日志导出开关',
  },
  {
    id: 'al-0007',
    timestamp: '2026-11-20T08:55:01+08:00',
    projectId: 'proj-alpha',
    operatorId: 'u-admin',
    operatorName: '王喜博',
    action: 'grant_role',
    target: 'member:u-bob',
    detail: '将赵雪加入 Beta 项目',
  },
  {
    id: 'al-0008',
    timestamp: '2026-11-20T13:40:33+08:00',
    projectId: 'proj-gamma',
    operatorId: 'u-carol',
    operatorName: '陈晨',
    action: 'delete_record',
    target: 'record:R-77',
    detail: '删除过期记录，原因：保留期已满',
  },
  {
    id: 'al-0009',
    timestamp: '2026-11-20T17:10:09+08:00',
    projectId: 'proj-beta',
    operatorId: 'u-bob',
    operatorName: '赵雪',
    action: 'login',
    target: 'session',
    detail: '登录失败 2 次后成功',
  },
  {
    id: 'al-0010',
    timestamp: '2026-11-21T10:18:27+08:00',
    projectId: 'proj-alpha',
    operatorId: 'u-alice',
    operatorName: '李明',
    action: 'create_task',
    target: 'task:T-205',
    detail: '创建任务「审计日志按操作人筛选」',
  },
  {
    id: 'al-0011',
    timestamp: '2026-11-21T16:02:54+08:00',
    projectId: 'proj-gamma',
    operatorId: 'u-admin',
    operatorName: '王喜博',
    action: 'update_config',
    target: 'project:proj-gamma',
    detail: '调整数据保留策略为 180 天',
  },
  {
    id: 'al-0012',
    timestamp: '2026-11-22T09:20:41+08:00',
    projectId: 'proj-beta',
    operatorId: 'u-alice',
    operatorName: '李明',
    action: 'export_data',
    target: 'audit-log',
    detail: '导出 Beta 项目审计日志 12 条',
  },
];

let nextSeq = entries.length + 1;

/**
 * 将查询时间边界解析为毫秒时间戳。
 * 纯日期（YYYY-MM-DD）按东八区解释：from 取当日 00:00:00，to 取当日 23:59:59.999。
 * 解析失败返回 NaN。
 * @param {string|undefined} value
 * @param {'from'|'to'} kind
 * @returns {number}
 */
export function parseTimeBound(value, kind) {
  if (value === undefined) return NaN;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const time = kind === 'from' ? 'T00:00:00+08:00' : 'T23:59:59.999+08:00';
    return Date.parse(`${value}${time}`);
  }
  return Date.parse(value);
}

/** 判断字符串是否可解析为有效时间。 */
export function isValidTime(value) {
  if (typeof value !== 'string' || value.trim() === '') return false;
  return !Number.isNaN(Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+08:00` : value));
}

/**
 * 追加一条审计记录（返回只读副本）。
 */
export function append(entry) {
  const record = {
    ...entry,
    id: entry.id ?? `al-${String(nextSeq++).padStart(4, '0')}`,
    timestamp: entry.timestamp ?? new Date().toISOString(),
  };
  entries.push(record);
  return { ...record };
}

/**
 * 查询审计日志。
 *
 * @param {object} options
 * @param {string} [options.operatorId] 按操作人筛选（用户 id，精确匹配）
 * @param {string} [options.projectId] 按项目筛选
 * @param {string} [options.action] 按操作类型筛选
 * @param {string} [options.from] 起始时间（含），ISO 8601
 * @param {string} [options.to] 结束时间（含），ISO 8601
 * @param {Set<string>|null} scopeProjectIds 数据范围；null 表示不限（管理员）
 * @param {number} options.page 页码，从 1 开始
 * @param {number} options.pageSize 每页条数（1-100）
 * @returns {{total: number, page: number, pageSize: number, items: AuditEntry[]}}
 */
export function query({
  operatorId,
  projectId,
  action,
  from,
  to,
  scopeProjectIds = null,
  page = 1,
  pageSize = 20,
}) {
  const matchProject = (entry) => {
    if (scopeProjectIds && !scopeProjectIds.has(entry.projectId)) return false;
    if (projectId !== undefined && entry.projectId !== projectId) return false;
    return true;
  };
  const fromTs = parseTimeBound(from, 'from');
  const toTs = parseTimeBound(to, 'to');
  const filtered = entries.filter((entry) => {
    if (operatorId !== undefined && entry.operatorId !== operatorId) return false;
    if (action !== undefined && entry.action !== action) return false;
    if (!matchProject(entry)) return false;
    const ts = Date.parse(entry.timestamp);
    if (!Number.isNaN(fromTs) && ts < fromTs) return false;
    if (!Number.isNaN(toTs) && ts > toTs) return false;
    return true;
  });

  // 按时间倒序（同一时间按 id 倒序，保证分页稳定）。
  filtered.sort((a, b) => {
    const diff = Date.parse(b.timestamp) - Date.parse(a.timestamp);
    return diff !== 0 ? diff : a.id < b.id ? 1 : -1;
  });

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  return {
    total,
    page,
    pageSize,
    items: filtered.slice(start, start + pageSize).map((e) => ({ ...e })),
  };
}
