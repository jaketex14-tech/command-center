/********************************************************************
 * LOCAL STORAGE RECOVERY SCANNER, RETENTION & SAFETY BACKUPS
 ********************************************************************/
function isDemoSeedData(parsedObj) {
  if (!parsedObj) return false;
  const tasks = normalizeArray(parsedObj.tasks);
  for (let i = 0; i < tasks.length; i++) {
    if (tasks[i].id === "t_demo_1" || tasks[i].id === "t_demo_2" || tasks[i].id === "chk_demo_1") {
      return true;
    }
  }
  return false;
}

function scanAllLocalStorageSnapshots() {
  const snapshots = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const raw = localStorage.getItem(key);
      if (!raw || raw[0] !== "{") continue;

      try {
        const parsed = JSON.parse(raw);
        const users = normalizeArray(parsed.users);
        const tasks = normalizeArray(parsed.tasks);
        const hasKey = Boolean(parsed.geminiApiKey && String(parsed.geminiApiKey).trim());

        if (users.length > 0 || tasks.length > 0 || hasKey) {
          snapshots.push({
            storageKey: key,
            isDemo: isDemoSeedData(parsed),
            usersCount: users.length,
            userNames: users.map(function(u) { return u.name; }).join(", "),
            tasksCount: tasks.length,
            taskTitles: tasks.slice(0, 4).map(function(t) { return t.title; }).join(" • "),
            hasGeminiKey: hasKey,
            data: parsed
          });
        }
      } catch (e2) {}
    }
  } catch (e) {}

  snapshots.sort(function(a, b) {
    if (a.isDemo !== b.isDemo) return a.isDemo ? 1 : -1;
    return (b.tasksCount + b.usersCount) - (a.tasksCount + a.usersCount);
  });
  return snapshots;
}

function renderRecoverySnapshots() {
  const container = document.getElementById("recovery-snapshots-list");
  if (!container) return;
  const list = scanAllLocalStorageSnapshots();

  if (list.length === 0) {
    container.innerHTML = '<div style="font-size:13px; color:var(--muted);">No local snapshots found on this device.</div>';
    return;
  }

  container.innerHTML = list.map(function(snap, idx) {
    const tag = snap.isDemo
      ? '<span class="scan-status-pill scan-ignored">Preview Demo Data</span>'
      : '<span class="scan-status-pill scan-accepted">Saved Device Snapshot</span>';
    const keyBadge = snap.hasGeminiKey ? " • Gemini Key Present" : "";
    return '<div class="scan-log-card">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
        tag +
        '<span style="font-size:11px; color:var(--muted);">' + escapeHtmlAttr(snap.storageKey) + '</span>' +
      '</div>' +
      '<div style="font-size:13px; color:#60a5fa; font-weight:600; margin-bottom:4px;">' +
        snap.usersCount + ' Users (' + escapeHtmlAttr(snap.userNames || "None") + ') • ' + snap.tasksCount + ' Tasks' + keyBadge +
      '</div>' +
      (snap.taskTitles ? ('<div style="font-size:12px; color:var(--muted); margin-bottom:10px;">Tasks: ' + escapeHtmlAttr(snap.taskTitles) + '</div>') : '') +
      '<button class="btn btn-success" style="padding:11px; font-size:13px;" onclick="restoreSnapshotByIndex(' + idx + ')">Restore This Snapshot to App &amp; Firebase</button>' +
    '</div>';
  }).join("");
}

async function restoreSnapshotByIndex(idx) {
  if (!isAdminRole(getCurrentUser())) return;
  const list = scanAllLocalStorageSnapshots();
  const chosen = list[idx];
  if (!chosen || !chosen.data) return;

  const d = chosen.data;
  const restoredUsers = normalizeArray(d.users);
  const restoredTasks = normalizeArray(d.tasks).map(normalizeTaskObject);

  state = {
    geminiApiKey: d.geminiApiKey || state.geminiApiKey || "",
    filterSettings: Object.assign({}, DEFAULT_FILTER_SETTINGS, d.filterSettings || state.filterSettings || {}),
    users: restoredUsers.length > 0 ? restoredUsers : state.users,
    tasks: restoredTasks,
    lastNotification: d.lastNotification || null
  };

  if (!state.users.some(function(u) { return u.id === currentUserId; })) {
    currentUserId = state.users[0].id;
    localStorage.setItem(SESSION_USER_KEY, currentUserId);
  }

  hasCompletedInitialCloudPull = true;
  toggleDropdownPanel("recoveryScanner", false);
  await pushStateToCloud("Snapshot Restored", "Restored " + state.users.length + " users and " + state.tasks.length + " tasks to Firebase.", "ADMINS");
}

function runCompletedTasksMaintenance(tasksList) {
  const now = Date.now();
  let changed = false;
  const kept = [];

  const list = normalizeArray(tasksList);
  for (let i = 0; i < list.length; i++) {
    const t = list[i];
    if (!t.completed) {
      kept.push(t);
      continue;
    }

    if (!t.completedTimestamp) {
      t.completedTimestamp = now;
      changed = true;
    }

    const ageMs = now - Number(t.completedTimestamp);

    if (ageMs > TASK_RETENTION_MS) {
      changed = true;
      continue;
    }

    if (ageMs > PHOTO_RETENTION_MS) {
      const imgs = normalizeArray(t.images);
      if (imgs.length > 0) {
        t.images = [];
        t.photosPurged = true;
        changed = true;
      }
      const notes = normalizeArray(t.notes);
      for (let n = 0; n < notes.length; n++) {
        const noteImgs = normalizeArray(notes[n].images);
        if (noteImgs.length > 0) {
          notes[n].images = [];
          notes[n].photosPurged = true;
          changed = true;
        }
      }
      t.notes = notes;
    }

    kept.push(t);
  }

  return { tasks: kept, changed: changed };
}

function loadBestAvailableLocalState() {
  try {
    let bestCandidate = null;
    let recoveredKey = "";

    const allKeys = [SAFETY_BACKUP_KEY, STORAGE_KEY].concat(LEGACY_KEYS);
    for (let i = 0; i < allKeys.length; i++) {
      const raw = localStorage.getItem(allKeys[i]);
      if (!raw) continue;
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.geminiApiKey && !recoveredKey) {
          recoveredKey = parsed.geminiApiKey;
        }
        if (!isDemoSeedData(parsed) && !bestCandidate) {
          bestCandidate = parsed;
        }
      } catch (e2) {}
    }

    if (!bestCandidate) {
      const rawCurrent = localStorage.getItem(STORAGE_KEY);
      if (rawCurrent) bestCandidate = JSON.parse(rawCurrent);
    }

    if (!bestCandidate) {
      return JSON.parse(JSON.stringify(DEFAULT_SHARED_STATE));
    }

    const users = normalizeArray(bestCandidate.users);
    const rawTasks = normalizeArray(bestCandidate.tasks).map(normalizeTaskObject);
    const maint = runCompletedTasksMaintenance(rawTasks);

    return {
      geminiApiKey: bestCandidate.geminiApiKey || recoveredKey || "",
      filterSettings: Object.assign({}, DEFAULT_FILTER_SETTINGS, bestCandidate.filterSettings || {}),
      users: users.length > 0 ? users : DEFAULT_SHARED_STATE.users,
      tasks: maint.tasks,
      lastNotification: bestCandidate.lastNotification || null
    };
  } catch (e) {
    return JSON.parse(JSON.stringify(DEFAULT_SHARED_STATE));
  }
}

/********************************************************************
 * PROTECTED CLOUD SYNC & NOTIFICATIONS
 ********************************************************************/
async function pushStateToCloud(notifyTitle, notifyBody, targetAudience) {
  if (notifyTitle && notifyBody) {
    state.lastNotification = {
      id: Date.now(),
      title: notifyTitle,
      body: notifyBody,
      target: targetAudience || "ALL",
      actorId: currentUserId
    };
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  if (!isDemoSeedData(state) && (state.tasks.length > 0 || state.users.length > 1)) {
    localStorage.setItem(SAFETY_BACKUP_KEY, JSON.stringify(state));
  }
  renderAll();

  if (notifyTitle && notifyBody) {
    checkAndFireNotification(state.lastNotification, true);
  }

  const dbUrl = getFirebaseUrl();
  if (!dbUrl || dbUrl.indexOf("PLACEHOLDER") !== -1) return;

  if (!hasCompletedInitialCloudPull) {
    await pullStateFromCloud();
    return;
  }

  try {
    await fetch(dbUrl + "/command_center.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state)
    });
    updateSyncIndicator(true);
  } catch (err) {
    updateSyncIndicator(false);
  }
}

async function pullStateFromCloud() {
  const dbUrl = getFirebaseUrl();
  if (!dbUrl || dbUrl.indexOf("PLACEHOLDER") !== -1) {
    hasCompletedInitialCloudPull = true;
    updateSyncIndicator(false);
    return;
  }

  try {
    const res = await fetch(dbUrl + "/command_center.json?t=" + Date.now());
    if (!res.ok) throw new Error("Sync HTTP error");
    const remoteData = await res.json();

    if (!remoteData) {
      hasCompletedInitialCloudPull = true;
      if (!isDemoSeedData(state)) {
        await pushStateToCloud();
      }
      return;
    }

    if (!isDemoSeedData(state) && (state.tasks.length > 0 || state.users.length > 1)) {
      localStorage.setItem(SAFETY_BACKUP_KEY, JSON.stringify(state));
    }

    const remoteUsers = normalizeArray(remoteData.users);
    const rawRemoteTasks = normalizeArray(remoteData.tasks).map(normalizeTaskObject);
    const maint = runCompletedTasksMaintenance(rawRemoteTasks);
    const preservedKey = remoteData.geminiApiKey || state.geminiApiKey || "";

    state = {
      geminiApiKey: preservedKey,
      filterSettings: Object.assign({}, DEFAULT_FILTER_SETTINGS, remoteData.filterSettings || state.filterSettings || {}),
      users: remoteUsers.length > 0 ? remoteUsers : state.users,
      tasks: maint.tasks,
      lastNotification: remoteData.lastNotification || null
    };

    hasCompletedInitialCloudPull = true;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateSyncIndicator(true);

    if ((preservedKey && !remoteData.geminiApiKey) || maint.changed) {
      pushStateToCloud();
    }

    const incomingHash = computeStateHash(state);
    if (!isUserTyping() && !isEditModalOpen() && incomingHash !== lastRenderedHash) {
      renderAll();
    }

    if (state.lastNotification) {
      checkAndFireNotification(state.lastNotification, false);
    }
  } catch (err) {
    updateSyncIndicator(false);
  }
}

function startCloudSyncLoop() {
  clearInterval(cloudPollTimer);
  const dbUrl = getFirebaseUrl();
  if (dbUrl && dbUrl.indexOf("PLACEHOLDER") === -1) {
    pullStateFromCloud();
    cloudPollTimer = setInterval(function() {
      pullStateFromCloud();
      if (!isUserTyping() && !isEditModalOpen()) {
        pollNativePhoneCaptures(false);
      }
    }, 3500);
  } else {
    hasCompletedInitialCloudPull = true;
    updateSyncIndicator(false);
  }
}

function updateSyncIndicator(isOnline) {
  const dot = document.getElementById("sync-dot");
  const txt = document.getElementById("sync-status-text");
  const timeEl = document.getElementById("sync-time");
  const dbUrl = getFirebaseUrl();
  if (isOnline && dbUrl && dbUrl.indexOf("PLACEHOLDER") === -1) {
    dot.className = "sync-indicator online";
    txt.textContent = "Cloud Synchronized";
    timeEl.textContent = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } else {
    dot.className = "sync-indicator";
    txt.textContent = "Offline Mode";
  }
}

function showBanner(title, body) {
  const banner = document.getElementById("push-banner");
  document.getElementById("push-title").textContent = title;
  document.getElementById("push-body").textContent = body;
  banner.style.display = "flex";
  clearTimeout(window._pushTimer);
  window._pushTimer = setTimeout(hidePush, 6000);
}

function checkAndFireNotification(notifObj, isLocalAction) {
  if (!notifObj || !notifObj.id) return;
  const lastSeenId = Number(localStorage.getItem(LAST_NOTIF_KEY) || 0);
  if (notifObj.id <= lastSeenId) return;

  localStorage.setItem(LAST_NOTIF_KEY, String(notifObj.id));

  const user = getCurrentUser();
  if (!user) return;

  const targets = normalizeArray(notifObj.target);
  const isTargetedToMe =
    notifObj.target === "ALL" ||
    targets.indexOf(user.id) !== -1 ||
    notifObj.target === user.id ||
    (notifObj.target === "ADMINS" && isAdminRole(user)) ||
    (notifObj.target === "MANAGERS" && isDelegatorOrAdminRole(user));

  if (!isTargetedToMe && !isLocalAction) return;

  showBanner(notifObj.title, notifObj.body);

  try {
    if (window.AndroidNative && typeof window.AndroidNative.sendNotification === "function") {
      window.AndroidNative.sendNotification(notifObj.title, notifObj.body);
      return;
    }
  } catch (e) {}

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(notifObj.title, { body: notifObj.body });
  }
}

function hidePush() {
  document.getElementById("push-banner").style.display = "none";
}
