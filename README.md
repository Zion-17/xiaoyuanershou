# 校园闲转・校园闲置二手物品交易平台（微信小程序）

> 课程设计：同学A（000000001）、同学B（000000002）、同学C（000000000）、同学D（000000003）

基于微信云开发的校园二手交易平台。**所有写操作与鉴权都在云函数内完成**，小程序端只做展示。

## 一、架构

```
pages/*  ──►  services/*.js  ──►  utils/api.js  ──►  云函数 api（action 路由）
                                                        │
                                              云数据库 / 云存储
                                          （客户端无直接写权限）
```

| 目录 | 作用 |
|---|---|
| `pages/` | 14 个页面，只负责渲染与交互 |
| `services/` | 按领域划分的调用薄层（user / goods / chat / favorite / order / admin） |
| `utils/api.js` | 唯一的云函数调用入口，统一拆包 `{ok, data}` / `{ok:false, code, message}` |
| `utils/guard.js` | 登录拦截、封禁提示、统一错误提示 |
| `utils/watch.js` | 会话实时监听（双 openid 订阅合并） |
| `utils/format.js` | 时间格式化 |
| `utils/view.js` | 列表项展示装饰（分类渐变、emoji、时间文案） |
| `utils/config.js` | 云环境 ID、客服电话（全项目唯一来源） |
| `cloudfunctions/api/` | 云函数：`index.js` 路由 + `actions/*` 各领域处理 |

**身份模型**：以 `openid` 为准。学号通过白名单校验并绑定 openid，此后该学号只能由绑定的微信登录。

## 二、首次部署（必须按顺序）

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

用**管理员学号 000000000 对应的微信**打开小程序，在「我的」→ 进入管理员控制台后，于开发者工具控制台执行：

```js
wx.cloud.callFunction({ name: 'api', data: { action: 'admin.migrateV1', payload: {} } })
  .then(r => console.log(r.result))
```

该调用会：回填 `users.openid`、合并同学号重复档案、建 `whitelist`/`admins`、给 `goods` 补 `sellerOpenid`、把历史消息的会话 id 与发送者改成 openid 维度。**幂等，可重复执行。**

返回里的 `remaining` 不为 0 时重复执行（分批迁移，避免客户端 15 秒调用超时）；`whitelist.created` 表示本次新建的白名单条数。

> 若提示"首次初始化只能用管理员学号执行"，说明当前微信与库里的管理员档案对不上——到控制台手动给 `admins` 集合插入一条 `{ "openid": "你的openid", "sid": "000000000" }` 即可。

### 5. 验证

- 用非白名单学号登录 → 应提示"该学号不在本校白名单内"
- 用其他微信登录已绑定的学号 → 应提示"已绑定其他微信"
- 管理员封禁某账号 → 该账号被强制登出，商品从首页消失，发消息被拒
- 解封 → 商品自动恢复

## 三、数据模型

| 集合 | 关键字段 |
|---|---|
| `users` | `openid`、`sid`、`name`、`role`、`credit` |
| `whitelist` | `sid`、`boundOpenid` |
| `admins` | `openid`、`sid` |
| `goods` | `sellerOpenid`、`sid`/`sellerSid`、`status`、`image`(云存储 fileID) |
| `chats` | `goodId`、`openidA`、`openidB`、`lastText`、`lastTime` |
| `messages` | `chatId`、`openidA`、`openidB`、`senderOpenid`、`senderName` |
| `reads` | `chatId`、`openid`、`openidA`、`openidB`、`readTime` |
| `favorites` | `openid`、`goodId` |
| `orders` | `buyerOpenid`、`sellerOpenid`、`status` |
| `bans` / `violations` | `sid` / `goodId`、`banSid` |

## 四、开发约定

- 新增数据操作：在 `cloudfunctions/api/actions/` 里加处理函数 → 在 `index.js` 注册 `action` → 在 `services/` 加一行薄封装。**不要恢复客户端直接读写数据库。**
- 新增页面：`guard.requireLogin(this)` 放在 `onLoad`/`onShow` 首行；列表数据用 `utils/view.js` 装饰。
- 客服电话只从 `utils/config.js` 取。

## 五、已知限制

- 站内消息依赖 `db.watch` 实时推送；若安全规则导致订阅失败，会自动降级为 3 秒轮询。
- 商品列表分页 20 条/页，滚动加载。
- 未实现：消息撤回、多图上传、管理端审计日志、评价体系扩展。
