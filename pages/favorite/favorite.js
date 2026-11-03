// pages/favorite/favorite.js
const favoriteSvc = require('../../services/favorite');
const guard = require('../../utils/guard');
const { decorateGoods } = require('../../utils/view');

Page({
  data: { list: [] },

  async onShow() {
    if (!guard.requireLogin(this)) return;
    try {
      this.setData({ list: decorateGoods(await favoriteSvc.list()) });
    } catch (e) {
      guard.showError(e);
    }
  },

  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); },

  async unfav(e) {
    const id = e.currentTarget.dataset.id;
    try {
      await favoriteSvc.toggle(id);
      wx.showToast({ title: '已取消收藏', icon: 'none' });
      this.onShow();
    } catch (err) {
      guard.showError(err);
    }
  }
});
