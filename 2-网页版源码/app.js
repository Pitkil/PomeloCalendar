'use strict';

const STORAGE_EVENTS = 'swu-calendar-events-v2';
const STORAGE_SETTINGS = 'swu-calendar-settings-v2';
const STORAGE_FOCUS = 'swu-calendar-focus-v2';
const STORAGE_ACCOUNTS = 'swu-calendar-accounts-v1';
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
    semesterTitle: `${startYear}-${startYear + 1}-${firstTerm ? 1 : 2}`,
    semesterStart: firstTerm ? `${startYear}-09-07` : `${startYear + 1}-02-23`,
    semesterEnd: firstTerm ? `${startYear + 1}-01-17` : `${startYear + 1}-07-05`,
    totalWeeks: 19,
    focusMinutes: 25,
    breakMinutes: 5,
    accent: '#176b55',
    wallpaper: 'paper',
    customWallpaper: '',
    opacity: 94
  };
}

const today = toDateKey(new Date());
const settings = { ...defaultSettings(), ...loadJson(STORAGE_SETTINGS, {}) };
const initialEvents = [{
  id: uid('welcome'), title: '完成校园日历实验', date: today, startTime: '19:00', endTime: '20:30',
  category: '学习', location: '图书馆', notes: '体验新增、编辑、搜索和番茄钟。', color: '#d76a4a', source: 'personal', completed: false
}];
const focusRecord = loadJson(STORAGE_FOCUS, { date: today, rounds: 0, minutes: 0 });

const state = {
  settings,
  events: loadJson(STORAGE_EVENTS, initialEvents),
  accounts: loadJson(STORAGE_ACCOUNTS, []),
  selectedDate: today,
  cursor: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  view: 'month',
  query: '',
  editingId: '',
  editingAccountId: '',
  timer: {
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
  $('semesterLine').textContent = `${state.settings.semesterTitle} · ${week ? `第 ${week} 教学周` : '假期 / 未排课'}`;
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
  $('agendaPanel').classList.toggle('hidden', state.view === 'focus' || state.view === 'accounting');
  $('floatingAdd').classList.toggle('hidden', state.view === 'focus' || state.view === 'accounting');
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
  $('timerMode').textContent = timer.mode === 'focus' ? '专注时间' : '休息时间';
  $('timerToggle').textContent = timer.running ? '暂停' : timer.mode === 'focus' ? '开始专注' : '开始休息';
  $('roundDisplay').textContent = `今日第 ${timer.rounds + 1} 轮`;
  $('focusLengthLabel').textContent = state.settings.focusMinutes;
  $('breakLengthLabel').textContent = state.settings.breakMinutes;
  document.querySelectorAll('[data-focus-mode]').forEach((button) => button.classList.toggle('active', button.dataset.focusMode === timer.mode));
  const progress = timer.duration ? (1 - timer.left / timer.duration) * 360 : 0;
  $('timerRing').style.setProperty('--progress', `${progress}deg`);
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
  $('settingSemesterTitle').value = state.settings.semesterTitle;
  $('settingSemesterStart').value = state.settings.semesterStart;
  $('settingSemesterEnd').value = state.settings.semesterEnd;
  $('settingTotalWeeks').value = state.settings.totalWeeks;
  $('settingFocusMinutes').value = state.settings.focusMinutes;
  $('settingBreakMinutes').value = state.settings.breakMinutes;
  $('settingAccent').value = state.settings.accent;
  $('settingWallpaper').value = state.settings.wallpaper === 'custom' ? 'paper' : state.settings.wallpaper;
  $('settingOpacity').value = state.settings.opacity;
  $('settingsDialog').showModal();
}

function submitSettings(event) {
  event.preventDefault();
  Object.assign(state.settings, {
    semesterTitle: $('settingSemesterTitle').value.trim() || state.settings.semesterTitle,
    semesterStart: $('settingSemesterStart').value,
    semesterEnd: $('settingSemesterEnd').value,
    totalWeeks: Math.max(1, Number($('settingTotalWeeks').value || 19)),
    focusMinutes: Math.max(1, Number($('settingFocusMinutes').value || 25)),
    breakMinutes: Math.max(1, Number($('settingBreakMinutes').value || 5)),
    accent: $('settingAccent').value,
    wallpaper: state.settings.wallpaper === 'custom' && state.settings.customWallpaper ? 'custom' : $('settingWallpaper').value,
    opacity: Math.max(72, Math.min(100, Number($('settingOpacity').value || 94)))
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
  const first = Number((String(raw).match(/\d+/) || ['1'])[0]);
  return ({ 1: ['08:00', '09:40'], 3: ['10:10', '11:50'], 5: ['14:00', '15:40'], 7: ['16:10', '17:50'], 9: ['19:00', '20:40'], 11: ['20:50', '22:20'] })[first] || ['08:00', '09:40'];
}

function courseToEvents(course, index) {
  const title = course.title || course.kcmc || '未命名课程';
  const teacher = course.teacher || course.xm || '';
  const location = course.place || course.cdmc || '';
  const sessions = course.sessions || course.jc || '1-2节';
  const [startTime, endTime] = sectionTimes(sessions);
  if (course.date) return [{ id: `course-${course.id || course.course_id || index}-${course.date}`, title, teacher, location, date: course.date, startTime, endTime, category: '课程', notes: sessions, color: '#176b55', source: 'course' }];
  const weekday = Math.max(1, Math.min(7, Number(course.weekday || course.xqj || 1)));
  const firstMonday = mondayOf(fromDateKey(state.settings.semesterStart));
  return parseWeeks(course.weeks || course.zcd, Number(state.settings.totalWeeks)).map((week) => ({
    id: `course-${course.id || course.course_id || index}-${week}`,
    title, teacher, location, date: toDateKey(addDays(firstMonday, (week - 1) * 7 + weekday - 1)), startTime, endTime,
    category: '课程', notes: `第${week}周 · ${sessions}`, color: '#176b55', source: 'course', completed: false
  }));
}

function replaceCourses(courses) {
  const personal = state.events.filter((item) => item.source !== 'course');
  const remote = courses.flatMap(courseToEvents);
  state.events = sortEvents([...personal, ...remote]);
  save();
  renderAll();
}

const demoCourses = [
  { id: 'se', title: '软件工程', teacher: '张老师', place: '第八教学楼 105', weekday: 1, sessions: '1-2节', weeks: '1-16周' },
  { id: 'ai', title: '人工智能导论', teacher: '李老师', place: '第十教学楼 204', weekday: 3, sessions: '5-6节', weeks: '1-16周(单)' },
  { id: 'pe', title: '体育', teacher: '王老师', place: '第一运动场', weekday: 5, sessions: '3-4节', weeks: '2-16周(双)' }
];

function openSync() { $('schedulePaste').value = ''; $('syncDialog').showModal(); }

function splitImportLine(line, delimiter) {
  const cells = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"' && quoted) { cell += '"'; index += 1; continue; }
    if (char === '"') { quoted = !quoted; continue; }
    if (char === delimiter && !quoted) { cells.push(cell.trim()); cell = ''; continue; }
    cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

function importWeekday(value) {
  const text = String(value ?? '').trim();
  const match = text.match(/[1-7]/);
  if (match) return Number(match[0]);
  return ({ 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7 })[text.replace(/^星期?/, '')] || 0;
}

function normalizeCourse(course = {}) {
  return {
    id: course.id || course.course_id || course.kch_id || '',
    title: course.title || course.kcmc || course.name || '',
    teacher: course.teacher || course.xm || '',
    weekday: importWeekday(course.weekday ?? course.xqj ?? course.week ?? 0),
    sessions: course.sessions || course.jc || course.section || '1-2节',
    weeks: course.weeks || course.zcd || course.weekList || '',
    place: course.place || course.cdmc || course.classroom || '',
    date: course.date || ''
  };
}

function importCoursesFromText(raw) {
  const text = String(raw || '').replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('请先选择或粘贴课表内容');
  const pdfCourses = parsePdfSchedule(text);
  if (pdfCourses.length) return pdfCourses;
  try {
    const parsed = JSON.parse(text);
    const list = Array.isArray(parsed) ? parsed : (parsed.courses || parsed.kbList || parsed.schedule || parsed.res);
    if (Array.isArray(list) && list.length) return list.map(normalizeCourse);
  } catch { /* Not JSON; continue with delimited text. */ }

  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) throw new Error('未识别到课表数据，请提供 JSON、CSV 或带表头的表格文本');
  const delimiter = lines[0].includes('\t') ? '\t' : ',';
  const header = splitImportLine(lines[0], delimiter).map((item) => item.toLowerCase());
  const aliases = {
    title: ['课程名称', '课程', '科目', 'title', 'kcmc'], teacher: ['教师', '老师', 'teacher', 'xm'],
    weekday: ['星期', '星期几', '周几', 'weekday', 'xqj'], sessions: ['节次', '上课节次', 'sessions', 'jc'],
    weeks: ['周次', '上课周次', 'weeks', 'zcd'], place: ['教室', '地点', 'place', 'cdmc'], id: ['课程号', '课程代码', 'id', 'kch_id']
  };
  const indexOf = (names) => header.findIndex((item) => names.some((name) => item === name || item.includes(name)));
  const indexes = Object.fromEntries(Object.entries(aliases).map(([key, names]) => [key, indexOf(names)]));
  if (indexes.title < 0) throw new Error('表头中未找到“课程名称”列');
  return lines.slice(1).map((line, index) => {
    const cells = splitImportLine(line, delimiter);
    const value = (key) => indexes[key] >= 0 ? cells[indexes[key]] : '';
    const weekday = importWeekday(value('weekday'));
    const title = value('title');
    return title && weekday ? normalizeCourse({ id: value('id') || `manual-${index + 1}`, title, teacher: value('teacher'), weekday, sessions: value('sessions'), weeks: value('weeks'), place: value('place') }) : null;
  }).filter(Boolean);
}

function importManualSchedule() {
  try {
    const courses = importCoursesFromText($('schedulePaste').value);
    if (!courses.length) throw new Error('没有识别到有效课程，请检查星期和课程名称');
    replaceCourses(courses);
    const status = `手动导入成功 · ${pad(new Date().getHours())}:${pad(new Date().getMinutes())}`;
    localStorage.setItem('swu-calendar-sync-status', status);
    $('syncDialog').close();
    showToast(`已导入 ${courses.length} 门课程`);
  } catch (error) {
    showToast(`导入失败：${error.message}`);
  }
}

async function extractPdfText(file) {
  const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs';
  const buffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buffer }).promise;
  const pages = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo += 1) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const rows = [];
    content.items.forEach((item) => {
      const y = Math.round(item.transform?.[5] || 0);
      let row = rows.find((entry) => Math.abs(entry.y - y) <= 3);
      if (!row) { row = { y, cells: [] }; rows.push(row); }
      row.cells.push({ x: item.transform?.[4] || 0, text: item.str });
    });
    const ordered = rows.sort((a, b) => b.y - a.y);
    const header = ordered.find((row) => row.cells.some((cell) => /星期一/.test(cell.text)));
    const dayXs = header ? header.cells.filter((cell) => /^星期[一二三四五六日天]$/.test(cell.text.trim())).sort((a, b) => a.x - b.x).map((cell) => cell.x) : [];
    pages.push(ordered.map((row) => {
      const dayCells = Array.from({ length: 7 }, () => []);
      row.cells.forEach((cell) => {
        if (!dayXs.length) return;
        let nearest = 0; let distance = Infinity;
        dayXs.forEach((x, index) => { const next = Math.abs(cell.x - x); if (next < distance) { nearest = index; distance = next; } });
        if (distance < 95) dayCells[nearest].push(cell.text);
      });
      return dayXs.length ? dayCells.map((cells) => cells.join(' ')).join('\t') : row.cells.sort((a, b) => a.x - b.x).map((cell) => cell.text).join('\t');
    }).join('\n'));
  }
  return pages.join('\n');
}

function parsePdfSchedule(text) {
  if (!/时间段|星期一/.test(text)) return [];
  const pending = Array.from({ length: 7 }, () => null);
  const result = [];
  const finish = (day) => { const item = pending[day]; if (!item || !item.sessions) return; result.push(normalizeCourse({ id: `pdf-${day}-${result.length + 1}`, title: item.title, teacher: item.teacher, place: item.place, weekday: day + 1, sessions: item.sessions, weeks: item.weeks })); pending[day] = null; };
  text.split(/\r?\n/).forEach((line) => {
    if (!line.trim() || /时间段|202\d-202\d学年/.test(line)) return;
    line.split('\t').forEach((rawCell, day) => {
      const cell = rawCell.trim(); if (!cell) return;
      const titleMatch = cell.match(/^(.+?)[◆◇](?:\s|$)/);
      const detail = cell.match(/^\(([^)]*节)\)\s*([^/]*)/);
      if (titleMatch && !detail) { finish(day); pending[day] = { title: titleMatch[1].trim(), teacher: '', place: '', sessions: '', weeks: '' }; return; }
      if (!pending[day]) return;
      const item = pending[day];
      if (detail) { item.sessions = detail[1]; item.weeks = detail[2].replace(/第/g, '').trim(); }
      const teacher = cell.match(/教师:([^/]+)/); if (teacher) item.teacher = `${item.teacher}${item.teacher ? ',' : ''}${teacher[1].trim()}`;
      const place = cell.match(/场地:([^/]+)/); if (place) item.place = place[1].trim();
    });
  });
  pending.forEach((_, day) => finish(day));
  return result.flat();
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
  download(`swu-campus-accounts-${today}.csv`, '\uFEFF' + lines.join('\n'), 'text/csv;charset=utf-8'); showToast('账本已导出')
}

function resetTimer(mode = state.timer.mode) {
  if (state.timer.handle) clearInterval(state.timer.handle);
  const duration = (mode === 'focus' ? state.settings.focusMinutes : state.settings.breakMinutes) * 60;
  Object.assign(state.timer, { mode, running: false, duration, left: duration, handle: null });
  renderTimer();
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
    state.timer.left -= 1;
    if (state.timer.left <= 0) finishTimer();
    renderTimer();
  }, 1000);
  renderTimer();
}

function finishTimer() {
  clearInterval(state.timer.handle);
  state.timer.handle = null;
  state.timer.running = false;
  if (state.timer.mode === 'break') {
    resetTimer('focus');
    showToast('休息结束，继续加油');
    return;
  }
  const minutes = Number(state.settings.focusMinutes);
  const now = new Date();
  const start = new Date(now.getTime() - minutes * 60000);
  state.events.push({
    id: uid('focus'), title: $('focusTask').value.trim() || '专注时间', date: today,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`, endTime: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
    category: '学习', location: '', notes: `完成 ${minutes} 分钟番茄钟`, color: '#c9573e', source: 'focus', completed: true
  });
  state.timer.rounds += 1;
  state.timer.minutes += minutes;
  localStorage.setItem(STORAGE_FOCUS, JSON.stringify({ date: today, rounds: state.timer.rounds, minutes: state.timer.minutes }));
  save();
  resetTimer('break');
  renderAll();
  showToast(`完成 ${minutes} 分钟专注，休息一下吧`);
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
  const body = state.events.map((item) => ['BEGIN:VEVENT', `UID:${item.id}@swu-calendar`, `DTSTART:${stamp(item.date, item.startTime)}`, `DTEND:${stamp(item.date, item.endTime)}`, `SUMMARY:${escapeIcs(item.title)}`, `LOCATION:${escapeIcs(item.location)}`, `DESCRIPTION:${escapeIcs(item.notes)}`, 'END:VEVENT'].join('\r\n')).join('\r\n');
  download('swu-campus-calendar.ics', `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//SWU Campus Calendar//CN\r\n${body}\r\nEND:VCALENDAR`, 'text/calendar;charset=utf-8');
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
  $('exportBackup').addEventListener('click', () => { download(`swu-calendar-backup-${today}.json`, JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), settings: { ...state.settings, customWallpaper: '' }, events: state.events }, null, 2), 'application/json;charset=utf-8'); showToast('备份文件已导出'); });
  $('syncOpen').addEventListener('click', openSync);
  $('manualImport').addEventListener('click', importManualSchedule);
  $('manualImportFooter').addEventListener('click', importManualSchedule);
  $('scheduleFile').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    try {
      $('schedulePaste').value = file.name.toLowerCase().endsWith('.pdf') ? await extractPdfText(file) : await file.text();
      showToast(`已载入 ${file.name}，请检查识别结果后导入`);
    }
    catch { showToast('文件读取失败，请改用文本粘贴'); }
  });
  $('importDemo').addEventListener('click', () => { replaceCourses(demoCourses); const status = '已导入示例课表'; localStorage.setItem('swu-calendar-sync-status', status); $('syncDialog').close(); renderAll(); showToast('示例课表已导入'); });
  $('addExpense').addEventListener('click', () => openAccountDialog());
  $('exportAccounts').addEventListener('click', exportAccounts);
  $('accountForm').addEventListener('submit', submitAccount);
  $('deleteAccount').addEventListener('click', deleteAccount);
  $('ledgerList').addEventListener('click', (event) => { const row = event.target.closest('[data-account-id]'); if (row) openAccountDialog(row.dataset.accountId); });
  $('timerToggle').addEventListener('click', toggleTimer);
  $('timerReset').addEventListener('click', () => resetTimer());
  document.querySelectorAll('[data-focus-mode]').forEach((button) => button.addEventListener('click', () => resetTimer(button.dataset.focusMode)));
  document.querySelectorAll('dialog').forEach((dialog) => dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); }));
}

bindEvents();
renderAll();
