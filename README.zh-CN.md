<div align="center">
  <p><a href="README.md">English</a> · <strong>简体中文</strong></p>
  <img src="assets/youke-calendar-avatar.png" width="112" alt="柚课日历图标">
  <h1>柚课日历 · Youke Calendar</h1>
  <p>课表、日程与专注，一页安排校园生活。</p>
  <p>
    <img alt="微信小程序" src="https://img.shields.io/badge/WeChat-Mini%20Program-07C160?logo=wechat&logoColor=white">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
    <img alt="原生网页" src="https://img.shields.io/badge/Web-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=111">
  </p>
</div>

![柚课日历产品界面](assets/readme/youke-calendar-hero.png)

柚课日历（Youke Calendar）是一套面向高校学生的校园效率工具，由微信原生小程序和完全离线的响应式单页面网页组成。项目不绑定某一所学校：学校名称、教务入口、学期信息和节次时间均可自定义，新用户首次进入时不会预置任何日程。

## 功能

| 模块 | 能力 |
| --- | --- |
| 日历与课表 | 月历、周课表、教学周、个人日程、搜索、完成状态与时间冲突提示 |
| 自带模型导入 | 仅小程序：本地提取 PDF、TXT、CSV、DOCX、XLSX、XLS，再交给用户选择的模型 |
| 学习计时 | 倒计时与正计时任务，自定义专注/休息时长，完成后沉淀学习记录 |
| 校园记账 | 收入与支出记录、分类汇总和趋势可视化 |
| 数据统计 | 学习时长、收支结构和近期趋势 |
| 个性化 | 多套主题色、预设壁纸、自定义本地壁纸和卡片透明度 |
| 多端使用 | 微信小程序与无需构建步骤的单页网页版 |

## 支持的课表

小程序会把课表内容直接发送给用户选择的模型服务商，提取课程、教师、教室、星期或日期、节次、周次，以及明确给出的起止时间。内置 OpenAI、Gemini、Claude、DeepSeek、Kimi、通义千问、智谱 GLM 和 SiliconFlow 预设，也支持自定义 OpenAI 兼容接口。

- 传统“星期 × 节次”周课表网格
- 包含精确开始/结束时间的课程列表
- 按具体日期排列、没有固定星期重复规则的教学清单
- 从高校教务系统复制的典型课表文本

PDF、TXT、CSV、DOCX、XLSX 和 XLS 会先在小程序本地转换为文字，再把文字发送给所选服务商。因此 DeepSeek、Kimi、通义千问、智谱 GLM、SiliconFlow 和自定义 OpenAI 兼容接口也能使用相同的文件导入流程。课程解析完全依赖所选模型，没有规则兜底，导入后请核对课程时间。图片或扫描版 PDF 需要先做 OCR。

## 项目结构

```text
.
├─ apps/
│  ├─ miniprogram/          # 微信原生小程序（TypeScript）
│  └─ web/                  # 响应式单页面网页版
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

如需智能导入课表，请在“日历设置”中选择模型服务商，并填写自己的接口地址、模型名称和 API Key。进入导入面板后可选择 PDF、TXT、CSV、DOCX、XLSX 或 XLS 文件；小程序会在本地提取文字，再发送给当前模型。也可以继续直接粘贴课表文字。

本地解析器已提交到小程序源码，微信开发者工具打开即可使用。修改解析依赖后，请在 `apps/miniprogram` 中执行 `pnpm run build:extractors` 重新生成解析器。

正式发布前，需要在微信公众平台的“开发 → 开发管理 → 开发设置 → 服务器域名 → request 合法域名”中加入计划支持的模型服务商域名；自定义接口也必须预先加入白名单。

### 网页版

网页版完全离线，不需要后端、安装、构建命令、账号或 API Key。

1. 在 GitHub 仓库页面点击 **Code → Download ZIP**，下载并解压源码。
2. 打开解压后的 `apps/web` 文件夹。
3. 双击 **`index.html`**，浏览器打开后即可使用柚课日历。

网页版数据只保存在当前浏览器中。添加课程时点击 **新增日程 → 课程**；网页版不提供课表文件导入或云端同步。

## 数据与隐私

- 日程、课表、学习记录、账目和外观设置默认保存在用户本机。
- 应用不要求填写或保存学校统一身份认证的账号、密码。
- 用户填写的模型 API Key 仅保存在小程序本地，不会提交到仓库，也不会发送给本项目自有服务器。
- 原始课表文件保留在设备本地；提取后的课表文字会由小程序直接发送给用户选择的模型服务商，并受对应服务商隐私政策约束。
- 网页版不会发起后端请求，应用数据仅保存在当前浏览器中。

## 测试

```bash
# 小程序类型检查
cd apps/miniprogram
npm run typecheck

# JavaScript 语法检查（仓库根目录）
node --check apps/web/app.js
```

小程序类型检查覆盖模型适配器和课程转日程逻辑。项目使用 `1-2节 → 08:00-09:40`、`7-9节 → 14:00-16:35`、`12-14节 → 19:20-21:55` 等节次映射。

## 已知限制

- 用户需要自行准备模型账户和 API Key，调用模型可能产生费用。
- 微信正式版只能请求已加入小程序 request 合法域名白名单的模型接口。
- PDF、TXT、CSV、DOCX、XLSX 和 XLS 都会先在本地提取文字，因此所有已配置的模型都能导入。
- 网页版支持手动添加课程，但不提供课表 PDF 导入。
- 课表文件的结构差异很大，扫描版 PDF 需要 OCR，导入结果应由用户最终确认。
- 网页版数据保存在当前浏览器，清理站点数据或更换设备后不会自动同步。
- 小程序与网页版目前不提供跨设备账号同步。

## License

仓库目前尚未添加开源许可证。在许可证明确前，代码默认保留全部权利。
