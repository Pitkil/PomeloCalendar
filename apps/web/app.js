'use strict';

const STORAGE_EVENTS = 'swu-calendar-events-v2';
const STORAGE_SETTINGS = 'swu-calendar-settings-v2';
const STORAGE_FOCUS = 'swu-calendar-focus-v2';
const STORAGE_ACCOUNTS = 'swu-calendar-accounts-v1';
const AI_SERVICE_URL = 'https://swu-calendar-ai-314241-5-1488632993.sh.run.tcloudbase.com/api/schedule/parse';
const DEFAULT_PERIOD_TIMES = '08:00-08:45,08:55-09:40,10:00-10:45,10:55-11:40,12:10-12:55,13:05-13:50,14:00-14:45,14:55-15:40,15:50-16:35,16:55-17:40,17:50-18:35,19:20-20:05,20:15-21:00,21:10-21:55';
const $ = (id) => document.getElementById(id);
const pad = (value) => String(value).padStart(2, '0');
const toDateKey = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const fromDateKey = (key) => new Date(`${key}T00:00:00`);
const addDays = (date, amount) => { const next = new Date(date); next.setDate(next.getDate() + amount); return next; };
const uid = (prefix = 'event') => `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
const minutesOf = (value) => { const [hours, minutes] = (value || '00:00').split(':').map(Number); return hours * 60 + minutes; };
const sortEvents = (events) => [...events].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));

function loadJson(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}

function defaultSettings() {
  const now = new Date();
  const firstTerm = now.getMonth() >= 7;
  const startYear = firstTerm ? now.getFullYear() : now.getFullYear() - 1;
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
    opacity: 94,
    aiServiceUrl: AI_SERVICE_URL
  };
}

const today = toDateKey(new Date());
const settings = { ...defaultSettings(), ...loadJson(STORAGE_SETTINGS, {}) };
if (!settings.aiServiceUrl || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\//.test(settings.aiServiceUrl)) settings.aiServiceUrl = AI_SERVICE_URL;
const initialEvents = [];
const focusRecord = loadJson(STORAGE_FOCUS, { date: today, rounds: 0, minutes: 0 });

const state = {
  settings,
  events: loadJson(STORAGE_EVENTS, initialEvents).filter((item) => !(item.id?.startsWith('welcome-') && item.title === '完成校园日历实验' && item.notes === '体验新增、编辑、搜索和番茄钟。')),
  accounts: loadJson(STORAGE_ACCOUNTS, []),
  selectedDate: today,
  cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  view: 'month',
  query: '',
  editingId: '',
  editingAccountId: '',
  importFile: null,
  timer: {
    kind: 'countdown',
    mode: 'focus',
    running: false,
    duration: settings.focusMinutes * 60,
    left: settings.focusMinutes * 60,
    handle: null,
    rounds: focusRecord.date === today ? Number(focusRecord.rounds || 0) : 0,
    minutes: focusRecord.date === today ? Number(focusRecord.minutes || 0) : 0
  }
};

const categoryColors = { 学习: '#d76a4a', 课程: '#176b55', 考试: '#a34f54', 作业: '#d29b36', 活动: '#3d6f89', 生活: '#7a6a58' };

function save() {
  localStorage.setItem(STORAGE_EVENTS, JSON.stringify(state.events));
  localStorage.setItem(STORAGE_SETTINGS, JSON.stringify(state.settings));
  localStorage.setItem(STORAGE_ACCOUNTS, JSON.stringify(state.accounts));
}

function teachingWeekOf(dateKey) {
  const diff = Math.floor((fromDateKey(dateKey) - fromDateKey(state.settings.semesterStart)) / 86400000);
  const week = Math.floor(diff / 7) + 1;
  return week >= 1 && week <= Number(state.settings.totalWeeks) ? week : 0;
}

function mondayOf(date) {
  const weekday = date.getDay() || 7;
  return addDays(date, 1 - weekday);
}

function formatLongDate(key) {
  const date = fromDateKey(key);
  return `${date.getMonth() + 1}月${date.getDate()}日 · 周${['日', '一', '二', '三', '四', '五', '六'][date.getDay()]}`;
}

function showToast(message) {
  const toast = $('toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.handle);
  showToast.handle = setTimeout(() => toast.classList.remove('show'), 2300);
}

function applyAppearance() {
  document.documentElement.style.setProperty('--accent', state.settings.accent);
  document.documentElement.style.setProperty('--paper-alpha', Math.max(.72, Math.min(1, Number(state.settings.opacity) / 100)));
  document.querySelector('meta[name="theme-color"]').setAttribute('content', state.settings.accent);
  document.body.dataset.wallpaper = state.settings.wallpaper;
  document.body.style.backgroundImage = '';
  if (state.settings.wallpaper === 'custom' && state.settings.customWallpaper) {
    document.body.style.backgroundImage = `linear-gradient(rgba(244,241,232,.22), rgba(244,241,232,.22)), url("${state.settings.customWallpaper}")`;
  }
}

function renderHeader() {
  const week = teachingWeekOf(state.selectedDate);
  $('semesterLine').textContent = `${state.settings.schoolName} · ${state.settings.semesterTitle} · ${week ? `第 ${week} 教学周` : '假期 / 未排课'}`;
  const now = new Date();
  $('todayDate').textContent = `${now.getMonth() + 1}月${now.getDate()}日 · 周${['日', '一', '二', '三', '四', '五', '六'][now.getDay()]}`;
  const todayEvents = sortEvents(state.events.filter((item) => item.date === today));
  $('todayCount').textContent = todayEvents.length;
  $('completedCount').textContent = todayEvents.filter((item) => item.completed).length;
  $('focusMinutes').textContent = state.timer.minutes;
  renderNextEvent(todayEvents);
}

function renderNextEvent(todayEvents) {
  const now = new Date();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const next = todayEvents.find((item) => minutesOf(item.endTime) > nowMinutes && !item.completed);
  if (!next) {
    $('nextCard').innerHTML = '<span class="micro-label">NEXT UP</span><h3>今天余下时间自由</h3><p>可以安排一次专注，或者给自己留一点空白。</p><span class="countdown">暂无待办</span>';
    return;
  }
  const until = Math.max(0, minutesOf(next.startTime) - nowMinutes);
  const status = until ? `${Math.floor(until / 60) ? `${Math.floor(until / 60)}小时` : ''}${until % 60}分钟后` : '正在进行';
  $('nextCard').innerHTML = `<span class="micro-label">NEXT UP</span><h3>${escapeHtml(next.title)}</h3><p>${escapeHtml(next.location || next.category)} · ${next.startTime}-${next.endTime}</p><span class="countdown">${status}</span>`;
}

function renderMonth() {
  const year = state.cursor.getFullYear();
  const month = state.cursor.getMonth();
  $('monthTitle').textContent = `${year}年${month + 1}月`;
  const first = new Date(year, month, 1);
  const gridStart = mondayOf(first);
  const rows = [];
  for (let row = 0; row < 6; row += 1) {
    const days = [];
    const mondayKey = toDateKey(addDays(gridStart, row * 7));
    days.push(`<div class="week-number" title="教学周">${teachingWeekOf(mondayKey) || '·'}</div>`);
    for (let col = 0; col < 7; col += 1) {
      const date = addDays(gridStart, row * 7 + col);
      const key = toDateKey(date);
      const dayEvents = state.events.filter((item) => item.date === key && matchesQuery(item));
      const classes = ['day-cell'];
      if (date.getMonth() !== month) classes.push('muted-day');
      if (key === today) classes.push('today');
      if (key === state.selectedDate) classes.push('selected');
      const eventLabels = dayEvents.slice(0, 2).map((item) => `<span class="cell-event" style="background:${item.color}18">${escapeHtml(item.title)}</span>`).join('');
      const more = dayEvents.length > 2 ? `<span class="cell-more">还有 ${dayEvents.length - 2} 项</span>` : '';
      days.push(`<button class="${classes.join(' ')}" data-date="${key}"><span class="day-number">${date.getDate()}</span><span class="cell-events">${eventLabels}${more}</span></button>`);
    }
    rows.push(`<div class="month-row">${days.join('')}</div>`);
  }
  $('monthGrid').innerHTML = rows.join('');
}

function renderWeek() {
  const start = mondayOf(fromDateKey(state.selectedDate));
  const week = teachingWeekOf(toDateKey(start));
  $('weekTitle').textContent = week ? `第 ${week} 教学周` : '假期 / 未排课';
  $('weekGrid').innerHTML = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(start, index);
    const key = toDateKey(date);
    const events = sortEvents(state.events.filter((item) => item.date === key && matchesQuery(item)));
    const visibleEvents = events.slice(0, 2);
    const cards = events.length ? `${visibleEvents.map((item) => `<article class="week-event" data-event-id="${item.id}" style="--event-color:${item.color}"><strong>${escapeHtml(item.title)}</strong><span>${item.startTime}-${item.endTime}</span><span>${escapeHtml(item.location || item.category)}</span></article>`).join('')}${events.length > 2 ? `<div class="week-more">+${events.length - 2} 门课程</div>` : ''}` : '<div class="free-day">空闲</div>';
    return `<div class="week-day ${key === today ? 'is-today' : ''}"><button class="week-day-head" data-date="${key}"><span>周${['一', '二', '三', '四', '五', '六', '日'][index]}</span><span>${date.getMonth() + 1}/${date.getDate()}</span></button>${cards}</div>`;
  }).join('');
}

function matchesQuery(item) {
  const query = state.query.trim().toLowerCase();
  if (!query) return true;
  return `${item.title}${item.teacher || ''}${item.location || ''}${item.category || ''}${item.notes || ''}`.toLowerCase().includes(query);
}

function renderAgenda() {
  const week = teachingWeekOf(state.selectedDate);
  $('selectedDateTitle').textContent = formatLongDate(state.selectedDate);
  $('selectedWeekLabel').textContent = week ? `第 ${week} 教学周` : '假期 / 未排课';
  const events = sortEvents(state.events.filter((item) => item.date === state.selectedDate && matchesQuery(item)));
  if (!events.length) {
    $('agendaList').innerHTML = '<div class="empty-state"><span class="empty-icon">☀</span><b>这一天还没有安排</b><span>给自己留白，或者添加一件想完成的事。</span></div>';
    return;
  }
  $('agendaList').innerHTML = `<div class="agenda-list">${events.map((item) => `
    <article class="agenda-event ${item.completed ? 'done' : ''}" style="--event-color:${item.color}">
      <div class="event-time">${item.startTime}<small>${item.endTime}</small></div>
      <div class="event-stripe"></div>
      <div class="event-copy" data-event-id="${item.id}">
        <h3>${escapeHtml(item.title)}<span class="source-chip">${item.source === 'course' ? '教务' : item.source === 'focus' ? '专注' : escapeHtml(item.category)}</span></h3>
        <p>${item.location ? `⌖ ${escapeHtml(item.location)}` : escapeHtml(item.category)}${item.teacher ? ` · ${escapeHtml(item.teacher)}` : ''}</p>
        ${item.notes ? `<p>${escapeHtml(item.notes)}</p>` : ''}
      </div>
      ${item.source === 'course' ? '' : `<button class="complete-button ${item.completed ? 'checked' : ''}" data-complete-id="${item.id}" aria-label="标记完成">${item.completed ? '✓' : ''}</button>`}
    </article>`).join('')}</div>`;
}

function renderSearch() {
  const query = state.query.trim();
  $('searchResultsSection').classList.toggle('hidden', !query);
  if (!query) return;
  const results = sortEvents(state.events.filter(matchesQuery)).slice(0, 40);
  $('searchCount').textContent = `${results.length} 项`;
  $('searchResults').innerHTML = results.length ? results.map((item) => `<div class="search-result" data-search-date="${item.date}"><i style="--event-color:${item.color}"></i><div><strong>${escapeHtml(item.title)}</strong><small>${item.date} · ${item.startTime} · ${escapeHtml(item.location || item.category)}</small></div><span class="subtle">查看</span></div>`).join('') : '<div class="empty-state"><b>没有找到相关安排</b><span>换一个课程名、老师或地点试试。</span></div>';
}

function renderViews() {
  document.querySelectorAll('.view-tab').forEach((button) => button.classList.toggle('active', button.dataset.view === state.view));
  $('monthView').classList.toggle('hidden', state.view !== 'month');
  $('weekView').classList.toggle('hidden', state.view !== 'week');
  $('focusView').classList.toggle('hidden', state.view !== 'focus');
  $('accountingView').classList.toggle('hidden', state.view !== 'accounting');
  $('statsView').classList.toggle('hidden', state.view !== 'stats');
  const utilityView = state.view === 'focus' || state.view === 'accounting' || state.view === 'stats';
  $('agendaPanel').classList.toggle('hidden', utilityView);
  $('floatingAdd').classList.toggle('hidden', utilityView);
}

function renderAccounting() {
  const prefix = today.slice(0, 7);
  const rows = state.accounts.filter((item) => item.date.startsWith(prefix)).sort((a, b) => b.date.localeCompare(a.date));
  const expense = rows.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
  const income = rows.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
  $('monthExpense').textContent = `¥${expense.toFixed(2)}`;
  $('monthIncome').textContent = `¥${income.toFixed(2)}`;
  $('monthBalance').textContent = `¥${(income - expense).toFixed(2)}`;
  const totals = {};
  rows.filter((item) => item.type === 'expense').forEach((item) => { totals[item.category] = (totals[item.category] || 0) + Number(item.amount); });
  $('categoryStats').innerHTML = Object.keys(totals).length ? Object.entries(totals).sort((a,b) => b[1]-a[1]).map(([name, amount]) => `<div class="category-stat"><span>${escapeHtml(name)}</span><strong>¥${amount.toFixed(2)}</strong><i style="width:${Math.min(100, amount / Math.max(expense, 1) * 100)}%"></i></div>`).join('') : '<div class="empty-state"><b>本月还没有消费</b><span>记下第一笔，让预算更有方向。</span></div>';
  $('ledgerList').innerHTML = rows.length ? rows.map((item) => `<article class="ledger-item" data-account-id="${item.id}"><div class="ledger-icon ${item.type}">${item.type === 'income' ? '↑' : '↓'}</div><div><strong>${escapeHtml(item.category)}</strong><small>${item.date}${item.note ? ` · ${escapeHtml(item.note)}` : ''}</small></div><b class="${item.type}">${item.type === 'income' ? '+' : '-'}¥${Number(item.amount).toFixed(2)}</b></article>`).join('') : '<div class="empty-state"><b>账本是空的</b><span>点击“记一笔”开始记录。</span></div>';
}

function renderTimer() {
  const timer = state.timer;
  $('timerDisplay').textContent = `${pad(Math.floor(timer.left / 60))}:${pad(timer.left % 60)}`;
  $('timerMode').textContent = timer.kind === 'stopwatch' ? '学习计时' : timer.mode === 'focus' ? '专注时间' : '休息时间';
  $('timerToggle').textContent = timer.running ? '暂停' : timer.kind === 'stopwatch' ? '开始计时' : timer.mode === 'focus' ? '开始专注' : '开始休息';
  $('roundDisplay').textContent = `今日第 ${timer.rounds + 1} 轮`;
  $('focusLengthLabel').textContent = state.settings.focusMinutes;
  $('breakLengthLabel').textContent = state.settings.breakMinutes;
  $('focusDurationFocus').value = state.settings.focusMinutes;
  $('focusDurationBreak').value = state.settings.breakMinutes;
  document.querySelectorAll('[data-focus-mode]').forEach((button) => button.classList.toggle('active', button.dataset.focusMode === timer.mode));
  document.querySelectorAll('[data-timer-kind]').forEach((button) => button.classList.toggle('active', button.dataset.timerKind === timer.kind));
  $('focusModeSwitch').classList.toggle('hidden', timer.kind === 'stopwatch');
  $('focusDurationControls').classList.toggle('hidden', timer.kind === 'stopwatch');
  $('timerFinish').classList.toggle('hidden', timer.kind !== 'stopwatch' || timer.left <= 0);
  const progress = timer.kind === 'stopwatch' ? (timer.left % 3600) / 3600 * 360 : timer.duration ? (1 - timer.left / timer.duration) * 360 : 0;
  $('timerRing').style.setProperty('--progress', `${progress}deg`);
  renderRecentFocus();
}

function focusMinutesOf(item) {
  const noted = Number(String(item.notes || '').match(/(\d+)\s*分钟/)?.[1] || 0);
  return Math.max(1, noted || minutesOf(item.endTime) - minutesOf(item.startTime) || 1);
}

function renderRecentFocus() {
  const rows = state.events.filter((item) => item.source === 'focus').sort((a, b) => `${b.date}${b.endTime}`.localeCompare(`${a.date}${a.endTime}`)).slice(0, 4);
  $('recentFocusCount').textContent = `${rows.length} 条`;
  $('recentFocusList').innerHTML = rows.length ? rows.map((item) => `<div class="recent-focus-row"><div><strong>${escapeHtml(item.title)}</strong><small>${item.date} · ${item.startTime}-${item.endTime}</small></div><span>${escapeHtml(item.notes)}</span></div>`).join('') : '<div class="empty-state compact"><b>还没有学习记录</b><span>输入任务后开始第一次计时吧。</span></div>';
}

function renderStatistics() {
  const focusEvents = state.events.filter((item) => item.source === 'focus');
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(fromDateKey(today), index - 6);
    const key = toDateKey(date);
    return { key, label: ['日', '一', '二', '三', '四', '五', '六'][date.getDay()], minutes: focusEvents.filter((item) => item.date === key).reduce((sum, item) => sum + focusMinutesOf(item), 0) };
  });
  const week = days.reduce((sum, item) => sum + item.minutes, 0);
  $('studyToday').textContent = days[6].minutes;
  $('studyWeek').textContent = week;
  $('studyAverage').textContent = Math.round(week / 7);
  const studyMax = Math.max(1, ...days.map((item) => item.minutes));
  $('studyChart').innerHTML = week ? days.map((item) => `<div class="study-column"><span>${item.minutes || ''}</span><i style="height:${Math.max(item.minutes ? 10 : 2, item.minutes / studyMax * 100)}%"></i><small>周${item.label}</small></div>`).join('') : '<div class="empty-state compact"><b>暂无学习数据</b><span>完成一次计时任务后，这里会生成趋势。</span></div>';

  const currentPrefix = today.slice(0, 7);
  const currentRows = state.accounts.filter((item) => item.date.startsWith(currentPrefix));
  const income = currentRows.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0);
  const expense = currentRows.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0);
  $('statsIncome').textContent = `¥${income.toFixed(2)}`;
  $('statsExpense').textContent = `¥${expense.toFixed(2)}`;
  $('statsBalance').textContent = `¥${(income - expense).toFixed(2)}`;
  const now = fromDateKey(today);
  const months = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() + index - 5, 1);
    const prefix = `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
    const rows = state.accounts.filter((item) => item.date.startsWith(prefix));
    return { label: `${date.getMonth() + 1}月`, income: rows.filter((item) => item.type === 'income').reduce((sum, item) => sum + Number(item.amount), 0), expense: rows.filter((item) => item.type === 'expense').reduce((sum, item) => sum + Number(item.amount), 0) };
  });
  const moneyMax = Math.max(1, ...months.flatMap((item) => [item.income, item.expense]));
  $('financeChart').innerHTML = months.some((item) => item.income > 0 || item.expense > 0) ? months.map((item) => `<div class="finance-column"><div><i class="income" style="height:${Math.max(item.income ? 8 : 2, item.income / moneyMax * 100)}%"></i><i class="expense" style="height:${Math.max(item.expense ? 8 : 2, item.expense / moneyMax * 100)}%"></i></div><small>${item.label}</small></div>`).join('') : '<div class="empty-state compact"><b>暂无收支数据</b><span>记下收入或支出后，这里会显示趋势。</span></div>';
}

function updateFocusDuration(kind, value) {
  const max = kind === 'focus' ? 180 : 60;
  const minutes = Math.max(1, Math.min(max, Number(value) || (kind === 'focus' ? 25 : 5)));
  state.settings[kind === 'focus' ? 'focusMinutes' : 'breakMinutes'] = minutes;
  save();
  resetTimer(state.timer.mode);
  renderAll();
  showToast(`${kind === 'focus' ? '专注' : '休息'}时长已设为 ${minutes} 分钟`);
}

function renderAll() {
  applyAppearance();
  renderHeader();
  renderViews();
  renderMonth();
  renderWeek();
  renderAgenda();
  renderSearch();
  renderAccounting();
  renderTimer();
  renderStatistics();
  $('syncStatus').textContent = localStorage.getItem('swu-calendar-sync-status') || '尚未导入课表';
}

function selectDate(key, scroll = false) {
  state.selectedDate = key;
  const date = fromDateKey(key);
  state.cursor = new Date(date.getFullYear(), date.getMonth(), 1);
  renderAll();
  if (scroll) $('agendaPanel').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openEventDialog(id = '') {
  state.editingId = id;
  const item = id ? state.events.find((entry) => entry.id === id) : null;
  $('eventDialogTitle').textContent = item ? '编辑日程' : '新增日程';
  $('eventTitle').value = item?.title || '';
  $('eventDate').value = item?.date || state.selectedDate;
  $('eventStart').value = item?.startTime || '09:00';
  $('eventEnd').value = item?.endTime || '10:00';
  $('eventCategory').value = item?.category || '学习';
  $('eventLocation').value = item?.location || '';
  $('eventTeacher').value = item?.teacher || '';
  $('eventNotes').value = item?.notes || '';
  $('deleteEvent').classList.toggle('hidden', !item);
  $('eventDialog').showModal();
  setTimeout(() => $('eventTitle').focus(), 60);
}

function commitEvent(item) {
  state.events = sortEvents([...state.events.filter((entry) => entry.id !== item.id), item]);
  state.selectedDate = item.date;
  state.cursor = new Date(fromDateKey(item.date).getFullYear(), fromDateKey(item.date).getMonth(), 1);
  save();
  $('eventDialog').close();
  renderAll();
  showToast(state.editingId ? '日程已更新' : '日程已添加');
}

function submitEvent(event) {
  event.preventDefault();
  const startTime = $('eventStart').value;
  const endTime = $('eventEnd').value;
  if (minutesOf(endTime) <= minutesOf(startTime)) {
    showToast('结束时间应晚于开始时间');
    return;
  }
  const category = $('eventCategory').value;
  const existing = state.events.find((entry) => entry.id === state.editingId);
  const item = {
    id: state.editingId || uid(),
    title: $('eventTitle').value.trim(),
    date: $('eventDate').value,
    startTime,
    endTime,
    category,
    location: $('eventLocation').value.trim(),
    notes: $('eventNotes').value.trim(),
    color: categoryColors[category] || '#d76a4a',
    source: existing?.source || 'personal',
    teacher: $('eventTeacher').value.trim(),
    completed: existing?.completed || false
  };
  const conflict = state.events.find((entry) => entry.id !== item.id && entry.date === item.date && minutesOf(entry.startTime) < minutesOf(item.endTime) && minutesOf(entry.endTime) > minutesOf(item.startTime));
  if (conflict && !confirm(`与“${conflict.title}”的时间重叠，仍要保存吗？`)) return;
  commitEvent(item);
}

function deleteCurrentEvent() {
  if (!state.editingId || !confirm('删除后无法恢复，确定继续吗？')) return;
  state.events = state.events.filter((item) => item.id !== state.editingId);
  save();
  $('eventDialog').close();
  renderAll();
  showToast('日程已删除');
}

function openSettings() {
  $('settingSchoolName').value = state.settings.schoolName || '我的校园';
  $('settingPortalUrl').value = state.settings.portalUrl || '';
  $('settingPeriodTimes').value = state.settings.periodTimes || DEFAULT_PERIOD_TIMES;
  $('settingSemesterTitle').value = state.settings.semesterTitle;
  $('settingSemesterStart').value = state.settings.semesterStart;
  $('settingSemesterEnd').value = state.settings.semesterEnd;
  $('settingTotalWeeks').value = state.settings.totalWeeks;
  $('settingAccent').value = state.settings.accent;
  $('settingWallpaper').value = state.settings.wallpaper === 'custom' ? 'paper' : state.settings.wallpaper;
  $('settingOpacity').value = state.settings.opacity;
  $('settingAiServiceUrl').value = state.settings.aiServiceUrl || '';
  $('settingsDialog').showModal();
}

function submitSettings(event) {
  event.preventDefault();
  Object.assign(state.settings, {
    schoolName: $('settingSchoolName').value.trim() || '我的校园',
    portalUrl: $('settingPortalUrl').value.trim().replace(/\/$/, ''),
    periodTimes: $('settingPeriodTimes').value.trim() || DEFAULT_PERIOD_TIMES,
    semesterTitle: $('settingSemesterTitle').value.trim() || state.settings.semesterTitle,
    semesterStart: $('settingSemesterStart').value,
    semesterEnd: $('settingSemesterEnd').value,
    totalWeeks: Math.max(1, Number($('settingTotalWeeks').value || 19)),
    accent: $('settingAccent').value,
    wallpaper: state.settings.wallpaper === 'custom' && state.settings.customWallpaper ? 'custom' : $('settingWallpaper').value,
    opacity: Math.max(72, Math.min(100, Number($('settingOpacity').value || 94))),
    aiServiceUrl: $('settingAiServiceUrl').value.trim().replace(/\/$/, '')
  });
  resetTimer(state.timer.mode);
  save();
  $('settingsDialog').close();
  renderAll();
  showToast('设置已保存');
}

function parseWeeks(raw, totalWeeks) {
  if (Array.isArray(raw)) return raw.map(Number).filter((week) => week >= 1 && week <= totalWeeks);
  if (!raw) return Array.from({ length: totalWeeks }, (_, index) => index + 1);
  const text = String(raw);
  const oddOnly = text.includes('单');
  const evenOnly = text.includes('双');
  const result = new Set();
  (text.match(/\d+\s*-\s*\d+|\d+/g) || []).forEach((range) => {
    const [start, rawEnd] = range.split('-').map((part) => Number(part.trim()));
    const end = rawEnd || start;
    for (let week = start; week <= end; week += 1) {
      if (week < 1 || week > totalWeeks || (oddOnly && week % 2 === 0) || (evenOnly && week % 2 !== 0)) continue;
      result.add(week);
    }
  });
  return result.size ? [...result] : Array.from({ length: totalWeeks }, (_, index) => index + 1);
}

function sectionTimes(raw = '') {
  const configured = String(state.settings.periodTimes || DEFAULT_PERIOD_TIMES).split(/[,，\n]/).map((item) => item.trim().match(/^(\d{1,2}:\d{2})\s*[-~—至]\s*(\d{1,2}:\d{2})$/)).filter(Boolean);
  const fallback = DEFAULT_PERIOD_TIMES.split(',').map((item) => item.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/));
  const schedule = configured.length ? configured : fallback;
  const sections = (String(raw).match(/\d+/g) || ['1']).map(Number);
  const first = Math.max(1, Math.min(schedule.length, sections[0] || 1));
  const last = Math.max(first, Math.min(schedule.length, sections[sections.length - 1] || first));
  return [schedule[first - 1]?.[1] || '08:00', schedule[last - 1]?.[2] || '09:40'];
}

function courseToEvents(course, index) {
  const title = course.title || course.kcmc || '未命名课程';
  const teacher = course.teacher || course.xm || '';
  const location = course.place || course.cdmc || '';
  const providedSessions = course.sessions || course.jc || '';
  const hasExactTimes = !providedSessions && /^\d{1,2}:\d{2}$/.test(course.startTime || '') && /^\d{1,2}:\d{2}$/.test(course.endTime || '');
  const sessions = providedSessions || (hasExactTimes ? '' : '1-2节');
  const inferredTimes = sectionTimes(sessions);
  const [startTime, endTime] = hasExactTimes ? [course.startTime, course.endTime] : inferredTimes;
  if (course.date) return [{ id: `course-${course.id || course.course_id || index}-${course.date}`, title, teacher, location, date: course.date, startTime, endTime, category: '课程', notes: sessions || `${startTime}-${endTime}`, color: '#176b55', source: 'course' }];
  const weekday = Math.max(1, Math.min(7, Number(course.weekday || course.xqj || 1)));
  const firstMonday = mondayOf(fromDateKey(state.settings.semesterStart));
  return parseWeeks(course.weeks || course.zcd, Number(state.settings.totalWeeks)).map((week) => ({
    id: `course-${course.id || course.course_id || index}-${week}`,
    title, teacher, location, date: toDateKey(addDays(firstMonday, (week - 1) * 7 + weekday - 1)), startTime, endTime,
    category: '课程', notes: `第${week}周 · ${sessions || `${startTime}-${endTime}`}`, color: '#176b55', source: 'course', completed: false
  }));
}

function replaceCourses(courses) {
  const personal = state.events.filter((item) => item.source !== 'course');
  const remote = courses.flatMap(courseToEvents);
  state.events = sortEvents([...personal, ...remote]);
  save();
  renderAll();
}

function openSync() {
  state.importFile = null;
  $('scheduleFile').value = '';
  $('scheduleFileName').textContent = '尚未选择文件';
  const link = $('campusPortalLink');
  link.classList.toggle('hidden', !state.settings.portalUrl);
  if (state.settings.portalUrl) { link.href = state.settings.portalUrl; link.textContent = `↗ 打开 ${state.settings.schoolName || '学校'} 教务系统`; }
  $('syncDialog').showModal();
}

async function importPdfWithAi() {
  if (!state.importFile) { showToast('请先选择学校教务系统导出的 PDF'); return; }
  if (!state.settings.aiServiceUrl) { showToast('请先在日历设置中填写智能解析服务地址'); return; }
  const button = $('aiImport');
  button.disabled = true; button.textContent = '正在由模型解析…';
  try {
    const formData = new FormData(); formData.append('schedule', state.importFile); formData.append('schoolName', state.settings.schoolName || '');
    const response = await fetch(state.settings.aiServiceUrl, { method: 'POST', body: formData });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(body.courses) || !body.courses.length) throw new Error(body?.error || '模型未返回有效课程');
    replaceCourses(body.courses);
    const status = `智能导入成功 · ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
    localStorage.setItem('swu-calendar-sync-status', status);
    $('syncDialog').close(); showToast(`已导入 ${body.courses.length} 门课程`);
  } catch (error) { showToast(`智能解析失败：${error.message}`); }
  finally { button.disabled = false; button.textContent = '智能解析并导入'; }
}

function openAccountDialog(id = '') {
  state.editingAccountId = id;
  const item = id ? state.accounts.find((entry) => entry.id === id) : null;
  $('accountType').value = item?.type || 'expense'; $('accountAmount').value = item?.amount || '';
  $('accountCategory').value = item?.category || '餐饮'; $('accountDate').value = item?.date || today; $('accountNote').value = item?.note || '';
  $('accountDialogTitle').textContent = item ? '编辑账目' : '记一笔'; $('deleteAccount').classList.toggle('hidden', !item); $('accountDialog').showModal();
}

function submitAccount(event) {
  event.preventDefault();
  const amount = Number($('accountAmount').value); if (!(amount > 0)) { showToast('请输入大于 0 的金额'); return; }
  const item = { id: state.editingAccountId || uid('account'), type: $('accountType').value, amount: amount.toFixed(2), category: $('accountCategory').value, date: $('accountDate').value, note: $('accountNote').value.trim() };
  state.accounts = [...state.accounts.filter((entry) => entry.id !== item.id), item]; save(); $('accountDialog').close(); renderAll(); showToast(state.editingAccountId ? '账目已更新' : '已记账');
}

function deleteAccount() { if (!state.editingAccountId || !confirm('确定删除这笔账目吗？')) return; state.accounts = state.accounts.filter((item) => item.id !== state.editingAccountId); save(); $('accountDialog').close(); renderAll(); showToast('账目已删除'); }

function exportAccounts() {
  const lines = ['类型,金额,分类,日期,备注', ...state.accounts.map((item) => `${item.type === 'income' ? '收入' : '支出'},${item.amount},${item.category},${item.date},"${String(item.note || '').replaceAll('"', '""')}"`)]
  download(`campus-accounts-${today}.csv`, '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8'); showToast('账本已导出')
}

function resetTimer(mode = state.timer.mode) {
  if (state.timer.handle) clearInterval(state.timer.handle);
  const duration = state.timer.kind === 'stopwatch' ? 0 : (mode === 'focus' ? state.settings.focusMinutes : state.settings.breakMinutes) * 60;
  Object.assign(state.timer, { mode, running: false, duration, left: duration, handle: null });
  renderTimer();
}

function setTimerKind(kind) {
  if (state.timer.handle) clearInterval(state.timer.handle);
  state.timer.kind = kind;
  state.timer.mode = 'focus';
  resetTimer('focus');
}

function toggleTimer() {
  if (state.timer.running) {
    clearInterval(state.timer.handle);
    state.timer.handle = null;
    state.timer.running = false;
    renderTimer();
    return;
  }
  state.timer.running = true;
  state.timer.handle = setInterval(() => {
    state.timer.left += state.timer.kind === 'stopwatch' ? 1 : -1;
    if (state.timer.kind === 'countdown' && state.timer.left <= 0) finishTimer();
    renderTimer();
  }, 1000);
  renderTimer();
}

function finishTimer() {
  clearInterval(state.timer.handle);
  state.timer.handle = null;
  state.timer.running = false;
  if (state.timer.kind === 'countdown' && state.timer.mode === 'break') {
    resetTimer('focus');
    showToast('休息结束，继续加油');
    return;
  }
  if (state.timer.kind === 'stopwatch' && state.timer.left <= 0) { showToast('请先开始计时'); return; }
  const stopwatch = state.timer.kind === 'stopwatch';
  const minutes = stopwatch ? Math.max(1, Math.round(state.timer.left / 60)) : Number(state.settings.focusMinutes);
  const now = new Date();
  const start = new Date(now.getTime() - minutes * 60000);
  state.events.push({
    id: uid('focus'), title: $('focusTask').value.trim() || (stopwatch ? '学习任务' : '专注时间'), date: today,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`, endTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    category: '学习', location: '', notes: `${stopwatch ? '正计时学习' : '倒计时专注'} ${minutes} 分钟`, color: '#c9573e', source: 'focus', completed: true
  });
  state.timer.rounds += 1;
  state.timer.minutes += minutes;
  localStorage.setItem(STORAGE_FOCUS, JSON.stringify({ date: today, rounds: state.timer.rounds, minutes: state.timer.minutes }));
  save();
  resetTimer(stopwatch ? 'focus' : 'break');
  renderAll();
  showToast(`已记录 ${minutes} 分钟${stopwatch ? '学习' : '专注'}`);
}

function compressWallpaper(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => { image.src = reader.result; };
    image.onerror = reject;
    image.onload = () => {
      const scale = Math.min(1, 1920 / image.width, 1280 / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', .78));
    };
    reader.readAsDataURL(file);
  });
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

function exportIcs() {
  const escapeIcs = (value = '') => String(value).replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const stamp = (date, time) => `${date.replaceAll('-', '')}T${time.replace(':', '')}00`;
  const body = state.events.map((item) => ['BEGIN:VEVENT', `UID:${item.id}@campus-calendar`, `DTSTART:${stamp(item.date, item.startTime)}`, `DTEND:${stamp(item.date, item.endTime)}`, `SUMMARY:${escapeIcs(item.title)}`, `LOCATION:${escapeIcs(item.location)}`, `DESCRIPTION:${escapeIcs(item.notes)}`, 'END:VEVENT'].join('\r\n')).join('\r\n');
  download('campus-calendar.ics', `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Campus Calendar//CN\r\n${body}\r\nEND:VCALENDAR`, 'text/calendar;charset=utf-8');
  showToast('ICS 日历已导出');
}

function bindEvents() {
  $('prevMonth').addEventListener('click', () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() - 1, 1); state.selectedDate = toDateKey(state.cursor); renderAll(); });
  $('nextMonth').addEventListener('click', () => { state.cursor = new Date(state.cursor.getFullYear(), state.cursor.getMonth() + 1, 1); state.selectedDate = toDateKey(state.cursor); renderAll(); });
  [$('goToday'), $('weekToday')].forEach((button) => button.addEventListener('click', () => selectDate(today)));
  document.querySelectorAll('.view-tab').forEach((button) => button.addEventListener('click', () => { state.view = button.dataset.view; renderAll(); }));
  $('searchInput').addEventListener('input', (event) => { state.query = event.target.value; renderAll(); });
  document.addEventListener('keydown', (event) => { if (event.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { event.preventDefault(); $('searchInput').focus(); } });
  $('monthGrid').addEventListener('click', (event) => { const button = event.target.closest('[data-date]'); if (button) selectDate(button.dataset.date); });
  $('weekGrid').addEventListener('click', (event) => { const eventCard = event.target.closest('[data-event-id]'); if (eventCard) return openEventDialog(eventCard.dataset.eventId); const day = event.target.closest('[data-date]'); if (day) selectDate(day.dataset.date, true); });
  $('agendaList').addEventListener('click', (event) => { const complete = event.target.closest('[data-complete-id]'); if (complete) { state.events = state.events.map((item) => item.id === complete.dataset.completeId ? { ...item, completed: !item.completed } : item); save(); renderAll(); return; } const copy = event.target.closest('[data-event-id]'); if (copy) openEventDialog(copy.dataset.eventId); });
  $('searchResults').addEventListener('click', (event) => { const result = event.target.closest('[data-search-date]'); if (result) selectDate(result.dataset.searchDate, true); });
  [$('addEvent'), $('floatingAdd')].forEach((button) => button.addEventListener('click', () => openEventDialog()));
  $('eventForm').addEventListener('submit', submitEvent);
  $('deleteEvent').addEventListener('click', deleteCurrentEvent);
  $('settingsOpen').addEventListener('click', openSettings);
  $('settingsForm').addEventListener('submit', submitSettings);
  $('settingWallpaper').addEventListener('change', (event) => { state.settings.wallpaper = event.target.value; applyAppearance(); });
  $('settingAccent').addEventListener('change', (event) => { state.settings.accent = event.target.value; applyAppearance(); });
  $('settingOpacity').addEventListener('input', (event) => { state.settings.opacity = Number(event.target.value); applyAppearance(); });
  $('wallpaperFile').addEventListener('change', async (event) => { const file = event.target.files[0]; if (!file) return; try { state.settings.customWallpaper = await compressWallpaper(file); state.settings.wallpaper = 'custom'; save(); applyAppearance(); showToast('自定义壁纸已应用'); } catch { showToast('壁纸处理失败，请换一张图片'); } });
  $('exportIcs').addEventListener('click', exportIcs);
  $('exportBackup').addEventListener('click', () => { download(`campus-calendar-backup-${today}.json`, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), settings: { ...state.settings, customWallpaper: '' }, events: state.events }, null, 2), 'application/json;charset=utf-8'); showToast('备份文件已导出'); });
  $('syncOpen').addEventListener('click', openSync);
  $('scheduleFile').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    state.importFile = file;
    $('scheduleFileName').textContent = `已选择：${file.name}`;
  });
  $('aiImport').addEventListener('click', importPdfWithAi);
  $('addExpense').addEventListener('click', () => openAccountDialog());
  $('exportAccounts').addEventListener('click', exportAccounts);
  $('accountForm').addEventListener('submit', submitAccount);
  $('deleteAccount').addEventListener('click', deleteAccount);
  $('ledgerList').addEventListener('click', (event) => { const row = event.target.closest('[data-account-id]'); if (row) openAccountDialog(row.dataset.accountId); });
  $('timerToggle').addEventListener('click', toggleTimer);
  $('timerReset').addEventListener('click', () => resetTimer());
  $('timerFinish').addEventListener('click', finishTimer);
  document.querySelectorAll('[data-timer-kind]').forEach((button) => button.addEventListener('click', () => setTimerKind(button.dataset.timerKind)));
  $('focusDurationFocus').addEventListener('change', (event) => updateFocusDuration('focus', event.target.value));
  $('focusDurationBreak').addEventListener('change', (event) => updateFocusDuration('break', event.target.value));
  document.querySelectorAll('[data-focus-mode]').forEach((button) => button.addEventListener('click', () => { if (state.timer.kind === 'countdown') resetTimer(button.dataset.focusMode); }));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
}

bindEvents();
renderAll();
