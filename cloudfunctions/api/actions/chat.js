// 会话与消息：一对一。会话正本由对手方 openid 对唯一确定 —— 一对用户只有一个窗口
const {
  db, assert, ts, findOne, findAll, me, pairOpenids, memberChat, pairKeyOf, userByOpenid
} = require('../lib');

const peerOf = (chat, openid) => (chat.openidA === openid ? chat.openidB : chat.openidA);

const getChat = id => (id
  ? db.collection('chats').doc(id).get().then(r => r.data).catch(() => null)
  : Promise.resolve(null));
const getGood = id => (id
  ? db.collection('goods').doc(id).get().then(r => r.data).catch(() => null)
  : Promise.resolve(null));

async function peerProfile(openid, fallbackName) {
  const u = await userByOpenid(openid);
  const ban = u ? await findOne('bans', { sid: String(u.sid) }) : null;
  return {
    openid,
    name: u ? u.name : (fallbackName || '对方用户'),
    avatar: u ? (u.avatar || '') : '',
    banned: !!ban
  };
}

const goodBrief = g => (g ? {
  id: g._id,
  title: g.title || '',
  price: g.price || 0,
  thumb: g.thumb || g.image || '',
  status: g.status || '',
  sellerOpenid: g.sellerOpenid || ''
} : null);

async function ensureChat(goodId, openid) {
  const good = await getGood(goodId);
  assert(good, 'NOT_FOUND', '商品不存在或已删除');
  assert(good.sellerOpenid, 'NOT_FOUND', '该商品缺少卖家信息，请联系管理员');
  assert(good.sellerOpenid !== openid, 'BAD_INPUT', '不能和自己聊天');
  const [a, b] = pairOpenids(openid, good.sellerOpenid);
  const chatId = pairKeyOf(a, b);

  let chat = await getChat(chatId);
  if (!chat) {
    const rec = {
      _id: chatId,
      openidA: a,
      openidB: b,
      goodId,
      currentGoodId: goodId,
      lastText: '',
      lastTime: new Date(),
      createTime: new Date()
    };
    try {
      await db.collection('chats').add({ data: rec });
    } catch (e) {
      // 并发下对方先建了同 _id 的会话，下面重新读
    }
    chat = await getChat(chatId);
    assert(chat, 'INTERNAL', '会话创建失败，请重试');
  } else if (chat.currentGoodId !== goodId) {
    // 谁点谁改：买家从商品页进入时把「当前咨询商品」切过去
    await db.collection('chats').doc(chatId).update({ data: { currentGoodId: goodId } });
    chat = { ...chat, currentGoodId: goodId };
  }
  return { chat, good };
}

async function open({ goodId }, { openid }) {
  await me(openid);
  const { chat, good } = await ensureChat(goodId, openid);
  const peer = await peerProfile(peerOf(chat, openid), good.sellerName);
  return { chatId: chat._id, peer, good: goodBrief(good) };
}

async function info({ chatId }, { openid }) {
  await me(openid);
  let chat = await memberChat(chatId, openid);
  // 迁移后的旧会话指针跳到正本，避免打开一个是空窗口
  if (chat.mergedInto) chat = await memberChat(chat.mergedInto, openid);
  const good = await getGood(chat.currentGoodId || chat.goodId);
  const peer = await peerProfile(peerOf(chat, openid), good && good.sellerName);
  return { chatId: chat._id, peer, good: goodBrief(good) };
}

async function list(payload, { openid }) {
  await me(openid);
  const [asA, asB] = await Promise.all([
    findAll('chats', { openidA: openid }, { limit: 100 }),
    findAll('chats', { openidB: openid }, { limit: 100 })
  ]);
  const chats = asA.concat(asB)
    // 点「聊一聊」就会建会话文档，但空会话不该占位：发过第一条消息才出现在消息页
    .filter(c => !c.mergedInto && String(c.lastText || '').trim() !== '')
    .sort((x, y) => ts(y.lastTime) - ts(x.lastTime));

  const goodIds = [...new Set(chats.map(c => c.currentGoodId || c.goodId).filter(Boolean))];
  const peerIds = [...new Set(chats.map(c => peerOf(c, openid)))];
  const [goods, users] = await Promise.all([
    Promise.all(goodIds.map(getGood)),
    Promise.all(peerIds.map(userByOpenid))
  ]);
  const goodMap = {};
  goods.filter(Boolean).forEach(g => { goodMap[g._id] = g; });
  const userMap = {};
  peerIds.forEach((p, i) => { if (users[i]) userMap[p] = users[i]; });

  return chats.map(c => {
    const peer = peerOf(c, openid);
    const u = userMap[peer];
    const g = goodMap[c.currentGoodId || c.goodId];
    return {
      id: c._id,
      goodId: c.currentGoodId || c.goodId || '',
      goodsTitle: g ? g.title : '商品已删除',
      with: u ? u.name : '对方用户',
      peerOpenid: peer,
      avatar: u ? (u.avatar || '') : '',
      last: c.lastText || '',
      time: ts(c.lastTime)
    };
  });
}

async function messages({ chatId }, { openid }) {
  await me(openid);
  await memberChat(chatId, openid);
  const rows = await findAll('messages', { chatId }, { order: ['createTime', 'asc'], limit: 300 });

  // 话题分隔条需要商品标题：消息本来就带了 goodId，一次批量取标题即可
  const ids = [...new Set(rows.map(m => m.goodId).filter(Boolean))];
  const goods = ids.length ? await Promise.all(ids.map(getGood)) : [];
  const titles = {};
  goods.filter(Boolean).forEach(g => { titles[g._id] = g.title || ''; });

  return {
    goods: titles,
    list: rows.map(m => ({
      _id: m._id,
      localId: m.localId || m._id,
      text: m.text,
      goodId: m.goodId || '',
      senderName: m.senderName,
      createTime: ts(m.createTime),
      mine: m.senderOpenid === openid
    }))
  };
}

async function send({ chatId, text, localId }, { openid }) {
  const user = await me(openid);
  const chat = await memberChat(chatId, openid);
  const body = String(text || '').trim();
  assert(body.length > 0 && body.length <= 500, 'BAD_INPUT', '消息内容不合法');

  const peer = await userByOpenid(peerOf(chat, openid));
  if (peer) {
    const ban = await findOne('bans', { sid: String(peer.sid) });
    assert(!ban, 'PEER_BANNED', '对方账号已被封禁，无法发送消息');
  }

  const rec = {
    chatId,
    localId: String(localId || ''),
    goodId: chat.currentGoodId || chat.goodId || '',
    openidA: chat.openidA,
    openidB: chat.openidB,
    senderOpenid: openid,
    senderSid: String(user.sid),
    senderName: user.name,
    text: body,
    createTime: new Date()
  };
  const res = await db.collection('messages').add({ data: rec });
  await db.collection('chats').doc(chatId).update({ data: { lastText: body, lastTime: rec.createTime } });
  return { id: res._id, createTime: ts(rec.createTime) };
}

async function markRead({ chatId }, { openid }) {
  await me(openid);
  const chat = await memberChat(chatId, openid);
  const existed = await findOne('reads', { chatId, openid });
  if (existed) {
    await db.collection('reads').doc(existed._id).update({ data: { readTime: new Date() } });
  } else {
    await db.collection('reads').add({
      data: { chatId, openid, openidA: chat.openidA, openidB: chat.openidB, readTime: new Date() }
    });
  }
  return { ok: true };
}

async function otherReadTime({ chatId }, { openid }) {
  await me(openid);
  await memberChat(chatId, openid);
  const rows = await findAll('reads', { chatId }, { limit: 20 });
  return rows
    .filter(r => r.openid !== openid)
    .reduce((max, r) => Math.max(max, ts(r.readTime)), 0);
}

module.exports = { open, info, list, messages, send, markRead, otherReadTime };
