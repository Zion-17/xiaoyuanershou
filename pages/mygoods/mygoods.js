// pages/mygoods/mygoods.js
const goodsSvc = require('../../services/goods');
const guard = require('../../utils/guard');
const { decorateGoods } = require('../../utils/view');

Page({
  data: { list: [] },

  async onShow() {
    if (!guard.requireLogin(this)) return;
    try {
      this.setData({ list: decorateGoods(await goodsSvc.mine()) });
    } catch (e) {
      guard.showError(e);
    }
  },

  goPublish() { wx.switchTab({ url: '/pages/publish/publish' }); },
  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },

  async toggleStatus(e) {
    const id = e.currentTarget.dataset.id;
    const g = this.data.list.find(x => x.id === id);
    if (!g) return;
    const next = g.status === 'on' ? 'off' : 'on';
    try {
      await goodsSvc.setStatus(id, next);
      wx.showToast({ title: next === 'on' ? '已上架' : '已下架', icon: 'success' });
      this.onShow();
    } catch (err) {
      guard.showError(err);
    }
  },

  remove(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除商品',
      content: '删除后不可恢复，确定？',
      success: async r => {
        if (!r.confirm) return;
        try {
          await goodsSvc.remove(id);
          this.onShow();
        } catch (err) {
          guard.showError(err);
        }
      }
    });
  }
});
