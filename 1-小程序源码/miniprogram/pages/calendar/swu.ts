type EventSource = 'personal' | 'course' | 'focus'

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
  aiServiceUrl: string
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
}

const STORAGE_EVENTS = 'swu-calendar-events-v2'
const STORAGE_SETTINGS = 'swu-calendar-settings-v2'
const STORAGE_FOCUS = 'swu-calendar-focus-v2'
const STORAGE_ACCOUNTS = 'swu-calendar-accounts-v1'
let timerId: number | undefined

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
    aiServiceUrl: 'http://127.0.0.1:8788/api/schedule/parse'
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

const timeFromSessions = (raw = '') => {
  const first = Number((raw.match(/\d+/) || ['1'])[0])
  const table: Record<number, [string, string]> = {
    1: ['08:00', '09:40'],
    3: ['10:10', '11:50'],
    5: ['14:00', '15:40'],
    7: ['16:10', '17:50'],
    9: ['19:00', '20:40'],
    11: ['20:50', '22:20']
  }
  return table[first] || ['08:00', '09:40']
}

const courseToEvents = (course: CourseLike, settings: Settings, courseIndex: number): CalendarEvent[] => {
  const title = course.title || course.kcmc || '未命名课程'
  const teacher = course.teacher || course.xm || ''
  const location = course.place || course.cdmc || ''
  const sessions = course.sessions || course.jc || '1-2节'
  const times = timeFromSessions(sessions)
  if (course.date) {
    return [{
      id: `course-${course.id || course.course_id || courseIndex}-${course.date}`,
      title,
      date: course.date,
      startTime: times[0],
      endTime: times[1],
      category: '课程',
      location,
      notes: sessions,
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
      notes: `第${week}周 · ${sessions}`,
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
      mode: 'focus', running: false, durationSeconds: 1500, secondsLeft: 1500,
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
    const initialEvents: CalendarEvent[] = savedEvents && savedEvents.length ? savedEvents : [
      {
        id: makeId('welcome'), title: '完成校园日历实验', date: todayKey, startTime: '19:00', endTime: '20:30',
        category: '学习', location: '图书馆', notes: '体验新增、编辑、搜索和番茄钟。', color: '#d76a4a', source: 'personal'
      }
    ]
    const focusSeconds = settings.focusMinutes * 60
    this.setData({
      todayKey,
      selectedDate: todayKey,
      year: now.getFullYear(),
      month: now.getMonth() + 1,
      settings,
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
      totalWeeks: Math.max(1, Number(this.data.settings.totalWeeks || 19)),
      focusMinutes: Math.max(1, Number(this.data.settings.focusMinutes || 25)),
      breakMinutes: Math.max(1, Number(this.data.settings.breakMinutes || 5)),
      cardOpacity: Math.max(70, Math.min(100, Number(this.data.settings.cardOpacity || 94))),
      aiServiceUrl: String(this.data.settings.aiServiceUrl || '').replace(/\/$/, '')
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
      const next = Number(this.data.focus.secondsLeft) - 1
      if (next <= 0) {
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
    const seconds = this.data.focus.mode === 'focus' ? this.data.settings.focusMinutes * 60 : this.data.settings.breakMinutes * 60
    this.setData({ 'focus.running': false, 'focus.secondsLeft': seconds, 'focus.durationSeconds': seconds, 'focus.display': this.formatSeconds(seconds) })
  },

  switchFocusMode(event: any) {
    if (timerId !== undefined) clearInterval(timerId)
    timerId = undefined
    const mode = String(event.currentTarget.dataset.mode)
    const seconds = (mode === 'focus' ? this.data.settings.focusMinutes : this.data.settings.breakMinutes) * 60
    this.setData({
      focus: { ...this.data.focus, mode, running: false, durationSeconds: seconds, secondsLeft: seconds, display: this.formatSeconds(seconds) }
    })
  },

  finishFocusRound() {
    const isFocus = this.data.focus.mode === 'focus'
    if (!isFocus) {
      const seconds = this.data.settings.focusMinutes * 60
      this.setData({ focus: { ...this.data.focus, mode: 'focus', running: false, durationSeconds: seconds, secondsLeft: seconds, display: this.formatSeconds(seconds) } })
      wx.showToast({ title: '休息结束，继续加油', icon: 'none' })
      return
    }
    const minutes = this.data.settings.focusMinutes
    const rounds = Number(this.data.focus.roundsToday) + 1
    const total = Number(this.data.focus.focusedMinutesToday) + minutes
    const now = new Date()
    const endTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`
    const start = new Date(now.getTime() - minutes * 60000)
    const focusEvent: CalendarEvent = {
      id: makeId('focus'), title: this.data.focus.taskTitle || '专注时间', date: this.data.todayKey,
      startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`, endTime, category: '学习', location: '',
      notes: `完成 ${minutes} 分钟番茄钟`, color: '#c9573e', source: 'focus', completed: true
    }
    const breakSeconds = this.data.settings.breakMinutes * 60
    this.setData({
      events: sortEvents([...(this.data.events as CalendarEvent[]), focusEvent]),
      focus: { ...this.data.focus, mode: 'break', running: false, roundsToday: rounds, focusedMinutesToday: total, durationSeconds: breakSeconds, secondsLeft: breakSeconds, display: this.formatSeconds(breakSeconds) }
    })
    wx.setStorageSync(STORAGE_FOCUS, { date: this.data.todayKey, rounds, minutes: total })
    this.persist()
    this.refreshView()
    wx.showModal({ title: '完成一个番茄钟', content: `已专注 ${minutes} 分钟，休息一下吧。`, showCancel: false })
  },

  openSync() { this.setData({ syncVisible: true }) },
  closeSync() { this.setData({ syncVisible: false }) },
  openJw() { wx.setClipboardData({ data: 'https://ywtb.swu.edu.cn/new-office-hall-pc/index.html#/' }); wx.showToast({ title: '办事大厅网址已复制', icon: 'none' }) },

  chooseScheduleFile() {
    wx.chooseMessageFile({ count: 1, type: 'file', success: (result) => {
      const file = result.tempFiles[0]
      if (!/\.pdf$/i.test(file.name || file.path)) { wx.showToast({ title: '请选择 PDF 课表', icon: 'none' }); return }
      const url = String(this.data.settings.aiServiceUrl || '')
      if (!url) { wx.showModal({ title: '缺少服务地址', content: '请在日历设置中填写智能课表解析服务地址。', showCancel: false }); return }
      wx.showLoading({ title: '模型解析中' })
      wx.uploadFile({
        url, filePath: file.path, name: 'schedule',
        success: (response) => {
          try {
            const body = JSON.parse(response.data || '{}')
            if (response.statusCode < 200 || response.statusCode >= 300 || !Array.isArray(body.courses) || !body.courses.length) throw new Error(body.error || '模型未返回有效课程')
            this.replaceRemoteCourses(body.courses)
            this.setData({ syncVisible: false, syncStatus: `智能导入 ${body.courses.length} 门课程` })
            wx.showToast({ title: `导入 ${body.courses.length} 门课程`, icon: 'success' })
          } catch (error) { wx.showModal({ title: '智能解析失败', content: error instanceof Error ? error.message : '服务返回异常', showCancel: false }) }
        },
        fail: (error) => wx.showModal({ title: '无法连接解析服务', content: error.errMsg || '网络请求失败', showCancel: false }),
        complete: () => wx.hideLoading()
      })
    } })
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
