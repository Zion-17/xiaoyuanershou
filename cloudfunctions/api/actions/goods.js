// 商品：浏览、详情、我的发布、发布、上下架、删除
const {
  cloud, db, _, fail, assert, ts, paging, findOne, findAll, me, blockedIds, isAdmin
} = require('../lib');

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// 图片在云存储里是私有的，客户端读不到，但云函数有管理员权限可以下载
async function downloadBase64(fileID, maxLen, label) {
  if (!fileID) return '';
  let res;
  try {
    res = await cloud.downloadFile({ fileID });
  } catch (e) {
    console.error('downloadFile fail', fileID, e);
    fail('BAD_INPUT', `${label}读取失败，请重新选择`);
  }
  const buf = res && res.fileContent;
  if (!buf || !buf.length) fail('BAD_INPUT', `${label}读取失败，请重新选择`);
  const uri = 'data:image/jpeg;base64,' + buf.toString('base64');
  if (uri.length > maxLen) fail('BAD_INPUT', `${label}过大，请换一张`);
  return uri;
}

const toCard = (g, useThumb = false) => ({
  id: g._id,
  title: g.title,
  price: g.price,
  originPrice: g.originPrice,
  condition: g.condition,
  category: g.category,
  location: g.location,
  desc: g.desc,
  // 列表只带缩略图，详情才带大图：云函数返回数据约 1MB 上限
  image: useThumb
    ? (g.thumb || g.image || g.imageBase64 || '')
    : (g.image || g.imageBase64 || ''),
  imageBase64: '',
  emoji: g.emoji || '📦',
  status: g.status,
  sellerName: g.sellerName,
  sellerAvatar: g.sellerAvatar || '',
  sellerOpenid: g.sellerOpenid || '',
  createTime: ts(g.createTime)
});

async function list({ category = '', keyword = '', condition = '', priceMin = null, priceMax = null, sort = 'new', page = 0, size = 20 } = {}) {
  const blocked = await blockedIds();
  const base = { status: 'on' };
  if (category) base.category = category;
  if (condition) base.condition = condition;
  if (blocked.length) base._id = _.nin(blocked);
  if (priceMin != null && priceMax != null) base.price = _.and(_.gte(+priceMin), _.lt(+priceMax));
  else if (priceMin != null) base.price = _.gte(+priceMin);
  else if (priceMax != null) base.price = _.lt(+priceMax);

  const kw = String(keyword || '').trim();
  const { skip, limit, size: s } = paging({ page, size });

  let query;
  if (kw) {
    const re = db.RegExp({ regexp: escapeRe(kw), options: 'i' });
    query = db.collection('goods').where(_.and([base, _.or([{ title: re }, { desc: re }])]));
  } else {
    query = db.collection('goods').where(base);
  }

  const [field, dir] = sort === 'price' || sort === 'priceAsc' ? ['price', 'asc']
    : sort === 'priceDesc' ? ['price', 'desc']
    : ['createTime', 'desc'];
  query = query.orderBy(field, dir);
  const { data } = await query.skip(skip).limit(limit + 1).get();
  const hasMore = data.length > s;

  return { list: data.slice(0, s).map(g => toCard(g, true)), hasMore };
}

async function detail({ id }, { openid }) {
  if (!id) return null;
  const g = await db.collection('goods').doc(id).get().then(r => r.data).catch(() => null);
  if (!g) return null;
  const hidden = await findOne('violations', { goodId: id });
  if (hidden && !(await isAdmin(openid))) return null;

  const seller = g.sellerOpenid ? await findOne('users', { openid: g.sellerOpenid }) : null;
  return {
    ...toCard(g),
    seller: {
      name: seller ? seller.name : (g.sellerName || '卖家'),
      credit: seller ? (seller.credit || 100) : 100,
      avatar: seller ? (seller.avatar || '') : '',
      openid: g.sellerOpenid || ''
    }
  };
}

async function mine(payload, { openid }) {
  const user = await me(openid);
  const sid = String(user.sid);
  const blocked = new Set(await blockedIds());
  const opt = { order: ['createTime', 'desc'], limit: 200 };
  const [byOpenid, bySid] = await Promise.all([
    findAll('goods', { sellerOpenid: openid }, opt),
    findAll('goods', { sid }, opt)
  ]);
  const seen = new Set();
  return byOpenid.concat(bySid)
    .filter(g => (seen.has(g._id) ? false : (seen.add(g._id), true)))
    .filter(g => !blocked.has(g._id))
    .map(g => toCard(g, true));
}

async function create(p = {}, { openid }) {
  const user = await me(openid);
  const title = String(p.title || '').trim();
  const price = +p.price;
  assert(title.length > 0 && title.length <= 40, 'BAD_INPUT', '请填写商品标题');
  assert(price > 0 && isFinite(price), 'BAD_INPUT', '请填写正确售价');
  assert(p.category, 'BAD_INPUT', '请选择分类');

  // 客户端只传 fileID（体积小），这里下载后转 base64 入库，保证所有人可读
  const image = p.image || await downloadBase64(p.imageFileID, 400 * 1024, '图片');
  const thumb = p.thumb || await downloadBase64(p.thumbFileID, 60 * 1024, '缩略图');
  const temps = [p.imageFileID, p.thumbFileID].filter(Boolean);
  if (temps.length) {
    cloud.deleteFile({ fileList: temps }).catch(e => console.error('清理临时图片失败', e));
  }

  const rec = {
    title,
    price,
    originPrice: +p.originPrice > 0 ? +p.originPrice : Math.round(price * 1.5),
    category: p.category,
    condition: p.condition || '全新',
    image,
    thumb,
    imageBase64: '',
    emoji: '',
    desc: String(p.desc || '').trim() || '卖家很懒，什么都没写~',
    location: p.location || '校内',
    sellerName: user.name,
    sellerAvatar: user.avatar || '',
    sellerSid: String(user.sid),
    sellerOpenid: openid,
    status: 'on',
    createTime: new Date()
  };
  const res = await db.collection('goods').add({ data: rec });
  return { id: res._id };
}

async function ownerGood(id, openid) {
  const g = await db.collection('goods').doc(id).get().then(r => r.data).catch(() => null);
  assert(g, 'NOT_FOUND', '商品不存在');
  assert(g.sellerOpenid === openid, 'FORBIDDEN', '只能操作自己发布的商品');
  return g;
}

async function setStatus({ id, status }, { openid }) {
  await me(openid);
  const g = await ownerGood(id, openid);
  assert(['on', 'off'].includes(status), 'BAD_INPUT', '状态不合法');
  assert(!(g.status === 'sold' && status === 'on'), 'BAD_INPUT', '已售出的商品不能重新上架');
  await db.collection('goods').doc(id).update({ data: { status } });
  return { id, status };
}

// 卖家改价：只能改自己的、未售出的商品
async function updatePrice({ id, price }, { openid }) {
  await me(openid);
  const g = await ownerGood(id, openid);
  const p = +price;
  assert(p > 0 && isFinite(p), 'BAD_INPUT', '请填写正确售价');
  assert(g.status !== 'sold', 'BAD_INPUT', '已售出的商品不能改价');
  await db.collection('goods').doc(id).update({ data: { price: p } });
  return { id, price: p };
}

async function remove({ id }, { openid }) {
  await me(openid);
  await ownerGood(id, openid);
  await db.collection('goods').doc(id).remove();
  return { id };
}

module.exports = { list, detail, mine, create, setStatus, updatePrice, remove };
