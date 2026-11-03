// 会话内实时监听：安全规则要求查询条件命中本人 openid，
// 一条 where 无法同时满足"或"的两支，因此开两条订阅再合并。
function watchMember(collection, chatId, openid, onChange, onError) {
  const db = wx.cloud.database();
  const buckets = { a: [], b: [] };
  const watchers = [];
  let closed = false;

  const emit = () => {
    if (closed) return;
    const map = new Map();
    [...buckets.a, ...buckets.b].forEach(d => map.set(d._id, d));
    const docs = Array.from(map.values())
      .sort((x, y) => new Date(x.createTime) - new Date(y.createTime));
    onChange(docs);
  };

  const open = (field, key) => {
    try {
      const w = db.collection(collection)
        .where({ chatId, [field]: openid })
        .watch({
          onChange: snap => { buckets[key] = (snap && snap.docs) || []; emit(); },
          onError: err => {
            console.error('[watch]', collection, field, err);
            if (onError) onError(err);
          }
        });
      watchers.push(w);
    } catch (e) {
      console.error('[watch] open fail', collection, field, e);
    }
  };

  open('openidA', 'a');
  open('openidB', 'b');

  return {
    close() {
      closed = true;
      watchers.forEach(w => { try { w.close(); } catch (e) {} });
    }
  };
}

module.exports = { watchMember };
