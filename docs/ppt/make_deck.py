# -*- coding: utf-8 -*-
"""生成课程设计答辩 PPT（16 页：4 个深色转场 + 10 个内容页 + 封面 + 数字墙）。

用法：python docs/ppt/make_deck.py
截图放到 docs/ppt/img/ 下，文件名见 SHOTS；缺失时自动画占位框。
"""
import os
import re
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.oxml.ns import qn

HERE = os.path.dirname(os.path.abspath(__file__))
IMG = os.path.join(HERE, 'img')
OUT = os.path.join(HERE, '答辩PPT.pptx')

INK = RGBColor(0x1A, 0x1D, 0x21)
BODY = RGBColor(0x3D, 0x44, 0x4F)
MUTED = RGBColor(0x6B, 0x72, 0x80)
FAINT = RGBColor(0xA8, 0xB0, 0xBC)
GREEN = RGBColor(0x00, 0xB5, 0x78)
GREEN_D = RGBColor(0x0E, 0x9A, 0x6A)
ORANGE = RGBColor(0xFF, 0x6B, 0x35)
RULE = RGBColor(0xE6, 0xE8, 0xEC)
CANVAS = RGBColor(0xF7, 0xF8, 0xFA)
WHITE = RGBColor(0xFF, 0xFF, 0xFF)

DARK = RGBColor(0x12, 0x16, 0x1C)
DARK_GHOST = RGBColor(0x1C, 0x22, 0x2B)
DARK_TEXT = RGBColor(0xEE, 0xF1, 0xF5)
DARK_MUTED = RGBColor(0x8A, 0x94, 0xA3)
DARK_GREEN = RGBColor(0x35, 0xD6, 0x9C)

CODE_BG = RGBColor(0x1B, 0x20, 0x28)
CODE_BAR = RGBColor(0x25, 0x2B, 0x35)
CODE_TXT = RGBColor(0xD7, 0xDD, 0xE5)
CODE_STR = RGBColor(0xFF, 0xB2, 0x7A)
CODE_CMT = RGBColor(0x6E, 0x7C, 0x8C)
CODE_NUM = RGBColor(0x4C, 0x55, 0x63)

FONT = '微软雅黑'
MONO = 'Consolas'

SHOTS = {
    '01-message.png': '消息列表（合并后）',
    '02-chat.png': '聊天页（商品条 + 购买）',
    '03-timeline.png': '时间线分隔条',
    '04-detail.png': '商品详情页',
    '05-admin.png': '管理员控制台',
    '06-index.png': '首页商品列表',
}


def _ea(run, name):
    rPr = run._r.get_or_add_rPr()
    node = rPr.find(qn('a:ea'))
    if node is None:
        node = rPr.makeelement(qn('a:ea'), {'typeface': name})
        rPr.append(node)
    else:
        node.set('typeface', name)


def tb(slide, x, y, w, h, text, size=16, color=INK, bold=False, font=FONT,
       align=PP_ALIGN.LEFT, line=1.45, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    for i, ln in enumerate(str(text).split('\n')):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        r = p.add_run()
        r.text = ln
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = font
        _ea(r, font)
    return box


def rect(slide, x, y, w, h, fill=None, line=None, lw=1.2,
         shape=MSO_SHAPE.RECTANGLE, dash=None):
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.shadow.inherit = False
    if fill is None:
        s.fill.background()
    else:
        s.fill.solid()
        s.fill.fore_color.rgb = fill
    if line is None:
        s.line.fill.background()
    else:
        s.line.color.rgb = line
        s.line.width = Pt(lw)
        if dash:
            s.line.dash_style = dash
    return s


def dots(slide, x, y, cols, rows, gap, color, d=0.035):
    for i in range(cols):
        for j in range(rows):
            rect(slide, x + i * gap, y + j * gap, d, d, fill=color, shape=MSO_SHAPE.OVAL)


def base(prs, kicker, title, page, deco=True):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, 13.334, 7.5, fill=WHITE)
    if deco:
        dots(s, 11.75, 0.55, 8, 3, 0.17, RGBColor(0xEC, 0xEF, 0xF3))
    rect(s, 0.9, 0.62, 0.26, 0.035, fill=GREEN)
    tb(s, 1.3, 0.54, 8, 0.3, kicker, size=10.5, color=MUTED)
    tb(s, 0.9, 0.92, 10.6, 0.72, title, size=27, bold=True)
    rect(s, 0.9, 1.8, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 7.04, 6, 0.24, '校园闲转 · 课程设计', size=9, color=MUTED)
    tb(s, 11.83, 7.04, 0.6, 0.24, str(page), size=9, color=MUTED, align=PP_ALIGN.RIGHT)
    return s


def section(prs, num, title, sub, keywords, page):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, 13.334, 7.5, fill=DARK)
    dots(s, 9.9, 5.35, 12, 5, 0.22, RGBColor(0x1F, 0x26, 0x30))
    tb(s, 0.82, 1.05, 5, 2.0, num, size=120, bold=True, color=DARK_GHOST, font=MONO)
    rect(s, 1.0, 3.05, 0.5, 0.04, fill=DARK_GREEN)
    tb(s, 1.0, 3.28, 8.5, 0.9, title, size=40, bold=True, color=DARK_TEXT)
    tb(s, 1.0, 4.3, 8.5, 0.5, sub, size=15, color=DARK_MUTED)
    x = 1.0
    for k in keywords:
        w = 0.34 + len(k) * 0.155
        rect(s, x, 5.15, w, 0.42, fill=None, line=RGBColor(0x32, 0x3B, 0x47), lw=1)
        tb(s, x, 5.24, w, 0.26, k, size=11, color=DARK_MUTED, align=PP_ALIGN.CENTER)
        x += w + 0.16
    tb(s, 11.83, 7.04, 0.6, 0.24, str(page), size=9, color=RGBColor(0x4A, 0x53, 0x60),
       align=PP_ALIGN.RIGHT)
    return s


def token_runs(line):
    out = []
    code, comment = line, ''
    idx = line.find('//')
    if idx >= 0:
        head = line[:idx]
        if head.count("'") % 2 == 0 and head.count('"') % 2 == 0:
            code, comment = head, line[idx:]
    for part in re.split(r"(\"[^\"]*\"|'[^']*')", code):
        if not part:
            continue
        out.append((part, CODE_STR if part[:1] in '"\'' else CODE_TXT))
    if comment:
        out.append((comment, CODE_CMT))
    return out


def code_window(slide, x, y, w, lines, name, size=11.5, lh=0.30):
    h = 0.42 + lh * len(lines) + 0.22
    rect(slide, x, y, w, h, fill=CODE_BG)
    rect(slide, x, y, w, 0.42, fill=CODE_BAR)
    for i, c in enumerate([RGBColor(0xFF, 0x5F, 0x57), RGBColor(0xFE, 0xBC, 0x2E),
                           RGBColor(0x28, 0xC8, 0x40)]):
        rect(slide, x + 0.22 + i * 0.22, y + 0.17, 0.085, 0.085, fill=c, shape=MSO_SHAPE.OVAL)
    tb(slide, x + 0.95, y + 0.11, w - 1.2, 0.24, name, size=9.5,
       color=RGBColor(0x9A, 0xA4, 0xB2), font=MONO)
    for i, ln in enumerate(lines):
        yy = y + 0.58 + i * lh
        tb(slide, x + 0.22, yy, 0.34, lh, str(i + 1), size=size, color=CODE_NUM,
           font=MONO, align=PP_ALIGN.RIGHT)
        box = slide.shapes.add_textbox(Inches(x + 0.72), Inches(yy - 0.02),
                                       Inches(w - 1.0), Inches(lh + 0.1))
        tf = box.text_frame
        tf.word_wrap = False
        tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
        p = tf.paragraphs[0]
        p.line_spacing = 1.2
        for text, color in token_runs(ln):
            r = p.add_run()
            r.text = text
            r.font.size = Pt(size)
            r.font.name = MONO
            r.font.color.rgb = color
    return h


def shot(slide, name, x, y, w, h, caption=None):
    path = os.path.join(IMG, name)
    if os.path.exists(path):
        rect(slide, x - 0.03, y - 0.03, w + 0.06, h + 0.06, fill=None, line=RULE, lw=1)
        slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    else:
        rect(slide, x, y, w, h, fill=CANVAS, line=RGBColor(0xC9, 0xCE, 0xD6), lw=1,
             dash=MSO_LINE_DASH_STYLE.DASH)
        tb(slide, x, y + h / 2 - 0.3, w, 0.28, SHOTS.get(name, name), size=10.5,
           color=MUTED, align=PP_ALIGN.CENTER)
        tb(slide, x, y + h / 2 + 0.02, w, 0.28, '待插入截图', size=9.5, color=FAINT,
           align=PP_ALIGN.CENTER)
    if caption:
        tb(slide, x, y + h + 0.1, w, 0.24, caption, size=9.5, color=MUTED)


def notes(slide, text):
    slide.notes_slide.notes_text_frame.text = text


def build():
    prs = Presentation()
    prs.slide_width = Inches(13.334)
    prs.slide_height = Inches(7.5)

    # 1 封面
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, 13.334, 7.5, fill=DARK)
    rect(s, 0, 0, 0.14, 7.5, fill=DARK_GREEN)
    dots(s, 9.35, 4.55, 16, 7, 0.24, RGBColor(0x1E, 0x25, 0x2F))
    tb(s, 1.15, 1.5, 9, 0.3, '课程设计 · 2026 年 11 月 6 日', size=12, color=DARK_MUTED)
    tb(s, 1.15, 1.95, 10, 1.1, '校园闲转', size=56, bold=True, color=DARK_TEXT)
    tb(s, 1.15, 3.12, 10, 0.5, '基于微信云开发的校园闲置二手交易平台', size=19, color=DARK_MUTED)
    rect(s, 1.15, 3.92, 1.0, 0.035, fill=ORANGE)
    tb(s, 1.15, 4.3, 9, 0.9, '微信小程序　·　云函数 + 云数据库\n15 个页面　·　38 个接口　·　42 条测试用例',
       size=13.5, color=RGBColor(0xB6, 0xBF, 0xCB), line=1.7)
    tb(s, 1.15, 6.3, 9, 0.35, '课程设计小组', size=13, color=DARK_TEXT)
    notes(s, '开场 20 秒：我们做的是校内二手交易小程序，所有写操作和鉴权都在云函数里。'
             '今天讲两件事：整体做了什么，以及我们解决的一个真实故障。')

    # 2 SECTION 01
    s = section(prs, '01', '为什么要做这个', '校园闲置物的流转，卡在三个地方',
                ['信息散', '没有信用', '没有留痕'], 2)
    notes(s, '转场 10 秒：先讲背景。')

    # 3 三堵点
    s = base(prs, '01 / 背景', '校园里闲置物流转的三个堵点', 3)
    cols = [('信息散', '二手信息散落在班级群、宿舍楼群、楼下贴纸，\n想找一件东西得翻几十条聊天记录。'),
            ('没有信用', '匿名交易看不出对方是谁、靠不靠谱，\n被放鸽子、被低价鸽都只能自认倒霉。'),
            ('没有留痕', '价格、时间、地点全在聊天里，\n事后没有任何可以追溯的凭据。')]
    for i, (t, d) in enumerate(cols):
        x = 0.9 + i * 3.88
        tb(s, x, 2.3, 3.3, 0.34, '0' + str(i + 1), size=11, color=GREEN, font=MONO)
        tb(s, x, 2.66, 3.3, 0.4, t, size=19, bold=True)
        rect(s, x, 3.18, 0.62, 0.028, fill=RULE)
        tb(s, x, 3.42, 3.4, 1.3, d, size=13, color=BODY, line=1.75)
    rect(s, 0.9, 5.55, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 5.85, 11.5, 0.5, '目标：把「校内实名 + 站内沟通 + 订单留痕」收进同一个小程序。',
       size=17, bold=True)
    notes(s, '30 秒：三个痛点各自对应一个设计决策。')

    # 4 功能全景
    s = base(prs, '01 / 功能', '15 个页面，5 个模块', 4)
    groups = [('商品', '首页·分类·搜索\n详情·发布·我的发布', '6'), ('交易', '下单·订单·评价', '3'),
              ('沟通', '消息·聊天', '2'), ('收藏', '收藏夹', '1'),
              ('账号与管理', '登录·我的·账号管理\n管理员控制台', '3')]
    x = 0.9
    for name, pages, n in groups:
        w = 2.18
        rect(s, x, 2.25, w, 2.05, fill=CANVAS)
        tb(s, x + 0.28, 2.45, w - 0.4, 0.5, n, size=26, bold=True, color=GREEN, font=MONO)
        tb(s, x + 0.28, 3.02, w - 0.4, 0.32, name, size=13.5, bold=True)
        tb(s, x + 0.28, 3.42, w - 0.4, 0.8, pages, size=10.5, color=MUTED, line=1.6)
        x += w + 0.19
    rect(s, 0.9, 4.65, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 4.95, 5.4, 0.3, '管理端做的事', size=11, color=MUTED)
    tb(s, 0.9, 5.3, 5.4, 1.4,
       '数据看板 · 成员封禁（联动下架商品、禁言）\n违规商品下架 / 恢复 · 全站会话只读审计\n数据迁移 · 成交数重算',
       size=12, color=BODY, line=1.75)
    shot(s, '06-index.png', 7.05, 4.9, 2.55, 1.72)
    shot(s, '05-admin.png', 9.95, 4.9, 2.55, 1.72)
    notes(s, '40 秒：快速过功能，不逐页念。')

    # 5 SECTION 02
    s = section(prs, '02', '一条数据是怎么走到库里的', '四层结构，客户端不碰数据库',
                ['页面层', '服务层', '云函数', '数据层'], 5)
    notes(s, '转场 10 秒。')

    # 6 四层结构
    s = base(prs, '02 / 架构', '四层结构，客户端不碰数据库', 6)
    rows = [('页面层', '15 个页面 · pages/*', '只做渲染与交互，无业务逻辑', GREEN),
            ('服务层', 'services/* + utils/api.js', '唯一网络出口，统一拆包 {ok, data}', GREEN_D),
            ('云函数', 'cloudfunctions/api · 38 个 action', '身份校验 / 业务校验 / 写库',
             RGBColor(0x0B, 0x7C, 0x55)),
            ('数据层', '云数据库 + 云存储', '安全规则：客户端读写全部关闭', INK)]
    for i, (t, sub, d, c) in enumerate(rows):
        y = 2.2 + i * 1.18
        rect(s, 0.9, y, 7.0, 0.95, fill=CANVAS)
        rect(s, 0.9, y, 0.055, 0.95, fill=c)
        tb(s, 1.18, y + 0.16, 2.1, 0.34, t, size=15, bold=True)
        tb(s, 1.18, y + 0.55, 3.3, 0.3, sub, size=10.5, font=MONO, color=MUTED)
        tb(s, 4.6, y + 0.34, 3.1, 0.35, d, size=11, color=BODY)
        if i < 3:
            rect(s, 4.32, y + 0.98, 0.022, 0.2, fill=RGBColor(0xC9, 0xCE, 0xD6))
    tb(s, 8.45, 2.3, 4.0, 0.3, '为什么这么切', size=11, color=MUTED)
    rect(s, 8.45, 2.62, 0.55, 0.028, fill=GREEN)
    tb(s, 8.45, 2.85, 4.0, 3.4,
       '小程序端的 openid 由微信下发，\n但客户端代码可被反编译。\n\n'
       '身份判定、封禁校验、写权限\n全部下沉到云函数，数据库\n安全规则对客户端读写关闭。\n\n'
       '客户端只剩一个出口。', size=12.5, color=BODY, line=1.75)
    notes(s, '40 秒：强调客户端零直写。')

    # 7 架构全景
    s = base(prs, '02 / 全景', '15 个页面 → 6 组 action → 11 个集合', 7)
    tb(s, 0.9, 2.2, 3.6, 0.28, '页面（15）', size=11, color=MUTED)
    tb(s, 0.9, 2.5, 3.6, 3.6,
       '首页 分类 搜索 详情 发布\n我的发布 订单 评价\n消息 聊天 收藏\n登录 我的 账号管理\n管理员控制台',
       size=12, color=BODY, line=1.95)
    rect(s, 4.55, 2.5, 0.012, 3.3, fill=RULE)
    tb(s, 4.95, 2.2, 3.6, 0.28, '云函数 action（38）', size=11, color=MUTED)
    acts = [('auth', 6), ('goods', 7), ('chat', 7), ('order', 5), ('favorite', 3), ('admin', 9)]
    for i, (a, n) in enumerate(acts):
        y = 2.55 + i * 0.55
        tb(s, 4.95, y, 1.5, 0.3, a, size=12, font=MONO)
        rect(s, 6.15, y + 0.06, n * 0.13, 0.19, fill=GREEN)
        tb(s, 6.15 + n * 0.13 + 0.1, y, 0.5, 0.3, str(n), size=10, font=MONO, color=MUTED)
    rect(s, 8.4, 2.5, 0.012, 3.3, fill=RULE)
    tb(s, 8.8, 2.2, 3.7, 0.28, '数据库集合（11）', size=11, color=MUTED)
    tb(s, 8.8, 2.5, 3.7, 3.6,
       'users　goods　orders\nchats　messages　reads\nfavorites　bans　violations\nwhitelist　admins',
       size=11.5, font=MONO, color=BODY, line=2.1)
    rect(s, 0.9, 6.35, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.55, 11.5, 0.3,
       '任意一条写请求：页面 → services → utils/api → 云函数鉴权 → 集合', size=11, color=MUTED)
    notes(s, '30 秒：给一个全局印象，说明页面不是各写各的。')

    # 8 代码页：唯一出口
    s = base(prs, '02 / 代码', '客户端只有一处碰网络', 8)
    code_window(s, 0.9, 2.15, 7.5, [
        'function call(action, payload = {}) {',
        '  return new Promise((resolve, reject) => {',
        '    wx.cloud.callFunction({',
        '      name: "api",',
        '      data: { action, payload },',
        '      success(res) {',
        '        const r = res && res.result;',
        '        if (r && r.ok) resolve(r.data);',
        '        else reject({ code: r.code, message: r.message });',
        '      }',
        '    });',
        '  });',
        '}',
    ], 'utils/api.js')
    tb(s, 8.85, 2.25, 3.6, 0.3, '为什么只留一个出口', size=11, color=MUTED)
    rect(s, 8.85, 2.6, 0.55, 0.028, fill=GREEN)
    tb(s, 8.85, 2.88, 3.6, 3.4,
       '服务端统一返回\n{ ok, data } / { ok:false, code }\n\n'
       '拆包只发生一次，\n「错误码 → 提示文案」\n只需维护一份。\n\n'
       '新增接口不用重写错误处理。', size=12, color=BODY, line=1.8)
    notes(s, '35 秒：这是全项目最窄的接缝。')

    # 9 代码页：安全边界
    s = base(prs, '02 / 代码', '身份只信微信，不信客户端', 9)
    code_window(s, 0.9, 2.15, 6.6, [
        'const me = async (openid) => {',
        '  const user = await userByOpenid(openid);',
        '  assert(user, "NOT_LOGGED_IN");',
        '  if (user.status === "deleted") fail(...);',
        '  const ban = await findOne("bans", { sid: user.sid });',
        '  if (ban) fail("BANNED");',
        '  return user;',
        '};',
    ], 'cloudfunctions/api/lib.js')
    code_window(s, 7.75, 2.15, 4.68, [
        '{',
        '  "read": "doc.openidA == auth.openid"',
        '        " || doc.openidB == auth.openid",',
        '  "write": false',
        '}',
    ], '数据库安全规则 · messages')
    tb(s, 0.9, 5.45, 11.5, 1.2,
       'openid 只从 getWXContext() 取，payload 里传什么都不看。封禁检查写在 me() 里，'
       '所有需要登录的接口自动获得拦截，不必逐个 action 重复写。', size=12, color=BODY, line=1.8)
    notes(s, '40 秒：左边是入口，右边是最后一道闸。')

    # 10 SECTION 03
    s = section(prs, '03', '一个真实的线上故障', '同一个卖家，两个聊天框，消息发不出去',
                ['现象', '排查', '根因', '修复'], 10)
    notes(s, '转场 10 秒：接下来讲我们真正栽过的坑。')

    # 11 现象
    s = base(prs, '03 / 现象', '同一个卖家，却有两个聊天框', 11)
    rect(s, 0.9, 2.2, 5.35, 3.85, fill=CANVAS)
    for i, (nm, tag, color, gname) in enumerate([('裴同学', '正常', GREEN, '正宗青岛鲜啤'),
                                                 ('卖家', '对手方查不到', ORANGE, '烟台冰淇淋')]):
        y = 2.55 + i * 1.5
        rect(s, 1.2, y, 4.75, 1.15, fill=WHITE, line=RULE, lw=1)
        rect(s, 1.42, y + 0.26, 0.62, 0.62, fill=CANVAS, shape=MSO_SHAPE.OVAL, line=RULE, lw=1)
        tb(s, 1.42, y + 0.36, 0.62, 0.4, '裴' if i == 0 else '?', size=14, color=MUTED,
           align=PP_ALIGN.CENTER)
        tb(s, 2.2, y + 0.24, 2.4, 0.3, nm, size=13, bold=True)
        tb(s, 2.2, y + 0.62, 3.3, 0.3, '关于：' + gname, size=10, color=MUTED)
        rect(s, 4.35, y + 0.24, 1.38, 0.3, fill=WHITE, line=color, lw=1,
             shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        tb(s, 4.35, y + 0.29, 1.38, 0.24, tag, size=8.5, color=color, align=PP_ALIGN.CENTER)
    tb(s, 0.9, 6.2, 5.35, 0.3, '同一对用户，库里两条会话记录', size=10, color=MUTED,
       align=PP_ALIGN.CENTER)
    tb(s, 6.75, 2.28, 5.6, 0.3, '三个同时出现的现象', size=11, color=MUTED)
    rect(s, 6.75, 2.6, 0.55, 0.028, fill=GREEN)
    items = [('同一个卖家，点两次不同商品', '进了两个不同的聊天窗口，历史消息被切开。'),
             ('其中一个对手方显示「卖家」', '头像永远是默认图标，改名换头像都不生效。'),
             ('管理员收不到别人的消息', '发出去的消息对方看不到，对方发的他也收不到。')]
    for i, (h, d) in enumerate(items):
        y = 2.9 + i * 1.12
        tb(s, 6.75, y, 5.6, 0.32, h, size=14, bold=True)
        tb(s, 6.75, y + 0.38, 5.6, 0.5, d, size=11.5, color=BODY, line=1.6)
    notes(s, '45 秒：只讲现象，不给结论。')

    # 12 代码页：根因
    s = base(prs, '03 / 根因', '学号被写进了 openid 字段', 12)
    code_window(s, 0.9, 2.15, 8.0, [
        'chats.openidA      = "000000003"   // 学号，不是 openid',
        'goods.sellerOpenid = "000000000"   // 同样是学号',
        'users 按 openid 查  ->  null',
        '昵称回退成字面量「卖家」  // 头像也一起丢了',
    ], '数据库真实数据（已脱敏）')
    tb(s, 9.3, 2.25, 3.15, 0.3, '怎么查出来的', size=11, color=MUTED)
    tb(s, 9.3, 2.62, 3.15, 3.4,
       '1  写只读自检接口\n    只返回本人数据\n\n2  两个账号各跑一次\n    对比 chats/users/goods\n\n3  sid 反查 users\n    发现「卖家」是同班同学',
       size=11, color=BODY, line=1.8)
    rect(s, 0.9, 4.55, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 4.8, 11.5, 1.2,
       '真实 openid 形如 obfA_3VuO7m9tS-…，永远不会是纯数字。历史代码把 sid 直接写进了 openid 字段，'
       '会话的「对手方」指向了一个不存在的用户——\n一条会话没有主人，消息写进去，谁都收不到。',
       size=12.5, color=BODY, line=1.85)
    notes(s, '50 秒：全场核心。强调不是权限问题，是数据问题。')

    # 13 代码页：方案
    s = base(prs, '03 / 方案', '一对用户，只能有一条会话', 13)
    code_window(s, 0.9, 2.15, 7.4, [
        'const pairKeyOf = (a, b) => {',
        '  const [x, y] = a < b ? [a, b] : [b, a];',
        '  return "c_" + md5(x + "|" + y).slice(0, 24);',
        '};',
        '',
        'const chatId = pairKeyOf(openid, good.sellerOpenid);',
        'let chat = await getChat(chatId);',
        '// 同 _id 的 add 会被数据库直接拒绝',
    ], 'cloudfunctions/api/actions/chat.js')
    pts = [('确定性主键', '会话 id 由两个 openid 算出，写死在服务端。'),
           ('主键即约束', '并发也造不出第二条，不依赖「先查后插」。'),
           ('商品降级为上下文', 'goodId 不再进主键，改为 currentGoodId。')]
    for i, (h, d) in enumerate(pts):
        y = 2.3 + i * 1.05
        rect(s, 8.6, y + 0.06, 0.05, 0.42, fill=GREEN)
        tb(s, 8.85, y, 3.6, 0.3, h, size=12.5, bold=True)
        tb(s, 8.85, y + 0.34, 3.6, 0.5, d, size=11, color=BODY, line=1.6)
    tb(s, 0.9, 5.35, 7.4, 0.9,
       '迁移脚本先预演再执行；旧会话只打 mergedInto 标记，消息一条不删。', size=11.5,
       color=MUTED, line=1.7)
    notes(s, '45 秒："主键即约束"是最值得讲的——把约定变成数据库层的保证。')

    # 14 效果
    s = base(prs, '03 / 效果', '数据对得上，才叫修好了', 14)
    nums = [('12', '条消息', '迁移前后一条不少'), ('4', '条会话', '碎片会话合并为正本'),
            ('1', '条消息', '此前双方都看不到，被找回')]
    for i, (n, u, d) in enumerate(nums):
        x = 0.9 + i * 3.9
        tb(s, x, 2.15, 3.5, 0.9, n, size=44, bold=True, color=GREEN, font=MONO)
        tb(s, x + 0.06, 3.1, 3.5, 0.3, u, size=12, color=MUTED)
        rect(s, x, 3.45, 0.55, 0.028, fill=RULE)
        tb(s, x, 3.66, 3.5, 0.6, d, size=11.5, color=BODY, line=1.5)
    rect(s, 0.9, 4.52, 11.53, 0.011, fill=RULE)
    shot(s, '01-message.png', 0.9, 4.85, 5.5, 1.55, '修复后：一个卖家一条会话')
    shot(s, '03-timeline.png', 6.93, 4.85, 5.5, 1.55, '同一窗口内切换商品，时间线自动分段')
    notes(s, '40 秒：用数字收尾。12 = 7 + 2 + 3，逐条核对过归属。')

    # 15 测试与质量
    s = base(prs, '04 / 质量', '42 条用例，6 个缺陷，2 个严重', 15)
    tb(s, 0.9, 2.2, 6.6, 0.3, '用例分布', size=11, color=MUTED)
    bars = [('聊天', 10), ('商品', 7), ('管理员', 7), ('登录认证', 6), ('交易', 5), ('头像', 4),
            ('安全', 3)]
    for i, (name, n) in enumerate(bars):
        y = 2.62 + i * 0.52
        tb(s, 0.9, y, 1.4, 0.3, name, size=10.5)
        rect(s, 2.4, y + 0.05, n * 0.28, 0.24,
             fill=GREEN if n >= 7 else RGBColor(0x8F, 0xD8, 0xC0))
        tb(s, 2.4 + n * 0.28 + 0.12, y, 0.6, 0.3, str(n), size=10.5, font=MONO, color=MUTED)
    rect(s, 6.95, 2.2, 0.011, 3.7, fill=RULE)
    tb(s, 7.25, 2.2, 5.2, 0.3, '6 个缺陷全部定位到根因', size=11, color=MUTED)
    bugs = [('BUG-01', '严重', '管理员收不到消息', ORANGE),
            ('BUG-03', '严重', '同一卖家两个聊天框', ORANGE),
            ('BUG-05', '中', '键盘把顶部商品条顶走', MUTED),
            ('BUG-02', '中', '看不到别人换的头像', MUTED),
            ('BUG-04', '轻', '空会话占位', MUTED),
            ('BUG-06', '轻', '切商品无时间线提示', MUTED)]
    for i, (bid, sev, d, c) in enumerate(bugs):
        y = 2.6 + i * 0.55
        tb(s, 7.25, y, 0.95, 0.3, bid, size=9.5, font=MONO, color=MUTED)
        rect(s, 8.28, y + 0.04, 0.6, 0.26, fill=WHITE, line=c, lw=1,
             shape=MSO_SHAPE.ROUNDED_RECTANGLE)
        tb(s, 8.28, y + 0.07, 0.6, 0.22, sev, size=8, color=c, align=PP_ALIGN.CENTER)
        tb(s, 9.05, y, 3.4, 0.3, d, size=11)
    rect(s, 0.9, 6.2, 11.53, 0.011, fill=RULE)
    tb(s, 0.9, 6.42, 11.5, 0.35,
       '另附 3 个自研静态检查脚本：页面四件套引用 · WXML 绑定 ↔ 页面方法 · 纯逻辑冒烟（10 例）',
       size=11, color=MUTED)
    notes(s, '35 秒：两个严重缺陷都在数据模型层。')

    # 16 数字墙
    s = prs.slides.add_slide(prs.slide_layouts[6])
    rect(s, 0, 0, 13.334, 7.5, fill=DARK)
    dots(s, 0.55, 5.65, 20, 5, 0.24, RGBColor(0x1E, 0x25, 0x2F))
    tb(s, 0.9, 0.85, 8, 0.3, '05 / 收尾', size=10.5, color=DARK_MUTED)
    tb(s, 0.9, 1.2, 11.5, 0.7, '这个项目的六个数字', size=30, bold=True, color=DARK_TEXT)
    rect(s, 0.9, 2.05, 0.5, 0.035, fill=DARK_GREEN)
    wall = [('38', '云函数接口'), ('15', '页面'), ('11', '数据库集合'),
            ('42', '测试用例'), ('6', '已修缺陷'), ('12', '消息一条不少')]
    for i, (n, label) in enumerate(wall):
        col, row = i % 3, i // 3
        x = 0.9 + col * 3.9
        y = 2.55 + row * 2.05
        tb(s, x, y, 2.6, 1.0, n, size=72, bold=True, color=DARK_GREEN, font=MONO, line=1.0)
        tb(s, x + 0.05, y + 1.05, 3.0, 0.3, label, size=13, color=DARK_MUTED)
        rect(s, x, y + 1.48, 2.2, 0.012, fill=RGBColor(0x2A, 0x32, 0x3D))
    rect(s, 0.9, 6.55, 11.53, 0.011, fill=RGBColor(0x2A, 0x32, 0x3D))
    tb(s, 0.9, 6.78, 5, 0.4, 'Q & A', size=22, bold=True, color=DARK_TEXT)
    tb(s, 5.0, 6.9, 7.4, 0.3, 'github.com/Zion-17/xiaoyuanershou', size=10.5,
       color=DARK_MUTED, align=PP_ALIGN.RIGHT)
    notes(s, '30 秒收尾：六个数字铺满，然后停下来等提问。')

    prs.save(OUT)
    print('saved:', OUT)


if __name__ == '__main__':
    build()
