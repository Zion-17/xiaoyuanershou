// 登录与用户自身信息
const {
  db, fail, assert, findOne, findAll, me, resolveRole, publicUser
} = require('../lib');

const EMAIL_RE = /^[^@]+@[^@]+\.[^@]+$/;
// 邮箱不限域名：QQ/163/校园邮箱均可；先归一全角符号与空白
const normalizeEmail = v => String(v || '')
  .replace(/＠/g, '@')
  .replace(/[．。]/g, '.')
  .replace(/\s/g, '');

async function login({ sid, email, name }, { openid }) {
  sid = String(sid || '').trim();
  email = normalizeEmail(email);
  name = String(name || '').trim();

  assert(/^\d{6,12}$/.test(sid), 'BAD_INPUT', '请输入正确学号');
  assert(EMAIL_RE.test(email), 'BAD_INPUT', '请输入正确的邮箱');
  assert(name.length > 0 && name.length <= 20, 'BAD_INPUT', '昵称需为 1-20 个字符');

  const ban = await findOne('bans', { sid });
  assert(!ban, 'BANNED', '账号已被封禁，请联系管理员');

  // 白名单可能被手工建成数字类型，这里兼容 string / number 两种写法
  const wl = (await findOne('whitelist', { sid })) ||
    (/^\d+$/.test(sid) ? await findOne('whitelist', { sid: Number(sid) }) : null);
  assert(wl, 'NOT_WHITELISTED', `学号「${sid}」不在本校白名单内`);
  if (wl.boundOpenid && wl.boundOpenid !== openid) {
    fail('SID_TAKEN', '该学号已绑定其他微信，请联系管理员解绑');
  }

  const exists = await findOne('users', { sid });
  assert(!exists || exists.status !== 'deleted', 'ACCOUNT_DELETED', '该账号已注销，请联系管理员');
  if (exists && exists.openid && exists.openid !== openid) {
    fail('SID_TAKEN', '该学号已被其他微信占用');
  }
  if (!wl.boundOpenid) {
    await db.collection('whitelist').doc(wl._id).update({
      data: { boundOpenid: openid, bindTime: new Date() }
    });
  }

  const role = await resolveRole(openid);
  const patch = { sid, email, name, role, openid, updateTime: new Date() };

  let user;
  if (exists) {
    await db.collection('users').doc(exists._id).update({ data: patch });
    user = { ...exists, ...patch };
  } else {
    const rec = {
      ...patch,
      avatar: '🧑‍🎓',
      credit: 100,
      verified: true,
      school: '本校',
      dealCount: 0,
      createTime: new Date()
    };
    const res = await db.collection('users').add({ data: rec });
    user = { _id: res._id, ...rec };
  }
  return publicUser(user);
}

// 刷新当前用户；被封禁时抛出 BANNED，由客户端统一处理
// 同时重算角色，避免历史记录里被降级的 role 一直生效
async function profile(payload, { openid }) {
  const user = await me(openid);
  const role = await resolveRole(openid);
  if (user.role !== role) {
    await db.collection('users').doc(user._id).update({ data: { role, updateTime: new Date() } });
  }
  return publicUser({ ...user, role });
}

// 已绑定 openid 的账号免密登录：昵称/邮箱只在首次注册时填一次
async function autoLogin(payload, { openid }) {
  const user = (await findOne('users', { openid })) || (await findOne('users', { _openid: openid }));
  if (!user) fail('NOT_REGISTERED', '请先完成首次认证');
  assert(user.status !== 'deleted', 'ACCOUNT_DELETED', '账号已注销');
  const ban = await findOne('bans', { sid: String(user.sid) });
  assert(!ban, 'BANNED', '账号已被封禁，请联系管理员');
  const role = await resolveRole(openid);
  if (!user.openid || user.role !== role) {
    await db.collection('users').doc(user._id).update({ data: { openid, role, updateTime: new Date() } });
  }
  return publicUser({ ...user, openid, role });
}

// 修改昵称 / 邮箱 / 头像（头像可以是 emoji 或云存储 fileID）
async function updateProfile({ name, email, avatar }, { openid }) {
  const user = await me(openid);
  const patch = { updateTime: new Date() };

  if (name != null) {
    const n = String(name).trim();
    assert(n.length > 0 && n.length <= 20, 'BAD_INPUT', '昵称需为 1-20 个字符');
    patch.name = n;
  }
  if (email != null) {
    const e = normalizeEmail(email);
    assert(EMAIL_RE.test(e), 'BAD_INPUT', '请输入正确的邮箱');
    patch.email = e;
  }
  // 头像是 base64 data URI（约 10KB 以内），上限放宽到 200KB
  if (avatar != null) patch.avatar = String(avatar).slice(0, 200 * 1024);

  await db.collection('users').doc(user._id).update({ data: patch });

  // 商品卡片上冗余存了卖家昵称/头像，这里同步，避免列表再回表查用户
  if (patch.name || patch.avatar) {
    const rows = await findAll('goods', { sellerOpenid: openid }, { limit: 200 });
    for (const g of rows) {
      const d = {};
      if (patch.name) d.sellerName = patch.name;
      if (patch.avatar) d.sellerAvatar = patch.avatar;
      await db.collection('goods').doc(g._id).update({ data: d });
    }
  }
  return publicUser({ ...user, ...patch });
}

// 注销账号：软删除，保留数据；下架在售商品、解绑白名单
async function deactivate(payload, { openid }) {
  const user = await me(openid);
  await db.collection('users').doc(user._id).update({
    data: { status: 'deleted', updateTime: new Date() }
  });

  const rows = await findAll('goods', { sellerOpenid: openid, status: 'on' }, { limit: 200 });
  for (const g of rows) {
    await db.collection('goods').doc(g._id).update({ data: { status: 'off' } });
  }

  const wl = await findOne('whitelist', { sid: String(user.sid) });
  if (wl && wl.boundOpenid === openid) {
    await db.collection('whitelist').doc(wl._id).update({ data: { boundOpenid: '' } });
  }
  return { sid: String(user.sid) };
}

module.exports = { login, profile, autoLogin, updateProfile, deactivate };
