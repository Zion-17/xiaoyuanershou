// pages/category/category.js
const app = getApp();
const goodsSvc = require('../../services/goods');
const guard = require('../../utils/guard');
const { decorateGoods } = require('../../utils/view');

Page({
  data: { categories: [], active: 'book', activeName: '', list: [], page: 0, hasMore: false, loading: false },

  onLoad() {
    const cats = app.globalData.categories;
    this.setData({ categories: cats, active: cats[0].id, activeName: cats[0].name });
    this.load(true);
  },

  setCat(e) {
    const id = e.currentTarget.dataset.id;
    const cat = this.data.categories.find(c => c.id === id);
    this.setData({ active: id, activeName: cat.name }, () => this.load(true));
  },

  async load(reset) {
    if (this.data.loading) return;
    this.setData({ loading: true });
    const page = reset ? 0 : this.data.page;
    try {
      const res = await goodsSvc.list({ category: this.data.active, page, size: 20 });
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

  goDetail(e) { wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id }); }
});
