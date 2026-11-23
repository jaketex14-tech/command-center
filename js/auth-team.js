/********************************************************************
 * AUTHENTICATION, NAVIGATION & UI CONTROLS
 ********************************************************************/
function getCurrentUser() {
  if (!currentUserId) return null;
  const list = normalizeArray(state.users);
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === currentUserId) return list[i];
  }
  return null;
}

function handleLogin() {
  const selectedId = document.getElementById("login-user-select").value;
  const enteredPin = document.getElementById("login-pin").value.trim();
  const list = normalizeArray(state.users);
  let userAccount = null;
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === selectedId) userAccount = list[i];
  }
  const errEl = document.getElementById("login-error");

  if (!userAccount) return;
  const requiredPin = userAccount.pin || "1234";

  if (enteredPin !== requiredPin) {
    errEl.style.display = "block";
    return;
  }

  errEl.style.display = "none";
  currentUserId = userAccount.id;
  localStorage.setItem(SESSION_USER_KEY, currentUserId);
  document.getElementById("login-pin").value = "";

  if (!isAdminRole(userAccount)) activeTab = "tasks";
  renderAll();
  pollNativePhoneCaptures(false);
  if (typeof initPushForCurrentUser === "function") initPushForCurrentUser();
}

function logoutUser() {
  if (currentUserId && typeof removeCurrentDeviceToken === "function") {
    removeCurrentDeviceToken(currentUserId);
  }
  currentUserId = null;
  localStorage.removeItem(SESSION_USER_KEY);
  closeEditModal();
  closeImageViewer();
  closeLiveCameraModal();
  if (typeof closeConfirmModal === "function") closeConfirmModal();
  renderAll();
}

function switchTab(tabName) {
  const user = getCurrentUser();
  if (!user || (!isAdminRole(user) && tabName !== "tasks")) return;
  activeTab = tabName;
  renderAll();
}

function toggleDropdownPanel(panelKey, forceState) {
  const nextState = typeof forceState === "boolean" ? forceState : !dropdownState[panelKey];
  dropdownState[panelKey] = nextState;

  const panelEl = document.getElementById("panel-" + panelKey);
  const chevEl = document.getElementById("chev-" + panelKey);
  if (panelEl) {
    panelEl.classList.toggle("hidden", !nextState);
  }
  if (chevEl) {
    chevEl.textContent = nextState ? "Close" : "Open";
  }
  if (panelKey === "taskCreator" && nextState) {
    renderScheduleWidget("creator");
  }
  if (panelKey === "triageCreator" && nextState) {
    renderScheduleWidget("triage");
  }
  if (panelKey === "recoveryScanner" && nextState) {
    renderRecoverySnapshots();
  }
  if (panelKey === "captureRules" && nextState) {
    populateFilterInputs();
  }
  if (panelKey === "scanLog" && nextState) {
    renderScanLog();
  }
  if (panelKey === "geminiKey" && nextState) {
    const keyInput = document.getElementById("gemini-key-input");
    if (keyInput && state.geminiApiKey) keyInput.value = state.geminiApiKey;
  }
}

function toggleTaskExpanded(taskId) {
  expandedTaskIds[taskId] = !expandedTaskIds[taskId];
  renderAll();
}

function toggleExpandAll(sectionType) {
  const targetTasks = sectionType === "triage"
    ? state.tasks.filter(function(t) { return t.visibility === "triage"; })
    : state.tasks.filter(function(t) { return t.visibility === "assigned" && !t.completed; });

  const anyCollapsed = targetTasks.some(function(t) { return !expandedTaskIds[t.id]; });
  for (let i = 0; i < targetTasks.length; i++) {
    expandedTaskIds[targetTasks[i].id] = anyCollapsed;
  }
  renderAll();
}

function setTaskSortMode(mode) {
  taskSortMode = mode;
  renderAll();
}

function setAdminFilter(userId) {
  adminFilterUserId = userId;
  renderAll();
}

/********************************************************************
 * ADMIN USER & API KEY MANAGEMENT
 ********************************************************************/
function saveGeminiKey() {
  if (!isAdminRole(getCurrentUser())) return;
  const keyInput = document.getElementById("gemini-key-input");
  state.geminiApiKey = keyInput.value.trim();
  preferredWorkingModel = null;
  keyInput.blur();
  toggleDropdownPanel("geminiKey", false);
  pushStateToCloud("AI Settings Updated", "Gemini API key saved and active for photo scanning.", "ADMINS");
}

function addNewUser() {
  if (!isAdminRole(getCurrentUser())) return;
  const nameInput = document.getElementById("new-user-name");
  const roleSelect = document.getElementById("new-user-role");
  const pinInput = document.getElementById("new-user-pin");
  const name = nameInput.value.trim();
  const pin = pinInput.value.trim() || "1234";
  if (!name) return;

  const selectedRole = (roleSelect.value === "admin" || roleSelect.value === "delegator") ? roleSelect.value : "member";

  state.users.push({
    id: "u_" + Date.now(),
    name: name,
    role: selectedRole,
    pin: pin
  });
  nameInput.value = "";
  nameInput.blur();
  toggleDropdownPanel("addUser", false);
  pushStateToCloud("Account Created", "New " + getRoleDisplayLabel(selectedRole) + " account created for " + name + ".", "ADMINS");
}

function updateUserRole(userId, newRole) {
  const actor = getCurrentUser();
  if (!isAdminRole(actor) || userId === actor.id) return;
  if (newRole !== "admin" && newRole !== "delegator" && newRole !== "member") return;

  const target = state.users.find(function(u) { return u.id === userId; });
  if (!target || target.role === newRole) return;

  target.role = newRole;
  if (document.activeElement && typeof document.activeElement.blur === "function") {
    document.activeElement.blur();
  }
  pushStateToCloud(
    "Role Updated",
    target.name + " is now assigned the " + getRoleDisplayLabel(newRole) + " role.",
    "ADMINS"
  );
}

function removeUser(userId) {
  const actor = getCurrentUser();
  if (!isAdminRole(actor) || userId === actor.id) return;
  if (state.users.length <= 1) return;

  const target = state.users.find(function(u) { return u.id === userId; });
  if (!target) return;

  openConfirmModal(
    "Remove User Account?",
    "Remove \"" + target.name + "\" (" + getRoleDisplayLabel(target.role) + ")? They will no longer be able to sign in.",
    "Remove Account",
    function() {
      if (state.users.length <= 1) return;
      state.users = state.users.filter(function(u) { return u.id !== userId; });
      if (adminFilterUserId === userId) {
        adminFilterUserId = "ALL";
      }
      pushStateToCloud("Account Removed", "Removed user account for " + target.name + ".", "ADMINS");
    }
  );
}

/********************************************************************
 * DISPLAY BADGE & LOOKUP HELPERS
 ********************************************************************/
function getSourceBadge(source) {
  const map = {
    SMS: { cls: "src-sms", label: "Text Message" },
    SAMSUNG: { cls: "src-samsung", label: "Reminder" },
    CAL: { cls: "src-cal", label: "Calendar" },
    MANUAL: { cls: "src-manual", label: "Direct Task" }
  };
  const item = map[source] || map.MANUAL;
  return '<span class="badge ' + item.cls + '">' + item.label + '</span>';
}

function getUrgentBadge(isUrgent) {
  if (!isUrgent) return "";
  return '<span class="badge badge-urgent">URGENT</span>';
}

function getDuePillHtml(task) {
  const label = formatFriendlyDueLabel(task.dueDate, task.duePeriod, task.due || "Today");
  const todayIso = getTodayIso();
  let cls = "due-pill";
  if (!task.completed && task.dueDate && task.dueDate < todayIso) {
    cls += " due-overdue";
  } else if (task.duePeriod === "PM") {
    cls += " due-pm";
  } else {
    cls += " due-am";
  }
  return '<span class="' + cls + '">Due: ' + escapeHtmlAttr(label) + '</span>';
}

function getUserName(userId) {
  const list = normalizeArray(state.users);
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === userId) return list[i].name;
  }
  return "Unassigned";
}

function getAssigneeBadges(assignedToField) {
  const ids = normalizeArray(assignedToField);
  if (ids.length === 0) return '<span class="assignee-pill">Unassigned</span>';
  return ids.map(function(id) {
    return '<span class="assignee-pill">' + escapeHtmlAttr(getUserName(id)) + '</span>';
  }).join(" ");
}
