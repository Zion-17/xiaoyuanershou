# 校园闲转・校园闲置二手物品交易平台（微信小程序）

> 课程设计：同学A（000000001）、同学B（000000002）、同学C（000000000）、同学D（000000003）

基于微信云开发的校园二手交易平台。**所有写操作与鉴权都在云函数内完成**，小程序端只做展示。

- 📄 测试文档见 [TESTING.md](TESTING.md)
- 🏷 版本标签：`v1`（清理前基线）、`v2`（死代码清理后）

## 一、架构

```
pages/*  ──►  services/*.js  ──►  utils/api.js  ──►  云函数 api（action 路由）
                                                        │
                                              云数据库 / 云存储
                                          （客户端无直接写权限）
```

| 目录 | 作用 |
|---|---|
| `pages/` | 15 个页面，只负责渲染与交互 |
| `services/` | 按领域划分的调用薄层（user / goods / chat / favorite / order / admin） |
| `utils/api.js` | 唯一的云函数调用入口，统一拆包 `{ok, data}` / `{ok:false, code, message}` |
| `utils/guard.js` | 登录拦截、封禁提示、统一错误提示 |
| `utils/watch.js` | 会话实时监听（双 openid 订阅合并） |
| `utils/format.js` | 时间格式化 |
| `utils/view.js` | 列表项展示装饰（分类渐变、emoji、时间文案） |
| `utils/avatar.js` | 头像类型降级（emoji / base64 / 不可读的云文件） |
| `utils/config.js` | 云环境 ID、客服电话（全项目唯一来源） |
| `cloudfunctions/api/` | 云函数：`index.js` 路由 + `lib.js` 公共能力 + `actions/*` 领域处理 |
| `scripts/` | 自研静态检查与冒烟测试（见 TESTING.md） |

**身份模型**：以 `openid` 为准。学号通过白名单校验并绑定 openid，此后该学号只能由绑定的微信登录。

---

## 二、核心代码导读

下面八段是整个系统里"一旦改错就会出数据事故"的地方，按依赖顺序排列。

### 1. 唯一调用入口：小程序端只有一个地方碰网络

`utils/api.js`

```js
function call(action, payload = {}) {
  return new Promise((resolve, reject) => {
    wx.cloud.callFunction({
      name: 'api',
      data: { action, payload },
      success(res) {
        const r = res && res.result;
        if (r && r.ok) resolve(r.data);
        else reject({ code: (r && r.code) || 'INTERNAL', message: (r && r.message) || '服务异常' });
      },
      fail(err) { reject({ code: 'NETWORK', message: '...' }); }
    });
  });
}
```

**为什么这么写**：服务端统一返回 `{ok, data}` / `{ok:false, code, message}`，客户端只在 `utils/api.js` 一处拆包。这样"错误码 → 用户提示"的映射（`utils/guard.js` 的 `showError`）只需要维护一份，新增接口不必重复写错误处理。

### 2. 鉴权：所有 action 的第一行都是 `me(openid)`

`cloudfunctions/api/lib.js`

```js
const me = async (openid, { allowBanned = false } = {}) => {
  const user = (await findOne('users', { openid })) || (await findOne('users', { _openid: openid }));
  assert(user, 'NOT_LOGGED_IN', '请先登录');
  if (user.status === 'deleted') fail('ACCOUNT_DELETED', '账号已注销');
  if (!allowBanned) {
    const ban = await findOne('bans', { sid: String(user.sid) });
    if (ban) fail('BANNED', '账号已被封禁');
  }
  return user.openid ? user : { ...user, openid };
};
```

**为什么这么写**：`openid` 只从 `cloud.getWXContext()` 取，**永远不信客户端传上来的身份**。`_openid` 兜底是给迁移前的历史档案用的（老版本客户端直接写库，文档里只有系统字段 `_openid`）。封禁检查放在这里，等于所有需要登录的接口自动获得封禁拦截，不必逐个 action 重复写。

### 3. 管理员判定：表 + 常量双保险

```js
const adminOf = async openid => {
  const a = await findOne('admins', { openid });
  if (a) return a;
  const u = (await findOne('users', { openid })) || (await findOne('users', { _openid: openid }));
  if (u && String(u.sid) === ADMIN_SID) return { openid, sid: ADMIN_SID, implicit: true };
  return null;
};
```

**为什么这么写**：只认 `admins` 表的话，一旦表被误清空，管理员就永久失权、再也进不去控制台（死锁）。常量为兜底，保证管理员学号本人永远能自救。管理员身份**只影响控制台的能力**，聊天、商品、订单走的是和普通用户完全相同的代码路径——这是本项目刻意保持的设计约束。

### 4. 会话唯一性：一对用户只可能有一个会话

`cloudfunctions/api/lib.js`

```js
const pairKeyOf = (a, b) => {
  const [x, y] = a < b ? [a, b] : [b, a];
  return 'c_' + crypto.createHash('md5').update(x + '|' + y).digest('hex').slice(0, 24);
};
```

`cloudfunctions/api/actions/chat.js`

```js
const [a, b] = pairOpenids(openid, good.sellerOpenid);
const chatId = pairKeyOf(a, b);
let chat = await getChat(chatId);
if (!chat) {
  try { await db.collection('chats').add({ data: { _id: chatId, openidA: a, openidB: b, ... } }); }
  catch (e) { /* 并发下对方先建了同 _id 的会话 */ }
  chat = await getChat(chatId);
} else if (chat.currentGoodId !== goodId) {
  await db.collection('chats').doc(chatId).update({ data: { currentGoodId: goodId } });
}
```

**为什么这么写**：会话主键由**两个 openid 排序后哈希**得到，写死在服务端。两个人的会话 id 是确定的，`add` 同 `_id` 会被数据库直接拒绝，所以**并发下也造不出第二条会话**——不依赖"先查后插"这种有竞态的应用层检查。

早期版本把 `goodId` 也放进会话主键，导致同一卖家每件商品一条会话，消息被割裂成多个窗口。现在商品降级为会话内的上下文：`currentGoodId` 记录"这一轮在问哪个宝贝"，`messages.goodId` 记录"这句话是在问哪个宝贝"。

### 5. 会话列表：没有消息的会话不出现

```js
const chats = asA.concat(asB)
  // 点「聊一聊」就会建会话文档，但空会话不该占位：发过第一条消息才出现在消息页
  .filter(c => !c.mergedInto && String(c.lastText || '').trim() !== '')
  .sort((x, y) => ts(y.lastTime) - ts(x.lastTime));
```

**为什么这么写**：`chat.open` 在用户点「聊一聊」的瞬间就要落库（需要持久化 `currentGoodId`），所以库里会存在 0 条消息的空会话。列表层过滤掉它们，效果等价于"发第一条消息后会话才出现"，同时不牺牲服务端的上下文记录。

`!c.mergedInto` 是迁移后的第二道过滤：历史碎片会话被软合并成墓碑文档（保留原记录、不物理删除），任何读取路径都要跳过它们。

### 6. 实时消息：一条 where 表达不了"或"，所以开两条订阅

`utils/watch.js`

```js
// 安全规则要求查询条件命中本人 openid，
// 一条 where 无法同时满足"或"的两支，因此开两条订阅再合并。
open('openidA', 'a');
open('openidB', 'b');
```

**为什么这么写**：`messages` 集合的安全规则是 `doc.openidA == auth.openid || doc.openidB == auth.openid`，而 `db.watch` 的订阅查询必须**自身**满足该规则才能建立。写 `where({ chatId, openidA: _.or([me, peer]) })` 会被规则判定为"未命中本人"。因此拆成两条 `where`，各自命中一支，客户端按 `_id` 去重合并。订阅建立失败时自动降级为 3 秒轮询。

### 7. 头像：云存储读不到就老实退回 emoji

`utils/avatar.js`

```js
function avatarOf(v, fallback = '🧑‍🎓') {
  const s = String(v || '');
  if (!s) return { image: '', emoji: fallback };
  // 云存储 fileID 在免费版是"仅创建者可读"，别的用户拿到的是加载不出来的空图
  if (s.startsWith('cloud://')) return { image: '', emoji: fallback };
  return isImageAvatar(s) ? { image: s, emoji: '' } : { image: '', emoji: s };
}
```

**为什么这么写**：微信云开发免费版的云存储权限是「仅创建者可读写」，升级到"所有用户可读"要付费。所以头像一律存 base64（96px 压缩后约 4-6KB）写进 `users.avatar`。历史数据里残留的 `cloud://` fileID 别人根本加载不出来，会渲染成一块空白——与其显示破图，不如降级成默认 emoji。

### 8. 数据迁移：先预演，再软合并，幂等

`cloudfunctions/api/actions/admin.js`

```js
const dryRun = !(payload && payload.execute === true);   // 默认只读
...
const [a, b] = a0 < b0 ? [a0, b0] : [b0, a0];
const key = pairKeyOf(a, b);                              // 与线上同一套 id 规则
...
await db.collection('messages').where({ chatId: id }).update({ data: { chatId: grp.key, ... } });
await db.collection('chats').doc(id).update({ data: { mergedInto: grp.key, mergedAt: new Date() } });
```

**为什么这么写**：三条硬约束——①**默认 dryRun**，避免误触直接改库；②旧会话只打 `mergedInto` 标记，**不物理删除**，消息正文一条不动，只改指针，随时可回滚；③正本 `_id` 用与线上完全相同的 `pairKeyOf` 计算，所以脚本重复执行时命中的是同一个文档，天然幂等。

---

## 三、首次部署（必须按顺序）

### 1. 部署云函数

微信开发者工具 → 左侧 `cloudfunctions/api` → 右键 →「**上传并部署：云端安装依赖**」。

部署后在云开发控制台把该函数**超时时间调到 60 秒**（迁移脚本需要）。

### 2. 建集合

需要存在这些集合（已有的不用重建）：`users`、`goods`、`orders`、`messages`、`favorites`、`bans`、`violations`、`reads`、`chats`、`whitelist`、`admins`。

### 3. 设置权限（关键，否则前功尽弃）

云开发控制台 → 数据库 → 每个集合 → 权限设置 → **自定义安全规则**：

`messages` 与 `reads`：

```json
{
  "read": "doc.openidA == auth.openid || doc.openidB == auth.openid",
  "write": false
}
```

其余全部集合（`users`、`goods`、`orders`、`favorites`、`bans`、`violations`、`chats`、`whitelist`、`admins`）：

```json
{
  "read": false,
  "write": false
}
```

> 客户端不再直接读数据库（只有会话实时监听读 `messages`/`reads`），所有请求经云函数，云函数不受安全规则限制。

### 4. 初始化（只做一次）

用**管理员学号 000000000 对应的微信**打开小程序 →「我的」→「管理员控制台」→「数据看板」→ 点「执行数据迁移」。

会先跑一次**预演**（只读、不写库），确认「修复商品 N 件 / 合并为 N 条会话 / 涉及 N 条消息」无误后再点执行。迁移会：把历史数据里误写成学号的 `openid` 修正、把同一对用户的多条会话合并为一条、回填 `currentGoodId`。**不删除任何聊天记录，幂等，可重复执行。**

> 若提示"首次初始化只能用管理员学号执行"，说明当前微信与库里的管理员档案对不上——到控制台手动给 `admins` 集合插入一条 `{ "openid": "你的openid", "sid": "000000000" }` 即可。

### 5. 验证

- 用非白名单学号登录 → 应提示"该学号不在本校白名单内"
- 用其他微信登录已绑定的学号 → 应提示"已绑定其他微信"
- 管理员封禁某账号 → 该账号被强制登出，商品从首页消失，发消息被拒
- 解封 → 商品自动恢复

完整用例见 [TESTING.md](TESTING.md)。

---

## 四、数据模型

| 集合 | 关键字段 |
|---|---|
| `users` | `openid`、`sid`、`name`、`role`、`avatar`(emoji 或 base64)、`credit` |
| `whitelist` | `sid`、`boundOpenid` |
| `admins` | `openid`、`sid` |
| `goods` | `sellerOpenid`、`sellerSid`、`status`、`thumb`/`image`(base64)、`price` |
| `chats` | `_id`(= `pairKeyOf(a,b)`)、`openidA`、`openidB`、`currentGoodId`、`lastText`、`lastTime`、`mergedInto`(迁移墓碑) |
| `messages` | `chatId`、`goodId`、`openidA`、`openidB`、`senderOpenid`、`senderName`、`localId` |
| `reads` | `chatId`、`openid`、`openidA`、`openidB`、`readTime` |
| `favorites` | `openid`、`goodId` |
| `orders` | `buyerOpenid`、`sellerOpenid`、`status` |
| `bans` / `violations` | `sid` / `goodId`、`banSid` |

**会话不变量**：任意两个用户之间**至多一条** `chats` 文档，且其 `_id` 恒等于 `pairKeyOf(openidA, openidB)`。

---

## 五、开发约定

- 新增数据操作：在 `cloudfunctions/api/actions/` 里加处理函数 → 在 `index.js` 注册 `action` → 在 `services/` 加一行薄封装。**不要恢复客户端直接读写数据库。**
- 新增页面：`guard.requireLogin(this)` 放在 `onLoad`/`onShow` 首行；列表数据用 `utils/view.js` 装饰。
- 客服电话只从 `utils/config.js` 取。
- 改动后跑一遍：`node scripts/check-refs.js && node scripts/check-bindings.js && node scripts/smoke.js`。

## 六、已知限制

- 站内消息依赖 `db.watch` 实时推送；若安全规则导致订阅失败，会自动降级为 3 秒轮询。
- 商品列表分页 20 条/页，滚动加载。
- 云存储私有导致图片改为 base64 入库，单张头像压缩到 96px、商品图列表用缩略图（≤28KB）/详情用大图（≤180KB）。
- 未实现：消息撤回、多图上传、管理端审计日志、评价体系扩展。
