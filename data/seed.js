/**
 * 演示用用户与令牌数据。真实实现应接内部账号体系，此处用静态表模拟。
 *
 * 角色：
 * - admin：管理员，可访问全部项目；
 * - member：普通成员，只能访问所属项目（projectIds）内的数据。
 */
export const users = [
  {
    id: 'u-admin',
    name: '王喜博',
    role: 'admin',
    projectIds: ['proj-alpha', 'proj-beta', 'proj-gamma'],
    token: 'tok-admin-001',
  },
  {
    id: 'u-alice',
    name: '李明',
    role: 'member',
    projectIds: ['proj-alpha', 'proj-beta'],
    token: 'tok-alice-002',
  },
  {
    id: 'u-bob',
    name: '赵雪',
    role: 'member',
    projectIds: ['proj-beta'],
    token: 'tok-bob-003',
  },
  {
    id: 'u-carol',
    name: '陈晨',
    role: 'member',
    projectIds: ['proj-gamma'],
    token: 'tok-carol-004',
  },
];

/** 项目名称（用于展示与 CSV 输出）。 */
export const projectNames = {
  'proj-alpha': 'Alpha 项目',
  'proj-beta': 'Beta 项目',
  'proj-gamma': 'Gamma 项目',
};

const usersByToken = new Map(users.map((u) => [u.token, u]));

/** 根据Bearer Token 解析用户，未命中返回 null。 */
export function findUserByToken(token) {
  return usersByToken.get(token) ?? null;
}
