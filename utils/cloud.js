// utils/cloud.js
// 统一数据访问层（微信云开发模式）
const db = () => wx.cloud.database();

// 管理员学号（同学C）
const ADMIN_SID = '000000000';

// 生成一对用户在某商品下的唯一会话 id（与先后顺序无关）
function pairChatId(goodId, sidA, sidB) {
  return 'chat_' + goodId + '_' + [String(sidA), String(sidB)].sort().join('_');
}
// 判断会话 id 是否为当前用户参与的新格式私聊
function isMyChat(chatId, mySid) {
  const parts = String(chatId || '').split('_');
  return parts.length === 4 && parts[0] === 'chat' && (parts[2] === mySid || parts[3] === mySid);
}

module.exports = {
  ADMIN_SID,
  isAdmin(u) { return !!u && String(u.sid) === ADMIN_SID; },
  pairChatId,

  // ---------- 用户 ----------
  async login({ sid, email, name }) {
    sid = String(sid);
    // 封禁名单校验
    if (await this.isBanned(sid)) throw { errMsg: '账号已被封禁，请联系管理员' };
    // 学号查重：已注册则复用原档案，避免同一学号重复建档
    const { data } = await db().collection('users').where({ sid }).limit(1).get();
    const role = sid === ADMIN_SID ? 'admin' : 'user';
    let user;
    if (data.length) {
      user = { ...data[0], email, name, role };
      try {
        await db().collection('users').doc(data[0]._id).update({ data: { email, name, role, updateTime: new Date() } });
      } catch {}
    } else {
      const rec = { sid, email, name, role, avatar: '🧑‍🎓', credit: 100, verified: true, school: '本校', dealCount: 0, updateTime: new Date() };
      const res = await db().collection('users').add({ data: rec });
      user = { _id: res._id, ...rec };
    }
    wx.setStorageSync('user', user);
    return user;
  },
  getUser() { return wx.getStorageSync('user') || null; },
  async logout() { wx.removeStorageSync('user'); },

  // ---------- 封禁 / 违规（辅助集合，仅创建者可写、所有人可读） ----------
  async getBanList() {
    try { const { data } = await db().collection('bans').limit(100).get(); return data; } catch { return []; }
  },
  async isBanned(sid) {
    try {
      const { data } = await db().collection('bans').where({ sid: String(sid) }).limit(1).get();
      return data.length > 0;
    } catch { return false; } // bans 集合未创建时不阻塞登录
  },
  // 封禁：写名单 + 联动屏蔽该学号全部在售商品（violations 带 banSid 标记，解封时精准恢复）
  async banUser(sid, name) {
    sid = String(sid);
    await db().collection('bans').add({ data: { sid, name, time: new Date() } });
    try {
      const { data } = await db().collection('goods').where({ sid, status: 'on' }).limit(100).get();
      for (const g of data) {
        await db().collection('violations').add({ data: { goodId: g._id, title: g.title, banSid: sid, time: new Date() } });
      }
    } catch (e) { console.error('封禁联动下架失败', e); }
  },
  // 解封：删名单 + 删该学号的联动屏蔽记录，商品自动恢复上架
  async unbanUser(sid) {
    sid = String(sid);
    const { data } = await db().collection('bans').where({ sid }).get();
    for (const d of data) { try { await db().collection('bans').doc(d._id).remove(); } catch {} }
    try {
      const { data: vs } = await db().collection('violations').where({ banSid: sid }).get();
      for (const v of vs) { try { await db().collection('violations').doc(v._id).remove(); } catch {} }
    } catch (e) { console.error('解封恢复商品失败', e); }
  },
  // 按昵称查是否被封（私聊拦截：对方可能是卖家或买家，消息里只有姓名）
  async isBannedByName(name) {
    if (!name || name === '卖家') return false;
    try {
      const { data } = await db().collection('users').where({ name }).limit(1).get();
      if (!data[0]?.sid) return false;
      return await this.isBanned(data[0].sid);
    } catch { return false; }
  },
  async getViolationIds() {
    try {
      const { data } = await db().collection('violations').limit(100).get();
      return new Set(data.map(v => v.goodId));
    } catch { return new Set(); }
  },
  hideGood(goodId, title) { return db().collection('violations').add({ data: { goodId, title, time: new Date() } }); },
  async restoreGood(goodId) {
    const { data } = await db().collection('violations').where({ goodId }).get();
    for (const d of data) { try { await db().collection('violations').doc(d._id).remove(); } catch {} }
  },

  // ---------- 商品 ----------
  async getGoods({ category = '', keyword = '' } = {}) {
    let q = db().collection('goods').where({ status: 'on' });
    if (category) q = q.where({ category });
    const { data } = await q.orderBy('createTime', 'desc').limit(100).get();
    const blocked = await this.getViolationIds();
    let list = data.filter(g => !blocked.has(g._id));
    if (keyword) {
      const k = keyword.toLowerCase();
      list = list.filter(g => (g.title || '').toLowerCase().includes(k) || (g.desc || '').toLowerCase().includes(k));
    }
    return list.map(g => ({ ...g, id: g._id, time: fmtDT(g.createTime) }));
  },
  // 我发布的商品（含已下架，供管理页上下架切换）
  async getMyGoods() {
    const u = this.getUser();
    if (!u) return [];
    const { data } = await db().collection('goods').orderBy('createTime', 'desc').limit(100).get();
    const blocked = await this.getViolationIds();
    return data
      .filter(g => !blocked.has(g._id))
      .filter(g => g.sid === String(u.sid) || g.sellerName === u.name)
      .map(g => ({ ...g, id: g._id, time: fmtDT(g.createTime) }));
  },
  async getGoodById(id) {
    if (!id) return null;
    try {
      const { data } = await db().collection('goods').doc(id).get();
      return data ? { ...data, id: data._id, time: fmtDT(data.createTime) } : null;
    } catch { return null; }
  },
  async addGood(data) {
    const res = await db().collection('goods').add({
      data: { ...data, status: 'on', createTime: new Date() }
    });
    return { _id: res._id, ...data };
  },
  updateGood(id, patch) { return db().collection('goods').doc(id).update({ data: patch }); },
  deleteGood(id) { return db().collection('goods').doc(id).remove(); },

  // ---------- 收藏 ----------
  // 收藏记录绑定学号 sid，避免误读/误删他人收藏
  async getFavoriteIds() {
    const u = this.getUser();
    if (!u) return [];
    const { data } = await db().collection('favorites').where({ sid: String(u.sid) }).get();
    return data.map(f => f.goodId);
  },
  async toggleFavorite(goodId) {
    const u = this.getUser();
    const { data } = await db().collection('favorites').where({ goodId, sid: String(u.sid) }).get();
    if (data.length) {
      await db().collection('favorites').doc(data[0]._id).remove();
      return true;
    }
    await db().collection('favorites').add({ data: { goodId, sid: String(u.sid), createTime: new Date() } });
    return false;
  },

  // ---------- 订单 ----------
  addOrder(data) {
    return db().collection('orders').add({ data: { ...data, status: '待确认', createTime: new Date() } });
  },
  async getMyOrders() {
    const u = this.getUser();
    if (!u?.name) return [];
    const { data } = await db().collection('orders')
      .where(db().command.or([{ buyer: u.name }, { seller: u.name }]))
      .orderBy('createTime', 'desc').limit(100).get();
    return data;
  },
  updateOrder(orderId, patch) { return db().collection('orders').doc(orderId).update({ data: patch }); },

  // ---------- 会话与消息 ----------
  // 只返回当前用户参与的一对一会话
  async getChats() {
    const u = this.getUser();
    if (!u) return [];
    const me = u.name || '';
    const mySid = String(u.sid || '');
    const { data: msgs } = await db().collection('messages').orderBy('createTime', 'desc').limit(200).get();
    const seen = new Set();
    const chats = [];

    for (const m of msgs) {
      if (!isMyChat(m.chatId, mySid)) continue; // 别人的私聊与旧格式群混消息一律不可见
      if (seen.has(m.chatId)) continue;
      seen.add(m.chatId);
      const goodId = String(m.chatId).split('_')[1];

      // 对方名字：会话里第一个不是我发的消息的 senderName
      const otherMsg = msgs.find(x => x.chatId === m.chatId && x.senderName && x.senderName !== me);
      let withName = otherMsg?.senderName || '卖家';
      let goodsTitle = '商品咨询';

      try {
        const { data: g } = await db().collection('goods').doc(goodId).get();
        if (g) {
          goodsTitle = g.title || goodsTitle;
          if (withName === '卖家') withName = g.sellerName || g.seller?.name || withName;
        }
      } catch {}

      let avatar = '', emoji = '🧑‍🎓';
      if (withName !== '卖家') {
        try {
          const { data: uu } = await db().collection('users').where({ name: withName }).limit(1).get();
          if (uu[0]?.avatar) {
            const a = uu[0].avatar;
            if (a.startsWith('data:') || a.startsWith('http')) avatar = a;
            else emoji = a;
          }
        } catch {}
      }

      chats.push({
        _id: m.chatId, id: m.chatId, goodId,
        last: m.text || '', time: fmtList(m.createTime),
        goodsTitle, with: withName, avatar, emoji,
        grad: ['#E8F5E9', '#B2DFDB']
      });
    }
    return chats;
  },

  async sendMessage(chatId, text, localId) {
    const me = this.getUser()?.name || '';
    const lid = localId || 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    await db().collection('messages').add({
      data: { chatId, text, localId: lid, senderName: me, createTime: new Date() }
    });
    return lid;
  },

  async getMessages(chatId) {
    const me = this.getUser()?.name || '';
    const { data } = await db().collection('messages').where({ chatId }).orderBy('createTime', 'asc').limit(200).get();
    return data.map(m => ({ ...m, mine: m.senderName === me }));
  },

  watchMessages(chatId, cb) {
    const me = this.getUser()?.name || '';
    return db().collection('messages').where({ chatId }).orderBy('createTime', 'asc').watch({
      onChange: ({ docs }) => cb(docs.map(m => ({ ...m, mine: m.senderName === me }))),
      onError: err => console.error('watch error', err)
    });
  },

  // ---------- 已读回执（reads 辅助集合） ----------
  // 我在看这个会话：写入/刷新我的已读时间（仅创建者可写，各自写各自的）
  async markChatRead(chatId) {
    const u = this.getUser();
    if (!u) return;
    const sid = String(u.sid);
    try {
      const { data } = await db().collection('reads').where({ chatId, sid }).limit(1).get();
      if (data.length) await db().collection('reads').doc(data[0]._id).update({ data: { readTime: new Date() } });
      else await db().collection('reads').add({ data: { chatId, sid, readTime: new Date() } });
    } catch (e) { console.error('markRead', e); }
  },
  // 对方最近一次读这个会话的时间（所有人可读）
  async getOtherReadTime(chatId) {
    const sid = String(this.getUser()?.sid || '');
    try {
      const { data } = await db().collection('reads').where({ chatId }).get();
      let t = null;
      for (const d of data) {
        if (String(d.sid) === sid) continue;
        const rt = new Date(d.readTime);
        if (!isNaN(rt.getTime()) && (!t || rt > t)) t = rt;
      }
      return t;
    } catch { return null; }
  },
  watchReads(chatId, cb) {
    return db().collection('reads').where({ chatId }).watch({
      onChange: ({ docs }) => cb(docs),
      onError: err => console.error('watch reads', err)
    });
  },

  // ---------- 管理员 ----------
  async adminGetStats() {
    const c = db();
    const [u, g, o, m] = await Promise.all([
      c.collection('users').count(), c.collection('goods').count(),
      c.collection('orders').count(), c.collection('messages').count()
    ]);
    return { users: u.total, goods: g.total, orders: o.total, messages: m.total };
  },
  async adminGetUsers() {
    const { data } = await db().collection('users').limit(100).get();
    const bans = await this.getBanList();
    const banSet = new Set(bans.map(b => b.sid));
    // 显示层按学号去重：同学号多条（历史重复建档）只显示最新档案
    const bySid = new Map();
    for (const x of data) {
      const sid = String(x.sid);
      const prev = bySid.get(sid);
      if (!prev || new Date(x.updateTime || 0) > new Date(prev.updateTime || 0)) bySid.set(sid, x);
    }
    return Array.from(bySid.values()).map(x => ({ ...x, banned: banSet.has(String(x.sid)) }));
  },
  async adminGetGoods() {
    const { data } = await db().collection('goods').orderBy('createTime', 'desc').limit(100).get();
    const blocked = await this.getViolationIds();
    return data.map(g => ({ ...g, id: g._id, blocked: blocked.has(g._id), time: fmtDT(g.createTime) }));
  },
  async adminGetAllMessages() {
    const { data } = await db().collection('messages').orderBy('createTime', 'desc').limit(500).get();
    return data.map(m => ({ ...m, time: fmtDT(m.createTime) }));
  },

  // ---------- 时间格式化（微信风格） ----------
  fmtChat,
  fmtList
};

// ---------- 工具函数 ----------
function hm(t) {
  return `${String(t.getHours()).padStart(2, '0')}:${String(t.getMinutes()).padStart(2, '0')}`;
}
function dayStart(x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); }
function toDate(d) {
  const t = d instanceof Date ? d : new Date(d);
  return isNaN(t.getTime()) ? null : t;
}
// 聊天时间分隔条：今天 HH:mm / 昨天 HH:mm / 今年 M月D日 HH:mm / 跨年 YYYY年M月D日 HH:mm
function fmtChat(d) {
  const t = toDate(d);
  if (!t) return '';
  const now = new Date();
  const diff = Math.round((dayStart(now) - dayStart(t)) / 86400000);
  if (diff === 0) return hm(t);
  if (diff === 1) return '昨天 ' + hm(t);
  if (t.getFullYear() === now.getFullYear()) return `${t.getMonth() + 1}月${t.getDate()}日 ${hm(t)}`;
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日 ${hm(t)}`;
}
// 会话列表时间：今天 HH:mm / 今年 M月D日 / 跨年 YYYY年M月D日
function fmtList(d) {
  const t = toDate(d);
  if (!t) return '';
  const now = new Date();
  if (dayStart(now) === dayStart(t)) return hm(t);
  if (t.getFullYear() === now.getFullYear()) return `${t.getMonth() + 1}月${t.getDate()}日`;
  return `${t.getFullYear()}年${t.getMonth() + 1}月${t.getDate()}日`;
}
// 商品日期：M-D HH:mm
function fmtDT(d) {
  const t = toDate(d);
  if (!t) return '';
  return `${t.getMonth() + 1}-${t.getDate()} ${hm(t)}`;
}
