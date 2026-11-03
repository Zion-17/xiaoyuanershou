const { call } = require('../utils/api');

module.exports = {
  create: (goodId, method) => call('order.create', { goodId, method }),
  list: () => call('order.list'),
  get: id => call('order.get', { id }),
  update: (id, status) => call('order.update', { id, status }),
  evaluate: (id, score, content) => call('order.evaluate', { id, score, content })
};
