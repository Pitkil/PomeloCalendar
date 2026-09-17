const { extractPdfText } = require('./pdf-engine.js')

const SELECTED_FILE = 'youke-selected-schedule-file'
const EXTRACTED_FILE = 'youke-extracted-schedule-file'

Page({
  async onLoad() {
    const file = wx.getStorageSync(SELECTED_FILE)
    try {
      if (!file || !file.path) throw new Error('没有找到待读取的 PDF，请返回后重新选择')
      const result = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
        filePath: file.path,
        success: resolve,
        fail: reject
      }))
      const text = await extractPdfText(result.data)
      if (String(text || '').trim().length < 20) {
        throw new Error('PDF 中没有可提取的文字；扫描版或图片版课表请先用 OCR 转为文字版 PDF')
      }
      wx.setStorageSync(EXTRACTED_FILE, { text, fileName: file.name, createdAt: Date.now() })
      wx.removeStorageSync(SELECTED_FILE)
      wx.navigateBack()
    } catch (error) {
      wx.removeStorageSync(SELECTED_FILE)
      wx.showModal({
        title: 'PDF 读取失败',
        content: error && error.message ? error.message : '无法读取这个 PDF 文件',
        showCancel: false,
        complete: () => wx.navigateBack()
      })
    }
  }
})
