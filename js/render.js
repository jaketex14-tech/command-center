/********************************************************************
 * COMPONENT & CARD RENDERERS
 ********************************************************************/
function renderTaskPhotosHtml(task) {
  const images = normalizeArray(task.images);
  if (images.length === 0) {
    if (task.photosPurged) {
      return '<div style="font-size:12px; color:var(--muted); font-style:italic;">Attached photo cleared after 3-day retention period.</div>';
    }
    return "";
  }

  return '<div class="photo-grid">' +
    images.map(function(src, idx) {
      return '<div class="photo-card">' +
        '<img src="' + src + '" onclick="openImageViewer(this.src)" alt="Task Photo ' + (idx + 1) + '" />' +
        '<div class="photo-caption">Tap photo to view full screen</div>' +
      '</div>';
    }).join("") +
  '</div>';
}

function renderTaskNotesHtml(task, canManageTasks) {
  const notes = normalizeArray(task.notes);
  const stagedImgs = normalizeArray(notePendingPhotos[task.id]);
  const isChooserOpen = Boolean(notePhotoSourceOpen[task.id]);

  const notesListHtml = notes.length === 0
    ? '<div style="font-size:13px; color:var(--muted); margin-bottom:6px;">No notes added yet.</div>'
    : notes.map(function(n) {
        const delBtn = canManageTasks
          ? (' <span style="color:#f87171; cursor:pointer; float:right;" onclick="deleteTaskNote(\'' + task.id + '\', \'' + n.id + '\')">Remove</span>')
          : "";
        const noteImgs = normalizeArray(n.images);
        const notePhotosHtml = noteImgs.length > 0
          ? ('<div class="note-photo-grid">' +
              noteImgs.map(function(src, idx) {
                return '<div class="note-photo-card">' +
                  '<img src="' + src + '" onclick="openImageViewer(this.src)" alt="Note Photo ' + (idx + 1) + '" />' +
                  '<div class="photo-caption">Tap photo to view full screen</div>' +
                '</div>';
              }).join("") +
            '</div>')
          : (n.photosPurged ? '<div style="font-size:11px; color:var(--muted); font-style:italic; margin-top:4px;">Note photo cleared after 3-day retention.</div>' : "");

        return '<div class="note-item">' +
          '<div class="note-meta">' + escapeHtmlAttr(n.authorName) + ' • ' + escapeHtmlAttr(n.createdAt) + delBtn + '</div>' +
          (n.text ? ('<div class="note-text">' + escapeHtmlAttr(n.text) + '</div>') : '') +
          notePhotosHtml +
        '</div>';
      }).join("");

  const stagedPreviewHtml = stagedImgs.length > 0
    ? ('<div class="note-photo-grid" style="margin-bottom:10px;">' +
        stagedImgs.map(function(src, idx) {
          return '<div class="note-photo-card">' +
            '<img src="' + src + '" onclick="openImageViewer(this.src)" alt="Staged Note Photo" />' +
            '<button type="button" class="btn btn-danger-outline" style="margin-top:8px; padding:8px; font-size:12px;" onclick="removeStagedNotePhoto(\'' + task.id + '\', ' + idx + ')">Remove Staged Photo</button>' +
          '</div>';
        }).join("") +
      '</div>')
    : "";

  const sourceChooserHtml = isChooserOpen
    ? ('<div class="note-source-chooser">' +
        '<div class="note-source-chooser-title">Select Photo Source (Direct Upload — Not Saved to Phone)</div>' +
        '<div class="note-source-btn-row">' +
          '<button type="button" class="btn" style="padding:11px; font-size:13px;" onclick="triggerNotePhotoInput(\'' + task.id + '\', \'camera\')">Take Photo (Camera)</button>' +
          '<button type="button" class="btn btn-secondary" style="padding:11px; font-size:13px;" onclick="triggerNotePhotoInput(\'' + task.id + '\', \'gallery\')">Photo Gallery</button>' +
        '</div>' +
      '</div>')
    : "";

  return '<div class="notes-box">' +
    '<div class="notes-header">Task Notes (' + notes.length + ')</div>' +
    notesListHtml +
    '<div class="note-input-wrap">' +
      '<input type="text" id="note-input-' + task.id + '" placeholder="Write a note or update for this task..." />' +
      stagedPreviewHtml +
      sourceChooserHtml +
      '<div class="btn-stack">' +
        '<button type="button" class="btn btn-secondary" style="padding:11px; font-size:13px;" onclick="toggleNotePhotoSourceMenu(\'' + task.id + '\')">' +
          (isChooserOpen ? 'Close Photo Options' : 'Attach Photo to Note (Camera / Gallery)') +
        '</button>' +
        '<button type="button" class="btn" style="padding:12px;" onclick="addTaskNote(\'' + task.id + '\')">Add Note &amp; Notify</button>' +
      '</div>' +
    '</div>' +
  '</div>';
}

function renderSummaryStripHtml(task) {
  const chk = normalizeArray(task.checklist);
  const imgs = normalizeArray(task.images);
  const notes = normalizeArray(task.notes);
  let notePhotoCount = 0;
  for (let i = 0; i < notes.length; i++) {
    notePhotoCount += normalizeArray(notes[i].images).length;
  }
  const totalPhotos = imgs.length + notePhotoCount;
  const pills = [];

  if (chk.length > 0) {
    if (task.completed) {
      const done = chk.filter(function(i) { return i.done || i.delivered; }).length;
      pills.push('<span class="summary-pill">Checklist: ' + done + '/' + chk.length + '</span>');
    } else {
      const deliveredCount = chk.filter(function(i) { return i.delivered; }).length;
      const remaining = chk.filter(function(i) { return !i.delivered; });
      const doneRemaining = remaining.filter(function(i) { return i.done; }).length;
      if (deliveredCount > 0) {
        pills.push('<span class="summary-pill partial">' + deliveredCount + ' Delivered</span>');
      }
      const readyCls = (remaining.length > 0 && doneRemaining === remaining.length) ? "summary-pill ready" : "summary-pill";
      const label = deliveredCount > 0 ? "Remaining: " : "Checklist: ";
      pills.push('<span class="' + readyCls + '">' + label + doneRemaining + '/' + remaining.length + '</span>');
    }
  }
  if (totalPhotos > 0) {
    pills.push('<span class="summary-pill">' + totalPhotos + (totalPhotos === 1 ? ' Photo' : ' Photos') + '</span>');
  }
  if (notes.length > 0) {
    pills.push('<span class="summary-pill">' + notes.length + (notes.length === 1 ? ' Note' : ' Notes') + '</span>');
  }
  if (pills.length === 0) {
    pills.push('<span class="summary-pill">Tap to view details</span>');
  }
  return '<div class="task-summary-strip">' + pills.join("") + '</div>';
}

function renderChecklistHtml(task) {
  const list = normalizeArray(task.checklist);
  if (list.length === 0) return "";

  const deliveredCount = list.filter(function(i) { return i.delivered; }).length;
  const visibleItems = task.completed
    ? list
    : list.filter(function(i) { return !i.delivered; });

  const checkedVisibleCount = visibleItems.filter(function(i) { return i.done || i.delivered; }).length;
  const allVisibleChecked = visibleItems.length > 0 && checkedVisibleCount === visibleItems.length;

  let headerLeft = "Item Checklist";
  if (!task.completed && deliveredCount > 0) {
    headerLeft = "Remaining Items (" + deliveredCount + " Delivered &amp; Hidden)";
  } else if (task.completed && deliveredCount > 0) {
    headerLeft = "Full Item Checklist (All Loads)";
  }

  let bannerHtml = "";
  if (!task.completed && visibleItems.length === 0 && deliveredCount > 0) {
    bannerHtml = '<div class="checklist-ready-banner">All Items Delivered in Partial Loads — Ready to Mark Task Complete</div>';
  } else if (allVisibleChecked && !task.completed) {
    bannerHtml = '<div class="checklist-ready-banner">' +
      (deliveredCount > 0 ? 'All Remaining Items Checked' : 'All Items Checked') +
      ' — Ready for Delivery / Final Completion</div>';
  }

  const rowsHtml = visibleItems.map(function(item) {
    const isChecked = Boolean(item.done || item.delivered);
    const rowClass = isChecked ? "checklist-item-row item-done" : "checklist-item-row";
    const mark = isChecked ? "✓" : "";
    const clickAttr = (task.completed || item.delivered)
      ? ""
      : (' onclick="toggleChecklistItem(\'' + task.id + '\', \'' + item.id + '\')"');
    const deliveredMeta = (task.completed && item.delivered)
      ? ('<span class="checklist-item-sub">Delivered in partial load' +
          (item.deliveredBy ? (' by ' + escapeHtmlAttr(item.deliveredBy)) : '') +
          (item.deliveredAt ? (' • ' + escapeHtmlAttr(item.deliveredAt)) : '') +
        '</span>')
      : "";

    return '<div class="' + rowClass + '"' + clickAttr + '>' +
      '<div class="sub-check">' + mark + '</div>' +
      '<div class="checklist-item-text">' +
        escapeHtmlAttr(item.text) +
        deliveredMeta +
      '</div>' +
    '</div>';
  }).join("");

  const showPartialBtn =
    task.visibility === "assigned" &&
    !task.completed &&
    checkedVisibleCount > 0 &&
    checkedVisibleCount < visibleItems.length;

  const partialBtnHtml = showPartialBtn
    ? ('<button type="button" class="btn btn-partial" style="margin-top:12px; padding:12px; font-size:13px;" onclick="markCheckedItemsDelivered(\'' + task.id + '\')">' +
        'Mark ' + checkedVisibleCount + ' Checked ' + (checkedVisibleCount === 1 ? 'Item' : 'Items') + ' Delivered &amp; Hide' +
      '</button>')
    : "";

  return '<div class="checklist-box">' +
    '<div class="checklist-header"><span>' + headerLeft + '</span><span>' + checkedVisibleCount + ' / ' + visibleItems.length + ' Checked</span></div>' +
    bannerHtml +
    rowsHtml +
    partialBtnHtml +
  '</div>';
}

function renderTriageCardHtml(t, isAdmin) {
  const isExpanded = Boolean(expandedTaskIds[t.id]);
  const cardCls = "card task-card" + (t.urgent ? " urgent-card" : "") + (isExpanded ? " expanded" : "");
  const selectedForThis = triageSelections[t.id] || [];

  const userRows = state.users.map(function(u) {
    const isSel = selectedForThis.indexOf(u.id) !== -1;
    const rowCls = isSel ? "user-pick-row selected" : "user-pick-row";
    return '<div class="' + rowCls + '" onclick="toggleTriageUser(\'' + t.id + '\', \'' + u.id + '\')">' +
      '<span>' + escapeHtmlAttr(u.name) + '</span>' +
      '<div class="pick-indicator">' + (isSel ? "✓" : "") + '</div>' +
    '</div>';
  }).join("");

  const urgentBtnText = t.urgent ? "Remove Urgent Priority" : "Pin as Urgent / High-Priority";
  const urgentBtnCls = t.urgent ? "btn btn-urgent-active" : "btn btn-secondary";

  return '<div class="' + cardCls + '">' +
    '<div class="task-accordion-header" onclick="toggleTaskExpanded(\'' + t.id + '\')">' +
      '<div class="task-header-left">' +
        '<div class="task-meta">' + getUrgentBadge(t.urgent) + ' ' + getSourceBadge(t.source) + ' ' + getDuePillHtml(t) + '</div>' +
        '<div class="task-title">' + escapeHtmlAttr(t.title) + '</div>' +
        renderSummaryStripHtml(t) +
      '</div>' +
      '<span class="task-expand-pill">' + (isExpanded ? "Close" : "Open") + '</span>' +
    '</div>' +
    (isExpanded ? (
      '<div class="task-accordion-body">' +
        renderTaskPhotosHtml(t) +
        renderChecklistHtml(t) +
        renderTaskNotesHtml(t, isAdmin) +
        '<label class="form-label" style="margin-top:6px;">Tap Team Members to Assign</label>' +
        '<div class="user-select-grid">' + userRows + '</div>' +
        '<div class="btn-stack">' +
          '<button class="btn" onclick="assignTriageItem(\'' + t.id + '\')">Assign Selected &amp; Send Notification</button>' +
          '<button class="' + urgentBtnCls + '" onclick="toggleTaskUrgentDirect(\'' + t.id + '\')">' + urgentBtnText + '</button>' +
          '<button class="btn btn-secondary" onclick="openEditModal(\'' + t.id + '\')">Edit Task, Schedule &amp; Checklist</button>' +
          '<button class="btn btn-danger-outline" onclick="dismissTriageItem(\'' + t.id + '\')">Dismiss Item</button>' +
        '</div>' +
      '</div>'
    ) : '') +
  '</div>';
}

function renderTaskCardHtml(t, canManageTasks) {
  const isExpanded = Boolean(expandedTaskIds[t.id]);
  const hasChecklist = normalizeArray(t.checklist).length > 0;
  const completeBtnText = t.completed
    ? "Re-Open Task"
    : (hasChecklist ? "Mark Entire Task Delivered & Complete" : "Mark Task Complete");
  const urgentCls = (t.urgent && !t.completed) ? " urgent-card" : "";
  const expCls = isExpanded ? " expanded" : "";
  const cardCls = (t.completed ? "card task-card completed" : "card task-card") + urgentCls + expCls;
  const btnCls = t.completed ? "btn btn-secondary" : "btn btn-success";
  const statusHtml = t.completed
    ? ('<div class="done-stamp">Completed by ' + escapeHtmlAttr(getUserName(t.completedBy)) + ' (' + escapeHtmlAttr(t.completedAt || "Done") + ')</div>')
    : ('<div class="task-sub">Assigned by ' + escapeHtmlAttr(getUserName(t.createdBy)) + '</div>');

  const urgentToggleBtnText = t.urgent ? "Remove Urgent Priority" : "Pin as Urgent / High-Priority";
  const urgentToggleBtnCls = t.urgent ? "btn btn-urgent-active" : "btn btn-secondary";

  const managerButtonsHtml = canManageTasks
    ? ((!t.completed ? ('<button class="' + urgentToggleBtnCls + '" onclick="toggleTaskUrgentDirect(\'' + t.id + '\')">' + urgentToggleBtnText + '</button>') : "") +
       '<button class="btn btn-secondary" onclick="openEditModal(\'' + t.id + '\')">Edit Task, Schedule &amp; Checklist</button>' +
       '<button class="btn btn-danger-outline" onclick="deleteTask(\'' + t.id + '\')">Delete Task</button>')
    : "";

  return '<div class="' + cardCls + '">' +
    '<div class="task-accordion-header" onclick="toggleTaskExpanded(\'' + t.id + '\')">' +
      '<div class="task-header-left">' +
        '<div class="task-meta">' + getUrgentBadge(t.urgent) + ' ' + getSourceBadge(t.source) + ' ' + getAssigneeBadges(t.assignedTo) + ' ' + getDuePillHtml(t) + '</div>' +
        '<div class="task-title">' + escapeHtmlAttr(t.title) + '</div>' +
        renderSummaryStripHtml(t) +
      '</div>' +
      '<span class="task-expand-pill">' + (isExpanded ? "Close" : "Open") + '</span>' +
    '</div>' +
    (isExpanded ? (
      '<div class="task-accordion-body">' +
        renderTaskPhotosHtml(t) +
        renderChecklistHtml(t) +
        renderTaskNotesHtml(t, canManageTasks) +
        statusHtml +
        '<div class="btn-stack" style="margin-top: 4px;">' +
          '<button class="' + btnCls + '" onclick="toggleTaskCompletion(\'' + t.id + '\')">' + completeBtnText + '</button>' +
          managerButtonsHtml +
        '</div>' +
      '</div>'
    ) : '') +
  '</div>';
}

function renderCreatorUserGrid() {
  const grid = document.getElementById("creator-user-grid");
  if (!grid) return;
  grid.innerHTML = state.users.map(function(u) {
    const isSel = creatorSelectedUsers.indexOf(u.id) !== -1;
    const rowCls = isSel ? "user-pick-row selected" : "user-pick-row";
    return '<div class="' + rowCls + '" onclick="toggleCreatorUser(\'' + u.id + '\')">' +
      '<span>' + escapeHtmlAttr(u.name) + ' (' + getRoleDisplayLabel(u.role).toUpperCase() + ')</span>' +
      '<div class="pick-indicator">' + (isSel ? "✓" : "") + '</div>' +
    '</div>';
  }).join("");
}

/********************************************************************
 * MASTER RENDER LOOP & BOOTSTRAP
 ********************************************************************/
function renderAll() {
  state.users = normalizeArray(state.users);
  if (state.users.length === 0) state.users = DEFAULT_SHARED_STATE.users.slice();
  state.tasks = normalizeArray(state.tasks).map(normalizeTaskObject);
  lastRenderedHash = computeStateHash(state);

  const loginSelect = document.getElementById("login-user-select");
  if (document.activeElement !== loginSelect) {
    const prevLoginSel = loginSelect.value;
    loginSelect.innerHTML = state.users.map(function(u) {
      const roleLabel = getRoleDisplayLabel(u.role).toUpperCase();
      return '<option value="' + u.id + '">' + escapeHtmlAttr(u.name) + ' (' + roleLabel + ')</option>';
    }).join("");
    if (prevLoginSel && state.users.some(function(u) { return u.id === prevLoginSel; })) {
      loginSelect.value = prevLoginSel;
    }
  }

  const user = getCurrentUser();
  if (!user) {
    document.getElementById("app-header").classList.add("hidden");
    document.getElementById("bottom-nav").classList.add("hidden");
    document.getElementById("tab-triage").classList.add("hidden");
    document.getElementById("tab-tasks").classList.add("hidden");
    document.getElementById("tab-team").classList.add("hidden");
    document.getElementById("login-screen").classList.remove("hidden");
    return;
  }

  document.getElementById("login-screen").classList.add("hidden");
  const isAdmin = isAdminRole(user);
  const isDelegatorOrAdmin = isDelegatorOrAdminRole(user);

  if (!isAdmin && activeTab !== "tasks") {
    activeTab = "tasks";
  }

  document.getElementById("app-header").classList.remove("hidden");
  document.getElementById("bottom-nav").classList.remove("hidden");
  document.getElementById("header-username").textContent = user.name;
  const roleBadge = document.getElementById("header-role-badge");
  roleBadge.textContent = getRoleDisplayLabel(user.role);
  roleBadge.className = "role-tag " + getRoleBadgeClass(user.role);

  document.getElementById("nav-triage").classList.toggle("hidden", !isAdmin);
  document.getElementById("nav-team").classList.toggle("hidden", !isAdmin);
  document.getElementById("admin-task-creator-wrap").classList.toggle("hidden", !isDelegatorOrAdmin);
  document.getElementById("admin-filter-bar").classList.toggle("hidden", !isDelegatorOrAdmin);

  document.getElementById("tab-triage").classList.toggle("hidden", !(isAdmin && activeTab === "triage"));
  document.getElementById("tab-tasks").classList.toggle("hidden", activeTab !== "tasks");
  document.getElementById("tab-team").classList.toggle("hidden", !(isAdmin && activeTab === "team"));

  document.getElementById("nav-triage").classList.toggle("active", activeTab === "triage");
  document.getElementById("nav-tasks").classList.toggle("active", activeTab === "tasks");
  document.getElementById("nav-team").classList.toggle("active", activeTab === "team");

  const sortModes = ["priority_date", "date_only", "group_day"];
  for (let sm = 0; sm < sortModes.length; sm++) {
    const chipEl = document.getElementById("sort-chip-" + sortModes[sm]);
    if (chipEl) chipEl.classList.toggle("active", taskSortMode === sortModes[sm]);
  }

  if (isDelegatorOrAdmin) {
    renderCreatorUserGrid();
    syncUrgentToggleUI();
  }

  if (isAdmin) {
    const keyTriggerLabel = document.getElementById("gemini-key-trigger-label");
    if (keyTriggerLabel) {
      keyTriggerLabel.innerHTML = state.geminiApiKey
        ? 'Gemini API Key <span style="color:#34d399; font-size:12px; margin-left:6px;">(Saved &amp; Active)</span>'
        : 'Gemini API Key <span style="color:#fbbf24; font-size:12px; margin-left:6px;">(Not Set)</span>';
    }

    const keyInput = document.getElementById("gemini-key-input");
    if (document.activeElement !== keyInput && state.geminiApiKey) {
      keyInput.value = state.geminiApiKey;
    }
    if (dropdownState.recoveryScanner) {
      renderRecoverySnapshots();
    }
    if (dropdownState.captureRules) {
      populateFilterInputs();
    }
    if (dropdownState.scanLog) {
      renderScanLog();
    }
  }

  const triageItems = state.tasks
    .filter(function(t) { return t.visibility === "triage"; })
    .slice()
    .sort(function(a, b) {
      const urgDiff = (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0);
      if (urgDiff !== 0) return urgDiff;
      return computeTaskDueSortScore(a) - computeTaskDueSortScore(b);
    });

  document.getElementById("triage-count").textContent = triageItems.length;
  const badgeTriage = document.getElementById("badge-triage");
  badgeTriage.textContent = triageItems.length;
  badgeTriage.classList.toggle("hidden", triageItems.length === 0);

  const triageListEl = document.getElementById("triage-list");
  if (triageItems.length === 0) {
    triageListEl.innerHTML = '<div class="card" style="text-align:center; color:var(--muted); font-size:14px; padding:28px;">No pending work items in triage queue.</div>';
  } else {
    triageListEl.innerHTML = triageItems.map(function(t) {
      return renderTriageCardHtml(t, isAdmin);
    }).join("");
  }

  if (isDelegatorOrAdmin) {
    const chips = [{ id: "ALL", label: "All Users" }].concat(state.users.map(function(u) {
      return { id: u.id, label: u.name };
    }));
    document.getElementById("admin-filter-bar").innerHTML = chips.map(function(c) {
      const cls = adminFilterUserId === c.id ? "chip active" : "chip";
      return '<button class="' + cls + '" onclick="setAdminFilter(\'' + c.id + '\')">' + escapeHtmlAttr(c.label) + '</button>';
    }).join("");
  }

  let visibleTasks = state.tasks.filter(function(t) { return t.visibility === "assigned"; });
  if (!isDelegatorOrAdmin) {
    visibleTasks = visibleTasks.filter(function(t) {
      const list = normalizeArray(t.assignedTo);
      return list.indexOf(user.id) !== -1;
    });
    document.getElementById("tasks-heading").textContent = "My Active Tasks";
  } else {
    document.getElementById("tasks-heading").textContent = adminFilterUserId === "ALL" ? "All Active Tasks" : ("Active Tasks for " + getUserName(adminFilterUserId));
    if (adminFilterUserId !== "ALL") {
      visibleTasks = visibleTasks.filter(function(t) {
        const list = normalizeArray(t.assignedTo);
        return list.indexOf(adminFilterUserId) !== -1;
      });
    }
  }

  const activeTasks = visibleTasks
    .filter(function(t) { return !t.completed; })
    .slice()
    .sort(function(a, b) {
      if (taskSortMode === "priority_date") {
        const urgDiff = (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0);
        if (urgDiff !== 0) return urgDiff;
      }
      return computeTaskDueSortScore(a) - computeTaskDueSortScore(b);
    });

  const completedTasks = visibleTasks.filter(function(t) { return Boolean(t.completed); });
  const urgentCount = activeTasks.filter(function(t) { return Boolean(t.urgent); }).length;

  const badgeTasks = document.getElementById("badge-tasks");
  badgeTasks.textContent = activeTasks.length;
  badgeTasks.classList.toggle("hidden", activeTasks.length === 0);
  document.getElementById("tasks-stats").textContent = urgentCount > 0
    ? ("(" + activeTasks.length + " Active • " + urgentCount + " Urgent)")
    : ("(" + activeTasks.length + " Active)");

  const tasksListEl = document.getElementById("tasks-list");
  if (activeTasks.length === 0) {
    tasksListEl.innerHTML = '<div class="card" style="text-align:center; color:var(--muted); font-size:14px; padding:28px;">No active tasks pending.</div>';
  } else if (taskSortMode === "group_day") {
    let groupedHtml = "";
    let lastDateKey = null;
    for (let i = 0; i < activeTasks.length; i++) {
      const t = activeTasks[i];
      const dKey = t.dueDate || getTodayIso();
      if (dKey !== lastDateKey) {
        lastDateKey = dKey;
        groupedHtml += '<div class="day-group-header">' + escapeHtmlAttr(formatDayHeading(dKey)) + '</div>';
      }
      groupedHtml += renderTaskCardHtml(t, isDelegatorOrAdmin);
    }
    tasksListEl.innerHTML = groupedHtml;
  } else {
    tasksListEl.innerHTML = activeTasks.map(function(t) {
      return renderTaskCardHtml(t, isDelegatorOrAdmin);
    }).join("");
  }

  const completedLabelEl = document.getElementById("completed-trigger-label");
  if (completedLabelEl) {
    completedLabelEl.textContent = "Completed Tasks (" + completedTasks.length + ")";
  }
  const clearBtnEl = document.getElementById("btn-clear-completed");
  if (clearBtnEl) {
    clearBtnEl.classList.toggle("hidden", !(isAdmin && completedTasks.length > 0));
  }

  const completedListEl = document.getElementById("completed-tasks-list");
  if (completedListEl) {
    if (completedTasks.length === 0) {
      completedListEl.innerHTML = '<div style="text-align:center; color:var(--muted); font-size:13px; padding:14px 0;">No completed tasks in archive.</div>';
    } else {
      completedListEl.innerHTML = completedTasks.map(function(t) {
        return renderTaskCardHtml(t, isDelegatorOrAdmin);
      }).join("");
    }
  }

  if (isAdmin) {
    document.getElementById("team-list").innerHTML = state.users.map(function(u) {
      const currentRole = (u.role === "admin" || u.role === "delegator") ? u.role : "member";
      const roleCls = "role-tag " + getRoleBadgeClass(currentRole);
      const isSelf = u.id === user.id;

      const roleControlHtml = !isSelf
        ? ('<label class="form-label" style="margin-bottom:6px;">Permission Role</label>' +
           '<select style="margin-bottom:10px; padding:12px 14px;" onchange="updateUserRole(\'' + u.id + '\', this.value)">' +
             '<option value="member"' + (currentRole === "member" ? " selected" : "") + '>Crew / Team Member</option>' +
             '<option value="delegator"' + (currentRole === "delegator" ? " selected" : "") + '>Delegator (Create &amp; Assign Tasks)</option>' +
             '<option value="admin"' + (currentRole === "admin" ? " selected" : "") + '>Administrator (Full Access)</option>' +
           '</select>')
        : "";

      const removeBtn = !isSelf
        ? ('<button class="btn btn-danger-outline" onclick="removeUser(\'' + u.id + '\')">Remove Account</button>')
        : "";

      return '<div class="card">' +
        '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">' +
          '<div>' +
            '<div style="font-weight:600; font-size:16px; margin-bottom:4px;">' + escapeHtmlAttr(u.name) + '</div>' +
            '<div style="font-size:13px; color:var(--muted);">PIN: ' + escapeHtmlAttr(u.pin || "1234") + '</div>' +
          '</div>' +
          '<span class="' + roleCls + '">' + getRoleDisplayLabel(currentRole).toUpperCase() + '</span>' +
        '</div>' +
        roleControlHtml +
        removeBtn +
      '</div>';
    }).join("");
  }
}

state = loadBestAvailableLocalState();
renderAll();
startCloudSyncLoop();
