'use strict';

/**
 * 内存数据存储（greenfield 最小实现）。
 *
 * 数据模型（对应需求文档 §8 假设 A3/A4，语义约束为准）：
 * - users:      { id, name, role: 'admin' | 'member', deleted }
 * - projects:   { id, name }
 * - memberships: Array<{ userId, projectId }>   用户与项目多对多归属
 * - auditLogs:  { id, operatorId, projectId, action, result, detail, createdAt }
 *               operatorId 为 null 表示系统触发（需求 B11）
 */

function createStore(seed) {
  const users = new Map();
  const projects = new Map();
  const memberships = new Map(); // userId -> Set<projectId>
  const auditLogs = [];

  for (const u of (seed && seed.users) || []) {
    users.set(u.id, { role: 'member', deleted: false, ...u });
  }
  for (const p of (seed && seed.projects) || []) {
    projects.set(p.id, { ...p });
  }
  for (const m of (seed && seed.memberships) || []) {
    if (!memberships.has(m.userId)) memberships.set(m.userId, new Set());
    memberships.get(m.userId).add(m.projectId);
  }
  for (const l of (seed && seed.auditLogs) || []) {
    auditLogs.push({ ...l });
  }

  let logSeq = auditLogs.length;

  return {
    users,
    projects,
    memberships,

    /** 追加一条审计日志（含“导出行为本身入审计”，需求 §6 规则 5）。 */
    appendAuditLog(entry) {
      logSeq += 1;
      const log = {
        id: `log-${logSeq}`,
        operatorId: null,
        projectId: null,
        action: '',
        result: 'success',
        detail: '',
        createdAt: new Date().toISOString(),
        ...entry,
      };
      auditLogs.push(log);
      return log;
    },

    getAuditLogs() {
      return auditLogs;
    },

    getUser(id) {
      return users.get(id) || null;
    },

    getProject(id) {
      return projects.get(id) || null;
    },

    /** 操作人展示名：已注销用户仍可按 ID 归档展示（需求 B10）。 */
    displayName(operatorId) {
      if (!operatorId) return '系统';
      const u = users.get(operatorId);
      if (!u || u.deleted) return '已注销';
      return u.name;
    },
  };
}

/** 测试/演示用种子数据：U1、U2 为成员，admin 为超管，P1/P2 两个项目。 */
function defaultSeed() {
  const t = (h, m, s) => new Date(Date.UTC(2026, 0, 1, h, m, s)).toISOString();
  return {
    users: [
      { id: 'admin', name: '平台管理员', role: 'admin' },
      { id: 'u1', name: '张一', role: 'member' },
      { id: 'u2', name: '王二', role: 'member' },
    ],
    projects: [
      { id: 'p1', name: '项目一' },
      { id: 'p2', name: '项目二' },
    ],
    memberships: [
      { userId: 'u1', projectId: 'p1' },
      { userId: 'u2', projectId: 'p2' },
    ],
    auditLogs: [
      { id: 'log-1', operatorId: 'u1', projectId: 'p1', action: 'deploy.create', result: 'success', detail: '普通详情, 含逗号', createdAt: t(10, 0, 0) },
      { id: 'log-2', operatorId: 'u1', projectId: 'p1', action: 'build.run', result: 'failure', detail: '带引号"的内容\n换行', createdAt: t(11, 0, 0) },
      { id: 'log-3', operatorId: 'u2', projectId: 'p2', action: 'deploy.create', result: 'success', detail: '=1+1', createdAt: t(12, 0, 0) },
      { id: 'log-4', operatorId: 'u2', projectId: 'p2', action: 'release.publish', result: 'success', detail: '@cmd /c calc', createdAt: t(13, 0, 0) },
      { id: 'log-5', operatorId: null, projectId: 'p1', action: 'system.cron', result: 'success', detail: '定时任务', createdAt: t(14, 0, 0) },
    ],
  };
}

module.exports = { createStore, defaultSeed };
