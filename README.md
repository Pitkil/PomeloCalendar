<div align="center">
  <p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
  <img src="assets/youke-calendar-avatar.png" width="112" alt="Youke Calendar icon">
  <h1>Youke Calendar · 柚课日历</h1>
  <p>Timetables, plans, and focus sessions for everyday campus life.</p>
  <p>
    <img alt="WeChat Mini Program" src="https://img.shields.io/badge/WeChat-Mini%20Program-07C160?logo=wechat&logoColor=white">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
    <img alt="Vanilla Web" src="https://img.shields.io/badge/Web-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=111">
    <img alt="Node.js" src="https://img.shields.io/badge/Node.js-18%2B-339933?logo=nodedotjs&logoColor=white">
  </p>
</div>

![Youke Calendar product interface](assets/readme/youke-calendar-hero.png)

Youke Calendar is a campus productivity toolkit for university students. It combines a native WeChat Mini Program, a responsive single-page web app, and an AI-assisted PDF timetable parser. The project is not tied to one university: school names, academic portals, semester details, and class-period times are configurable. New users start with an empty calendar and can add events or import a timetable when they are ready.

## Features

| Area | What it provides |
| --- | --- |
| Calendar and timetable | Monthly calendar, weekly timetable, teaching-week tracking, personal events, search, completion state, and conflict warnings |
| AI-assisted PDF import | Supports traditional weekly grids, lists with exact start/end times, and date-based course schedules |
| Study timer | Countdown and stopwatch tasks, configurable focus/rest durations, and completed study records |
| Campus budgeting | Income and expense entries, category summaries, and trend visualization |
| Insights | Study-time totals, income/expense breakdowns, and recent trends |
| Personalization | Color themes, built-in wallpapers, local custom wallpapers, and card-opacity controls |
| Two clients | A WeChat Mini Program and a build-free single-page web version |

## Supported timetable formats

The parser sends text extracted from academic-system PDFs to an OpenAI-compatible model and structures the response as course data. It can capture course names, instructors, rooms, weekdays or exact dates, class periods, teaching weeks, and explicit start/end times. Automated tests currently cover:

- Traditional weekday-by-period timetable grids
- Course lists that include exact start and end times
- Date-based schedules without a recurring weekday
- A regression sample exported from Southwest University's academic system

Parsing intentionally relies on the model response and has no local rule-based fallback. Results from scanned, unusually formatted, or low-quality PDFs depend on the configured model, so imported times should always be reviewed.

## Repository structure

```text
.
├─ apps/
│  ├─ miniprogram/          # Native WeChat Mini Program (TypeScript)
│  └─ web/                  # Responsive single-page web app
├─ services/
│  └─ schedule-parser/      # PDF extraction and AI course structuring
├─ assets/
│  ├─ readme/               # README promotional assets
│  ├─ icons.svg             # Web icon sprite
│  └─ youke-calendar-avatar.png
├─ README.md                # English
└─ README.zh-CN.md          # Simplified Chinese
```

Source directories and filenames use English. The current product interface is written in Chinese.

## Quick start

### WeChat Mini Program

1. Install [WeChat Developer Tools](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html).
2. Import `apps/miniprogram` and enter your own Mini Program AppID.
3. Install dependencies and run the type check:

```bash
cd apps/miniprogram
npm install
npm run typecheck
```

PDF import also requires the parser service below to be deployed in the same WeChat CloudBase environment as the Mini Program. The current service name and environment ID are defined in `miniprogram/app.ts` and `miniprogram/pages/calendar/index.ts`; update both when deploying to your own environment.

### Web app

The web app has no build step. Open `apps/web/index.html` directly, or serve the repository through a local static server:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080/apps/web/`. To import a timetable, enter the parser's complete `/api/schedule/parse` URL in Calendar Settings.

### Schedule parser service

```bash
cd services/schedule-parser
npm install
copy .env.example .env
npm start
```

Configure at least these server-side environment variables:

```dotenv
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://api.deepseek.com
OPENAI_MODEL=deepseek-v4-flash
```

The local synchronous endpoint is `http://127.0.0.1:8788/api/schedule/parse`. The Mini Program uses asynchronous job endpoints, so the service must be deployed to its associated WeChat CloudBase environment. See [`services/schedule-parser/README.md`](services/schedule-parser/README.md) for the endpoint and CloudBase details. API keys belong only in server-side environment variables—never in the web app, Mini Program source, or Git history.

## Data and privacy

- Events, timetable data, study records, transactions, and appearance settings are stored locally by default.
- The app does not request or store university sign-in credentials.
- During import, the PDF is temporarily sent to the parser service; asynchronous jobs clear temporary PDF content after success or failure.
- The model API key remains in server-side environment variables.
- Public web deployments should add HTTPS, CORS rules, access control, and rate limiting around the parser endpoint.

## Verification

```bash
# Mini Program type check
cd apps/miniprogram
npm run typecheck

# Parser service tests
cd ../../services/schedule-parser
npm test

# JavaScript syntax checks (from the repository root)
node --check apps/web/app.js
node --check services/schedule-parser/server.cjs
```

The parser currently has five automated test cases. The project also verifies mappings such as `Periods 1–2 → 08:00–09:40`, `Periods 7–9 → 14:00–16:35`, and `Periods 12–14 → 19:20–21:55`.

## Known limitations

- AI-assisted import requires a separately deployed parser service and may incur model or cloud-resource costs.
- PDF layouts vary widely, and users remain responsible for reviewing imported course data.
- Web data is stored in the current browser and will not survive cleared site data or automatically move to another device.
- Cross-device account synchronization is not currently available in either client.

## License

No open-source license has been added yet. Until a license is provided, all rights are reserved by default.
