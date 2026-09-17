# 柚课日历单页面网页版

直接打开 `index.html` 或运行 `python -m http.server 8080`。

课表流程：学校教务系统 → 我的课表 → 导出 PDF → 上传。网页将 PDF 和学校名称发送给智能解析服务，由大模型返回标准课程 JSON。支持周课表网格、具体时间列表和日期清单；学校入口和节次时间可在设置中修改。

先部署 `../../services/schedule-parser`，然后在“日历设置”填入完整接口地址，例如 `https://your-service.example.com/api/schedule/parse`。API 密钥只应保存在服务端 `.env`。
