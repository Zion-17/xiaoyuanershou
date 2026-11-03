const { call } = require('../utils/api');

module.exports = {
  list: (params = {}) => call('goods.list', params),
  detail: id => call('goods.detail', { id }),
  mine: () => call('goods.mine'),
  create: data => call('goods.create', data),
  setStatus: (id, status) => call('goods.setStatus', { id, status }),
  updatePrice: (id, price) => call('goods.updatePrice', { id, price }),
  remove: id => call('goods.remove', { id })
};
