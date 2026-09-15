# 3. 认证后端源码

这是“西柚日历”的课表同步服务。它在一次请求内完成西南大学统一认证并查询教务课表，返回前端可直接导入的课程数组。

## 安全边界

- 仅访问西南大学官方域名 `idm.swu.edu.cn`、`uaaap.swu.edu.cn` 和 `jw.swu.edu.cn`。
- 学号、密码和登录 Cookie 只存在于当前请求内，不写入文件、数据库、缓存或日志。
- 每次同步结束后立即清空 Cookie 容器。
- 默认带请求体大小限制、超时、基础限流和无缓存响应头。
- 本项目参考了 OpenSWU 的认证流程和课表字段约定，但没有调用已超时的第三方 `xdbbt` 服务。

## 本地运行

需要 Node.js 20 或更高版本，无第三方 npm 依赖：

```bash
npm start
```

服务默认监听 `http://127.0.0.1:8787`。检查状态：

```bash
curl http://127.0.0.1:8787/health
```

小程序和网页版的默认后端地址已经指向该地址。微信开发者工具调试 HTTP 本地服务时，需要在“详情 → 本地设置”中启用“不校验合法域名、web-view、TLS 版本以及 HTTPS 证书”。正式发布时必须部署为 HTTPS，并在微信公众平台配置 request 合法域名。

## API

```http
POST /api/swu/schedule
Content-Type: application/json

{
  "username": "学号",
  "password": "统一认证密码",
  "year": 2026,
  "term": 1
}
```

成功响应：

```json
{
  "courses": [
    {
      "id": "课程 ID",
      "title": "软件工程",
      "teacher": "教师",
      "place": "教室",
      "weekday": 3,
      "sessions": "5-6节",
      "weeks": "1-16周"
    }
  ],
  "meta": {
    "year": 2026,
    "term": 1,
    "provider": "swu-official"
  }
}
```

## 测试

```bash
npm test
```

测试使用模拟课表服务，不需要也不会读取真实学号和密码。

## Docker 部署

```bash
docker build -t swu-calendar-auth .
docker run --rm -p 8787:8787 -e HOST=0.0.0.0 swu-calendar-auth
```

生产环境建议设置 `CORS_ORIGIN` 为网页版的实际 HTTPS 来源，并通过反向代理提供 HTTPS。不要在命令行、配置文件或 Git 仓库中填写真实账号密码。
