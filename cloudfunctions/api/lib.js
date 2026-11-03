// 云函数公共工具：错误、鉴权、查询、时间
const crypto = require('crypto');
const cloud = require('wx-server-sdk');
const { PHONE, ADMIN_SID } = require('./config');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const _ = db.command;

class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const fail = (code, message) => { throw new ApiError(code, message); };
const assert = (cond, code, message) => { if (!cond) fail(code, message); };

const ts = d => (d ? new Date(d).getTime() : 0);
const paging = ({ page = 0, size = 20 } = {}) => {
  const s = Math.min(Math.max(+size || 20, 1), 50);
  const p = Math.max(+page || 0, 0);
  return { skip: p * s, limit: s, size: s, page: p };
};

const findOne = async (coll, where) => {
  const { data } = await db.collection(coll).where(where).limit(1).get();
  return data[0] || null;
};

const findAll = async (coll, where, { limit = 500, order } = {}) => {
  let q = db.collection(coll).where(where);
  if (order) q = q.orderBy(order[0], order[1]);
  const { data } = await q.limit(Math.min(limit, 1000)).get();
  return data;
};

// 当前用户（默认拒绝被封禁者）
// 迁移前的历史档案只有 _openid 字段，这里做兜底，保证过渡期可用
const me = async (openid, { allowBanned = false } = {}) => {
  const user = (await findOne('users', { openid })) || (await findOne('users', { _openid: openid }));
  assert(user, 'NOT_LOGGED_IN', '请先登录');
  if (user.status === 'deleted') fail('ACCOUNT_DELETED', '账号已注销');
  if (!allowBanned) {
    const ban = await findOne('bans', { sid: String(user.sid) });
    if (ban) fail('BANNED', '账号已被封禁，请联系客服 ' + PHONE);
  }
  return user.openid ? user : { ...user, openid };
};

// 管理员判定：admins 表命中，或用户学号等于服务端常量 ADMIN_SID（兜底，防止表为空时管理员失权）
const adminOf = async openid => {
  const a = await findOne('admins', { openid });
  if (a) return a;
  const u = (await findOne('users', { openid })) || (await findOne('users', { _openid: openid }));
  if (u && String(u.sid) === ADMIN_SID) return { openid, sid: ADMIN_SID, implicit: true };
  return null;
};

const requireAdmin = async openid => {
  const admin = await adminOf(openid);
  assert(admin, 'FORBIDDEN', '无管理员权限');
  return admin;
};

const isAdmin = async openid => !!(await adminOf(openid));

const resolveRole = async openid => ((await adminOf(openid)) ? 'admin' : 'user');

// 首次初始化：admins 为空时，允许管理员学号本人在其微信上完成引导
const ensureAdminOrBootstrap = async openid => {
  let count = 0;
  try { count = (await db.collection('admins').count()).total; } catch (e) { count = 0; }
  if (count > 0) {
    await requireAdmin(openid);
    return false;
  }
  const user = (await findOne('users', { _openid: openid })) || (await findOne('users', { openid }));
  assert(user && String(user.sid) === ADMIN_SID,
    'FORBIDDEN', '首次初始化只能用管理员学号执行，或在控制台手动写入 admins 记录');
  await db.collection('admins').add({ data: { openid, sid: String(user.sid), time: new Date() } });
  return true;
};

// 被管理员下架（violations）的商品 id；30 秒实例内缓存，避免每次列表都全表扫
let blockedCache = { ids: [], at: 0 };
const blockedIds = async () => {
  const now = Date.now();
  if (blockedCache.at && now - blockedCache.at < 30000) return blockedCache.ids;
  const rows = await findAll('violations', {}, { limit: 1000 });
  const ids = [...new Set(rows.map(r => r.goodId))];
  blockedCache = { ids, at: now };
  return ids;
};
const clearBlockedCache = () => { blockedCache = { ids: [], at: 0 }; };

const pairOpenids = (a, b) => (a < b ? [a, b] : [b, a]);

// 会话正本 id：由对手方 openid 对确定性推导。写死在服务端，保证"一对用户只有一条会话"，
// 并发下 add 同 _id 会被数据库拒绝，结构上造不出第二条
const pairKeyOf = (a, b) => {
  const [x, y] = a < b ? [a, b] : [b, a];
  return 'c_' + crypto.createHash('md5').update(x + '|' + y).digest('hex').slice(0, 24);
};

// 迁移前的历史档案只有 _openid 字段，按 openid 查人时统一兜底
const userByOpenid = async openid =>
  (await findOne('users', { openid })) || (await findOne('users', { _openid: openid }));

const memberChat = async (chatId, openid) => {
  const chat = await db.collection('chats').doc(chatId).get().then(r => r.data).catch(() => null);
  assert(chat, 'NOT_FOUND', '会话不存在');
  assert(chat.openidA === openid || chat.openidB === openid, 'FORBIDDEN', '无权访问该会话');
  return chat;
};

const publicUser = u => ({
  sid: String(u.sid),
  name: u.name,
  email: u.email || '',
  role: u.role || 'user',
  avatar: u.avatar || '',
  credit: u.credit || 100,
  school: u.school || '本校',
  dealCount: u.dealCount || 0,
  // 自己的 openid 返回给本人，用于实时监听的安全规则查询条件
  openid: u.openid || ''
});

module.exports = {
  cloud, db, _,
  ApiError, fail, assert, ts, paging,
  findOne, findAll, me, requireAdmin, isAdmin, adminOf, resolveRole, ensureAdminOrBootstrap,
  blockedIds, clearBlockedCache, pairOpenids, memberChat, publicUser,
  pairKeyOf, userByOpenid
};
