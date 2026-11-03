// pages/login/login.js
const userSvc = require('../../services/user');
const guard = require('../../utils/guard');

// 邮箱只做宽松格式校验：任意邮箱（QQ/163/校园邮箱均可）
// 先把全角符号和空格归一，避免中文输入法导致的"看起来对却校验失败"
const normalizeEmail = v => String(v || '')
  .replace(/＠/g, '@')
  .replace(/[．。]/g, '.')
  .replace(/\s/g, '');
const EMAIL_RE = /^[^@]+@[^@]+\.[^@]+$/;

Page({
  data: { sid: '', email: '', nick: '', agree: false },

  onLoad() { this._autoLogin(); },

  // 已绑定过的微信直接进站，昵称/邮箱只在首次认证时填
  async _autoLogin() {
    wx.showLoading({ title: '登录中…' });
    try {
      const user = await userSvc.autoLogin();
      guard.setUser(user);
      wx.hideLoading();
      wx.showToast({ title: '欢迎回来', icon: 'none' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 400);
    } catch (e) {
      wx.hideLoading();
      if (e && e.code === 'BANNED') guard.showError(e);
      // 未注册或网络异常：留在表单让用户处理
    }
  },

  onSid(e) { this.setData({ sid: e.detail.value }); },
  onEmail(e) { this.setData({ email: e.detail.value }); },
  onNick(e) { this.setData({ nick: e.detail.value }); },
  toggleAgree() { this.setData({ agree: !this.data.agree }); },

  async doLogin() {
    const sid = String(this.data.sid || '').trim();
    const email = normalizeEmail(this.data.email);
    const nick = String(this.data.nick || '').trim();
    const { agree } = this.data;
    if (!/^\d{6,12}$/.test(sid)) return wx.showToast({ title: '请输入正确学号', icon: 'none' });
    if (!EMAIL_RE.test(email)) return wx.showToast({ title: '请输入正确的邮箱', icon: 'none' });
    if (!nick) return wx.showToast({ title: '起个昵称吧', icon: 'none' });
    if (nick.length > 20) return wx.showToast({ title: '昵称最多 20 个字', icon: 'none' });
    if (!agree) return wx.showToast({ title: '请先同意安全公约', icon: 'none' });

    wx.showLoading({ title: '认证中…' });
    try {
      const user = await userSvc.login({ sid, email, name: nick });
      guard.setUser(user);
      wx.hideLoading();
      wx.showToast({ title: '认证通过', icon: 'success' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 600);
    } catch (e) {
      wx.hideLoading();
      const app = getApp();
      if (app) app.globalData.user = null;
      if (e && e.code === 'SID_TAKEN') {
        wx.showModal({ title: '无法登录', content: e.message, showCancel: false });
      } else {
        guard.showError(e);
      }
    }
  }
});
