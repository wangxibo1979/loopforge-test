import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);

const app = createApp();
app.listen(port, () => {
  console.log(`审计日志服务已启动：http://localhost:${port}`);
  console.log('接口：');
  console.log('  GET /api/health');
  console.log('  GET /api/audit-logs?operatorId=&projectId=&action=&from=&to=&page=&pageSize=');
  console.log('  GET /api/audit-logs/export?operatorId=&projectId=&action=&from=&to=');
});
