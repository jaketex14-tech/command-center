/********************************************************************
 * DELETE CONFIRMATION MODAL
 ********************************************************************/
let pendingConfirmAction = null;

function openConfirmModal(title, message, confirmLabel, onConfirm) {
  pendingConfirmAction = typeof onConfirm === "function" ? onConfirm : null;
  document.getElementById("confirm-modal-title").textContent = title || "Confirm Action";
  document.getElementById("confirm-modal-message").textContent = message || "Are you sure?";
  document.getElementById("confirm-modal-ok").textContent = confirmLabel || "Delete";
  document.getElementById("confirm-modal").classList.remove("hidden");
}

function closeConfirmModal() {
  pendingConfirmAction = null;
  const modal = document.getElementById("confirm-modal");
  if (modal) modal.classList.add("hidden");
}

function executePendingConfirm() {
  const action = pendingConfirmAction;
  closeConfirmModal();
  if (action) action();
}
/********************************************************************
 * URGENT PRIORITY CONTROLS
 ********************************************************************/
function syncUrgentToggleUI() {
  const cRow = document.getElementById("creator-urgent-row");
  const cInd = document.getElementById("creator-urgent-ind");
  if (cRow && cInd) {
    cRow.classList.toggle("selected", creatorUrgent);
    cInd.textContent = creatorUrgent ? "✓" : "";
  }

  const tRow = document.getElementById("triage-urgent-row");
  const tInd = document.getElementById("triage-urgent-ind");
  if (tRow && tInd) {
    tRow.classList.toggle("selected", triageCreatorUrgent);
    tInd.textContent = triageCreatorUrgent ? "✓" : "";
  }

  const eRow = document.getElementById("edit-urgent-row");
  const eInd = document.getElementById("edit-urgent-ind");
  if (eRow && eInd) {
    eRow.classList.toggle("selected", editDraftUrgent);
    eInd.textContent = editDraftUrgent ? "✓" : "";
  }
}

function toggleCreatorUrgent() {
  creatorUrgent = !creatorUrgent;
  syncUrgentToggleUI();
}

function toggleTriageCreatorUrgent() {
  triageCreatorUrgent = !triageCreatorUrgent;
  syncUrgentToggleUI();
}

function toggleEditUrgent() {
  editDraftUrgent = !editDraftUrgent;
  syncUrgentToggleUI();
}

function toggleTaskUrgentDirect(taskId) {
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  const actor = getCurrentUser();
  if (!task || !isDelegatorOrAdminRole(actor)) return;

  task.urgent = !task.urgent;
  expandedTaskIds[taskId] = true;

  if (task.urgent && task.visibility === "assigned") {
    const targets = normalizeArray(task.assignedTo);
    pushStateToCloud(
      "[URGENT] Priority Escalated",
      actor.name + " pinned \"" + task.title + "\" as Urgent / High-Priority.",
      targets.length > 0 ? targets : "ALL"
    );
  } else {
    pushStateToCloud();
  }
}

/********************************************************************
 * TASK CREATION, TRIAGE & LIFECYCLE
 ********************************************************************/
function toggleCreatorUser(userId) {
  const idx = creatorSelectedUsers.indexOf(userId);
  if (idx !== -1) {
    creatorSelectedUsers.splice(idx, 1);
  } else {
    creatorSelectedUsers.push(userId);
  }
  renderCreatorUserGrid();
}

function toggleTriageUser(taskId, userId) {
  if (!isAdminRole(getCurrentUser())) return;
  const current = triageSelections[taskId] ? triageSelections[taskId].slice() : [];
  const idx = current.indexOf(userId);
  if (idx !== -1) {
    current.splice(idx, 1);
  } else {
    current.push(userId);
  }
  triageSelections[taskId] = current;
  expandedTaskIds[taskId] = true;
  renderAll();
}

function assignTriageItem(taskId) {
  const adminUser = getCurrentUser();
  if (!isAdminRole(adminUser)) return;
  const selectedIds = triageSelections[taskId] || [];
  const task = state.tasks.find(function(t) { return t.id === taskId; });

  if (!task || selectedIds.length === 0) {
    showBanner("Select Assignee", "Tap at least one team member before assigning.");
    return;
  }

  task.visibility = "assigned";
  task.assignedTo = selectedIds;
  delete triageSelections[taskId];

  const prefix = task.urgent ? "[URGENT] " : "";
  const names = selectedIds.map(function(id) { return getUserName(id); }).join(", ");
  pushStateToCloud(prefix + "Task Assigned", "Assigned to " + names + ": " + task.title, selectedIds);
}

function dismissTriageItem(taskId) {
  if (!isAdminRole(getCurrentUser())) return;
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;

  openConfirmModal(
    "Dismiss Triage Item?",
    "Remove \"" + task.title + "\" from the triage queue? This cannot be undone.",
    "Dismiss & Delete",
    function() {
      state.tasks = state.tasks.filter(function(t) { return t.id !== taskId; });
      delete triageSelections[taskId];
      pushStateToCloud();
    }
  );
}

async function handleManualAnalyze() {
  if (!isAdminRole(getCurrentUser())) return;
  const inputEl = document.getElementById("triage-manual-input");
  const sourceEl = document.getElementById("triage-source-select");
  const feedbackEl = document.getElementById("analyze-feedback");
  const btnEl = document.getElementById("btn-analyze");

  if (activePhotoScanPromise) {
    btnEl.textContent = "Finishing Photo Scan...";
    await activePhotoScanPromise;
  }

  const rawText = inputEl.value.trim();
  if (!rawText && triagePendingPhotos.length === 0) {
    showBanner("Input Required", "Paste a message or attach a photo of a material list first.");
    return;
  }

  btnEl.textContent = "Analyzing...";
  feedbackEl.style.display = "none";

  const dueDate = calState.triage.date || getTodayIso();
  const duePeriod = calState.triage.period || "AM";
  const dueLabel = formatFriendlyDueLabel(dueDate, duePeriod, "Today");

  const attachedPhotos = triagePendingPhotos.slice();
  const result = await evaluateIncomingMessage(rawText, sourceEl.value, dueLabel, "", attachedPhotos, true);
  btnEl.textContent = "Analyze & Generate Work Task";

  recordScanDecision({
    source: sourceEl.value,
    sender: "Manual Entry",
    text: rawText || "(Photo Scan)",
    accepted: Boolean(result && result.isWorkRelated),
    reason: result && result.reason ? result.reason : "Evaluated"
  });

  if (!result || !result.isWorkRelated) {
    feedbackEl.style.display = "block";
    feedbackEl.style.color = "#f87171";
    feedbackEl.textContent = "Filtered Out (" + (result && result.reason ? result.reason : "Non-work message") + ").";
    return;
  }

  const isUrgent = Boolean(triageCreatorUrgent || result.urgent);
  const newId = "t_" + Date.now();

  state.tasks.unshift({
    id: newId,
    title: result.title,
    source: sourceEl.value,
    dueDate: dueDate,
    duePeriod: duePeriod,
    due: dueLabel,
    urgent: isUrgent,
    checklist: result.checklist || [],
    images: attachedPhotos,
    notes: [],
    visibility: "triage",
    assignedTo: [],
    createdBy: currentUserId,
    completed: false,
    completedBy: null,
    completedAt: null,
    completedTimestamp: null
  });

  expandedTaskIds[newId] = true;
  inputEl.value = "";
  triagePendingPhotos = [];
  triageCreatorUrgent = false;
  syncUrgentToggleUI();
  renderStagingPhotos();
  toggleDropdownPanel("triageCreator", false);

  feedbackEl.style.display = "block";
  feedbackEl.style.color = "#34d399";
  feedbackEl.textContent = "Created task \"" + result.title + "\" (" + (result.checklist ? result.checklist.length : 0) + " checklist items, " + attachedPhotos.length + " photo(s)).";

  const prefix = isUrgent ? "[URGENT] " : "";
  pushStateToCloud(prefix + "New Work Item Ready", result.title + " added to Triage Queue.", "ADMINS");
}

async function createAndAssignTask() {
  const actor = getCurrentUser();
  if (!isDelegatorOrAdminRole(actor)) return;

  const titleInput = document.getElementById("new-task-title");
  const checklistInput = document.getElementById("new-task-checklist");
  const createBtn = document.getElementById("btn-create-task");

  if (creatorSelectedUsers.length === 0) {
    showBanner("Select Assignee", "Tap at least one team member to assign this task.");
    return;
  }

  if (activePhotoScanPromise) {
    createBtn.textContent = "Finishing Photo Scan...";
    await activePhotoScanPromise;
  }

  let title = titleInput.value.trim();
  const rawChecklistText = checklistInput.value.trim();
  const attachedPhotos = creatorPendingPhotos.slice();

  if (!title && !rawChecklistText && attachedPhotos.length === 0) {
    showBanner("Input Required", "Enter a task title, checklist items, or attach a photo.");
    return;
  }

  createBtn.textContent = "Publishing...";

  let checklist = parseManualChecklistText(rawChecklistText);

  if (attachedPhotos.length > 0 && checklist.length === 0) {
    createBtn.textContent = "Scanning Photo List...";
    const scanRes = await extractChecklistFromPhotosWithGemini(attachedPhotos);
    if (scanRes && scanRes.items && scanRes.items.length > 0) {
      if (!title && scanRes.title) title = scanRes.title;
      checklist = scanRes.items.map(function(txt, idx) {
        return {
          id: "chk_" + Date.now() + "_" + idx,
          text: txt,
          done: false,
          delivered: false,
          deliveredBy: null,
          deliveredAt: null
        };
      });
    }
  }

  if (!title) title = "Material List Task";

  const isUrgent = Boolean(creatorUrgent || detectUrgentKeyword(title));
  const dueDate = calState.creator.date || getTodayIso();
  const duePeriod = calState.creator.period || "AM";
  const due = formatFriendlyDueLabel(dueDate, duePeriod, "Today");
  const assignedIds = creatorSelectedUsers.slice();
  const names = assignedIds.map(function(id) { return getUserName(id); }).join(", ");
  const newId = "t_" + Date.now();

  state.tasks.unshift({
    id: newId,
    title: title,
    source: "MANUAL",
    dueDate: dueDate,
    duePeriod: duePeriod,
    due: due,
    urgent: isUrgent,
    checklist: checklist,
    images: attachedPhotos,
    notes: [],
    visibility: "assigned",
    assignedTo: assignedIds,
    createdBy: actor.id,
    completed: false,
    completedBy: null,
    completedAt: null,
    completedTimestamp: null
  });

  expandedTaskIds[newId] = true;
  titleInput.value = "";
  checklistInput.value = "";
  creatorSelectedUsers = [];
  creatorUrgent = false;
  creatorPendingPhotos = [];
  syncUrgentToggleUI();
  renderStagingPhotos();
  createBtn.textContent = "Publish & Notify Assignees";
  toggleDropdownPanel("taskCreator", false);

  const prefix = isUrgent ? "[URGENT] " : "";
  pushStateToCloud(prefix + "New Task Assignment", "Assigned to " + names + ": " + title + " (Due: " + due + ", " + checklist.length + " items)", assignedIds);
}

/********************************************************************
 * CHECKLISTS, PARTIAL DELIVERY & COMPLETION
 ********************************************************************/
function toggleChecklistItem(taskId, itemId) {
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  const actor = getCurrentUser();
  if (!task || !actor || task.completed) return;

  const list = normalizeArray(task.checklist);
  for (let i = 0; i < list.length; i++) {
    if (list[i].id === itemId) {
      if (list[i].delivered) return;
      list[i].done = !list[i].done;
      list[i].doneBy = list[i].done ? actor.name : null;
      break;
    }
  }
  task.checklist = list;
  expandedTaskIds[taskId] = true;

  const remaining = list.filter(function(i) { return !i.delivered; });
  const remainingDone = remaining.filter(function(i) { return i.done; }).length;

  if (remaining.length > 0 && remainingDone === remaining.length) {
    pushStateToCloud(
      "Checklist Items Ready",
      "All remaining items (" + remaining.length + ") checked for \"" + task.title + "\" by " + actor.name + ". Ready for final delivery/completion.",
      "MANAGERS"
    );
  } else {
    pushStateToCloud();
  }
}

function markCheckedItemsDelivered(taskId) {
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  const actor = getCurrentUser();
  if (!task || !actor || task.completed) return;

  const list = normalizeArray(task.checklist);
  const now = new Date();
  const nowStr = now.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  let newlyDelivered = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i].done && !list[i].delivered) {
      list[i].delivered = true;
      list[i].deliveredBy = actor.name;
      list[i].deliveredAt = nowStr;
      newlyDelivered++;
    }
  }

  if (newlyDelivered === 0) {
    showBanner("No Items Checked", "Check off the items you are delivering first.");
    return;
  }

  task.checklist = list;
  expandedTaskIds[taskId] = true;

  const remainingCount = list.filter(function(i) { return !i.delivered; }).length;
  pushStateToCloud(
    "Partial Delivery Logged",
    actor.name + " marked " + newlyDelivered + " item(s) delivered on \"" + task.title + "\" (" + remainingCount + " remaining).",
    "MANAGERS"
  );
}

function toggleTaskCompletion(taskId) {
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  const actor = getCurrentUser();
  if (!task || !actor) return;

  task.completed = !task.completed;

  if (task.completed) {
    const now = new Date();
    const nowStr = now.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    task.completedBy = actor.id;
    task.completedAt = nowStr;
    task.completedTimestamp = Date.now();
    expandedTaskIds[taskId] = false;
    pushStateToCloud("Task Delivered & Completed", "\"" + task.title + "\" marked complete by " + actor.name + " at " + nowStr + ".", "MANAGERS");
  } else {
    task.completedBy = null;
    task.completedAt = null;
    task.completedTimestamp = null;
    pushStateToCloud("Task Re-Opened", "\"" + task.title + "\" reopened by " + actor.name + ".", "MANAGERS");
  }
}

function clearAllCompletedTasks() {
  if (!isAdminRole(getCurrentUser())) return;
  const completedCount = state.tasks.filter(function(t) { return t.visibility === "assigned" && t.completed; }).length;
  if (completedCount === 0) return;

  openConfirmModal(
    "Clear All Completed Tasks?",
    "Permanently delete all " + completedCount + " completed task" + (completedCount === 1 ? "" : "s") + " from the archive? This cannot be undone.",
    "Delete All Completed",
    function() {
      state.tasks = state.tasks.filter(function(t) { return !(t.visibility === "assigned" && t.completed); });
      toggleDropdownPanel("completedTasks", false);
      pushStateToCloud("Completed Tasks Cleared", "Removed " + completedCount + " completed task(s) from the archive.", "ADMINS");
    }
  );
}

function deleteTask(taskId) {
  if (!isDelegatorOrAdminRole(getCurrentUser())) return;
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;

  const heading = task.completed ? "Delete Completed Task?" : "Delete Active Task?";
  openConfirmModal(
    heading,
    "Permanently delete \"" + task.title + "\"? This cannot be undone.",
    "Delete Task",
    function() {
      state.tasks = state.tasks.filter(function(t) { return t.id !== taskId; });
      pushStateToCloud();
    }
  );
}

/********************************************************************
 * TASK NOTES
 ********************************************************************/
function addTaskNote(taskId) {
  const inputEl = document.getElementById("note-input-" + taskId);
  const text = inputEl ? inputEl.value.trim() : "";
  const stagedImgs = normalizeArray(notePendingPhotos[taskId]);

  if (!text && stagedImgs.length === 0) {
    showBanner("Empty Note", "Write a note or attach a photo first.");
    return;
  }

  const task = state.tasks.find(function(t) { return t.id === taskId; });
  const actor = getCurrentUser();
  if (!task || !actor) return;

  const notes = normalizeArray(task.notes);
  const timeStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  notes.push({
    id: "n_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    authorId: actor.id,
    authorName: actor.name,
    text: text,
    images: stagedImgs.slice(),
    createdAt: timeStr
  });
  task.notes = notes;

  delete notePendingPhotos[taskId];
  delete notePhotoSourceOpen[taskId];
  expandedTaskIds[taskId] = true;
  if (inputEl) {
    inputEl.value = "";
    inputEl.blur();
  }

  const assignedIds = normalizeArray(task.assignedTo);
  let targetAudience = "MANAGERS";
  if (isDelegatorOrAdminRole(actor) && assignedIds.length > 0) {
    targetAudience = assignedIds.slice();
  } else if (assignedIds.length > 0) {
    const managerIds = normalizeArray(state.users)
      .filter(function(u) { return isDelegatorOrAdminRole(u); })
      .map(function(u) { return u.id; });
    const combined = managerIds.concat(assignedIds);
    targetAudience = combined.filter(function(id, idx) { return combined.indexOf(id) === idx; });
  }

  const photoDesc = stagedImgs.length > 0 ? (" [" + stagedImgs.length + " photo(s)]") : "";
  const bodyPreview = text ? ("\"" + text + "\"" + photoDesc) : ("Attached " + stagedImgs.length + " photo(s) to task notes.");

  pushStateToCloud(
    "New Note on \"" + task.title + "\"",
    actor.name + ": " + bodyPreview,
    targetAudience
  );
}

function deleteTaskNote(taskId, noteId) {
  if (!isDelegatorOrAdminRole(getCurrentUser())) return;
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  const note = normalizeArray(task.notes).find(function(n) { return n.id === noteId; });
  if (!note) return;

  const preview = note.text
    ? ("\"" + (note.text.length > 60 ? note.text.slice(0, 60) + "..." : note.text) + "\"")
    : (normalizeArray(note.images).length + " attached photo(s)");

  openConfirmModal(
    "Delete Task Note?",
    "Remove " + (note.authorName || "this user") + "'s note (" + preview + ")? This cannot be undone.",
    "Delete Note",
    function() {
      const currentTask = state.tasks.find(function(t) { return t.id === taskId; });
      if (!currentTask) return;
      currentTask.notes = normalizeArray(currentTask.notes).filter(function(n) { return n.id !== noteId; });
      expandedTaskIds[taskId] = true;
      pushStateToCloud();
    }
  );
}

/********************************************************************
 * EDIT TASK MODAL
 ********************************************************************/
function openEditModal(taskId) {
  if (!isDelegatorOrAdminRole(getCurrentUser())) return;
  const task = state.tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;

  editingTaskId = task.id;
  document.getElementById("edit-task-title").value = task.title || "";
  document.getElementById("edit-new-items-input").value = "";

  const iso = task.dueDate || getTodayIso();
  const parts = iso.split("-");
  calState.edit = {
    date: iso,
    period: (task.duePeriod === "PM") ? "PM" : "AM",
    viewYear: Number(parts[0]) || new Date().getFullYear(),
    viewMonth: (Number(parts[1]) || (new Date().getMonth() + 1)) - 1
  };
  renderScheduleWidget("edit");

  editDraftUrgent = Boolean(task.urgent);
  editDraftChecklist = normalizeArray(task.checklist).map(function(item) {
    return {
      id: item.id || ("chk_" + Date.now() + "_" + Math.floor(Math.random() * 1000)),
      text: String(item.text || ""),
      done: Boolean(item.done),
      doneBy: item.doneBy || null,
      delivered: Boolean(item.delivered),
      deliveredBy: item.deliveredBy || null,
      deliveredAt: item.deliveredAt || null
    };
  });

  editDraftAssignees = normalizeArray(task.assignedTo).slice();
  editDraftPhotos = normalizeArray(task.images).slice();

  syncUrgentToggleUI();
  renderEditModalContents(task);
  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  editingTaskId = null;
  editDraftChecklist = [];
  editDraftAssignees = [];
  editDraftPhotos = [];
  editDraftUrgent = false;
  document.getElementById("edit-modal").classList.add("hidden");
}

function updateDraftItemText(index, newText) {
  if (editDraftChecklist[index]) {
    editDraftChecklist[index].text = newText;
  }
}

function restoreDraftDeliveredItem(index) {
  if (!editDraftChecklist[index]) return;
  editDraftChecklist[index].delivered = false;
  editDraftChecklist[index].deliveredBy = null;
  editDraftChecklist[index].deliveredAt = null;
  editDraftChecklist[index].done = false;
  editDraftChecklist[index].doneBy = null;
  const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
  renderEditModalContents(task);
}

function removeDraftItem(index) {
  editDraftChecklist.splice(index, 1);
  const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
  renderEditModalContents(task);
}

function appendDraftItems() {
  const newItemsInput = document.getElementById("edit-new-items-input");
  const raw = (newItemsInput.value || "").trim();
  if (!raw) return;

  const parsedItems = parseManualChecklistText(raw);
  for (let i = 0; i < parsedItems.length; i++) {
    editDraftChecklist.push(parsedItems[i]);
  }
  newItemsInput.value = "";

  const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
  renderEditModalContents(task);
}

function toggleEditAssignee(userId) {
  const idx = editDraftAssignees.indexOf(userId);
  if (idx !== -1) {
    editDraftAssignees.splice(idx, 1);
  } else {
    editDraftAssignees.push(userId);
  }
  const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
  renderEditModalContents(task);
}

function renderEditModalContents(task) {
  const photoContainer = document.getElementById("edit-photos-container");
  if (editDraftPhotos.length === 0) {
    photoContainer.innerHTML = '<div style="color:var(--muted); font-size:13px; padding:4px 0 8px;">No photos attached to this task.</div>';
  } else {
    photoContainer.innerHTML = editDraftPhotos.map(function(src, idx) {
      return '<div class="photo-card">' +
        '<img src="' + src + '" onclick="openImageViewer(this.src)" alt="Attached Photo" />' +
        '<button class="btn btn-danger-outline" style="margin-top:10px; padding:10px;" onclick="removeStagedPhoto(\'edit\', ' + idx + ')">Remove Photo</button>' +
      '</div>';
    }).join("");
  }

  const container = document.getElementById("edit-checklist-container");
  if (editDraftChecklist.length === 0) {
    container.innerHTML = '<div style="color:var(--muted); font-size:13px; padding:12px 0 16px;">No checklist items yet. Add items below if needed.</div>';
  } else {
    container.innerHTML = editDraftChecklist.map(function(item, idx) {
      const statusTag = item.delivered
        ? " (Delivered — Hidden)"
        : (item.done ? " (Checked Off)" : "");
      const restoreBtn = item.delivered
        ? ('<button class="btn btn-secondary" style="padding:10px; margin-bottom:8px;" onclick="restoreDraftDeliveredItem(' + idx + ')">Restore to Active Checklist</button>')
        : "";
      return '<div class="edit-item-card">' +
        '<label class="form-label">Item #' + (idx + 1) + statusTag + '</label>' +
        '<input type="text" value="' + escapeHtmlAttr(item.text) + '" oninput="updateDraftItemText(' + idx + ', this.value)" />' +
        restoreBtn +
        '<button class="btn btn-danger-outline" style="padding:12px;" onclick="removeDraftItem(' + idx + ')">Remove Item</button>' +
      '</div>';
    }).join("");
  }

  const assigneesSection = document.getElementById("edit-assignees-section");
  const userGrid = document.getElementById("edit-user-grid");
  if (task && task.visibility === "assigned") {
    assigneesSection.classList.remove("hidden");
    userGrid.innerHTML = state.users.map(function(u) {
      const isSel = editDraftAssignees.indexOf(u.id) !== -1;
      const rowCls = isSel ? "user-pick-row selected" : "user-pick-row";
      return '<div class="' + rowCls + '" onclick="toggleEditAssignee(\'' + u.id + '\')">' +
        '<span>' + escapeHtmlAttr(u.name) + ' (' + getRoleDisplayLabel(u.role).toUpperCase() + ')</span>' +
        '<div class="pick-indicator">' + (isSel ? "✓" : "") + '</div>' +
      '</div>';
    }).join("");
  } else {
    assigneesSection.classList.add("hidden");
  }
}

async function saveTaskEdits() {
  if (activePhotoScanPromise) {
    await activePhotoScanPromise;
  }

  const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
  const actor = getCurrentUser();
  if (!task || !isDelegatorOrAdminRole(actor)) return;

  const pendingNewText = (document.getElementById("edit-new-items-input").value || "").trim();
  if (pendingNewText) {
    const extraItems = parseManualChecklistText(pendingNewText);
    for (let i = 0; i < extraItems.length; i++) {
      editDraftChecklist.push(extraItems[i]);
    }
  }

  const newTitle = document.getElementById("edit-task-title").value.trim();
  if (!newTitle) {
    showBanner("Missing Title", "Task title cannot be blank.");
    return;
  }

  if (task.visibility === "assigned" && editDraftAssignees.length === 0) {
    showBanner("Select Assignee", "An assigned task must have at least one team member selected.");
    return;
  }

  task.title = newTitle;
  task.dueDate = calState.edit.date || getTodayIso();
  task.duePeriod = calState.edit.period || "AM";
  task.due = formatFriendlyDueLabel(task.dueDate, task.duePeriod, "Today");
  task.urgent = Boolean(editDraftUrgent);
  task.images = editDraftPhotos.slice();
  task.checklist = editDraftChecklist.map(function(item) {
    return {
      id: item.id,
      text: String(item.text || "").trim(),
      done: Boolean(item.done),
      doneBy: item.doneBy || null,
      delivered: Boolean(item.delivered),
      deliveredBy: item.deliveredBy || null,
      deliveredAt: item.deliveredAt || null
    };
  }).filter(function(item) {
    return item.text.length > 0;
  });

  if (task.visibility === "assigned") {
    task.assignedTo = editDraftAssignees.slice();
  }

  expandedTaskIds[task.id] = true;
  const prefix = task.urgent ? "[URGENT] " : "";
  const notifyTargets = task.visibility === "assigned" ? task.assignedTo.slice() : "ADMINS";
  const notifyHeading = prefix + (task.visibility === "assigned" ? "Assigned Task Updated" : "Triage Task Updated");
  const notifyMsg = actor.name + " updated \"" + task.title + "\" (Due: " + task.due + ").";

  closeEditModal();
  pushStateToCloud(notifyHeading, notifyMsg, notifyTargets);
}
