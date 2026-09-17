const { extractOfficeText } = require('./office-engine.js')

const SELECTED_FILE = 'youke-selected-schedule-file'
const EXTRACTED_FILE = 'youke-extracted-schedule-file'

Page({
  async onLoad() {
    const file = wx.getStorageSync(SELECTED_FILE)
    try {
      if (!file || !file.path) throw new Error('没有找到待读取的课表文件，请返回后重新选择')
      const result = await new Promise((resolve, reject) => wx.getFileSystemManager().readFile({
        filePath: file.path,
        success: resolve,
        fail: reject
      }))
      const text = extractOfficeText(result.data, file.extension)
      if (String(text || '').trim().length < 20) throw new Error('文件中没有找到足够的课表文字')
      wx.setStorageSync(EXTRACTED_FILE, { text, fileName: file.name, createdAt: Date.now() })
      wx.removeStorageSync(SELECTED_FILE)
      wx.navigateBack()
    } catch (error) {
      wx.removeStorageSync(SELECTED_FILE)
      wx.showModal({
        title: '文件读取失败',
        content: error && error.message ? error.message : '无法读取这个课表文件',
        showCancel: false,
        complete: () => wx.navigateBack()
      })
    }
  }
})
