// pages/detail/detail.js
const app = getApp();
const goodsSvc = require('../../services/goods');
const favoriteSvc = require('../../services/favorite');
const orderSvc = require('../../services/order');
const guard = require('../../utils/guard');
const { decorateGood } = require('../../utils/view');

Page({
  data: { id: null, g: null, categoryName: '', faved: false },

  onLoad(opt) {
    this._id = (opt && opt.id) || '';
    // 从聊天页的「购买」进来时带 buy=1，加载完成后再自动拉起下单面板（只触发一次）
    this._autoBuy = !!(opt && opt.buy);
    this._open();
  },

  onShow() {
    this.refreshFav();
  },

  async _open() {
    if (!this._id) { wx.showToast({ title: '商品不存在', icon: 'none' }); return; }
    try {
      const g = await goodsSvc.detail(this._id);
      if (!g) {
        wx.showToast({ title: '商品不存在或已下架', icon: 'none' });
        return;
      }
      const me = guard.getUser();
      const isOwner = !!(me && me.openid && g.sellerOpenid && g.sellerOpenid === me.openid);
      this.setData({
        id: g.id,
        g: decorateGood(g),
        categoryName: app.getCategoryName(g.category),
        isOwner,
        canBuy: g.status === 'on' && !isOwner,
        soldOut: g.status === 'sold'
      });
      this.refreshFav();
      if (this._autoBuy) { this._autoBuy = false; this.order(); }
    } catch (e) {
      guard.showError(e);
    }
  },

  async refreshFav() {
    if (!this.data.id) return;
    if (!guard.getUser()) { this.setData({ faved: false }); return; }
    try {
      const ids = await favoriteSvc.ids();
      this.setData({ faved: ids.indexOf(this.data.id) > -1 });
    } catch (e) { /* 未登录或网络问题不打扰浏览 */ }
  },

  async toggleFav() {
    if (!guard.requireLogin(this)) return;
    try {
      const res = await favoriteSvc.toggle(this.data.id);
      this.setData({ faved: res.faved });
      wx.showToast({ title: res.faved ? '已收藏' : '已取消收藏', icon: 'none' });
    } catch (e) { guard.showError(e); }
  },

  goChat() {
    if (!guard.requireLogin(this)) return;
    const g = this.data.g;
    wx.navigateTo({
      url: `/pages/chat/chat?goodId=${this.data.id}` +
        `&goodTitle=${encodeURIComponent(g.title)}` +
        `&sellerName=${encodeURIComponent(g.seller.name)}`
    });
  },

  onSeller() { this.goChat(); },

  order() {
    if (!guard.requireLogin(this)) return;
    if (!this.data.canBuy) {
      wx.showToast({ title: this.data.soldOut ? '该商品已售出' : '该商品已下架', icon: 'none' });
      return;
    }
    wx.showActionSheet({
      itemList: ['宿舍当面交易', '线上支付（模拟）'],
      success: async r => {
        try {
          await orderSvc.create(this.data.id, r.tapIndex === 0 ? '当面交易' : '线上支付');
          wx.showModal({
            title: '下单成功',
            content: '订单已提交，等待卖家确认后即可约定见面地点。',
            confirmText: '查看订单',
            success: res => { if (res.confirm) wx.navigateTo({ url: '/pages/order/order' }); }
          });
        } catch (e) { guard.showError(e); }
      }
    });
  },

  // ---------- 卖家操作 ----------
  editPrice() {
    wx.showModal({
      title: '修改价格',
      editable: true,
      placeholderText: '输入新的价格（元）',
      success: async r => {
        if (!r.confirm) return;
        const price = +(r.content || '').trim();
        if (!price || price <= 0 || isNaN(price)) {
          wx.showToast({ title: '请输入正确的价格', icon: 'none' });
          return;
        }
        try {
          await goodsSvc.updatePrice(this.data.id, price);
          wx.showToast({ title: '价格已更新', icon: 'success' });
          this._open();
        } catch (e) { guard.showError(e); }
      }
    });
  },

  toggleShelf() {
    const g = this.data.g;
    const next = g.status === 'on' ? 'off' : 'on';
    wx.showModal({
      title: next === 'on' ? '重新上架' : '下架商品',
      content: next === 'on' ? '重新上架后其他同学可以看到并购买。' : '下架后商品从首页移除，其他人无法购买。',
      success: async r => {
        if (!r.confirm) return;
        try {
          await goodsSvc.setStatus(this.data.id, next);
          wx.showToast({ title: next === 'on' ? '已上架' : '已下架', icon: 'success' });
          this._open();
        } catch (e) { guard.showError(e); }
      }
    });
  },

  removeGood() {
    wx.showModal({
      title: '删除商品',
      content: '删除后不可恢复，确定？',
      success: async r => {
        if (!r.confirm) return;
        try {
          await goodsSvc.remove(this.data.id);
          wx.showToast({ title: '已删除', icon: 'success' });
          setTimeout(() => wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) }), 600);
        } catch (e) { guard.showError(e); }
      }
    });
  }
});
