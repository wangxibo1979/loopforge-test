# 审计日志演示服务

为审计日志提供按操作人筛选、筛选结果 CSV 导出，并内置成员数据权限控制。

## 功能

1. **按操作人筛选**：`operatorId` 参数精确匹配操作人；
2. **CSV 导出**：`/export` 接口按当前筛选条件导出 CSV（UTF-8 BOM，Excel 可直接打开；含逗号/引号/换行的字段按 RFC 4180 转义）；
3. **数据权限**：
   - `admin`：可查询/导出全部项目的审计日志；
   - `member`（普通成员）：只能查询/导出**自己所属项目**内的数据；
     - 不传 `projectId` 时自动限定在自己所属项目范围内；
     - 传入越权 `projectId` 时直接返回 `403`（查询与导出口径一致，导出不绕过权限）。

## 快速开始

```bash
npm install
npm start          # 默认监听 3000，可用 PORT 覆盖
npm test           # 运行全部测试（node:test）
```

## 接口

所有接口需要 `Authorization: Bearer <token>`。演示用户与 Token 见 `data/seed.js`：

| 用户 | 角色 | 所属项目 | Token |
|---|---|---|---|
| 王喜博 u-admin | admin | 全部 | `tok-admin-001` |
| 李明 u-alice | member | alpha、beta | `tok-alice-002` |
| 赵雪 u-bob | member | beta | `tok-bob-003` |
| 陈晨 u-carol | member | gamma | `tok-carol-004` |

### 查询审计日志

```
GET /api/audit-logs?operatorId=&projectId=&action=&from=&to=&page=&pageSize=
```

| 参数 | 说明 |
|---|---|
| `operatorId` | 操作人用户 id，精确匹配 |
| `projectId` | 项目 id；普通成员传越权项目返回 403 |
| `action` | 操作类型，如 `login`、`export_data` |
| `from` / `to` | 时间范围（含边界）；纯日期按东八区解释 |
| `page` / `pageSize` | 分页，默认 1 / 20，最大 100 |

响应示例：

```json
{ "total": 5, "page": 1, "pageSize": 20, "items": [ { "id": "al-0012", "timestamp": "2026-11-22T09:20:41+08:00", "projectId": "proj-beta", "operatorId": "u-alice", "operatorName": "李明", "action": "export_data", "target": "audit-log", "detail": "..." } ] }
```

### 导出 CSV

```
GET /api/audit-logs/export?operatorId=&projectId=&action=&from=&to=
```

- 与查询接口共用同一套筛选参数、校验与数据权限；
- 返回 `text/csv; charset=utf-8`，`Content-Disposition: attachment`；
- 列：`id, timestamp, projectId, projectName, operatorId, operatorName, action, target, detail`。

## 示例

```bash
# 管理员按操作人筛选
curl -H "Authorization: Bearer tok-admin-001" \
  "http://localhost:3000/api/audit-logs?operatorId=u-alice"

# 普通成员按操作人筛选并导出 CSV（仅限自己所属项目）
curl -H "Authorization: Bearer tok-bob-003" \
  "http://localhost:3000/api/audit-logs/export?operatorId=u-bob" -o audit.csv

# 普通成员越权访问 → 403
curl -H "Authorization: Bearer tok-alice-002" \
  "http://localhost:3000/api/audit-logs?projectId=proj-gamma"
```

## 测试

`npm test` 覆盖：

- 操作人筛选、组合筛选（项目/时间/操作类型）、分页与排序；
- CSV 响应头、内容与筛选一致性、RFC 4180 转义、UTF-8 BOM；
- 认证（401）、成员数据范围裁剪、越权 403（查询与导出）、管理员全量访问。

## 说明

- 存储为演示用内存数据（`src/auditStore.js`），真实接入时替换为数据库查询并保持相同的过滤与权限语义；
- 认证为演示用静态 Token（`data/seed.js`），真实接入时替换为账号体系校验。
