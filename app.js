// 校园闲转 - 校园闲置二手物品交易平台
const { CLOUD_ENV } = require('./utils/config');
const guard = require('./utils/guard');
const userSvc = require('./services/user');

if (wx.cloud) {
  try {
    wx.cloud.init({ env: CLOUD_ENV, traceUser: true });
  } catch (e) { console.error('云初始化失败', e); }
}

App({
  globalData: {
    categories: [
      { id: 'book',    name: '教材书籍', emoji: '📚', grad: ['#FFE9D0', '#FFB88C'] },
      { id: 'digital', name: '电子产品', emoji: '📱', grad: ['#D6E4FF', '#8AA9FF'] },
      { id: 'life',    name: '生活用品', emoji: '🧸', grad: ['#D9F6E3', '#7EDFA8'] },
      { id: 'sport',   name: '运动器材', emoji: '🏀', grad: ['#FFE0E0', '#FF9A9A'] },
      { id: 'cloth',   name: '服饰鞋包', emoji: '👟', grad: ['#F3E8FF', '#C9A7FF'] },
      { id: 'beauty',  name: '美妆洗护', emoji: '💄', grad: ['#FFE4F0', '#FF9AC4'] },
      { id: 'bike',    name: '代步出行', emoji: '🚲', grad: ['#E0F7FA', '#80DEEA'] },
      { id: 'other',   name: '其他杂物', emoji: '🎒', grad: ['#FFF8D6', '#F0D879'] }
    ],
    conditions: ['全新', '几乎全新', '轻微使用', '明显使用'],
    user: null
  },

  onLaunch() {
    this._readLocalUser();
    this._banGate();
  },

  onShow() {
    this._readLocalUser();
    this._banGate();
  },

  _readLocalUser() {
    this.globalData.user = guard.getUser();
  },

  // 全局封禁闸门：服务端说了算；查询失败（网络）不误伤登录态
  async _banGate() {
    const u = this.globalData.user;
    if (!u || this._gatePending) return;
    if (Date.now() - (this._gateAt || 0) < 60000) return;
    this._gatePending = true;
    this._gateAt = Date.now();
    try {
      const fresh = await userSvc.profile();
      guard.setUser(fresh);
      this.globalData.user = fresh;
    } catch (e) {
      if (e && e.code === 'BANNED') guard.bannedModal();
      else if (e && e.code === 'NOT_LOGGED_IN') guard.clearUser();
    } finally {
      this._gatePending = false;
    }
  },

  getCategoryName(cid) {
    const c = this.globalData.categories.find(x => x.id === cid);
    return c ? c.name : '其他';
  },

  categoryOf(cid) {
    return this.globalData.categories.find(x => x.id === cid) ||
      { id: '', name: '其他', emoji: '📦', grad: ['#F2F3F5', '#E4E7EB'] };
  }
});
