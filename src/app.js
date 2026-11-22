import express from 'express';
import { requireAuth } from './auth.js';
import { createAuditRouter } from './auditRoutes.js';
import { HttpError } from './errors.js';

/** 创建 Express 应用（独立于启动逻辑，便于测试）。 */
export function createApp() {
  const app = express();

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 审计日志相关接口均需认证
  app.use('/api', requireAuth, createAuditRouter());

  app.use((req, _res, next) => {
    next(new HttpError(404, `接口不存在：${req.method} ${req.path}`));
  });

  // 统一错误处理
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    console.error(err);
    return res.status(500).json({ error: '服务器内部错误' });
  });

  return app;
}
