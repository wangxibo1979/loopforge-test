/**
 * 数据权限模型。
 *
 * - admin（管理员）：可查询/导出所有项目的审计日志。
 * - member（普通成员）：只能查询/导出自己所属项目内的审计日志；
 *   明确传入越权 projectId 时直接拒绝（403）。
 */
import { HttpError } from './errors.js';

/** 判断用户是否为管理员。 */
export function isAdmin(user) {
  return user?.role === 'admin';
}

/**
 * 返回用户可见的项目集合。
 * 管理员返回 null 表示不受限制；普通成员返回其所属项目 id 的 Set。
 * @returns {Set<string> | null}
 */
export function accessibleProjectIds(user) {
  if (isAdmin(user)) return null;
  return new Set(user.projectIds ?? []);
}

/** 判断用户是否可以访问指定项目。 */
export function canAccessProject(user, projectId) {
  if (isAdmin(user)) return true;
  return (user?.projectIds ?? []).includes(projectId);
}

/**
 * 断言用户可以访问指定项目，否则抛出 403。
 * @param {object} user 已认证用户
 * @param {string|undefined} projectId 查询显式指定的项目 id
 */
export function assertProjectAccess(user, projectId) {
  if (projectId !== undefined && !canAccessProject(user, projectId)) {
    throw new HttpError(403, `无权访问项目 ${projectId} 的审计日志`);
  }
}
