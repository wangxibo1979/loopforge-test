import { findUserByToken } from '../data/seed.js';
import { HttpError } from './errors.js';

/**
 * 认证中间件：校验 Authorization: Bearer <token>，通过后挂载 req.user。
 */
export function requireAuth(req, _res, next) {
  const header = req.get('authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  const token = match?.[1]?.trim();
  if (!token) {
    return next(new HttpError(401, '缺少认证信息，请在 Authorization 头中携带 Bearer Token'));
  }
  const user = findUserByToken(token);
  if (!user) {
    return next(new HttpError(401, '无效的访问令牌'));
  }
  req.user = user;
  return next();
}
