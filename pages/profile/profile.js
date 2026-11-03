// pages/profile/profile.js
const userSvc = require('../../services/user');
const goodsSvc = require('../../services/goods');
const favoriteSvc = require('../../services/favorite');
const orderSvc = require('../../services/order');
const guard = require('../../utils/guard');
const { PHONE } = require('../../utils/config');
const { avatarOf } = require('../../utils/avatar');

Page({
  data: { user: null, isAdmin: false, myGoodsCount: 0, favCount: 0, orderCount: 0 },

  async onShow() {
    let user = guard.getUser();
    if (user) {
      try {
        user = await userSvc.profile();
        guard.setUser(user);
      } catch (e) {
        if (e && e.code === 'BANNED') { guard.bannedModal(); return; }
        if (e && e.code === 'NOT_LOGGED_IN') { guard.clearUser(); user = null; }
      }
    }
    const av = avatarOf(user && user.avatar, '🧑‍🎓');
    this.setData({
      user: user ? { ...user, avatarImage: av.image, avatarEmoji: av.emoji } : null,
      isAdmin: !!(user && user.role === 'admin')
    });
    if (user) this._loadCounts();
    else this.setData({ myGoodsCount: 0, favCount: 0, orderCount: 0 });
  },

  async _loadCounts() {
    try { this.setData({ myGoodsCount: (await goodsSvc.mine()).length }); } catch (e) {}
    try { this.setData({ favCount: (await favoriteSvc.ids()).length }); } catch (e) {}
    try { this.setData({ orderCount: (await orderSvc.list()).length }); } catch (e) {}
  },

  goLogin() { wx.navigateTo({ url: '/pages/login/login' }); },

  goMyGoods() { if (guard.requireLogin(this, { isTab: true })) wx.navigateTo({ url: '/pages/mygoods/mygoods' }); },
  goFavorite() { if (guard.requireLogin(this, { isTab: true })) wx.navigateTo({ url: '/pages/favorite/favorite' }); },
  goOrder() { if (guard.requireLogin(this, { isTab: true })) wx.navigateTo({ url: '/pages/order/order' }); },
  goAccount() { if (guard.requireLogin(this, { isTab: true })) wx.navigateTo({ url: '/pages/account/account' }); },
  goAdmin() { wx.navigateTo({ url: '/pages/admin/admin' }); },

  onContact() {
    wx.showModal({
      title: '联系客服',
      content: '客服电话：' + PHONE,
      confirmText: '拨打电话',
      success: r => {
        if (r.confirm) wx.makePhoneCall({ phoneNumber: PHONE, fail() {} });
      }
    });
  },

  onAbout() {
    wx.showModal({
      title: '关于校园闲转',
      content: '版本 2.0.0（云开发版）\n仅限本校学生，倡导面对面安全交易。',
      showCancel: false
    });
  },

  doLogout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出当前账号吗？',
      success: r => {
        if (r.confirm) {
          guard.clearUser();
          this.onShow();
        }
      }
    });
  }
});
