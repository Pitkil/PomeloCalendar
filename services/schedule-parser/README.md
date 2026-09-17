# 智能课表解析服务

服务提取不同高校教务系统的 PDF 文本并调用 OpenAI 兼容大模型接口，返回标准课程 JSON。支持周课表网格、具体时间列表和日期清单，没有本地规则解析或导入兜底。

- 网页版使用 `POST /api/schedule/parse` 同步上传。
- 小程序读取 PDF 后通过 `POST /api/schedule/jobs-base64` 创建异步任务，并用 `GET /api/schedule/jobs/:jobId` 查询结果；不再依赖云存储上传链路。
- 异步任务保存在云数据库集合 `schedule_parse_jobs`，任务完成或失败后会清空临时 PDF 内容。
- 任务接口只接受微信云托管注入了 `x-wx-openid` 的小程序请求。

复制 `.env.example` 为 `.env` 后填入自己的密钥，再执行：

```bash
npm install
npm start
```

运行 `npm test` 可验证传统节次课表、明确起止时间课表、日期清单和模型重试格式的结构化兼容性。

本地网页接口为 `http://127.0.0.1:8788/api/schedule/parse`。小程序任务接口需部署在关联的微信云托管环境中，服务会使用当前环境的云存储和云数据库。`.env` 已被 Git 忽略，不能提交。
