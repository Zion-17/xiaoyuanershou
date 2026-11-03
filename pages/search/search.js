// pages/search/search.js
const app = getApp();
const goodsSvc = require('../../services/goods');
const guard = require('../../utils/guard');
const { decorateGoods } = require('../../utils/view');

const PRICE_RANGES = [
  { min: null, max: null },
  { min: 0, max: 20 },
  { min: 20, max: 50 },
  { min: 50, max: 100 },
  { min: 100, max: null }
];

Page({
  data: {
    categories: [], kw: '', cat: '',
    priceRanges: ['不限价格', '0-20元', '20-50元', '50-100元', '100元以上'],
    priceIdx: 0, priceLabel: '不限',
    conditions: ['不限成色', '全新', '几乎全新', '轻微使用', '明显使用'],
    condIdx: 0, condLabel: '不限',
    sort: 'default', sortLabel: '默认',
    list: [], page: 0, hasMore: false, loading: false
  },

  onLoad(opt) {
    this._timer = null;
    this.setData({ categories: app.globalData.categories, cat: (opt && opt.cat) || '' });
    this.load(true);
  },

  onUnload() {
    if (this._timer) clearTimeout(this._timer);
  },

  onKw(e) {
    const kw = e.detail.value;
    this.setData({ kw });
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => this.load(true), 300);
  },
  doSearch() { this.load(true); },
  goBack() { wx.navigateBack(); },

  setCat(e) { this.setData({ cat: e.currentTarget.dataset.id }, () => this.load(true)); },
  setPrice(e) {
    const i = +e.detail.value;
    this.setData({ priceIdx: i, priceLabel: this.data.priceRanges[i].replace('价格', '') }, () => this.load(true));
  },
  setCond(e) {
    const i = +e.detail.value;
    this.setData({ condIdx: i, condLabel: this.data.conditions[i] === '不限成色' ? '不限' : this.data.conditions[i] }, () => this.load(true));
  },
  toggleSort() {
    const order = ['default', 'priceAsc', 'priceDesc'];
    const labels = { default: '默认', priceAsc: '价格从低', priceDesc: '价格从高' };
    const next = order[(order.indexOf(this.data.sort) + 1) % order.length];
    this.setData({ sort: next, sortLabel: labels[next] }, () => this.load(true));
  },

  async load(reset) {
    if (this.data.loading && !reset) return;
    const page = reset ? 0 : this.data.page;
    this.setData({ loading: true });
    const range = PRICE_RANGES[this.data.priceIdx] || PRICE_RANGES[0];
    try {
      const res = await goodsSvc.list({
        category: this.data.cat,
        keyword: this.data.kw,
        condition: this.data.condIdx > 0 ? this.data.conditions[this.data.condIdx] : '',
        priceMin: range.min,
        priceMax: range.max,
        sort: this.data.sort,
        page,
        size: 20
      });
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
