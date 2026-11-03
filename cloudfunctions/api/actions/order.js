// 订单：创建、列表、状态流转、评价
const {
  db, assert, ts, findOne, findAll, me
} = require('../lib');

async function create({ goodId, method }, { openid }) {
  const user = await me(openid);
  const good = await db.collection('goods').doc(goodId).get().then(r => r.data).catch(() => null);
  assert(good, 'NOT_FOUND', '商品不存在');
  assert(good.status === 'on', 'BAD_INPUT', '该商品已下架或已售出');
  assert(good.sellerOpenid !== openid, 'BAD_INPUT', '不能购买自己的商品');

  const rec = {
    goodId,
    title: good.title,
    image: good.thumb || good.image || good.imageBase64 || '',
    imageBase64: '',
    emoji: good.emoji || '📦',
    price: good.price,
    method: method === '线上支付' ? '线上支付' : '当面交易',
    buyerOpenid: openid,
    buyerSid: String(user.sid),
    buyer: user.name,
    sellerOpenid: good.sellerOpenid || '',
    sellerSid: good.sellerSid || '',
    seller: good.sellerName || '',
    status: '待确认',
    createTime: new Date()
  };
  const res = await db.collection('orders').add({ data: rec });
  // 一件二手商品只有一个买家：下单即锁定为已售出，首页不再展示、他人无法再下单
  await db.collection('goods').doc(goodId).update({ data: { status: 'sold', soldTo: openid, soldTime: new Date() } });
  return { id: res._id };
}

async function list(payload, { openid }) {
  await me(openid);
  const [asBuyer, asSeller] = await Promise.all([
    findAll('orders', { buyerOpenid: openid }, { limit: 200 }),
    findAll('orders', { sellerOpenid: openid }, { limit: 200 })
  ]);
  const seen = new Set();
  return asBuyer.concat(asSeller)
    .filter(o => (seen.has(o._id) ? false : (seen.add(o._id), true)))
    .sort((a, b) => ts(b.createTime) - ts(a.createTime))
    .map(o => ({
      _id: o._id,
      goodId: o.goodId,
      title: o.title,
      price: o.price,
      emoji: o.emoji || '📦',
      image: o.image || '',
      imageBase64: o.imageBase64 || '',
      method: o.method,
      seller: o.seller,
      buyer: o.buyer,
      status: o.status,
      evaluated: !!o.evaluated,
      time: ts(o.createTime),
      mine: o.buyerOpenid === openid
    }));
}

async function ownerOrder(id, openid) {
  const o = await db.collection('orders').doc(id).get().then(r => r.data).catch(() => null);
  assert(o, 'NOT_FOUND', '订单不存在');
  assert(o.buyerOpenid === openid || o.sellerOpenid === openid, 'FORBIDDEN', '无权操作该订单');
  return o;
}

async function update({ id, status }, { openid }) {
  await me(openid);
  const o = await ownerOrder(id, openid);
  assert(['待确认', '已完成', '已取消'].includes(status), 'BAD_INPUT', '状态不合法');
  assert(o.status === '待确认', 'BAD_INPUT', '仅待确认订单可变更状态');

  if (status === '已取消') {
    assert(o.buyerOpenid === openid, 'FORBIDDEN', '仅买家可取消订单');
    // 取消后商品回到在售状态，其他人可以继续购买
    const g = await db.collection('goods').doc(o.goodId).get().then(r => r.data).catch(() => null);
    if (g && g.status === 'sold' && g.soldTo === o.buyerOpenid) {
      await db.collection('goods').doc(o.goodId).update({ data: { status: 'on', soldTo: '', soldTime: null } });
    }
  }

  if (status === '已完成') {
    const seller = await findOne('users', { openid: o.sellerOpenid });
    if (seller) {
      await db.collection('users').doc(seller._id).update({
        data: { dealCount: (seller.dealCount || 0) + 1 }
      });
    }
  }

  await db.collection('orders').doc(id).update({ data: { status, updateTime: new Date() } });
  return { id, status };
}

async function evaluate({ id, score, content }, { openid }) {
  await me(openid);
  const o = await ownerOrder(id, openid);
  assert(o.status === '已完成', 'BAD_INPUT', '订单完成后才能评价');
  assert(!o.evaluated, 'BAD_INPUT', '该订单已评价');
  const s = Math.min(Math.max(+score || 5, 1), 5);
  await db.collection('orders').doc(id).update({
    data: {
      evaluated: true,
      evaluate: { score: s, content: String(content || '').slice(0, 200) || '好评', by: openid, time: new Date() }
    }
  });
  return { id };
}

async function get({ id }, { openid }) {
  await me(openid);
  const o = await ownerOrder(id, openid);
  return {
    _id: o._id, goodId: o.goodId, title: o.title, price: o.price, emoji: o.emoji || '📦',
    seller: o.seller, buyer: o.buyer, status: o.status, evaluated: !!o.evaluated, time: ts(o.createTime)
  };
}

async function count(payload, { openid }) {
  const rows = await list(payload, { openid });
  return { total: rows.length };
}

module.exports = { create, list, get, update, evaluate, count };
