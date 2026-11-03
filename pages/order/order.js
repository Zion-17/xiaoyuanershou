// pages/order/order.js
const orderSvc = require('../../services/order');
const guard = require('../../utils/guard');
const { fmtDT } = require('../../utils/format');

const STATUS_KEY = { '待确认': 'pending', '已完成': 'done', '已取消': 'cancelled' };
const EMOJI = '📦';
const GRAD = ['#F2F3F5', '#E4E7EB'];

Page({
  data: { list: [] },

  async onShow() {
    if (!guard.requireLogin(this)) return;
    try {
      const rows = await orderSvc.list();
      this.setData({
        list: rows.map(o => ({
          ...o,
          emoji: o.emoji || EMOJI,
          grad: GRAD,
          statusKey: STATUS_KEY[o.status] || 'pending',
          time: fmtDT(o.time)
        }))
      });
    } catch (e) {
      guard.showError(e);
    }
  },

  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },

  cancel(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '取消订单',
      content: '确定取消该订单？',
      success: async r => {
        if (!r.confirm) return;
        try {
          await orderSvc.update(id, '已取消');
          this.onShow();
        } catch (err) { guard.showError(err); }
      }
    });
  },

  confirm(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认收货',
      content: '请确认已当面验货并完成交易',
      success: async r => {
        if (!r.confirm) return;
        try {
          await orderSvc.update(id, '已完成');
          wx.showToast({ title: '交易完成', icon: 'success' });
          this.onShow();
        } catch (err) { guard.showError(err); }
      }
    });
  },

  goEvaluate(e) {
    wx.navigateTo({ url: '/pages/evaluate/evaluate?orderId=' + e.currentTarget.dataset.id });
  }
});
