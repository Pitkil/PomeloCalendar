<div align="center">
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
  <img src="assets/youke-calendar-avatar.png" width="112" alt="柚课日历图标">
  <h1>柚课日历 · Youke Calendar</h1>
  <p>课表、日程与专注，一页安排校园生活。</p>
  <p>
    <img alt="微信小程序" src="https://img.shields.io/badge/WeChat-Mini%20Program-07C160?logo=wechat&logoColor=white">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
    <img alt="原生网页" src="https://img.shields.io/badge/Web-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=111">
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white">
  </p>
</div>

![柚课日历产品界面](assets/readme/youke-calendar-hero.png)

柚课日历（Youke Calendar）是一套面向高校学生的校园效率工具，由微信原生小程序、响应式单页面网页和智能 PDF 课表解析服务组成。项目不绑定某一所学校：学校名称、教务入口、学期信息和节次时间均可自定义，新用户首次进入时不会预置任何日程。

## 功能

| 模块 | 能力 |
| --- | --- |
| 日历与课表 | 月历、周课表、教学周、个人日程、搜索、完成状态与时间冲突提示 |
| PDF 智能导入 | 仅小程序：识别传统周课表网格、明确起止时间列表、按日期排列的教学清单 |
| 学习计时 | 倒计时与正计时任务，自定义专注/休息时长，完成后沉淀学习记录 |
| 校园记账 | 收入与支出记录、分类汇总和趋势可视化 |
| 数据统计 | 学习时长、收支结构和近期趋势 |
| 个性化 | 多套主题色、预设壁纸、自定义本地壁纸和卡片透明度 |
| 多端使用 | 微信小程序与无需构建步骤的单页网页版 |

## 支持的课表

解析服务以 OpenAI 兼容的大模型接口处理教务系统导出的 PDF，能够提取课程、教师、教室、星期或日期、节次、周次，以及 PDF 中明确给出的起止时间。目前自动化测试覆盖：

- 传统“星期 × 节次”周课表网格
- 包含精确开始/结束时间的课程列表
- 按具体日期排列、没有固定星期重复规则的教学清单
- 西南大学教务系统导出 PDF 的回归样例

解析完全依赖模型输出，没有本地规则兜底。扫描件、复杂排版或低质量 PDF 的效果取决于模型能力，导入后请核对课程时间。

## 项目结构

```text
.
├─ apps/
│  ├─ miniprogram/          # 微信原生小程序（TypeScript）
│  └─ web/                  # 响应式单页面网页版
├─ services/
│  └─ schedule-parser/      # PDF 提取与大模型结构化服务
├─ assets/
│  ├─ readme/               # README 宣传素材
│  └─ youke-calendar-avatar.png
├─ README.md                # English
└─ README.zh-CN.md          # 简体中文
```

仓库内的源码目录和文件均采用英文名称；界面文案保留中文。

## 快速开始

### 微信小程序

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。
2. 导入 `apps/miniprogram`，并填写自己的小程序 AppID。
3. 在目录中安装依赖并检查类型：

```bash
cd apps/miniprogram
npm install
npm run typecheck
```

如果需要 PDF 智能导入，还需部署下方的解析服务，并让小程序使用同一微信云开发环境。当前服务名和环境 ID 位于 `miniprogram/app.ts` 与 `miniprogram/pages/calendar/index.ts`，部署到自己的环境时应一并修改。

### 网页版

网页版没有打包步骤，也不依赖后端。直接双击 `apps/web/index.html` 即可使用；也可以在仓库根目录运行静态服务器：

```bash
python -m http.server 8080
```

浏览器访问 `http://localhost:8080/apps/web/`。课程可通过“新增日程”并选择“课程”分类手动添加；网页版不提供 PDF 导入或云端同步。

### 智能课表解析服务

```bash
cd services/schedule-parser
npm install
copy .env.example .env
npm start
```

至少配置以下服务端环境变量：

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
```

本地同步接口为 `http://127.0.0.1:8788/api/schedule/parse`。小程序使用异步任务接口，因此服务需部署到与小程序关联的微信云托管环境；具体接口与 CloudBase 配置见 [`services/schedule-parser/README.md`](services/schedule-parser/README.md)。密钥只能配置在服务端，不能写入网页、小程序源码或提交到 Git。

## 数据与隐私

- 日程、课表、学习记录、账目和外观设置默认保存在用户本机。
- 应用不要求填写或保存学校统一身份认证的账号、密码。
- 小程序导入课表时，PDF 会被临时发送到解析服务；异步任务完成或失败后会清空临时 PDF 内容。
- 大模型 API 密钥仅存在于服务端环境变量中。
- 网页版不会发起后端请求，应用数据仅保存在当前浏览器中。

## 测试

```bash
# 小程序类型检查
cd apps/miniprogram
npm run typecheck

# 解析服务测试
cd ../../services/schedule-parser
npm test

# JavaScript 语法检查（仓库根目录）
node --check apps/web/app.js
node --check services/schedule-parser/server.cjs
```

当前解析服务测试覆盖 5 个用例；项目同时验证了 `1-2节 → 08:00-09:40`、`7-9节 → 14:00-16:35`、`12-14节 → 19:20-21:55` 等节次映射。

## 已知限制

- 小程序智能导入需要自行部署解析服务并承担模型与云资源费用。
- 网页版支持手动添加课程，但不提供课表 PDF 导入。
- 课表 PDF 的结构差异很大，导入结果应由用户最终确认。
- 网页版数据保存在当前浏览器，清理站点数据或更换设备后不会自动同步。
- 小程序与网页版目前不提供跨设备账号同步。

## License

仓库目前尚未添加开源许可证。在许可证明确前，代码默认保留全部权利。
