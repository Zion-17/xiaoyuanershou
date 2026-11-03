// 云函数调用封装：所有数据访问都经这里，客户端不再直接读写数据库
function call(action, payload = {}) {
  return new Promise((resolve, reject) => {
    if (!wx.cloud) {
      reject({ code: 'NO_CLOUD', message: '当前环境不支持云开发' });
      return;
    }
    wx.cloud.callFunction({
      name: 'api',
      data: { action, payload },
      success(res) {
        const r = res && res.result;
        if (r && r.ok) resolve(r.data);
        else reject({ code: (r && r.code) || 'INTERNAL', message: (r && r.message) || '服务异常' });
      },
      fail(err) {
        console.error('[api] callFunction fail', action, err);
        const raw = (err && (err.errMsg || err.message)) || '';
        reject({
          code: 'NETWORK',
          message: raw ? '请求失败：' + raw : '网络异常，请稍后重试'
        });
      }
    });
  });
}

module.exports = { call };
