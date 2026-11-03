// pages/chat/chat.js
const chatSvc = require('../../services/chat');
const guard = require('../../utils/guard');
const { watchMember } = require('../../utils/watch');
const { fmtChat } = require('../../utils/format');
const { avatarOf } = require('../../utils/avatar');

const GAP = 5 * 60 * 1000;

Page({
  data: { chat: null, draft: '', messages: [], scrollAnchor: '', kbHeight: 0 },

  onLoad(opt) {
    const u = guard.requireLogin(this);
    if (!u) return;
    this._me = u;
    this._rawMsgs = [];
    this._goodTitles = {};
    this._pending = new Map();
    this._otherRead = 0;
    this._watchers = [];
    this._timer = null;
    this._pollTimer = null;
    this._lastMark = 0;
    this._lastIdx = -1;
    this._init(opt || {});
  },

  async _init(opt) {
    try {
      const info = opt.chatId
        ? await chatSvc.info(decodeURIComponent(opt.chatId))
        : await chatSvc.open(opt.goodId);
      this._chatId = info.chatId;
      const av = avatarOf(info.peer.avatar, '🧑‍🎓');
      const good = info.good || null;
      const meOpenid = (this._me && this._me.openid) || '';
      this.setData({
        chat: {
          _id: info.chatId,
          good,
          canBuy: !!(good && good.status === 'on' && good.sellerOpenid && good.sellerOpenid !== meOpenid),
          avatarImage: av.image,
          avatarEmoji: av.emoji,
          peerBanned: !!info.peer.banned
        }
      });
      wx.setNavigationBarTitle({ title: info.peer.name || '聊天' });
      if (info.peer.banned) {
        wx.showModal({ title: '无法聊天', content: '该用户已被封禁，无法发送消息', showCancel: false });
      }

      await this._loadMessages();
      this._watch();
      this._timer = setInterval(() => this._render(), 60000);
    } catch (e) {
      guard.showError(e);
    }
  },

  onUnload() {
    (this._watchers || []).forEach(w => { try { w.close(); } catch (e) {} });
    if (this._timer) clearInterval(this._timer);
    if (this._pollTimer) clearInterval(this._pollTimer);
  },

  onGoods() {
    const g = this.data.chat && this.data.chat.good;
    if (!g || !g.id) return;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + g.id });
  },

  // 从聊天直接下单：详情页负责售出/下架/自己商品等全部校验，这里只带个标记过去
  onBuy() {
    const g = this.data.chat && this.data.chat.good;
    if (!g || !g.id) return;
    wx.navigateTo({ url: '/pages/detail/detail?id=' + g.id + '&buy=1' });
  },

  // 键盘弹起时抬高容器底部，顶部商品栏位置不变，只有消息区被压缩
  onKeyboardHeightChange(e) {
    this.setData({ kbHeight: (e.detail && e.detail.height) || 0 });
  },

  async _loadMessages() {
    if (!this._chatId) return;
    const [res, otherRead] = await Promise.all([
      chatSvc.messages(this._chatId),
      chatSvc.otherReadTime(this._chatId).catch(() => 0)
    ]);
    this._goodTitles = (res && res.goods) || {};
    this._rawMsgs = (res && res.list) || [];
    this._otherRead = otherRead || 0;
    this._render();
    this._markRead();
    this._scrollBottom();
  },

  _watch() {
    const openid = this._me.openid;
    if (!openid) { this._startPolling(); return; }

    this._watchers.push(watchMember('messages', this._chatId, openid, docs => {
      this._rawMsgs = docs.map(m => ({
        _id: m._id,
        localId: m.localId || m._id,
        text: m.text,
        goodId: m.goodId || '',
        senderName: m.senderName,
        createTime: new Date(m.createTime).getTime(),
        mine: m.senderOpenid === openid
      }));
      this._render();
      this._markRead();
      this._scrollBottom();
    }, () => this._startPolling()));

    this._watchers.push(watchMember('reads', this._chatId, openid, docs => {
      this._otherRead = docs
        .filter(r => r.openid !== openid)
        .reduce((max, r) => Math.max(max, new Date(r.readTime).getTime()), 0);
      this._render();
    }, () => {}));
  },

  // 实时监听不可用时的退路：3 秒轮询
  _startPolling() {
    if (this._pollTimer) return;
    this._pollTimer = setInterval(async () => {
      try {
        const res = await chatSvc.messages(this._chatId);
        const otherRead = await chatSvc.otherReadTime(this._chatId).catch(() => 0);
        this._goodTitles = (res && res.goods) || {};
        this._rawMsgs = (res && res.list) || [];
        this._otherRead = otherRead || 0;
        this._render();
      } catch (e) { /* 轮询失败静默重试 */ }
    }, 3000);
  },

  _markRead() {
    if (!this._chatId) return;
    const now = Date.now();
    if (now - this._lastMark < 5000) return;
    this._lastMark = now;
    chatSvc.markRead(this._chatId).catch(() => {});
  },

  _render() {
    const list = (this._rawMsgs || []).slice();
    // 已落库的消息会带着同一个 localId 回来，此时丢掉本地乐观副本，避免闪两条
    const landed = new Set(list.map(m => m.localId).filter(Boolean));
    landed.forEach(id => this._pending.delete(id));
    const pending = Array.from(this._pending.values());

    const titles = this._goodTitles || {};
    let lastT = 0;
    let lastGood = '';
    let lastMsgIdx = -1;
    const messages = [];

    list.concat(pending).forEach(m => {
      const t = m.createTime || 0;
      const showTime = !!t && (!lastT || t - lastT > GAP);
      if (t) lastT = t;

      // 合并会话后一个窗口里有多个商品的对话，话题切换处插一条分隔
      const gid = m.goodId || '';
      if (gid && gid !== lastGood) {
        lastGood = gid;
        if (titles[gid]) messages.push({ localId: 'sep_' + gid, sep: true, text: '咨询商品：' + titles[gid] });
      }

      lastMsgIdx = messages.length;
      messages.push({
        ...m,
        showTime,
        timeText: showTime ? fmtChat(t) : '',
        read: !!(m.mine && m.createTime && this._otherRead && m.createTime <= this._otherRead)
      });
    });

    // 刚切到某个商品、还没在它下面发过消息时，末尾补一条提示，
    // 否则切商品只有顶部横条变化，时间线里看不出在聊哪个
    const cur = this.data.chat && this.data.chat.good;
    if (cur && cur.id && cur.id !== lastGood && cur.title) {
      messages.push({ localId: 'sep_cur_' + cur.id, sep: true, text: '咨询商品：' + cur.title });
    }

    this._lastIdx = lastMsgIdx;
    this.setData({ messages });
  },

  _scrollBottom() {
    if (!this.data.messages.length) return;
    const idx = this._lastIdx >= 0 ? this._lastIdx : this.data.messages.length - 1;
    this.setData({ scrollAnchor: '' });
    setTimeout(() => this.setData({ scrollAnchor: 'msg' + idx }), 20);
  },

  onDraft(e) { this.setData({ draft: e.detail.value }); },

  async send() {
    const text = this.data.draft.trim();
    if (!text) return;
    if (!this._chatId) { wx.showToast({ title: '会话未就绪', icon: 'none' }); return; }

    const localId = 'm' + Date.now() + Math.random().toString(36).slice(2, 6);
    const good = (this.data.chat && this.data.chat.good) || {};
    this._pending.set(localId, {
      _id: localId, localId, text, mine: true, goodId: good.id || '', createTime: Date.now()
    });
    this.setData({ draft: '' });
    this._render();
    this._scrollBottom();

    try {
      await chatSvc.send(this._chatId, text, localId);
      this._render();
    } catch (e) {
      const failed = this._pending.get(localId);
      if (failed) { failed.failed = true; this._pending.set(localId, failed); this._render(); }
      guard.showError(e);
    }
  }
});
