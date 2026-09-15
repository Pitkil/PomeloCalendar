# 单页面网页版

直接打开 `index.html` 或运行 `python -m http.server 8080`。

课表流程：办事大厅 → 教务系统 → 我的课表 → 导出 PDF → 上传。网页将 PDF 发送给智能解析服务，由大模型返回标准课程 JSON；不保留 CSV、JSON、文本或规则解析兜底。

先部署 `../3-智能课表解析服务`，然后在“日历设置”填入完整接口地址，例如 `https://your-service.example.com/api/schedule/parse`。API 密钥只应保存在服务端 `.env`。
