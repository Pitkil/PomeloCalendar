# 智能课表解析服务

网页和小程序把教务系统导出的 PDF 上传到 `POST /api/schedule/parse`；服务提取 PDF 文本并调用 OpenAI 兼容大模型接口，返回标准课程 JSON。没有本地规则解析或导入兜底。

复制 `.env.example` 为 `.env` 后填入自己的密钥，再执行：

```bash
npm install
npm start
```

本地地址为 `http://127.0.0.1:8788/api/schedule/parse`。部署后，将公网完整接口地址填入网页/小程序的“智能课表解析服务地址”。`.env` 已被 Git 忽略，不能提交。
