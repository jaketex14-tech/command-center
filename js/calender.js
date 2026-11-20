function getTodayIso() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function addDaysToIso(isoStr, daysToAdd) {
  const parts = String(isoStr || getTodayIso()).split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  d.setDate(d.getDate() + daysToAdd);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function getNextMondayIso() {
  const d = new Date();
  const day = d.getDay();
  const diff = (8 - day) % 7 || 7;
  d.setDate(d.getDate() + diff);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return yyyy + "-" + mm + "-" + dd;
}

function formatFriendlyDueLabel(dueDate, duePeriod, fallbackDue) {
  if (!dueDate) return fallbackDue || "Today";
  const today = getTodayIso();
  const tomorrow = addDaysToIso(today, 1);
  const slot = (duePeriod === "PM") ? "PM" : "AM";

  if (dueDate === today) return "Today • " + slot;
  if (dueDate === tomorrow) return "Tomorrow • " + slot;

  const parts = dueDate.split("-");
  if (parts.length === 3) {
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const label = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
    return label + " • " + slot;
  }
  return dueDate + " • " + slot;
}

function formatDayHeading(dueDate) {
  if (!dueDate) return "Unscheduled";
  const today = getTodayIso();
  const tomorrow = addDaysToIso(today, 1);
  const parts = dueDate.split("-");
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  const fullDate = d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });

  if (dueDate < today) return "Overdue — " + fullDate;
  if (dueDate === today) return "Today — " + fullDate;
  if (dueDate === tomorrow) return "Tomorrow — " + fullDate;
  return fullDate;
}

function computeTaskDueSortScore(task) {
  const iso = task.dueDate || getTodayIso();
  const numDate = Number(iso.replace(/\-/g, "")) || 99999999;
  const slotOffset = (task.duePeriod === "PM") ? 1 : 0;
  return (numDate * 10) + slotOffset;
}

let calState = {
  creator: { date: getTodayIso(), period: "AM", viewYear: new Date().getFullYear(), viewMonth: new Date().getMonth() },
  triage: { date: getTodayIso(), period: "AM", viewYear: new Date().getFullYear(), viewMonth: new Date().getMonth() },
  edit: { date: getTodayIso(), period: "AM", viewYear: new Date().getFullYear(), viewMonth: new Date().getMonth() }
};

function setCalendarQuickDate(mode, targetType) {
  const st = calState[mode];
  if (!st) return;
  if (targetType === "today") st.date = getTodayIso();
  else if (targetType === "tomorrow") st.date = addDaysToIso(getTodayIso(), 1);
  else if (targetType === "monday") st.date = getNextMondayIso();

  const parts = st.date.split("-");
  st.viewYear = Number(parts[0]);
  st.viewMonth = Number(parts[1]) - 1;
  renderScheduleWidget(mode);
}

function shiftCalendarMonth(mode, delta) {
  const st = calState[mode];
  if (!st) return;
  st.viewMonth += delta;
  if (st.viewMonth < 0) {
    st.viewMonth = 11;
    st.viewYear -= 1;
  } else if (st.viewMonth > 11) {
    st.viewMonth = 0;
    st.viewYear += 1;
  }
  renderScheduleWidget(mode);
}

function pickCalendarDay(mode, isoDate) {
  const st = calState[mode];
  if (!st) return;
  st.date = isoDate;
  renderScheduleWidget(mode);
}

function setCalendarPeriod(mode, period) {
  const st = calState[mode];
  if (!st) return;
  st.period = (period === "PM") ? "PM" : "AM";
  renderScheduleWidget(mode);
}

function renderScheduleWidget(mode) {
  const container = document.getElementById("cal-widget-" + mode);
  const st = calState[mode];
  if (!container || !st) return;

  const todayIso = getTodayIso();
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const firstDayIdx = new Date(st.viewYear, st.viewMonth, 1).getDay();
  const daysInMonth = new Date(st.viewYear, st.viewMonth + 1, 0).getDate();

  let cellsHtml = "";
  for (let e = 0; e < firstDayIdx; e++) {
    cellsHtml += '<div class="cal-day-cell empty"></div>';
  }
  for (let day = 1; day <= daysInMonth; day++) {
    const mm = String(st.viewMonth + 1).padStart(2, "0");
    const dd = String(day).padStart(2, "0");
    const cellIso = st.viewYear + "-" + mm + "-" + dd;
    let cls = "cal-day-cell";
    if (cellIso === todayIso) cls += " today";
    if (cellIso === st.date) cls += " selected";
    cellsHtml += '<div class="' + cls + '" onclick="pickCalendarDay(\'' + mode + '\', \'' + cellIso + '\')">' + day + '</div>';
  }

  const amCls = st.period === "AM" ? "ampm-option active-am" : "ampm-option";
  const pmCls = st.period === "PM" ? "ampm-option active-pm" : "ampm-option";
  const readout = formatFriendlyDueLabel(st.date, st.period, "Today");

  container.innerHTML =
    '<div class="cal-quick-row">' +
      '<button type="button" class="cal-quick-btn" onclick="setCalendarQuickDate(\'' + mode + '\', \'today\')">Today</button>' +
      '<button type="button" class="cal-quick-btn" onclick="setCalendarQuickDate(\'' + mode + '\', \'tomorrow\')">Tomorrow</button>' +
      '<button type="button" class="cal-quick-btn" onclick="setCalendarQuickDate(\'' + mode + '\', \'monday\')">Next Mon</button>' +
    '</div>' +
    '<div class="cal-header-nav">' +
      '<button type="button" class="cal-nav-btn" onclick="shiftCalendarMonth(\'' + mode + '\', -1)">&lt;</button>' +
      '<div class="cal-month-title">' + monthNames[st.viewMonth] + ' ' + st.viewYear + '</div>' +
      '<button type="button" class="cal-nav-btn" onclick="shiftCalendarMonth(\'' + mode + '\', 1)">&gt;</button>' +
    '</div>' +
    '<div class="cal-weekdays"><div>Su</div><div>Mo</div><div>Tu</div><div>We</div><div>Th</div><div>Fr</div><div>Sa</div></div>' +
    '<div class="cal-days-grid">' + cellsHtml + '</div>' +
    '<div class="ampm-slider-wrap">' +
      '<div class="' + amCls + '" onclick="setCalendarPeriod(\'' + mode + '\', \'AM\')">AM (Morning)</div>' +
      '<div class="' + pmCls + '" onclick="setCalendarPeriod(\'' + mode + '\', \'PM\')">PM (Afternoon)</div>' +
    '</div>' +
    '<div class="schedule-selected-readout">Scheduled: ' + escapeHtmlAttr(readout) + '</div>';
}
