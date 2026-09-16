# 智能课表解析服务

服务提取教务系统 PDF 文本并调用 OpenAI 兼容大模型接口，返回标准课程 JSON。没有本地规则解析或导入兜底。

- 网页版使用 `POST /api/schedule/parse` 同步上传。
- 小程序先把 PDF 上传到云存储，再通过 `POST /api/schedule/jobs` 创建异步任务，并用 `GET /api/schedule/jobs/:jobId` 查询结果。
- 异步任务保存在云数据库集合 `schedule_parse_jobs`，临时 PDF 在任务完成或失败后自动删除。
- 任务接口只接受微信云托管注入了 `x-wx-openid` 的小程序请求。

复制 `.env.example` 为 `.env` 后填入自己的密钥，再执行：

```bash
npm install
npm start
```

本地网页接口为 `http://127.0.0.1:8788/api/schedule/parse`。小程序任务接口需部署在关联的微信云托管环境中，服务会使用当前环境的云存储和云数据库。`.env` 已被 Git 忽略，不能提交。
