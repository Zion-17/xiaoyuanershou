// pages/index/index.js
const app = getApp();
const goodsSvc = require('../../services/goods');
const guard = require('../../utils/guard');
const { decorateGoods } = require('../../utils/view');

Page({
  data: { categories: [], list: [], sort: 'rec', page: 0, hasMore: false, loading: false },

  onLoad() {
    this.setData({ categories: app.globalData.categories });
  },

  onShow() { this.load(true); },

  async load(reset) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const page = reset ? 0 : this.data.page;
    try {
      const res = await goodsSvc.list({ page, size: 20, sort: this.data.sort === 'price' ? 'price' : 'new' });
      const items = decorateGoods(res.list);
      this.setData({
        list: reset ? items : this.data.list.concat(items),
        page: page + 1,
        hasMore: res.hasMore
      });
    } catch (e) {
      guard.showError(e);
    }
    this.setData({ loading: false });
  },

  onReachBottom() {
    if (this.data.hasMore) this.load(false);
  },

  async onPullDownRefresh() {
    await this.load(true);
    wx.stopPullDownRefresh();
  },

  setSort(e) { this.setData({ sort: e.currentTarget.dataset.s }, () => this.load(true)); },
  goSearch() { wx.navigateTo({ url: '/pages/search/search' }); },
  goCategory(e) {
    const { id, name } = e.currentTarget.dataset;
    wx.navigateTo({ url: '/pages/search/search?cat=' + id + '&name=' + encodeURIComponent(name) });
  },
  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); }
});
