// 冒烟测试：纯函数与展示装饰逻辑（不依赖微信运行时）
const assert = require('assert');

global.getApp = () => ({
  categoryOf: id => (id === 'book'
    ? { id: 'book', name: '教材书籍', emoji: '📚', grad: ['#FFE9D0', '#FFB88C'] }
    : { id: '', name: '其他', emoji: '📦', grad: ['#F2F3F5', '#E4E7EB'] })
});

const { avatarOf, isImageAvatar } = require('../utils/avatar');
const { fmtChat, fmtList, fmtDT } = require('../utils/format');
const { decorateGood, decorateChat } = require('../utils/view');

let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('avatar: emoji 原样当文本', () => {
  assert.deepStrictEqual(avatarOf('🧑‍🎓'), { image: '', emoji: '🧑‍🎓' });
});

ok('avatar: 云存储 fileID 私有读，回退 emoji', () => {
  const r = avatarOf('cloud://env.abc/avatars/1.jpg', '🧑');
  assert.strictEqual(r.image, '');
  assert.strictEqual(r.emoji, '🧑');
});

ok('avatar: https 链接当图片', () => {
  assert.strictEqual(isImageAvatar('https://x.com/a.png'), true);
});

ok('avatar: 空值回退默认 emoji', () => {
  assert.deepStrictEqual(avatarOf('', '🧑'), { image: '', emoji: '🧑' });
});

ok('format: 今天只显示 HH:mm', () => {
  const s = fmtChat(Date.now());
  assert.ok(/^\d{2}:\d{2}$/.test(s), 'got ' + s);
});

ok('format: 空值返回空串', () => {
  assert.strictEqual(fmtDT(null), '');
  assert.strictEqual(fmtList(undefined), '');
});

ok('decorateGood: 图片头像', () => {
  const g = decorateGood({ id: '1', title: 'A', price: 10, category: 'book', sellerName: '张三', sellerAvatar: 'https://x.com/a.png', status: 'on' });
  assert.strictEqual(g.seller.name, '张三');
  assert.strictEqual(g.seller.avatarImage, 'https://x.com/a.png');
  assert.strictEqual(g.seller.avatarEmoji, '');
  assert.deepStrictEqual(g.grad, ['#FFE9D0', '#FFB88C']);
});

ok('decorateGood: cloud fileID 头像回退 emoji', () => {
  const g = decorateGood({ id: '3', title: 'C', price: 1, category: 'book', sellerName: '王五', sellerAvatar: 'cloud://a/b.jpg', status: 'on' });
  assert.strictEqual(g.seller.avatarImage, '');
  assert.strictEqual(g.seller.avatarEmoji, '🧑');
});

ok('decorateGood: emoji 头像 + 缺分类走兜底', () => {
  const g = decorateGood({ id: '2', title: 'B', price: 5, category: 'unknown', sellerName: '李四', sellerAvatar: '🐱' });
  assert.strictEqual(g.seller.avatarEmoji, '🐱');
  assert.strictEqual(g.seller.avatarImage, '');
  assert.deepStrictEqual(g.grad, ['#F2F3F5', '#E4E7EB']);
});

ok('decorateChat: 头像与时间', () => {
  const c = decorateChat({ id: 'c1', with: '王五', avatar: '🦊', last: 'hi', time: Date.now() });
  assert.strictEqual(c.avatarEmoji, '🦊');
  assert.ok(/^\d{2}:\d{2}$/.test(c.time));
});

console.log(`SMOKE OK (${n} cases)`);
