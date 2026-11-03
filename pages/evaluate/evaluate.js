// pages/evaluate/evaluate.js
const orderSvc = require('../../services/order');
const guard = require('../../utils/guard');

Page({
  data: { order: null, score: 5, content: '', scoreText: '非常满意' },

  async onLoad(opt) {
    if (!guard.requireLogin(this)) return;
    try {
      const order = await orderSvc.get(opt && opt.orderId);
      this.setData({
        order: { ...order, emoji: order.emoji || '📦', grad: ['#F2F3F5', '#E4E7EB'] }
      });
    } catch (e) {
      guard.showError(e);
    }
  },

  setScore(e) {
    const s = +e.currentTarget.dataset.s;
    const tips = ['', '很差', '不太好', '一般', '满意', '非常满意'];
    this.setData({ score: s, scoreText: tips[s] || '' });
  },

  onContent(e) { this.setData({ content: e.detail.value }); },

  async submit() {
    const order = this.data.order;
    if (!order || !order._id) {
      wx.showToast({ title: '订单不存在', icon: 'none' });
      return;
    }
    try {
      await orderSvc.evaluate(order._id, this.data.score, this.data.content);
      wx.showToast({ title: '评价成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 800);
    } catch (e) {
      guard.showError(e);
    }
  }
});
