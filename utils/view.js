// 展示层装饰：补齐分类渐变、emoji、时间文案、头像类型，保持各页 WXML 结构不变
const { fmtDT, fmtList } = require('./format');
const { avatarOf } = require('./avatar');

const FALLBACK = { emoji: '📦', grad: ['#F2F3F5', '#E4E7EB'] };

function decorateGood(g, extra = {}) {
  const app = getApp();
  const cat = (app && app.categoryOf && g.category) ? app.categoryOf(g.category) : null;
  const src = cat || FALLBACK;
  const sellerAvatar = avatarOf(g.sellerAvatar || (g.seller && g.seller.avatar), '🧑');
  return {
    ...g,
    emoji: g.emoji || src.emoji,
    grad: (g.grad && g.grad.length) ? g.grad : src.grad,
    seller: {
      name: g.sellerName || (g.seller && g.seller.name) || '卖家',
      credit: (g.seller && g.seller.credit) || 100,
      avatarImage: sellerAvatar.image,
      avatarEmoji: sellerAvatar.emoji
    },
    time: fmtDT(g.createTime),
    ...extra
  };
}

const decorateGoods = list => (list || []).map(g => decorateGood(g));

function decorateChat(c) {
  const av = avatarOf(c.avatar, '🧑‍🎓');
  return {
    ...c,
    grad: ['#E8F5E9', '#B2DFDB'],
    avatarImage: av.image,
    avatarEmoji: av.emoji,
    time: fmtList(c.time)
  };
}

module.exports = { decorateGood, decorateGoods, decorateChat, fmtDT, fmtList, avatarOf };
