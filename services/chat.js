const { call } = require('../utils/api');

module.exports = {
  open: goodId => call('chat.open', { goodId }),
  info: chatId => call('chat.info', { chatId }),
  list: () => call('chat.list'),
  messages: chatId => call('chat.messages', { chatId }),
  send: (chatId, text, localId) => call('chat.send', { chatId, text, localId }),
  markRead: chatId => call('chat.markRead', { chatId }),
  otherReadTime: chatId => call('chat.otherReadTime', { chatId })
};
