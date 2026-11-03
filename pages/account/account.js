// pages/account/account.js
const userSvc = require('../../services/user');
const guard = require('../../utils/guard');
const { avatarOf } = require('../../utils/avatar');

// 4 行 × 5 列：前三行动物，最后一行为人物（第一个即默认头像）
const EMOJIS = [
  '🐱', '🐶', '🐼', '🦊', '🐰',
  '🐻', '🐨', '🐯', '🦁', '🐮',
  '🐷', '🐸', '🐵', '🐔', '🐧',
  '🧑‍🎓', '👦', '👧', '👨', '👩'
];
const AVATAR_SIZE = 96;
const AVATAR_MAX_LEN = 180 * 1024;

Page({
  data: {
    user: null, name: '', email: '',
    avatar: '', avatarImage: '', avatarEmoji: '🧑‍🎓',
    emojis: EMOJIS, emojiPanel: false,
    saving: false
  },

  async onLoad() {
    const u = guard.requireLogin(this);
    if (!u) return;
    this._fill(u);
    // 拉一次云端档案，保证昵称/邮箱是库里最新的（不是本地缓存）
    try {
      const fresh = await userSvc.profile();
      if (fresh) {
        guard.setUser(fresh);
        this._fill(fresh);
      }
    } catch (e) {
      // 网络失败就用本地缓存，不打断编辑
    }
  },

  _fill(u) {
    const av = avatarOf(u.avatar, '🧑‍🎓');
    this.setData({
      user: u,
      name: u.name || '',
      email: u.email || '',
      avatar: u.avatar || '',
      avatarImage: av.image,
      avatarEmoji: av.emoji
    });
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onEmail(e) { this.setData({ email: e.detail.value }); },

  // 点头像直接展开 emoji 选择面板（相册/拍照/微信头像走下方那一行）
  chooseAvatar() {
    this.setData({ emojiPanel: true });
  },

  // 微信头像回调：拿到的是临时文件，压缩后转存云存储
  onChooseWechatAvatar(e) {
    const url = e.detail && e.detail.avatarUrl;
    if (!url) return;
    this._upload(url);
  },

  onEmojiTap(e) {
    this._setAvatar(e.currentTarget.dataset.e);
    this.setData({ emojiPanel: false });
  },

  closeEmojiPanel() { this.setData({ emojiPanel: false }); },

  noop() {},

  _setAvatar(v) {
    const av = avatarOf(v, '🧑‍🎓');
    this.setData({ avatar: v, avatarImage: av.image, avatarEmoji: av.emoji });
  },

  // 头像不落云存储：免费版存储是私有的，别的用户读不到文件。
  // 压到 96px 后转 base64 直接写进 users.avatar，数据库对所有人可读。
  async _upload(src) {
    wx.showLoading({ title: '处理头像…' });
    try {
      let path = src;
      try {
        path = await this._compress(src);
      } catch (e) {
        console.warn('canvas 压缩失败，改用原图', e);
      }

      let base64;
      try {
        base64 = wx.getFileSystemManager().readFileSync(path, 'base64');
      } catch (e) {
        throw new Error('读取图片失败');
      }

      const mime = /\.png$/i.test(path) ? 'image/png' : 'image/jpeg';
      const dataUri = `data:${mime};base64,` + base64;
      if (dataUri.length > AVATAR_MAX_LEN) throw new Error('头像过大');

      this._setAvatar(dataUri);
      wx.hideLoading();
    } catch (e) {
      console.error('头像处理失败', e);
      wx.hideLoading();
      const msg = (e && e.message === '头像过大') ? '图片太大，请换一张' : '头像处理失败，请重试';
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  // 头像压到 96px 方图，任何机型都能算得动、存得下
  _compress(src) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().select('#avatarCanvas').fields({ node: true, size: true }).exec(r => {
        if (!r || !r[0] || !r[0].node) { reject(new Error('canvas not found')); return; }
        const canvas = r[0].node;
        const img = canvas.createImage();
        img.onload = () => {
          try {
            const size = Math.max(1, Math.min(AVATAR_SIZE, img.width, img.height));
            const sx = (img.width - size) / 2;
            const sy = (img.height - size) / 2;
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, size, size);
            ctx.drawImage(img, sx, sy, size, size, 0, 0, size, size);
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'jpg',
              quality: 0.8,
              success: res => resolve(res.tempFilePath),
              fail: reject
            });
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
      });
    });
  },

  async save() {
    const name = this.data.name.trim();
    const email = this.data.email.trim();
    if (!name) return wx.showToast({ title: '昵称不能为空', icon: 'none' });
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return wx.showToast({ title: '请输入正确的邮箱', icon: 'none' });
    if (this.data.saving) return;

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中…' });
    try {
      const user = await userSvc.updateProfile({ name, email, avatar: this.data.avatar });
      guard.setUser(user);
      wx.hideLoading();
      wx.showToast({ title: '已保存', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 600);
    } catch (e) {
      wx.hideLoading();
      guard.showError(e);
    }
    this.setData({ saving: false });
  },

  deactivate() {
    wx.showModal({
      title: '注销账号',
      content: '注销后该微信将无法登录，在售商品会全部下架，历史订单与聊天记录保留。确定继续？',
      confirmText: '确认注销',
      confirmColor: '#FF4D4F',
      success: async r => {
        if (!r.confirm) return;
        try {
          await userSvc.deactivate();
          guard.clearUser();
          wx.showToast({ title: '账号已注销', icon: 'none' });
          setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800);
        } catch (e) {
          guard.showError(e);
        }
      }
    });
  },

  logout() {
    wx.showModal({
      title: '退出登录',
      content: '退出后可用同一微信免密重新登录。',
      success: r => {
        if (!r.confirm) return;
        guard.clearUser();
        wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/index/index' }) });
      }
    });
  }
});
