// pages/publish/publish.js
const app = getApp();
const goodsSvc = require('../../services/goods');
const guard = require('../../utils/guard');

// 列表返回缩略图、详情返回大图：云函数返回数据约 1MB，20 条大图会超限
const FULL_STEPS = [{ w: 900, q: 0.7 }, { w: 750, q: 0.6 }, { w: 600, q: 0.5 }];
const FULL_MAX = 180 * 1024;
const THUMB_STEPS = [{ w: 360, q: 0.5 }, { w: 300, q: 0.45 }];
const THUMB_MAX = 28 * 1024;
// callFunction 的 data 里大字段临界约 100KB，图片只传 fileID，绝不传 base64
const UPLOAD_HARD_LIMIT = 1.5 * 1024 * 1024;

Page({
  data: {
    imageFileID: '',      // 云存储 fileID（大图），由云函数下载后转 base64 入库
    thumbFileID: '',      // 云存储 fileID（缩略图）
    imageBase64: '',      // 仅用于本地预览（本地临时路径）
    title: '', price: '', originPrice: '',
    categories: [], catNames: [], catIdx: 0,
    conditions: app.globalData.conditions, condIdx: 0,
    locations: ['1号楼', '2号楼', '3号楼', '4号楼', '5号楼', '6号楼', '7号楼', '8号楼', '9号楼', '10号楼', '11号楼', '12号楼'], locIdx: 0,
    desc: ''
  },

  onLoad() {
    if (!guard.requireLogin(this, { isTab: true })) return;
    const cats = app.globalData.categories;
    this.setData({ categories: cats, catNames: cats.map(c => c.name) });
  },

  chooseImg() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async res => {
        const tempPath = res.tempFiles[0].tempFilePath;
        wx.showLoading({ title: '处理图片…' });
        try {
          const fullPath = await this._compressToFile(tempPath, FULL_STEPS, FULL_MAX);
          const thumbPath = await this._compressToFile(tempPath, THUMB_STEPS, THUMB_MAX);
          const [imageFileID, thumbFileID] = await Promise.all([
            this._upload(fullPath, 'goods'),
            this._upload(thumbPath, 'goods-thumb')
          ]);
          // 预览用本地缩略图路径，不回传 base64
          this.setData({ imageFileID, thumbFileID, imageBase64: thumbPath });
          wx.hideLoading();
        } catch (e) {
          wx.hideLoading();
          console.error('图片处理失败', e);
          const msg = (e && e.message === '图片处理失败') ? '图片处理失败，请换一张图片再试' : '图片处理失败，请重试';
          wx.showToast({ title: msg, icon: 'none' });
        }
      }
    });
  },

  // 逐档压缩出临时文件，取第一个达到体积目标的档位
  async _compressToFile(src, steps, maxBytes) {
    let lastPath = '';
    let encoded = false;
    for (const step of steps) {
      try {
        const path = await this._encode(src, step.w, step.q);
        encoded = true;
        lastPath = path;
        if (this._size(path) <= maxBytes) return path;
      } catch (e) {
        console.error('压缩档位失败', step, e);
      }
    }
    if (!encoded) {
      // canvas 不可用：退回原图，但必须挡住超大文件
      if (this._size(src) > UPLOAD_HARD_LIMIT) throw new Error('图片处理失败');
      return src;
    }
    return lastPath;
  },

  _size(path) {
    try { return wx.getFileSystemManager().statSync(path).size || 0; } catch (e) { return 0; }
  },

  _upload(filePath, dir) {
    const ext = /\.png$/i.test(filePath) ? 'png' : 'jpg';
    const cloudPath = `${dir}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    return wx.cloud.uploadFile({ cloudPath, filePath }).then(r => r.fileID);
  },

  _encode(src, w, quality) {
    return new Promise((resolve, reject) => {
      wx.createSelectorQuery().select('#canvas').fields({ node: true, size: true }).exec(r => {
        if (!r || !r[0] || !r[0].node) { reject(new Error('canvas not found')); return; }
        const canvas = r[0].node;
        const img = canvas.createImage();
        img.onload = () => {
          try {
            const h = Math.max(1, Math.round(img.height * (w / img.width)));
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            // 先铺白底：PNG 透明通道转 JPEG 时不会出现黑块
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
            wx.canvasToTempFilePath({
              canvas,
              fileType: 'jpg',
              quality,
              success: res => resolve(res.tempFilePath),
              fail: reject
            });
          } catch (e) { reject(e); }
        };
        img.onerror = () => reject(new Error('image load failed'));
        img.src = src;
      });
    });
  },

  removeImg() { this.setData({ imageFileID: '', thumbFileID: '', imageBase64: '' }); },

  onTitle(e) { this.setData({ title: e.detail.value }); },
  onPrice(e) { this.setData({ price: e.detail.value }); },
  onOrigin(e) { this.setData({ originPrice: e.detail.value }); },
  setCat(e) { this.setData({ catIdx: +e.detail.value }); },
  setCond(e) { this.setData({ condIdx: +e.detail.value }); },
  setLoc(e) { this.setData({ locIdx: +e.detail.value }); },
  onDesc(e) { this.setData({ desc: e.detail.value }); },

  async submit() {
    if (!guard.requireLogin(this, { isTab: true })) return;
    const { title, price, originPrice, categories, catIdx, conditions, condIdx, locations, locIdx, desc, imageFileID, thumbFileID } = this.data;
    if (!title.trim()) return wx.showToast({ title: '填写标题', icon: 'none' });
    if (!price || isNaN(price) || +price <= 0) return wx.showToast({ title: '填写正确售价', icon: 'none' });

    wx.showLoading({ title: '发布中…' });
    try {
      await goodsSvc.create({
        title: title.trim(),
        price: +price,
        originPrice: +originPrice || 0,
        category: categories[catIdx].id,
        condition: conditions[condIdx],
        imageFileID,
        thumbFileID,
        desc: desc.trim(),
        location: locations[locIdx]
      });
      wx.hideLoading();
      wx.showToast({ title: '发布成功', icon: 'success' });
      this.setData({ title: '', price: '', originPrice: '', desc: '', imageFileID: '', thumbFileID: '', imageBase64: '' });
      setTimeout(() => wx.switchTab({ url: '/pages/index/index' }), 800);
    } catch (e) {
      wx.hideLoading();
      guard.showError(e);
    }
  }
});
