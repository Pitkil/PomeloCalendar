type EventSource = 'personal' | 'course' | 'focus'
type ModelProtocol = 'openai' | 'gemini' | 'anthropic' | 'compatible'

interface ModelPreset {
  id: string
  name: string
  protocol: ModelProtocol
  baseUrl: string
  model: string
}

interface CalendarEvent {
  id: string
  title: string
  date: string
  startTime: string
  endTime: string
  category: string
  location: string
  notes: string
  color: string
  source: EventSource
  teacher?: string
  completed?: boolean
}

interface Settings {
  schoolName: string
  portalUrl: string
  periodTimes: string
  semesterTitle: string
  semesterStart: string
  semesterEnd: string
  totalWeeks: number
  focusMinutes: number
  breakMinutes: number
  accent: string
  wallpaper: string
  customWallpaper: string
  cardOpacity: number
  modelPreset: string
  modelProtocol: ModelProtocol
  modelBaseUrl: string
  modelName: string
  modelApiKey: string
}

interface AccountEntry { id: string; type: 'expense' | 'income'; amount: number; category: string; date: string; note: string }

interface CourseLike {
  id?: string
  course_id?: string
  title?: string
  kcmc?: string
  teacher?: string
  xm?: string
  place?: string
  cdmc?: string
  weekday?: number | string
  xqj?: number | string
  sessions?: string
  jc?: string
  weeks?: string | number[]
  zcd?: string
  date?: string
  startTime?: string
  endTime?: string
}

const STORAGE_EVENTS = 'swu-calendar-events-v2'
const STORAGE_SETTINGS = 'swu-calendar-settings-v2'
const STORAGE_FOCUS = 'swu-calendar-focus-v2'
const STORAGE_ACCOUNTS = 'swu-calendar-accounts-v1'
const STORAGE_SELECTED_FILE = 'youke-selected-schedule-file'
const STORAGE_EXTRACTED_FILE = 'youke-extracted-schedule-file'
let timerId: number | undefined
const DEFAULT_PERIOD_TIMES = '08:00-08:45,08:55-09:40,10:00-10:45,10:55-11:40,12:10-12:55,13:05-13:50,14:00-14:45,14:55-15:40,15:50-16:35,16:55-17:40,17:50-18:35,19:20-20:05,20:15-21:00,21:10-21:55'
const MODEL_PRESETS: ModelPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', protocol: 'compatible', baseUrl: 'https://api.deepseek.com', model: 'deepseek-chat' },
  { id: 'openai', name: 'OpenAI', protocol: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini' },
  { id: 'gemini', name: 'Google Gemini', protocol: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta', model: 'gemini-2.5-flash' },
  { id: 'anthropic', name: 'Anthropic Claude', protocol: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-5' },
  { id: 'kimi', name: 'Kimi / Moonshot', protocol: 'compatible', baseUrl: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-32k' },
  { id: 'qwen', name: '通义千问 / Qwen', protocol: 'compatible', baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { id: 'zhipu', name: '智谱 GLM', protocol: 'compatible', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  { id: 'siliconflow', name: 'SiliconFlow', protocol: 'compatible', baseUrl: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  { id: 'custom', name: '自定义 OpenAI 兼容接口', protocol: 'compatible', baseUrl: '', model: '' }
]

const trimBaseUrl = (value: string) => String(value || '').trim().replace(/\/+$/, '')
const joinApiUrl = (baseUrl: string, path: string) => `${trimBaseUrl(baseUrl)}/${path.replace(/^\/+/, '')}`

const requestJson = (url: string, header: Record<string, string>, data: unknown) => new Promise<any>((resolve, reject) => {
  wx.request({
    url,
    method: 'POST',
    header: { 'content-type': 'application/json', ...header },
    data,
    timeout: 120000,
    success: (response: any) => {
      const statusCode = Number(response.statusCode || 0)
      const body = response.data || {}
      if (statusCode < 200 || statusCode >= 300) {
        const message = body?.error?.message || body?.error || body?.message || `模型接口返回 ${statusCode || '未知状态'}`
        reject(new Error(String(message)))
        return
      }
      resolve(body)
    },
    fail: (error: any) => {
      const message = String(error?.errMsg || '')
      if (/url not in domain list|合法域名|domain/i.test(message)) {
        reject(new Error('该模型域名未加入微信小程序 request 合法域名，请先在公众平台配置'))
        return
      }
      reject(new Error(/timeout|超时/i.test(message) ? '模型响应超时，请稍后重试' : `无法连接模型接口：${message || '网络异常'}`))
    }
  })
})

const buildSchedulePrompt = (settings: Settings, scheduleText: string) => `你是课程表结构化助手。请从下面由用户课表文件提取的文字中识别课程，不要猜测缺失信息。\n学校：${settings.schoolName}\n学期：${settings.semesterTitle}\n学期开始：${settings.semesterStart}\n教学周数：${settings.totalWeeks}\n默认节次时间：${settings.periodTimes}\n只返回合法 JSON，不要 Markdown：{"courses":[{"title":"课程名","teacher":"教师","place":"教室","weekday":1,"sessions":"1-2节","weeks":"1-16周","date":"YYYY-MM-DD 或空字符串","startTime":"HH:MM 或空字符串","endTime":"HH:MM 或空字符串"}]}。weekday 使用 1-7 表示周一至周日；按具体日期上课时填写 date；课表明确写出起止时间时必须保留。\n课表文字：\n${scheduleText}`

const extractResponseText = (body: any, protocol: ModelProtocol) => {
  if (protocol === 'gemini') return (body?.candidates?.[0]?.content?.parts || []).map((part: any) => part?.text || '').join('\n')
  if (protocol === 'anthropic') return (body?.content || []).map((part: any) => part?.text || '').join('\n')
  if (protocol === 'openai') {
    if (body?.output_text) return String(body.output_text)
    return (body?.output || []).flatMap((item: any) => item?.content || []).map((part: any) => part?.text || '').join('\n')
  }
  return String(body?.choices?.[0]?.message?.content || '')
}

const parseCourseResponse = (raw: string): CourseLike[] => {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const candidates = [text]
  const objectStart = text.indexOf('{')
  const objectEnd = text.lastIndexOf('}')
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1))
  const arrayStart = text.indexOf('[')
  const arrayEnd = text.lastIndexOf(']')
  if (arrayStart >= 0 && arrayEnd > arrayStart) candidates.push(text.slice(arrayStart, arrayEnd + 1))
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate)
      const rows = Array.isArray(parsed) ? parsed : parsed?.courses
      if (Array.isArray(rows)) {
        return rows.filter((row) => row && (row.title || row.kcmc) && (row.date || row.weekday || row.xqj))
      }
    } catch {}
  }
  throw new Error('模型返回的课程 JSON 格式不正确，请重试或更换模型')
}

const requestScheduleCourses = async (settings: Settings, scheduleText: string) => {
  const apiKey = String(settings.modelApiKey || '').trim()
  const baseUrl = trimBaseUrl(settings.modelBaseUrl)
  const model = String(settings.modelName || '').trim()
  if (!apiKey || !baseUrl || !model) throw new Error('请先在大模型设置中填写 API Key、接口地址和模型名称')
  const prompt = buildSchedulePrompt(settings, scheduleText)
  const protocol = settings.modelProtocol
  let body: any
  if (protocol === 'openai') {
    const content: any[] = [{ type: 'input_text', text: prompt }]
    body = await requestJson(joinApiUrl(baseUrl, 'responses'), { Authorization: `Bearer ${apiKey}` }, { model, input: [{ role: 'user', content }] })
  } else if (protocol === 'gemini') {
    const parts: any[] = [{ text: prompt }]
    body = await requestJson(joinApiUrl(baseUrl, `models/${encodeURIComponent(model)}:generateContent`), { 'x-goog-api-key': apiKey }, { contents: [{ role: 'user', parts }], generationConfig: { responseMimeType: 'application/json' } })
  } else if (protocol === 'anthropic') {
    const content: any[] = [{ type: 'text', text: prompt }]
    body = await requestJson(joinApiUrl(baseUrl, 'messages'), { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }, { model, max_tokens: 8000, messages: [{ role: 'user', content }] })
  } else {
    body = await requestJson(joinApiUrl(baseUrl, 'chat/completions'), { Authorization: `Bearer ${apiKey}` }, { model, temperature: 0, messages: [{ role: 'user', content: prompt }] })
  }
  const courses = parseCourseResponse(extractResponseText(body, protocol))
  if (!courses.length) throw new Error('模型没有识别到有效课程，请检查内容后重试')
  return courses
}

const pad = (value: number) => String(value).padStart(2, '0')

const toDateKey = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const fromDateKey = (key: string) => new Date(`${key}T00:00:00`)

const addDays = (date: Date, amount: number) => {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

const makeId = (prefix = 'event') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`

const minutesOf = (value: string) => {
  const parts = (value || '00:00').split(':').map(Number)
  return parts[0] * 60 + parts[1]
}

const defaultSettings = (): Settings => {
  const now = new Date()
  const firstTerm = now.getMonth() >= 7
  const startYear = firstTerm ? now.getFullYear() : now.getFullYear() - 1
  return {
    schoolName: '我的校园',
    portalUrl: '',
    periodTimes: DEFAULT_PERIOD_TIMES,
    semesterTitle: `${startYear}-${startYear + 1}-${firstTerm ? 1 : 2}`,
    semesterStart: firstTerm ? `${startYear}-09-07` : `${startYear + 1}-02-23`,
    semesterEnd: firstTerm ? `${startYear + 1}-01-17` : `${startYear + 1}-07-05`,
    totalWeeks: 19,
    focusMinutes: 25,
    breakMinutes: 5,
    accent: '#176b55',
    wallpaper: 'paper',
    customWallpaper: '',
    cardOpacity: 94,
    modelPreset: 'deepseek',
    modelProtocol: 'compatible',
    modelBaseUrl: 'https://api.deepseek.com',
    modelName: 'deepseek-chat',
    modelApiKey: ''
  }
}

const teachingWeekOf = (dateKey: string, settings: Settings) => {
  const date = fromDateKey(dateKey)
  const start = fromDateKey(settings.semesterStart)
  const diff = Math.floor((date.getTime() - start.getTime()) / 86400000)
  const week = Math.floor(diff / 7) + 1
  return week >= 1 && week <= settings.totalWeeks ? week : 0
}

const parseWeeks = (raw: string | number[] | undefined, totalWeeks: number) => {
  if (Array.isArray(raw)) return raw.filter((week) => week >= 1 && week <= totalWeeks)
  if (!raw) return Array.from({ length: totalWeeks }, (_, index) => index + 1)
  const text = String(raw)
  const result = new Set<number>()
  const oddOnly = /单/.test(text)
  const evenOnly = /双/.test(text)
  const ranges = text.match(/\d+\s*-\s*\d+|\d+/g) || []
  ranges.forEach((range) => {
    const numbers = range.split('-').map((part) => Number(part.trim()))
    const start = numbers[0]
    const end = numbers[1] || start
    for (let week = start; week <= end; week += 1) {
      if (week < 1 || week > totalWeeks) continue
      if (oddOnly && week % 2 === 0) continue
      if (evenOnly && week % 2 !== 0) continue
      result.add(week)
    }
  })
  return result.size ? Array.from(result) : Array.from({ length: totalWeeks }, (_, index) => index + 1)
}

const timeFromSessions = (raw = '', configured = DEFAULT_PERIOD_TIMES) => {
  const pairs = String(configured || DEFAULT_PERIOD_TIMES).split(/[,，\n]/).map((item) => item.trim().match(/^(\d{1,2}:\d{2})\s*[-~—至]\s*(\d{1,2}:\d{2})$/)).filter(Boolean)
  const fallbackPairs = DEFAULT_PERIOD_TIMES.split(',').map((item) => item.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/))
  const schedule = pairs.length ? pairs : fallbackPairs
  const sections = (String(raw).match(/\d+/g) || ['1']).map(Number)
  const first = Math.max(1, Math.min(schedule.length, sections[0] || 1))
  const last = Math.max(first, Math.min(schedule.length, sections[sections.length - 1] || first))
  return [schedule[first - 1]?.[1] || '08:00', schedule[last - 1]?.[2] || '09:40']
}

const courseToEvents = (course: CourseLike, settings: Settings, courseIndex: number): CalendarEvent[] => {
  const title = course.title || course.kcmc || '未命名课程'
  const teacher = course.teacher || course.xm || ''
  const location = course.place || course.cdmc || ''
  const providedSessions = course.sessions || course.jc || ''
  const hasExactTimes = !providedSessions && /^\d{1,2}:\d{2}$/.test(course.startTime || '') && /^\d{1,2}:\d{2}$/.test(course.endTime || '')
  const sessions = providedSessions || (hasExactTimes ? '' : '1-2节')
  const inferredTimes = timeFromSessions(sessions, settings.periodTimes)
  const times = hasExactTimes
    ? [String(course.startTime), String(course.endTime)]
    : inferredTimes
  if (course.date) {
    return [{
      id: `course-${course.id || course.course_id || courseIndex}-${course.date}`,
      title,
      date: course.date,
      startTime: times[0],
      endTime: times[1],
      category: '课程',
      location,
      notes: sessions || `${times[0]}-${times[1]}`,
      color: '#176b55',
      source: 'course',
      teacher
    }]
  }

  const weekday = Number(course.weekday || course.xqj || 1)
  const weeks = parseWeeks(course.weeks || course.zcd, settings.totalWeeks)
  const semesterStart = fromDateKey(settings.semesterStart)
  const startWeekday = semesterStart.getDay() || 7
  const firstMonday = addDays(semesterStart, 1 - startWeekday)
  return weeks.map((week) => {
    const date = addDays(firstMonday, (week - 1) * 7 + Math.max(1, Math.min(7, weekday)) - 1)
    const key = toDateKey(date)
    return {
      id: `course-${course.id || course.course_id || courseIndex}-${week}`,
      title,
      date: key,
      startTime: times[0],
      endTime: times[1],
      category: '课程',
      location,
      notes: `第${week}周 · ${sessions || `${times[0]}-${times[1]}`}`,
      color: '#176b55',
      source: 'course' as EventSource,
      teacher
    }
  })
}

const sortEvents = (events: CalendarEvent[]) => events.slice().sort((a, b) => {
  const dayCompare = a.date.localeCompare(b.date)
  return dayCompare || a.startTime.localeCompare(b.startTime)
})

Page({
  data: {
    todayKey: '',
    selectedDate: '',
    selectedLabel: '',
    year: 0,
    month: 0,
    monthTitle: '',
    teachingWeek: 0,
    weekdays: ['一', '二', '三', '四', '五', '六', '日'],
    calendarRows: [] as any[],
    weekDays: [] as any[],
    events: [] as CalendarEvent[],
    selectedEvents: [] as CalendarEvent[],
    searchResults: [] as CalendarEvent[],
    query: '',
    viewMode: 'month',
    editorVisible: false,
    settingsVisible: false,
    syncVisible: false,
    accountingVisible: false,
    editingId: '',
    categories: ['学习', '课程', '考试', '作业', '活动', '生活'],
    categoryColors: ['#d76a4a', '#176b55', '#a34f54', '#d29b36', '#3d6f89', '#7a6a58'],
    form: {
      title: '', date: '', startTime: '09:00', endTime: '10:00', categoryIndex: 0,
      location: '', notes: '', color: '#d76a4a'
    },
    settings: defaultSettings(),
    modelOptions: MODEL_PRESETS,
    modelIndex: 0,
    scheduleText: '',
    panelAlpha: '0.94',
    wallpaperStyle: '',
    accentOptions: [
      { name: '校历绿', value: '#176b55' },
      { name: '湖水蓝', value: '#316b83' },
      { name: '番茄红', value: '#c9573e' },
      { name: '银杏金', value: '#a87919' }
    ],
    wallpaperOptions: [
      { name: '暖白纸张', value: 'paper' },
      { name: '缙云晨雾', value: 'lake' },
      { name: '银杏午后', value: 'ginkgo' },
      { name: '暮色自习', value: 'night' }
    ],
    focus: {
      kind: 'countdown', mode: 'focus', running: false, durationSeconds: 1500, secondsLeft: 1500,
      display: '25:00', taskTitle: '', roundsToday: 0, focusedMinutesToday: 0
    },
    syncStatus: '尚未导入课表',
    accounts: [] as AccountEntry[],
    accountEditingId: '',
    accountForm: { type: 'expense', amount: '', categoryIndex: 0, date: '', note: '' },
    accountCategories: ['餐饮', '交通', '学习', '购物', '娱乐', '住宿', '医疗', '其他'],
    accountTypeOptions: ['支出', '收入'],
    monthExpense: '¥0.00', monthIncome: '¥0.00', monthBalance: '¥0.00',
    categoryStats: [] as any[],
    recentFocusRecords: [] as CalendarEvent[],
    studyStats: { today: 0, week: 0, average: 0, hasData: false, days: [] as any[] },
    financeStats: { income: '0.00', expense: '0.00', balance: '0.00', hasData: false, months: [] as any[] },
    stats: { todayCount: 0, completed: 0, focusMinutes: 0 }
  },

  onLoad() {
    const now = new Date()
    const todayKey = toDateKey(now)
    const savedSettings = wx.getStorageSync(STORAGE_SETTINGS) as Settings
    const settings = savedSettings && savedSettings.semesterStart ? { ...defaultSettings(), ...savedSettings } : defaultSettings()
    const savedEvents = wx.getStorageSync(STORAGE_EVENTS) as CalendarEvent[]
    const savedAccounts = wx.getStorageSync(STORAGE_ACCOUNTS) as AccountEntry[]
    const focusRecord = wx.getStorageSync(STORAGE_FOCUS) || {}
    const initialEvents: CalendarEvent[] = Array.isArray(savedEvents)
      ? savedEvents.filter((item) => !(item.id?.startsWith('welcome-') && item.title === '完成校园日历实验' && item.notes === '体验新增、编辑、搜索和番茄钟。'))
      : []
    const focusSeconds = settings.focusMinutes * 60
    const modelIndex = Math.max(0, MODEL_PRESETS.findIndex((item) => item.id === settings.modelPreset))
    this.setData({
      todayKey,
      selectedDate: todayKey,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      settings,
      modelIndex,
      panelAlpha: settings.cardOpacity >= 100 ? '1' : `0.${settings.cardOpacity}`,
      events: initialEvents,
      accounts: savedAccounts || [],
      focus: {
        ...this.data.focus,
        durationSeconds: focusSeconds,
        secondsLeft: focusSeconds,
        display: this.formatSeconds(focusSeconds),
        roundsToday: focusRecord.date === todayKey ? Number(focusRecord.rounds || 0) : 0,
        focusedMinutesToday: focusRecord.date === todayKey ? Number(focusRecord.minutes || 0) : 0
      },
    })
    this.applyWallpaper()
    this.refreshView()
    this.persist()
  },

  onUnload() {
    if (timerId !== undefined) clearInterval(timerId)
  },

  async onShow() {
    const extracted = wx.getStorageSync(STORAGE_EXTRACTED_FILE)
    if (!extracted || !extracted.text) return
    wx.removeStorageSync(STORAGE_EXTRACTED_FILE)
    try {
      await this.parseWithOwnModel(String(extracted.text))
    } catch (error) {
      wx.hideLoading()
      wx.showModal({ title: '智能解析失败', content: error instanceof Error ? error.message : '课表解析失败，请稍后重试', showCancel: false })
    }
  },

  noop() {},

  onPullDownRefresh() {
    this.refreshView()
    wx.stopPullDownRefresh()
    wx.showToast({ title: '日历已刷新', icon: 'success' })
  },

  formatSeconds(seconds: number) {
    const safe = Math.max(0, seconds)
    return `${pad(Math.floor(safe / 60))}:${pad(safe % 60)}`
  },

  persist() {
    wx.setStorageSync(STORAGE_EVENTS, this.data.events)
    wx.setStorageSync(STORAGE_SETTINGS, this.data.settings)
    wx.setStorageSync(STORAGE_ACCOUNTS, this.data.accounts)
  },

  applyWallpaper() {
    const settings = this.data.settings as Settings
    const custom = settings.wallpaper === 'custom' && settings.customWallpaper
    this.setData({ wallpaperStyle: custom ? `background-image:url('${settings.customWallpaper}');` : '' })
  },

  buildCalendarRows() {
    const year = Number(this.data.year)
    const month = Number(this.data.month)
    const first = new Date(year, month - 1, 1)
    const firstWeekday = first.getDay() || 7
    const gridStart = addDays(first, 1 - firstWeekday)
    const events = this.data.events as CalendarEvent[]
    const query = String(this.data.query).trim().toLowerCase()
    const rows: any[] = []
    for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
      const days: any[] = []
      for (let column = 0; column < 7; column += 1) {
        const date = addDays(gridStart, rowIndex * 7 + column)
        const key = toDateKey(date)
        const dayEvents = events.filter((item) => item.date === key && (!query || `${item.title}${item.location}${item.teacher || ''}`.toLowerCase().includes(query)))
        days.push({
          key,
          day: date.getDate(),
          muted: date.getMonth() + 1 !== month,
          today: key === this.data.todayKey,
          selected: key === this.data.selectedDate,
          eventCount: dayEvents.length,
          dots: dayEvents.slice(0, 3).map((item) => item.color)
        })
      }
      const mondayKey = days[0].key
      rows.push({ week: teachingWeekOf(mondayKey, this.data.settings), days })
    }
    return rows
  },

  buildWeekDays() {
    const selected = fromDateKey(this.data.selectedDate)
    const weekday = selected.getDay() || 7
    const monday = addDays(selected, 1 - weekday)
    const events = this.data.events as CalendarEvent[]
    return Array.from({ length: 7 }, (_, index) => {
      const date = addDays(monday, index)
      const key = toDateKey(date)
      return {
        key,
        label: `${date.getMonth() + 1}/${date.getDate()}`,
        weekday: this.data.weekdays[index],
        today: key === this.data.todayKey,
        events: sortEvents(events.filter((item) => item.date === key)).slice(0, 2),
        moreCount: events.filter((item) => item.date === key).length > 2 ? events.filter((item) => item.date === key).length - 2 : 0
      }
    })
  },

  refreshView() {
    const selected = fromDateKey(this.data.selectedDate)
    const events = sortEvents(this.data.events as CalendarEvent[])
    const selectedEvents = events.filter((item) => item.date === this.data.selectedDate)
    const query = String(this.data.query).trim().toLowerCase()
    const searchResults = query
      ? events.filter((item) => `${item.title}${item.location}${item.category}${item.teacher || ''}${item.notes}`.toLowerCase().includes(query)).slice(0, 30)
      : []
    const stats = {
      todayCount: events.filter((item) => item.date === this.data.todayKey).length,
      completed: events.filter((item) => item.date === this.data.todayKey && item.completed).length,
      focusMinutes: Number(this.data.focus.focusedMinutesToday || 0)
    }
    const monthPrefix = this.data.todayKey.slice(0, 7)
    const monthAccounts = (this.data.accounts as AccountEntry[]).filter((item) => item.date.startsWith(monthPrefix)).sort((a, b) => b.date.localeCompare(a.date))
    const monthExpense = monthAccounts.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0)
    const monthIncome = monthAccounts.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0)
    const categoryTotals: Record<string, number> = {}
    monthAccounts.filter((item) => item.type === 'expense').forEach((item) => { categoryTotals[item.category] = (categoryTotals[item.category] || 0) + Number(item.amount) })
    const categoryStats = Object.keys(categoryTotals).map((name) => ({ name, amount: categoryTotals[name].toFixed(2), percent: Math.min(100, categoryTotals[name] / Math.max(monthExpense, 1) * 100) })).sort((a, b) => Number(b.amount) - Number(a.amount))
    const focusEvents = events.filter((item) => item.source === 'focus')
    const focusMinutesOf = (item: CalendarEvent) => {
      const noted = Number((item.notes || '').match(/(\d+)\s*分钟/)?.[1] || 0)
      const timed = minutesOf(item.endTime) - minutesOf(item.startTime)
      return Math.max(1, noted || timed || 1)
    }
    const lastSeven = Array.from({ length: 7 }, (_, index) => {
      const date = addDays(fromDateKey(this.data.todayKey), index - 6)
      const key = toDateKey(date)
      const minutes = focusEvents.filter((item) => item.date === key).reduce((sum, item) => sum + focusMinutesOf(item), 0)
      return { key, label: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()], minutes }
    })
    const weekMinutes = lastSeven.reduce((sum, item) => sum + item.minutes, 0)
    const maxStudy = Math.max(1, ...lastSeven.map((item) => item.minutes))
    const studyDays = lastSeven.map((item) => ({ ...item, height: Math.max(item.minutes ? 10 : 2, Math.round(item.minutes / maxStudy * 100)) }))
    const monthSeries = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(fromDateKey(this.data.todayKey).getFullYear(), fromDateKey(this.data.todayKey).getMonth() + index - 5, 1)
      const prefix = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`
      const rows = (this.data.accounts as AccountEntry[]).filter((item) => item.date.startsWith(prefix))
      return {
        key: prefix, label: `${date.getMonth() + 1}月`,
        income: rows.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0),
        expense: rows.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0)
      }
    })
    const maxMoney = Math.max(1, ...monthSeries.flatMap((item) => [item.income, item.expense]))
    const financeMonths = monthSeries.map((item) => ({ ...item, incomeHeight: Math.max(item.income ? 8 : 2, Math.round(item.income / maxMoney * 100)), expenseHeight: Math.max(item.expense ? 8 : 2, Math.round(item.expense / maxMoney * 100)) }))
    this.setData({
      monthTitle: `${this.data.year}年${this.data.month}月`,
      selectedLabel: `${selected.getMonth() + 1}月${selected.getDate()}日 · 周${['日', '一', '二', '三', '四', '五', '六'][selected.getDay()]}`,
      teachingWeek: teachingWeekOf(this.data.selectedDate, this.data.settings),
      calendarRows: this.buildCalendarRows(),
      weekDays: this.buildWeekDays(),
      selectedEvents,
      searchResults,
      stats,
      monthAccounts,
      categoryStats,
      recentFocusRecords: focusEvents.slice().sort((a, b) => `${b.date}${b.endTime}`.localeCompare(`${a.date}${a.endTime}`)).slice(0, 4),
      studyStats: { today: lastSeven[6].minutes, week: weekMinutes, average: Math.round(weekMinutes / 7), hasData: weekMinutes > 0, days: studyDays },
      financeStats: { income: monthIncome.toFixed(2), expense: monthExpense.toFixed(2), balance: (monthIncome - monthExpense).toFixed(2), hasData: monthSeries.some((item) => item.income > 0 || item.expense > 0), months: financeMonths },
      monthExpense: `¥${monthExpense.toFixed(2)}`,
      monthIncome: `¥${monthIncome.toFixed(2)}`,
      monthBalance: `¥${(monthIncome - monthExpense).toFixed(2)}`
    })
  },

  changeMonth(amount: number) {
    const date = new Date(this.data.year, this.data.month - 1 + amount, 1)
    const selectedDate = toDateKey(date)
    this.setData({ year: date.getFullYear(), month: date.getMonth() + 1, selectedDate })
    this.refreshView()
  },

  previousMonth() { this.changeMonth(-1) },
  nextMonth() { this.changeMonth(1) },

  goToday() {
    const today = fromDateKey(this.data.todayKey)
    this.setData({ year: today.getFullYear(), month: today.getMonth() + 1, selectedDate: this.data.todayKey })
    this.refreshView()
  },

  selectDate(event: any) {
    const key = String(event.currentTarget.dataset.key)
    const date = fromDateKey(key)
    this.setData({ selectedDate: key, year: date.getFullYear(), month: date.getMonth() + 1 })
    this.refreshView()
  },

  switchView(event: any) {
    this.setData({ viewMode: String(event.currentTarget.dataset.mode) })
    this.refreshView()
  },

  onSearchInput(event: any) {
    this.setData({ query: event.detail.value })
    this.refreshView()
  },

  clearSearch() {
    this.setData({ query: '' })
    this.refreshView()
  },

  openAdd(event?: any) {
    const date = event && event.currentTarget.dataset.date ? String(event.currentTarget.dataset.date) : this.data.selectedDate
    this.setData({
      editorVisible: true,
      editingId: '',
      form: { title: '', date, startTime: '09:00', endTime: '10:00', categoryIndex: 0, location: '', notes: '', color: this.data.categoryColors[0], teacher: '' }
    })
  },

  openEvent(event: any) {
    const id = String(event.currentTarget.dataset.id)
    const item = (this.data.events as CalendarEvent[]).find((entry) => entry.id === id)
    if (!item) return
    const categoryIndex = Math.max(0, this.data.categories.indexOf(item.category))
    this.setData({
      editorVisible: true,
      editingId: id,
      form: { ...item, categoryIndex }
    })
  },

  closeEditor() { this.setData({ editorVisible: false }) },

  onFormInput(event: any) {
    const field = String(event.currentTarget.dataset.field)
    this.setData({ [`form.${field}`]: event.detail.value })
  },

  onDateChange(event: any) { this.setData({ 'form.date': event.detail.value }) },
  onStartTimeChange(event: any) { this.setData({ 'form.startTime': event.detail.value }) },
  onEndTimeChange(event: any) { this.setData({ 'form.endTime': event.detail.value }) },

  onCategoryChange(event: any) {
    const index = Number(event.detail.value)
    this.setData({ 'form.categoryIndex': index, 'form.color': this.data.categoryColors[index] })
  },

  commitEvent(item: CalendarEvent) {
    const events = (this.data.events as CalendarEvent[]).filter((entry) => entry.id !== item.id)
    events.push(item)
    this.setData({ events: sortEvents(events), editorVisible: false, selectedDate: item.date })
    this.persist()
    this.refreshView()
    wx.showToast({ title: this.data.editingId ? '日程已更新' : '日程已添加', icon: 'success' })
  },

  saveEvent() {
    const form = this.data.form
    if (!String(form.title).trim()) {
      wx.showToast({ title: '请填写日程名称', icon: 'none' })
      return
    }
    if (minutesOf(form.endTime) <= minutesOf(form.startTime)) {
      wx.showToast({ title: '结束时间应晚于开始时间', icon: 'none' })
      return
    }
    const item: CalendarEvent = {
      id: this.data.editingId || makeId(),
      title: String(form.title).trim(), date: form.date, startTime: form.startTime, endTime: form.endTime,
      category: this.data.categories[Number(form.categoryIndex)], location: String(form.location || '').trim(),
      notes: String(form.notes || '').trim(), color: form.color, source: ((this.data.events as CalendarEvent[]).find((entry) => entry.id === this.data.editingId)?.source || 'personal') as EventSource,
      teacher: String((form as any).teacher || '').trim()
    }
    const conflict = (this.data.events as CalendarEvent[]).find((entry) =>
      entry.id !== item.id && entry.date === item.date && minutesOf(entry.startTime) < minutesOf(item.endTime) && minutesOf(entry.endTime) > minutesOf(item.startTime)
    )
    if (conflict) {
      wx.showModal({
        title: '发现时间冲突',
        content: `与“${conflict.title}”的时间重叠，仍要保存吗？`,
        success: (result) => { if (result.confirm) this.commitEvent(item) }
      })
      return
    }
    this.commitEvent(item)
  },

  deleteEvent() {
    if (!this.data.editingId) return
    wx.showModal({
      title: '删除日程', content: '删除后无法恢复，确定继续吗？', confirmColor: '#c9573e',
      success: (result) => {
        if (!result.confirm) return
        this.setData({ events: (this.data.events as CalendarEvent[]).filter((item) => item.id !== this.data.editingId), editorVisible: false })
        this.persist()
        this.refreshView()
      }
    })
  },

  toggleComplete(event: any) {
    const id = String(event.currentTarget.dataset.id)
    const events = (this.data.events as CalendarEvent[]).map((item) => item.id === id ? { ...item, completed: !item.completed } : item)
    this.setData({ events })
    this.persist()
    this.refreshView()
  },

  openSettings() { this.setData({ settingsVisible: true }) },
  closeSettings() { this.setData({ settingsVisible: false }) },

  onSettingsInput(event: any) {
    const field = String(event.currentTarget.dataset.field)
    this.setData({ [`settings.${field}`]: event.detail.value })
  },

  onSemesterStartChange(event: any) { this.setData({ 'settings.semesterStart': event.detail.value }) },
  onSemesterEndChange(event: any) { this.setData({ 'settings.semesterEnd': event.detail.value }) },

  onAccentChange(event: any) {
    const option = this.data.accentOptions[Number(event.detail.value)]
    this.setData({ 'settings.accent': option.value })
  },

  onWallpaperChange(event: any) {
    const option = this.data.wallpaperOptions[Number(event.detail.value)]
    this.setData({ 'settings.wallpaper': option.value })
    this.applyWallpaper()
  },

  onModelProviderChange(event: any) {
    const modelIndex = Number(event.detail.value)
    const option = MODEL_PRESETS[modelIndex] || MODEL_PRESETS[0]
    this.setData({
      modelIndex,
      'settings.modelPreset': option.id,
      'settings.modelProtocol': option.protocol,
      'settings.modelBaseUrl': option.baseUrl,
      'settings.modelName': option.model
    })
  },

  chooseWallpaper() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      success: (result) => {
        const tempFilePath = result.tempFiles[0].tempFilePath
        wx.getFileSystemManager().saveFile({
          tempFilePath,
          success: (saved) => {
            this.setData({ 'settings.wallpaper': 'custom', 'settings.customWallpaper': saved.savedFilePath })
            this.applyWallpaper()
          }
        })
      }
    })
  },

  saveSettings() {
    const settings = {
      ...this.data.settings,
      schoolName: String(this.data.settings.schoolName || '').trim() || '我的校园',
      portalUrl: String(this.data.settings.portalUrl || '').trim().replace(/\/$/, ''),
      periodTimes: String(this.data.settings.periodTimes || '').trim() || DEFAULT_PERIOD_TIMES,
      totalWeeks: Math.max(1, Number(this.data.settings.totalWeeks || 19)),
      focusMinutes: Math.max(1, Number(this.data.settings.focusMinutes || 25)),
      breakMinutes: Math.max(1, Number(this.data.settings.breakMinutes || 5)),
      cardOpacity: Math.max(70, Math.min(100, Number(this.data.settings.cardOpacity || 94))),
      modelBaseUrl: trimBaseUrl(this.data.settings.modelBaseUrl),
      modelName: String(this.data.settings.modelName || '').trim(),
      modelApiKey: String(this.data.settings.modelApiKey || '').trim()
    }
    const seconds = settings.focusMinutes * 60
    this.setData({
      settings,
      panelAlpha: settings.cardOpacity >= 100 ? '1' : `0.${settings.cardOpacity}`,
      settingsVisible: false,
      focus: { ...this.data.focus, durationSeconds: seconds, secondsLeft: seconds, display: this.formatSeconds(seconds), running: false }
    })
    if (timerId !== undefined) clearInterval(timerId)
    timerId = undefined
    this.applyWallpaper()
    this.persist()
    this.refreshView()
  },

  onFocusTaskInput(event: any) { this.setData({ 'focus.taskTitle': event.detail.value }) },

  switchTimerKind(event: any) {
    if (timerId !== undefined) clearInterval(timerId)
    timerId = undefined
    const kind = String(event.currentTarget.dataset.kind)
    const seconds = kind === 'stopwatch' ? 0 : this.data.settings.focusMinutes * 60
    this.setData({ focus: { ...this.data.focus, kind, mode: 'focus', running: false, durationSeconds: seconds, secondsLeft: seconds, display: this.formatSeconds(seconds) } })
  },

  onFocusDurationChange(event: any) {
    const kind = String(event.currentTarget.dataset.kind)
    const max = kind === 'focus' ? 180 : 60
    const minutes = Math.max(1, Math.min(max, Number(event.detail.value) || (kind === 'focus' ? 25 : 5)))
    const field = kind === 'focus' ? 'focusMinutes' : 'breakMinutes'
    this.setData({ [`settings.${field}`]: minutes })
    this.persist()
    this.resetTimer()
    wx.showToast({ title: `${kind === 'focus' ? '专注' : '休息'}时长已更新`, icon: 'none' })
  },

  toggleTimer() {
    if (this.data.focus.running) {
      if (timerId !== undefined) clearInterval(timerId)
      timerId = undefined
      this.setData({ 'focus.running': false })
      return
    }
    this.setData({ 'focus.running': true })
    timerId = setInterval(() => {
      const stopwatch = this.data.focus.kind === 'stopwatch'
      const next = Number(this.data.focus.secondsLeft) + (stopwatch ? 1 : -1)
      if (!stopwatch && next <= 0) {
        if (timerId !== undefined) clearInterval(timerId)
        timerId = undefined
        this.finishFocusRound()
        return
      }
      this.setData({ 'focus.secondsLeft': next, 'focus.display': this.formatSeconds(next) })
    }, 1000) as unknown as number
  },

  resetTimer() {
    if (timerId !== undefined) clearInterval(timerId)
    timerId = undefined
    const seconds = this.data.focus.kind === 'stopwatch' ? 0 : (this.data.focus.mode === 'focus' ? this.data.settings.focusMinutes * 60 : this.data.settings.breakMinutes * 60)
    this.setData({ 'focus.running': false, 'focus.secondsLeft': seconds, 'focus.durationSeconds': seconds, 'focus.display': this.formatSeconds(seconds) })
  },

  switchFocusMode(event: any) {
    if (timerId !== undefined) clearInterval(timerId)
    timerId = undefined
    if (this.data.focus.kind === 'stopwatch') return
    const mode = String(event.currentTarget.dataset.mode)
    const seconds = (mode === 'focus' ? this.data.settings.focusMinutes : this.data.settings.breakMinutes) * 60
    this.setData({
      focus: { ...this.data.focus, mode, running: false, durationSeconds: seconds, secondsLeft: seconds, display: this.formatSeconds(seconds) }
    })
  },

  finishFocusRound() {
    if (timerId !== undefined) clearInterval(timerId)
    timerId = undefined
    const stopwatch = this.data.focus.kind === 'stopwatch'
    if (stopwatch && Number(this.data.focus.secondsLeft) <= 0) {
      wx.showToast({ title: '请先开始计时', icon: 'none' })
      return
    }
    const isFocus = this.data.focus.mode === 'focus'
    if (!isFocus) {
      const seconds = this.data.settings.focusMinutes * 60
      this.setData({ focus: { ...this.data.focus, mode: 'focus', running: false, durationSeconds: seconds, secondsLeft: seconds, display: this.formatSeconds(seconds) } })
      wx.showToast({ title: '休息结束，继续加油', icon: 'none' })
      return
    }
    const minutes = stopwatch ? Math.max(1, Math.round(Number(this.data.focus.secondsLeft) / 60)) : this.data.settings.focusMinutes
    const rounds = Number(this.data.focus.roundsToday) + 1
    const total = Number(this.data.focus.focusedMinutesToday) + minutes
    const now = new Date()
    const endTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const start = new Date(now.getTime() - minutes * 60000)
    const focusEvent: CalendarEvent = {
      id: makeId('focus'), title: this.data.focus.taskTitle || (stopwatch ? '学习任务' : '专注时间'), date: this.data.todayKey,
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`, endTime, category: '学习', location: '',
      notes: `${stopwatch ? '正计时学习' : '倒计时专注'} ${minutes} 分钟`, color: '#c9573e', source: 'focus', completed: true
    }
    const breakSeconds = stopwatch ? 0 : this.data.settings.breakMinutes * 60
    this.setData({
      events: sortEvents([...(this.data.events as CalendarEvent[]), focusEvent]),
      focus: { ...this.data.focus, mode: stopwatch ? 'focus' : 'break', running: false, roundsToday: rounds, focusedMinutesToday: total, durationSeconds: breakSeconds, secondsLeft: breakSeconds, display: this.formatSeconds(breakSeconds) }
    })
    wx.setStorageSync(STORAGE_FOCUS, { date: this.data.todayKey, rounds, minutes: total })
    this.persist()
    this.refreshView()
    wx.showModal({ title: '学习记录已保存', content: `已记录 ${minutes} 分钟${stopwatch ? '学习' : '专注'}。`, showCancel: false })
  },

  openSync() { this.setData({ syncVisible: true, scheduleText: '' }) },
  closeSync() { this.setData({ syncVisible: false }) },
  openPortal() {
    const url = String(this.data.settings.portalUrl || '').trim()
    if (!url) { wx.showToast({ title: '请先在设置中填写教务入口', icon: 'none' }); return }
    wx.setClipboardData({ data: url })
  },

  chooseScheduleFile() {
    wx.chooseMessageFile({ count: 1, type: 'file', success: (result) => {
      const file = result.tempFiles[0]
      const name = String(file.name || file.path || '')
      const match = name.toLowerCase().match(/\.([a-z0-9]+)$/)
      const extension = match ? match[1] : ''
      if (!['pdf', 'txt', 'csv', 'docx', 'xlsx', 'xls'].includes(extension)) {
        wx.showModal({ title: '暂不支持这个文件', content: '请选择 PDF、TXT、CSV、DOCX、XLSX 或 XLS 课表。旧版 DOC 请先另存为 DOCX。', showCancel: false })
        return
      }
      if (Number(file.size || 0) > 8 * 1024 * 1024) {
        wx.showModal({ title: '文件过大', content: '请选择不超过 8MB 的课表文件。', showCancel: false })
        return
      }
      wx.setStorageSync(STORAGE_SELECTED_FILE, { path: file.path, name: file.name || `schedule.${extension}`, extension })
      wx.navigateTo({ url: extension === 'pdf' ? '/features/pdf-import/index' : '/features/office-import/index' })
    } })
  },

  onScheduleTextInput(event: any) { this.setData({ scheduleText: event.detail.value }) },

  async parseScheduleText() {
    const text = String(this.data.scheduleText || '').trim()
    if (text.length < 20) { wx.showToast({ title: '请先粘贴课表文本', icon: 'none' }); return }
    try {
      await this.parseWithOwnModel(text)
    } catch (error) {
      wx.hideLoading()
      wx.showModal({ title: '智能解析失败', content: error instanceof Error ? error.message : '课表解析失败，请稍后重试', showCancel: false })
    }
  },

  async parseWithOwnModel(scheduleText: string) {
    wx.showLoading({ title: '模型解析中', mask: true })
    const courses = await requestScheduleCourses(this.data.settings as Settings, scheduleText)
    this.replaceRemoteCourses(courses)
    this.setData({ syncVisible: false, scheduleText: '', syncStatus: `智能导入 ${courses.length} 门课程` })
    wx.hideLoading()
    wx.showToast({ title: `导入 ${courses.length} 门课程`, icon: 'success' })
  },

  replaceRemoteCourses(courses: CourseLike[]) {
    const personal = (this.data.events as CalendarEvent[]).filter((item) => item.source !== 'course')
    const remote = courses.flatMap((course, index) => courseToEvents(course, this.data.settings, index))
    this.setData({ events: sortEvents([...personal, ...remote]) })
    this.persist()
    this.refreshView()
  },

  openAccount(event?: any) { const id = event?.currentTarget?.dataset?.id || ''; const item = (this.data.accounts as AccountEntry[]).find((entry) => entry.id === id); this.setData({ accountEditingId: id, accountForm: { type: item?.type || 'expense', amount: item ? String(item.amount) : '', categoryIndex: item ? this.data.accountCategories.indexOf(item.category) : 0, date: item?.date || this.data.todayKey, note: item?.note || '' }, accountingVisible: true }) },
  closeAccount() { this.setData({ accountingVisible: false }) },
  onAccountInput(event: any) { const field = String(event.currentTarget.dataset.field); this.setData({ [`accountForm.${field}`]: event.detail.value }) },
  onAccountTypeChange(event: any) { this.setData({ 'accountForm.type': event.detail.value === '1' ? 'income' : 'expense' }) },
  onAccountCategoryChange(event: any) { this.setData({ 'accountForm.categoryIndex': Number(event.detail.value) }) },
  onAccountDateChange(event: any) { this.setData({ 'accountForm.date': event.detail.value }) },
  saveAccount() { const form = this.data.accountForm; const amount = Number(form.amount); if (!(amount > 0)) { wx.showToast({ title: '请输入金额', icon: 'none' }); return } const item: AccountEntry = { id: this.data.accountEditingId || makeId('account'), type: form.type as 'income' | 'expense', amount, category: this.data.accountCategories[Number(form.categoryIndex)], date: form.date || this.data.todayKey, note: String(form.note || '').trim() }; const accounts = [...(this.data.accounts as AccountEntry[]).filter((entry) => entry.id !== item.id), item]; this.setData({ accounts, accountingVisible: false }); this.persist(); this.refreshView(); wx.showToast({ title: '已保存', icon: 'success' }) },
  deleteAccount() { if (!this.data.accountEditingId) return; wx.showModal({ title: '删除账目', content: '确定删除这笔记录吗？', confirmColor: '#c9573e', success: (r) => { if (!r.confirm) return; this.setData({ accounts: (this.data.accounts as AccountEntry[]).filter((item) => item.id !== this.data.accountEditingId), accountingVisible: false }); this.persist(); this.refreshView() } }) }
})
