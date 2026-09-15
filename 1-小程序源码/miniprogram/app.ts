App({
  onLaunch() {
    wx.cloud.init({
      env: 'cloud1-d4gevz3o6da314ea9',
      traceUser: true
    })
  },
  globalData: {
    appName: '西柚日历'
  }
})
