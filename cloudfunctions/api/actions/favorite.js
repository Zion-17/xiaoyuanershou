// 收藏：以 openid 为准
const { db, _, findOne, findAll, me, blockedIds } = require('../lib');

async function toggle({ goodId }, { openid }) {
  await me(openid);
  const existed = await findOne('favorites', { openid, goodId });
  if (existed) {
    await db.collection('favorites').doc(existed._id).remove();
    return { faved: false };
  }
  await db.collection('favorites').add({ data: { openid, goodId, createTime: new Date() } });
  return { faved: true };
}

async function list(payload, { openid }) {
  await me(openid);
  const favs = await findAll('favorites', { openid }, { limit: 200 });
  if (!favs.length) return [];
  const ids = favs.map(f => f.goodId);
  const blocked = new Set(await blockedIds());
  const { data } = await db.collection('goods')
    .where({ _id: _.in(ids), status: 'on' })
    .limit(Math.min(ids.length, 100))
    .get();
  return data
    .filter(g => !blocked.has(g._id))
    .map(g => ({
      id: g._id,
      title: g.title,
      price: g.price,
      condition: g.condition,
      category: g.category,
      emoji: g.emoji || '',
      image: g.thumb || g.image || g.imageBase64 || ''
    }));
}

async function ids(payload, { openid }) {
  await me(openid);
  const favs = await findAll('favorites', { openid }, { limit: 500 });
  return favs.map(f => f.goodId);
}

module.exports = { toggle, list, ids };
