// 登录态、封禁提示、统一错误提示
const { PHONE } = require('./config');

const getUser = () => {
  try { return wx.getStorageSync('user') || null; } catch (e) { return null; }
};

const setUser = user => {
  try { wx.setStorageSync('user', user); } catch (e) {}
  const app = getApp();
  if (app) app.globalData.user = user;
};

const clearUser = () => {
  try { wx.removeStorageSync('user'); } catch (e) {}
  const app = getApp();
  if (app) app.globalData.user = null;
};

// 未登录拦截：返回用户对象；未登录时弹窗引导，取消则 tab 页回首页 / 二级页返回
function requireLogin(page, { isTab = false } = {}) {
  const user = getUser();
  if (user) return user;
  wx.showModal({
    title: '请先登录',
    content: '登录后才能使用该功能，请先完成学号认证',
    confirmText: '去登录',
    cancelText: '返回',
    success: r => {
      if (r.confirm) wx.navigateTo({ url: '/pages/login/login' });
      else if (isTab) wx.switchTab({ url: '/pages/index/index' });
      else wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index', fail() {} }) });
    }
  });
  return null;
}

// 封禁强制登出：全局唯一入口，客服电话只从这里取
function bannedModal() {
  clearUser();
  wx.showModal({
    title: '账号已被封禁',
    content: '你的账号因违规已被管理员封禁，暂时无法使用本平台功能。如有疑问请联系客服：' + PHONE,
    confirmText: '拨打客服',
    cancelText: '知道了',
    success: r => {
      if (r.confirm) wx.makePhoneCall({ phoneNumber: PHONE, fail() {} });
    },
    complete: () => { wx.switchTab({ url: '/pages/index/index', fail() {} }); }
  });
}

// 统一错误处理：登录失效、封禁、对方封禁、普通错误
function showError(err) {
  const code = err && err.code;
  if (code === 'BANNED') { bannedModal(); return; }
  if (code === 'NOT_LOGGED_IN') {
    clearUser();
    wx.showToast({ title: '登录已失效，请重新登录', icon: 'none' });
    return;
  }
  if (code === 'FORBIDDEN') {
    wx.showModal({ title: '无权限', content: (err && err.message) || '无权执行该操作', showCancel: false });
    return;
  }
  wx.showToast({ title: (err && err.message) || '网络异常，请稍后重试', icon: 'none', duration: 2500 });
}

module.exports = { PHONE, getUser, setUser, clearUser, requireLogin, bannedModal, showError };
