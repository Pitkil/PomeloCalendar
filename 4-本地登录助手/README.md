# 本地登录助手

这是西柚日历的备用课表获取方式。它借鉴了公开项目 `awymp3/swu-schedule-export` 的可行做法：在用户自己的 Chrome 中登录西南大学，完成验证码/滑块后读取课表页面 DOM。

## 使用

在项目根目录运行：

```bash
python -m pip install playwright
python -m playwright install chromium
python 4-本地登录助手/capture_swu.py
```

程序会打开临时浏览器窗口。请手动登录并进入“我的课表”，确认课表完整显示后回到终端按回车。程序会生成 `2-网页版源码/captured-swu.json`，回到西柚日历的“同步课表 → 手动登录后导入”选择这个文件。

账号、密码、Cookie 只存在于本次浏览器会话，不写入文件，也不会上传到云端后端。抓取完成后按回车关闭浏览器。

## 注意

- 校外访问教务系统可能需要校园网或学校允许的网络环境。
- 请不要把 `captured-swu.json` 提交到 Git；该文件可能包含你的课程安排。
- 该助手不能在微信小程序内部运行，生成 JSON 后可导入网页版，再通过备份/同步功能迁移日历数据。
