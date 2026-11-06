# -*- coding: utf-8 -*-
"""基于 ppt模板.pptx 生成《校园闲转》项目汇报 PPT（12 页）。

用法：python docs/ppt/make_deck_v2.py
产出：docs/ppt/校园闲转-项目汇报.pptx（脱敏版，覆盖；姓名为“同学 A–D”）
"""
import copy
import os

from pptx import Presentation
from pptx.dml.color import RGBColor
from pptx.enum.dml import MSO_LINE_DASH_STYLE
from pptx.enum.shapes import MSO_SHAPE
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.oxml.ns import qn
from pptx.util import Emu, Inches, Pt

HERE = os.path.dirname(os.path.abspath(__file__))
TPL = os.path.join(HERE, 'ppt模板.pptx')
OUT = os.path.join(HERE, '校园闲转-项目汇报.pptx')

INK = RGBColor(0xFF, 0xFF, 0xFF)
MUTED = RGBColor(0xA9, 0xB2, 0xD6)
ACCENT = RGBColor(0x8A, 0x8A, 0xFF)
PANEL = RGBColor(0x0E, 0x14, 0x33)


# ---------- 复制 / 排序 ----------

def duplicate(prs, src_idx):
    src = prs.slides[src_idx]
    dest = prs.slides.add_slide(src.slide_layout)
    for sh in list(dest.shapes):
        sh._element.getparent().remove(sh._element)
    tree = dest.shapes._spTree
    for sh in src.shapes:
        tree.append(copy.deepcopy(sh._element))
    # 源页的 <p:tags r:id> / 超链接指向本页 rels 里才有的部件，复制页没有，
    # 留着会让 PowerPoint 判定文件损坏
    for tag in ('a:custDataLst', 'p:custDataLst', 'a:hlinkClick'):
        for el in tree.iter(qn(tag)):
            el.getparent().remove(el)
    for el in tree.iter():
        if el.get(qn('r:embed')) or el.get(qn('r:link')):
            el.getparent().remove(el)
    return dest


def arrange(prs, order):
    lst = prs.slides._sldIdLst
    items = list(lst)
    final = [items[i] for i in order]
    keep = {id(x) for x in final}
    for it in items:
        if id(it) not in keep:
            prs.part.drop_rel(it.get(qn('r:id')))
            lst.remove(it)
    for it in final:
        lst.remove(it)
    for it in final:
        lst.append(it)


# ---------- 文本 ----------

def _clone_para(para):
    from pptx.text.text import _Paragraph
    new = copy.deepcopy(para._p)
    para._p.getparent().append(new)
    return _Paragraph(new, para._parent)


def fill(shape, lines):
    """按段落替换文字，保留原有字号/颜色/字体，只换内容。"""
    if not shape.has_text_frame:
        return
    tf = shape.text_frame
    paras = list(tf.paragraphs)
    while len(paras) < len(lines):
        paras.append(_clone_para(paras[-1]))
    while len(paras) > len(lines):
        p = paras.pop()
        p._p.getparent().remove(p._p)
    for p, text in zip(paras, lines):
        runs = p.runs
        if runs:
            runs[0].text = text
            for r in runs[1:]:
                r._r.getparent().remove(r._r)
        else:
            p.add_run().text = text


# ---------- 自制形状 ----------

def set_alpha(color_format, pct):
    xfill = color_format._xFill
    srgb = xfill.find(qn('a:srgbClr'))
    srgb.append(srgb.makeelement(qn('a:alpha'), {'val': str(int(pct * 1000))}))


def panel(slide, x, y, w, h, fill_color=PANEL, alpha=55, dashed=False, radius=0.05):
    sh = slide.shapes.add_shape(MSO_SHAPE.ROUNDED_RECTANGLE,
                                Inches(x), Inches(y), Inches(w), Inches(h))
    sh.adjustments[0] = radius
    sh.fill.solid()
    sh.fill.fore_color.rgb = fill_color
    set_alpha(sh.fill.fore_color, alpha)
    sh.line.color.rgb = ACCENT if dashed else RGBColor(0x33, 0x3B, 0x66)
    sh.line.width = Pt(1 if dashed else 0.75)
    if dashed:
        sh.line.dash_style = MSO_LINE_DASH_STYLE.DASH
    sh.shadow.inherit = False
    sh.text_frame.word_wrap = True
    return sh


def textbox(slide, x, y, w, h, lines, size=12, color=INK, bold=False,
            font='微软雅黑', align=PP_ALIGN.LEFT, spacing=1.15):
    tb = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    for i, line in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = spacing
        r = p.add_run()
        r.text = line
        r.font.size = Pt(size)
        r.font.bold = bold
        r.font.color.rgb = color
        r.font.name = font
        r._r.get_or_add_rPr().append(
            r._r.get_or_add_rPr().makeelement(qn('a:ea'), {'typeface': font}))
    return tb


def code_block(slide, x, y, w, title, lines, size=9.6):
    pad = 0.16
    h = 0.48 + len(lines) * (size * 1.7 / 72.0)
    panel(slide, x, y, w, h, PANEL, 70)
    textbox(slide, x + pad, y + 0.12, w - 2 * pad, 0.28, [title],
            size=9.5, color=ACCENT, bold=True)
    textbox(slide, x + pad, y + 0.46, w - 2 * pad, h - 0.54,
            lines, size=size, color=RGBColor(0xD8, 0xDE, 0xF0),
            font='Consolas', spacing=1.2)
    return h


def strip_body(slide):
    """删掉版式里的装饰内容，只保留背景、标题、logo。"""
    for sh in list(slide.shapes):
        try:
            top = Emu(sh.top).inches
            left = Emu(sh.left).inches
        except TypeError:
            continue
        keep = top < 1.5 or top > 6.2 or (left == 0 and top == 0)
        if not keep:
            sh._element.getparent().remove(sh._element)


# ---------- 内容 ----------

def build():
    prs = Presentation(TPL)
    duplicate(prs, 9)    # → 20：代码页
    duplicate(prs, 9)    # → 21：案例页
    arrange(prs, [0, 1, 9, 8, 10, 3, 17, 14, 6, 20, 21, 19])
    s = prs.slides

    # ---- P1 封面 ----
    p = s[0]
    fill(p.shapes[9], ['校园闲置二手交易平台　Campus Second-hand Trading'])
    fill(p.shapes[12], ['2026', '校园闲转'])
    fill(p.shapes[15], ['课程设计小组'])
    fill(p.shapes[17], ['微信小程序 · 云开发'])

    # ---- P2 目录 ----
    p = s[1]
    for idx, txt in {7: '背景与痛点', 11: '分工与功能',
                     15: '方案与实现', 19: '演示与总结'}.items():
        fill(p.shapes[idx], [txt])
    for idx, txt in {9: 'Background & Pain Points', 13: 'Team & Features',
                     17: 'Solution & Implementation', 21: 'Demo & Summary'}.items():
        fill(p.shapes[idx], [txt])

    # ---- P3 项目背景与行业现状（四列）----
    p = s[2]
    fill(p.shapes[1], ['校园二手现状'])
    fill(p.shapes[2], ['Where it gets stuck'])
    cols = [
        ((20, 24, 10), ['班级微信群', '信息淹没'],
         ['群里翻找', '信息被聊天淹没，', '卖掉了也没人删']),
        ((22, 26, 33), ['校园墙 / 贴吧', '匿名发帖'],
         ['无信用', '看不出对方是谁，', '放鸽子无从追责']),
        ((21, 25, 34), ['闲鱼等平台', '同城不同校'],
         ['绕远', '本可当面自提，', '却要走全城邮寄']),
        ((23, 27, 35), ['我们的切入口', '同校实名'],
         ['就在校内', '实名 + 站内沟通', '+ 订单留痕']),
    ]
    for idxs, titles, body in cols:
        fill(p.shapes[idxs[0]], [titles[0]])
        fill(p.shapes[idxs[1]], [titles[1]])
        fill(p.shapes[idxs[2]], body)

    # ---- P4 痛点（V 形）----
    p = s[3]
    fill(p.shapes[1], ['三个堵点'])
    fill(p.shapes[2], ['Three pain points'])
    pains = [
        ((22, 23), ['信息散'],
         ['商品散落在几十个群和楼下贴纸里，', '想找一件东西得翻半天聊天记录。']),
        ((24, 25), ['没信用'],
         ['匿名交易看不出对方是谁，', '被放鸽子、被临时压价只能自认倒霉。']),
        ((26, 27), ['没留痕'],
         ['价格、时间、地点全在聊天里，', '事后没有任何可以追溯的凭据。']),
        ((28, 29), ['我们的答案'],
         ['把校内实名、站内沟通、订单留痕收进一个小程序。']),
    ]
    for idxs, head, body in pains:
        fill(p.shapes[idxs[0]], head)
        box = p.shapes[idxs[1]]
        fill(box, body)
        # 模板正文框只有 0.29 吋且垂直居中，两行会顶到上面的标题
        box.text_frame.vertical_anchor = MSO_ANCHOR.TOP
        box.height = Inches(0.2 + 0.28 * len(body))

    # ---- P5 分工（大数字）----
    p = s[4]
    fill(p.shapes[1], ['四个人，四条线'])
    fill(p.shapes[2], ['Team & responsibility'])
    team = [
        ((10, 11), '同学 A　·　小程序前端', ['15 个页面的渲染与交互：首页、分类、搜索、详情、发布']),
        ((17, 18), '同学 B　·　云函数后端', ['38 个 action 的鉴权、业务校验与写库']),
        ((24, 25), '同学 C　·　数据与会话', ['会话唯一性、实时订阅合并、历史数据迁移']),
        ((31, 32), '同学 D　·　测试与文档', ['42 条测试用例、缺陷跟踪、文档与答辩材料']),
    ]
    for idxs, head, body in team:
        fill(p.shapes[idxs[0]], [head])
        fill(p.shapes[idxs[1]], body)

    # ---- P6 程序功能介绍（五节点）----
    p = s[5]
    fill(p.shapes[2], ['六个功能模块'])
    fill(p.shapes[3], ['Six modules'])
    mods = [
        ((26, 27), '身份认证', ['学号白名单注册', 'openid 绑定与免密登录']),
        ((28, 29), '商品', ['发布 / 编辑 / 下架', '我的发布管理']),
        ((30, 31), '浏览检索', ['首页分页、分类筛选', '关键词搜索']),
        ((32, 33), '站内沟通', ['会话按对手方唯一', '带商品上下文的聊天']),
        ((34, 35), '交易', ['收藏、下单锁库存', '订单流转与互评']),
    ]
    for idxs, head, body in mods:
        fill(p.shapes[idxs[0]], [head])
        fill(p.shapes[idxs[1]], body)

    # ---- P7 研发经历（时间线）----
    p = s[6]
    fill(p.shapes[1], ['研发经历'])
    fill(p.shapes[2], ['Development timeline'])
    # 时间线五个节点：标题盒 24/22/25/23/26，说明盒 28/27/29/32/30
    stages = [(24, 28, ['需求梳理'], ['群聊潜水', '访谈需求']),
              (22, 27, ['方案设计'], ['四层架构', '11 个集合']),
              (25, 29, ['迭代开发'], ['15 个页面', '38 个接口']),
              (23, 32, ['缺陷修复'], ['42 条用例', '7 个缺陷']),
              (26, 30, ['迁移收尾'], ['数据幂等', '材料定稿'])]
    for t_idx, n_idx, head, note in stages:
        fill(p.shapes[t_idx], head)
        fill(p.shapes[n_idx], note)

    # ---- P8 解决方案（中心圆）----
    p = s[7]
    fill(p.shapes[1], ['四个约束'])
    fill(p.shapes[2], ['Four constraints'])
    rules = [
        ((10, 11), ['客户端不碰数据库'], ['所有读写走云函数，', '安全规则对客户端全关']),
        ((12, 13), ['身份只信微信'], ['openid 由云端下发，', '学号白名单绑定']),
        ((14, 15), ['会话按对手方唯一'], ['主键由两个 openid', '排序哈希，并发不重复']),
        ((16, 17), ['迁移默认只读'], ['先预演再执行，', '软合并打墓碑，幂等']),
    ]
    for idxs, head, body in rules:
        fill(p.shapes[idxs[0]], head)
        fill(p.shapes[idxs[1]], body)

    # ---- P9 方案展示（圆环四步）----
    p = s[8]
    fill(p.shapes[1], ['四层架构'])
    fill(p.shapes[2], ['Four layers'])
    layers = [
        ((6, 7), ['页面层'], ['15 个页面，只做渲染与交互']),
        ((8, 9), ['服务层'], ['services/* + api.js，唯一出口']),
        ((10, 11), ['云函数'], ['38 个 action，鉴权 / 校验 / 写库']),
        ((12, 13), ['数据层'], ['11 个集合，客户端读写关闭']),
    ]
    for idxs, head, body in layers:
        fill(p.shapes[idxs[0]], head)
        fill(p.shapes[idxs[1]], body)

    # ---- P10 设计与实现（代码页）----
    p = s[9]
    strip_body(p)
    fill(p.shapes[1], ['关键实现'])
    fill(p.shapes[2], ['Implementation highlights'])
    textbox(p, 0.95, 1.58, 11.6, 0.35,
            ['代码全部在云函数里收口，客户端只负责渲染。下面两段是整个系统里'
             '「一旦改错就会出数据事故」的地方。'], size=13, color=MUTED)

    code_block(p, 0.95, 2.12, 5.75, 'utils/api.js — 小程序端唯一的网络出口', [
        'function call(action, payload = {}) {',
        '  return new Promise((resolve, reject) => {',
        '    wx.cloud.callFunction({ name: "api",',
        '      data: { action, payload },',
        '      success(res) {',
        '        const r = res && res.result;',
        '        if (r && r.ok) resolve(r.data);',
        '        else reject({ code: r.code,',
        '                      message: r.message });',
        '      }, fail: reject });',
        '  });',
        '}',
    ])
    code_block(p, 6.95, 2.12, 5.45, 'cloudfunctions/api/lib.js — 身份闸门', [
        'const me = async (openid) => {',
        '  const user = await userByOpenid(openid);',
        '  assert(user, "NOT_LOGGED_IN");',
        '  if (user.status === "deleted") fail(...);',
        '  const ban = await findOne("bans",',
        '                              { sid: user.sid });',
        '  if (ban) fail("BANNED");',
        '  return user;',
        '};',
    ])

    panel(p, 0.95, 5.2, 11.45, 1.12)
    textbox(p, 1.22, 5.3, 5.2, 0.3, ['为什么只留一个出口'], size=13, color=ACCENT, bold=True)
    textbox(p, 1.22, 5.62, 5.2, 0.7, [
        '15 个页面、6 个 service 全部收敛到 call()',
        '统一拆包 {ok, data} / {ok:false, code, message}',
    ], size=11, color=MUTED)
    textbox(p, 6.85, 5.3, 5.3, 0.3, ['为什么身份必须在服务端判'], size=13, color=ACCENT, bold=True)
    textbox(p, 6.85, 5.62, 5.3, 0.7, [
        '只认 cloud.getWXContext() 下发的 OPENID',
        '封禁、注销在入口统一拦截，业务代码无需重复判',
    ], size=11, color=MUTED)

    # ---- P11 举例（真实故障 + 截图位）----
    p = s[10]
    strip_body(p)
    fill(p.shapes[1], ['真实故障复盘'])
    fill(p.shapes[2], ['A real bug'])
    textbox(p, 0.95, 1.58, 7.0, 0.6,
            ['同一对用户，库里却有两条会话记录，消息被切成两半、双方互相收不到。'
             '这个问题是从 42 条用例里跑出来的。'], size=12, color=MUTED)

    steps = [
        ('现象', ['同一个卖家点两次不同商品，进了两个聊天窗口；',
                  '其中一个对手方显示成「卖家」，头像永远是默认图标。']),
        ('根因', ['早期把 goodId 也放进了会话主键，同卖家每商品一条会话；',
                  '历史数据里还把学号误写进了 openid 字段。']),
        ('修复', ['会话主键改为两个 openid 排序后哈希，商品降级为会话内上下文；',
                  '迁移脚本修正污染字段，碎片会话软合并成一条。']),
    ]
    y = 2.35
    for head, lines in steps:
        panel(p, 0.95, y, 6.35, 1.25, PANEL, 55)
        textbox(p, 1.2, y + 0.47, 0.8, 0.3, [head], size=13, color=ACCENT, bold=True)
        textbox(p, 2.05, y + 0.24, 5.0, 0.9, lines, size=11, color=MUTED)
        y += 1.4

    panel(p, 7.7, 2.35, 4.7, 1.95, PANEL, 28, dashed=True)
    textbox(p, 7.7, 3.15, 4.7, 0.6,
            ['截图位：修复后的消息列表', '一个卖家，只剩一条会话'],
            size=12, color=MUTED, align=PP_ALIGN.CENTER)
    panel(p, 7.7, 4.5, 4.7, 1.95, PANEL, 28, dashed=True)
    textbox(p, 7.7, 5.2, 4.7, 0.6,
            ['截图位：聊天窗口内切换商品', '时间线自动分段'],
            size=12, color=MUTED, align=PP_ALIGN.CENTER)

    # ---- P12 结尾 ----
    p = s[11]
    fill(p.shapes[9], ['Thanks for watching'])
    fill(p.shapes[16], ['感谢观看'])
    fill(p.shapes[13], ['课程设计小组'])
    fill(p.shapes[15], ['2026.11'])
    textbox(p, 1.5, 5.24, 10.3, 0.4,
            ['15 页面 · 38 接口 · 11 集合 · 42 条用例 · 7 个缺陷 · 消息一条不少'],
            size=13, color=MUTED, align=PP_ALIGN.CENTER)

    prs.save(OUT)
    print('saved:', OUT)


if __name__ == '__main__':
    build()
