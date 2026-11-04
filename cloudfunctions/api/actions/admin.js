// 管理端：看板、成员、商品、消息、封禁、下架、初始化与数据迁移
const {
  db, _, assert, ts, findOne, findAll, requireAdmin, ensureAdminOrBootstrap, blockedIds, pairKeyOf
} = require('../lib');
const { ADMIN_SID, DEFAULT_WHITELIST } = require('../config');

async function stats(payload, ctx) {
  await requireAdmin(ctx.openid);
  const [u, g, o, m] = await Promise.all([
    db.collection('users').count(),
    db.collection('goods').count(),
    db.collection('orders').count(),
    db.collection('messages').count()
  ]);
  return { users: u.total, goods: g.total, orders: o.total, messages: m.total };
}

// 同学号多条档案的保留规则：优先保留已绑定 openid 的，其次比 updateTime 新旧
const keepBetter = (candidate, current) => {
  if (!current) return true;
  const a = candidate.openid ? 1 : 0;
  const b = current.openid ? 1 : 0;
  if (a !== b) return a > b;
  return ts(candidate.updateTime) > ts(current.updateTime);
};

const dedupeBySid = rows => {
  const bySid = new Map();
  for (const x of rows) {
    const sid = String(x.sid);
    if (keepBetter(x, bySid.get(sid))) bySid.set(sid, x);
  }
  return bySid;
};

// 同学号多条档案合并为一条，返回展示列表
async function users(payload, ctx) {
  await requireAdmin(ctx.openid);
  const rows = await findAll('users', {}, { limit: 1000 });
  const bans = new Set((await findAll('bans', {}, { limit: 1000 })).map(b => String(b.sid)));
  const adminSids = new Set((await findAll('admins', {}, { limit: 100 })).map(a => String(a.sid)));
  adminSids.add(ADMIN_SID);

  const bySid = dedupeBySid(rows);

  return [...bySid.values()]
    .map(x => ({
      sid: String(x.sid),
      name: x.name,
      role: adminSids.has(String(x.sid)) ? 'admin' : 'user',
      credit: x.credit || 100,
      dealCount: x.dealCount || 0,
      banned: bans.has(String(x.sid)),
      duplicates: rows.filter(r => String(r.sid) === String(x.sid)).length
    }))
    .sort((a, b) => (a.role === 'admin' ? -1 : b.role === 'admin' ? 1 : a.sid.localeCompare(b.sid)));
}

async function goodsList(payload, ctx) {
  await requireAdmin(ctx.openid);
  const blocked = new Set(await blockedIds());
  const rows = await findAll('goods', {}, { order: ['createTime', 'desc'], limit: 500 });
  return rows.map(g => ({
    id: g._id,
    title: g.title,
    price: g.price,
    sellerName: g.sellerName,
    status: g.status,
    blocked: blocked.has(g._id),
    time: ts(g.createTime)
  }));
}

async function messages(payload, ctx) {
  await requireAdmin(ctx.openid);
  const rows = await findAll('messages', {}, { order: ['createTime', 'desc'], limit: 500 });
  return rows.map(m => ({
    _id: m._id,
    senderName: m.senderName || '未知用户',
    text: m.text,
    chatId: m.chatId,
    time: ts(m.createTime)
  }));
}

async function ban({ sid, name }, ctx) {
  await requireAdmin(ctx.openid);
  sid = String(sid);
  assert(sid !== ADMIN_SID, 'BAD_INPUT', '不能封禁管理员');

  if (!(await findOne('bans', { sid }))) {
    await db.collection('bans').add({ data: { sid, name, time: new Date() } });
  }
  const [bySellerSid, byLegacySid] = await Promise.all([
    findAll('goods', { sellerSid: sid, status: 'on' }, { limit: 500 }),
    findAll('goods', { sid, status: 'on' }, { limit: 500 })
  ]);
  const seen = new Set();
  const onSale = bySellerSid.concat(byLegacySid)
    .filter(g => (seen.has(g._id) ? false : (seen.add(g._id), true)));
  for (const g of onSale) {
    if (!(await findOne('violations', { goodId: g._id, banSid: sid }))) {
      await db.collection('violations').add({
        data: { goodId: g._id, title: g.title, banSid: sid, time: new Date() }
      });
    }
  }
  return { sid, hiddenGoods: onSale.length };
}

async function unban({ sid }, ctx) {
  await requireAdmin(ctx.openid);
  sid = String(sid);
  const bans = await findAll('bans', { sid }, { limit: 20 });
  for (const b of bans) await db.collection('bans').doc(b._id).remove();
  const vs = await findAll('violations', { banSid: sid }, { limit: 500 });
  for (const v of vs) await db.collection('violations').doc(v._id).remove();
  return { sid, restoredGoods: vs.length };
}

async function hideGood({ id, title }, ctx) {
  await requireAdmin(ctx.openid);
  if (!(await findOne('violations', { goodId: id, banSid: _.exists(false) }))) {
    await db.collection('violations').add({ data: { goodId: id, title, time: new Date() } });
  }
  return { id };
}

async function restoreGood({ id }, ctx) {
  await requireAdmin(ctx.openid);
  const vs = await findAll('violations', { goodId: id }, { limit: 20 });
  for (const v of vs) await db.collection('violations').doc(v._id).remove();
  return { id };
}

// 白名单补种（幂等）：预置 4 个学号 + users 表里出现过的学号，并把数字型 sid 归一为字符串
async function seedWhitelist(sidToOpenid) {
  const sids = [...new Set([...DEFAULT_WHITELIST, ...Object.keys(sidToOpenid)])];
  let created = 0;
  for (const sid of sids) {
    const wl = (await findOne('whitelist', { sid })) ||
      (/^\d+$/.test(sid) ? await findOne('whitelist', { sid: Number(sid) }) : null);
    if (!wl) {
      await db.collection('whitelist').add({
        data: { sid, boundOpenid: sidToOpenid[sid] || '', bindTime: sidToOpenid[sid] ? new Date() : null }
      });
      created++;
    } else if (typeof wl.sid !== 'string') {
      await db.collection('whitelist').doc(wl._id).update({ data: { sid } });
    }
  }
  return { total: sids.length, created };
}

// 一次性：建白名单与管理员。可重复执行；admins 为空时允许管理员学号自举
async function seed(payload, ctx) {
  await ensureAdminOrBootstrap(ctx.openid);

  const users = await findAll('users', {}, { limit: 1000 });
  const sidToOpenid = {};
  users.forEach(u => { if (u.openid) sidToOpenid[String(u.sid)] = u.openid; });

  const report = await seedWhitelist(sidToOpenid);

  const adminOpenid = sidToOpenid[ADMIN_SID] || ctx.openid;
  if (!(await findOne('admins', { openid: adminOpenid }))) {
    await db.collection('admins').add({ data: { openid: adminOpenid, sid: ADMIN_SID, time: new Date() } });
  }
  return { whitelist: report.total, created: report.created, adminOpenid };
}

// ---------------- 会话合并迁移 V2 ----------------
// 目标：①修复历史脏数据（学号被写进 openid 字段）②同一对用户的多条会话合并成一条
// 约束：不删除任何消息、不物理删除任何 chats 文档、可重复执行；默认 dryRun，需显式 execute=true 才写库
const SID_RE = /^\d{6,12}$/;

async function migrateV2(payload, ctx) {
  await requireAdmin(ctx.openid);
  const dryRun = !(payload && payload.execute === true);

  // 学号 → openid 映射，只信有 openid 的档案
  const userRows = await findAll('users', {}, { limit: 1000 });
  const sidToOpenid = {};
  userRows.forEach(u => {
    const sid = String(u.sid || '');
    if (sid && u.openid) sidToOpenid[sid] = u.openid;
  });
  const toOpenid = v => {
    const s = String(v || '');
    if (!s) return '';
    return SID_RE.test(s) ? (sidToOpenid[s] || '') : s;
  };

  const report = {
    dryRun,
    mappedSids: Object.keys(sidToOpenid).length,
    goodsFixed: [],
    chatFieldsFixed: [],
    pairs: [],
    messagesMoved: 0,
    readsMoved: 0,
    skipped: []
  };

  // 1) goods.sellerOpenid 里的学号 → openid
  const goodsRows = await findAll('goods', {}, { limit: 1000 });
  for (const g of goodsRows) {
    const raw = String(g.sellerOpenid || '');
    if (!SID_RE.test(raw)) continue;
    const fixed = sidToOpenid[raw] || '';
    if (!fixed) {
      report.skipped.push('商品「' + (g.title || g._id) + '」sellerOpenid=' + raw + ' 找不到对应用户');
      continue;
    }
    report.goodsFixed.push({ id: g._id, title: g.title || '', from: raw, to: fixed });
    if (!dryRun) {
      await db.collection('goods').doc(g._id).update({
        data: { sellerOpenid: fixed, sellerSid: String(g.sellerSid || g.sid || raw) }
      });
    }
  }

  // 2) chats 里的学号 → openid，并按 openid 对归并
  const chatRows = await findAll('chats', {}, { limit: 1000 });
  const groups = new Map();
  for (const c of chatRows) {
    if (c.mergedInto) continue;
    const a0 = toOpenid(c.openidA);
    const b0 = toOpenid(c.openidB);
    if (!a0 || !b0) {
      report.skipped.push('会话 ' + c._id + ' 的 openid 无法解析：' + c.openidA + ' / ' + c.openidB);
      continue;
    }
    if (a0 === b0) {
      report.skipped.push('会话 ' + c._id + ' 双方 openid 相同');
      continue;
    }
    const [a, b] = a0 < b0 ? [a0, b0] : [b0, a0];
    const key = pairKeyOf(a, b);
    if (!groups.has(key)) groups.set(key, { key, a, b, chats: [] });
    groups.get(key).chats.push({ ...c, _a: a, _b: b });
    if (c.openidA !== a || c.openidB !== b) {
      report.chatFieldsFixed.push({ id: c._id, from: [c.openidA, c.openidB], to: [a, b] });
    }
  }

  for (const grp of groups.values()) {
    const oldIds = grp.chats.map(c => c.id || c._id);
    let msgs = [];
    for (const id of oldIds) {
      msgs = msgs.concat(await findAll('messages', { chatId: id }, { limit: 1000 }));
    }
    msgs.sort((x, y) => ts(x.createTime) - ts(y.createTime));
    const last = msgs[msgs.length - 1] || null;
    const first = msgs[0] || null;
    const fallbackGood = grp.chats.map(c => c.goodId || '').filter(Boolean)[0] || '';
    const currentGoodId = (last && last.goodId) || fallbackGood;

    report.pairs.push({
      key: grp.key,
      openidA: grp.a,
      openidB: grp.b,
      from: oldIds,
      messages: msgs.length,
      currentGoodId,
      lastText: last ? String(last.text || '') : ''
    });
    if (dryRun) continue;

    const data = {
      openidA: grp.a,
      openidB: grp.b,
      goodId: fallbackGood || currentGoodId,
      currentGoodId,
      lastText: last ? String(last.text || '') : '',
      lastTime: (last && last.createTime) || new Date(),
      createTime: (first && first.createTime) || new Date()
    };
    const canon = await db.collection('chats').doc(grp.key).get().then(r => r.data).catch(() => null);
    if (canon) {
      await db.collection('chats').doc(grp.key).update({ data });
    } else {
      await db.collection('chats').add({ data: { _id: grp.key, ...data } });
    }

    for (const id of oldIds) {
      if (id === grp.key) continue;
      const r1 = await db.collection('messages').where({ chatId: id }).update({
        data: { chatId: grp.key, openidA: grp.a, openidB: grp.b }
      });
      report.messagesMoved += (r1 && r1.stats && r1.stats.updated) || 0;

      const r2 = await db.collection('reads').where({ chatId: id }).update({
        data: { chatId: grp.key, openidA: grp.a, openidB: grp.b }
      });
      report.readsMoved += (r2 && r2.stats && r2.stats.updated) || 0;

      // 旧会话文档只打合并标记，不物理删除
      await db.collection('chats').doc(id).update({ data: { mergedInto: grp.key, mergedAt: new Date() } });
    }
  }

  return report;
}

// 重算成交数：按 orders 里「已完成」的订单重新统计，买卖双方各计一次。
// 用绝对赋值而不是累加，所以重复执行结果一致；默认 dryRun。
async function recountDeals(payload, ctx) {
  await requireAdmin(ctx.openid);
  const dryRun = !(payload && payload.execute === true);

  const orders = await findAll('orders', { status: '已完成' }, { limit: 1000 });
  const count = {};
  orders.forEach(o => {
    [o.sellerOpenid, o.buyerOpenid].forEach(id => {
      if (id) count[id] = (count[id] || 0) + 1;
    });
  });

  const users = await findAll('users', {}, { limit: 1000 });
  const changes = [];
  for (const u of users) {
    const key = u.openid || u._openid || '';
    const want = count[key] || 0;
    if (Number(u.dealCount || 0) !== want) {
      changes.push({ sid: String(u.sid || ''), name: u.name || '', from: Number(u.dealCount || 0), to: want });
      if (!dryRun) await db.collection('users').doc(u._id).update({ data: { dealCount: want } });
    }
  }
  return { dryRun, orders: orders.length, users: users.length, changes };
}

module.exports = {
  stats, users, goods: goodsList, messages,
  ban, unban, hideGood, restoreGood, seed, migrateV2, recountDeals
};
