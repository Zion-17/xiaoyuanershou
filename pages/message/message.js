// pages/message/message.js
const chatSvc = require('../../services/chat');
const guard = require('../../utils/guard');
const { decorateChat } = require('../../utils/view');

Page({
  data: { list: [] },

  async onShow() {
    if (!guard.requireLogin(this, { isTab: true })) {
      this.setData({ list: [] });
      return;
    }
    try {
      const list = await chatSvc.list();
      this.setData({ list: list.map(decorateChat) });
    } catch (e) {
      this.setData({ list: [] });
      guard.showError(e);
    }
  },

  openChat(e) {
    const id = e.currentTarget.dataset.id;
    const chat = this.data.list.find(x => x.id === id);
    if (!chat) return;
    wx.navigateTo({
      url: `/pages/chat/chat?chatId=${encodeURIComponent(chat.id)}` +
        `&goodId=${chat.goodId || ''}` +
        `&goodTitle=${encodeURIComponent(chat.goodsTitle || '')}` +
        `&sellerName=${encodeURIComponent(chat.with || '')}`
    });
  }
});
