'use strict';

/**
 * 数据权限裁剪（需求 §6）。
 *
 * 唯一实现路径：查询接口与导出接口都必须经由这里得到可见项目集合，
 * 禁止任何接口自行计算范围 —— 保证“查询看不到但导出能拿到”的旁路不存在。
 */

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/**
 * 认证：从 Authorization: Bearer <token> 解析当前用户。
 * token 约定为用户 ID（真实系统应换成 session/JWT，这里只做身份识别通道）。
 * 未登录/无有效凭证 -> 401（AC-C6）。
 */
function authenticate(store, req) {
  const auth = req.headers['authorization'] || '';
  const m = /^Bearer\s+(.+)$/i.exec(auth);
  const token = m ? m[1].trim() : '';
  if (!token) {
    throw new HttpError(401, 'UNAUTHORIZED', '未登录或凭证缺失');
  }
  const user = store.getUser(token);
  if (!user || user.deleted) {
    throw new HttpError(401, 'UNAUTHORIZED', '无效凭证');
  }
  return user;
}

/**
 * 服务端强制裁剪：当前用户可见的项目 ID 集合。
 * - admin：全部项目
 * - member：仅其所属项目（多对多归属）
 */
function visibleProjectIds(store, user) {
  if (user.role === 'admin') {
    return new Set(store.projects.keys());
  }
  return new Set(store.memberships.get(user.id) || []);
}

/**
 * 访问指定项目：普通成员请求其未加入的项目时必须显式拒绝（403），
 * 而不是静默清空或只返回部分数据（需求 §6 规则 1/4，AC-C4）。
 */
function assertProjectAccess(store, user, projectId) {
  if (projectId === null || projectId === undefined || projectId === '') return;
  if (!store.getProject(projectId)) {
    throw new HttpError(404, 'PROJECT_NOT_FOUND', `项目不存在: ${projectId}`);
  }
  if (!visibleProjectIds(store, user).has(projectId)) {
    throw new HttpError(403, 'FORBIDDEN', `无权访问项目: ${projectId}`);
  }
}

module.exports = { HttpError, authenticate, visibleProjectIds, assertProjectAccess };
