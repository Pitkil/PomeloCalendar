<div align="center">
  <p><strong>English</strong> · <a href="README.zh-CN.md">简体中文</a></p>
  <img src="assets/youke-calendar-avatar.png" width="112" alt="Youke Calendar icon">
  <h1>Youke Calendar · 柚课日历</h1>
  <p>Timetables, plans, and focus sessions for everyday campus life.</p>
  <p>
    <img alt="WeChat Mini Program" src="https://img.shields.io/badge/WeChat-Mini%20Program-07C160?logo=wechat&logoColor=white">
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178C6?logo=typescript&logoColor=white">
    <img alt="Vanilla Web" src="https://img.shields.io/badge/Web-Vanilla%20JS-F7DF1E?logo=javascript&logoColor=111">
  </p>
</div>

![Youke Calendar product interface](assets/readme/youke-calendar-hero.png)

Youke Calendar is a campus productivity toolkit for university students. It combines a native WeChat Mini Program with a responsive, fully offline single-page web app. The project is not tied to one university: school names, academic portals, semester details, and class-period times are configurable. New users start with an empty calendar and can add events or import a timetable when they are ready.

## Features

| Area | What it provides |
| --- | --- |
| Calendar and timetable | Monthly calendar, weekly timetable, teaching-week tracking, personal events, search, completion state, and conflict warnings |
| Bring-your-own-model import | Mini Program only: users configure their own provider, model name, endpoint, and API key |
| Study timer | Countdown and stopwatch tasks, configurable focus/rest durations, and completed study records |
| Campus budgeting | Income and expense entries, category summaries, and trend visualization |
| Insights | Study-time totals, income/expense breakdowns, and recent trends |
| Personalization | Color themes, built-in wallpapers, local custom wallpapers, and card-opacity controls |
| Two clients | A WeChat Mini Program and a build-free single-page web version |

## Supported timetable formats

The Mini Program sends timetable content directly to the model provider selected by the user. It can capture course names, instructors, rooms, weekdays or exact dates, class periods, teaching weeks, and explicit start/end times. Supported presets include OpenAI, Gemini, Claude, DeepSeek, Kimi, Qwen, GLM, and SiliconFlow, plus a custom OpenAI-compatible endpoint.

- Traditional weekday-by-period timetable grids
- Course lists that include exact start and end times
- Date-based schedules without a recurring weekday
- Representative timetable text copied from a university academic system

OpenAI, Gemini, and Claude presets can receive PDF files directly. Other presets use pasted timetable text through OpenAI-compatible chat APIs. Parsing intentionally relies on the selected model and has no local rule-based fallback, so imported times should always be reviewed.

## Repository structure

```text
.
├─ apps/
│  ├─ miniprogram/          # Native WeChat Mini Program (TypeScript)
│  └─ web/                  # Responsive single-page web app
├─ assets/
│  ├─ readme/               # README promotional assets
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

For AI timetable import, open Calendar Settings and choose a model provider, then enter your own endpoint, model name, and API key. OpenAI, Gemini, and Claude can read PDFs directly; text-only providers parse timetable text pasted into the import panel.

Before releasing the Mini Program, add every provider domain you intend to support to **Development → Development Management → Development Settings → Server Domain Names → request legal domains** in the WeChat public platform. Custom endpoints also need to be allowlisted there.

### Web app

The web app has no build step and no backend dependency. Double-click `apps/web/index.html` to use it directly. You may also serve the repository through a local static server:

```bash
python -m http.server 8080
```

Then visit `http://localhost:8080/apps/web/`. Courses are added locally through “Add Event” with the “Course” category. PDF import and cloud synchronization are intentionally not included in the web version.

## Data and privacy

- Events, timetable data, study records, transactions, and appearance settings are stored locally by default.
- The app does not request or store university sign-in credentials.
- The user's model API key is stored only in local Mini Program storage. It is never committed to the repository or sent to a project-owned server.
- Timetable text or PDF content is sent directly from the Mini Program to the provider selected by the user and is subject to that provider's privacy policy.
- The web version makes no backend requests and keeps its application data in the current browser.

## Verification

```bash
# Mini Program type check
cd apps/miniprogram
npm run typecheck

# JavaScript syntax check (from the repository root)
node --check apps/web/app.js
```

The Mini Program type check covers the provider adapters and timetable-to-event conversion. Period mappings include `Periods 1–2 → 08:00–09:40`, `Periods 7–9 → 14:00–16:35`, and `Periods 12–14 → 19:20–21:55`.

## Known limitations

- Users need their own model account and API key; provider usage may incur charges.
- WeChat production builds can only call model domains configured in the Mini Program's request-domain allowlist.
- Direct PDF input is limited to the OpenAI, Gemini, and Claude adapters; other providers require pasted timetable text.
- The web version supports manual course entry but does not import timetable PDFs.
- PDF layouts vary widely, and users remain responsible for reviewing imported course data.
- Web data is stored in the current browser and will not survive cleared site data or automatically move to another device.
- Cross-device account synchronization is not currently available in either client.

## License

No open-source license has been added yet. Until a license is provided, all rights are reserved by default.
