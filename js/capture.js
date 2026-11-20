/********************************************************************
 * SCAN LOG & SMART FILTER SETTINGS MANAGEMENT
 ********************************************************************/
function getScanLog() {
  try {
    return normalizeArray(JSON.parse(localStorage.getItem(SCAN_LOG_KEY) || "[]"));
  } catch (e) {
    return [];
  }
}

function recordScanDecision(entry) {
  const log = getScanLog();
  log.unshift({
    id: "log_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    source: entry.source || "SMS",
    sender: entry.sender || "",
    text: entry.text || "",
    accepted: Boolean(entry.accepted),
    reason: entry.reason || ""
  });
  while (log.length > 15) log.pop();
  localStorage.setItem(SCAN_LOG_KEY, JSON.stringify(log));
  if (dropdownState.scanLog && !isUserTyping()) renderScanLog();
}

function clearScanLog() {
  if (!isAdminRole(getCurrentUser())) return;
  localStorage.removeItem(SCAN_LOG_KEY);
  renderScanLog();
}

function forcePromoteLogItem(logId) {
  if (!isAdminRole(getCurrentUser())) return;
  const log = getScanLog();
  const item = log.find(function(x) { return x.id === logId; });
  if (!item) return;

  const parsed = extractTitleAndChecklist(item.text, "", item.sender);
  const dueDate = getTodayIso();
  state.tasks.unshift({
    id: "t_" + Date.now(),
    title: parsed.title,
    source: item.source || "SMS",
    dueDate: dueDate,
    duePeriod: "AM",
    due: formatFriendlyDueLabel(dueDate, "AM", "Today"),
    urgent: false,
    checklist: parsed.checklist || [],
    images: [],
    notes: [],
    visibility: "triage",
    assignedTo: [],
    createdBy: currentUserId,
    completed: false,
    completedBy: null,
    completedAt: null,
    completedTimestamp: null
  });

  item.accepted = true;
  item.reason = "Manually promoted to Triage Queue";
  localStorage.setItem(SCAN_LOG_KEY, JSON.stringify(log));
  renderScanLog();
  pushStateToCloud("Moved to Triage", "\"" + parsed.title + "\" added to Triage Queue.", "ADMINS");
}

function blockSenderFromLog(senderName) {
  if (!isAdminRole(getCurrentUser())) return;
  const clean = String(senderName || "").trim();
  if (!clean) return;
  const fs = getFilterSettings();
  const existing = fs.ignoredSenders
    ? fs.ignoredSenders.split(",").map(function(s) { return s.trim(); }).filter(Boolean)
    : [];
  if (existing.indexOf(clean) === -1) {
    existing.push(clean);
  }
  fs.ignoredSenders = existing.join(", ");
  state.filterSettings = fs;
  populateFilterInputs();
  pushStateToCloud("Sender Ignored", "Future notifications from \"" + clean + "\" will be ignored.", "ADMINS");
}

function renderScanLog() {
  const listEl = document.getElementById("scan-log-list");
  if (!listEl) return;
  const log = getScanLog();
  if (log.length === 0) {
    listEl.innerHTML = '<div style="font-size:13px; color:var(--muted); padding:10px 0;">No notifications scanned yet.</div>';
    return;
  }

  listEl.innerHTML = log.map(function(item) {
    const pillCls = item.accepted ? "scan-status-pill scan-accepted" : "scan-status-pill scan-ignored";
    const pillLabel = item.accepted ? "Task Created" : "Ignored";
    const senderLabel = item.sender ? ("From: " + escapeHtmlAttr(item.sender) + " • ") : "";
    const promoteBtn = !item.accepted
      ? ('<button class="btn btn-secondary" style="padding:10px; font-size:13px;" onclick="forcePromoteLogItem(\'' + item.id + '\')">Send to Triage Queue Anyway</button>')
      : "";
    const blockBtn = item.sender
      ? ('<button class="btn btn-danger-outline" style="padding:10px; font-size:13px;" onclick="blockSenderFromLog(\'' + escapeHtmlAttr(item.sender) + '\')">Ignore Sender (' + escapeHtmlAttr(item.sender) + ')</button>')
      : "";

    return '<div class="scan-log-card">' +
      '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">' +
        '<span class="' + pillCls + '">' + pillLabel + '</span>' +
        '<span style="font-size:11px; color:var(--muted);">' + escapeHtmlAttr(item.source) + ' • ' + escapeHtmlAttr(item.time) + '</span>' +
      '</div>' +
      '<div style="font-size:12px; color:#60a5fa; margin-bottom:4px;">' + senderLabel + escapeHtmlAttr(item.reason) + '</div>' +
      '<div style="font-size:14px; color:var(--text); margin-bottom:10px; line-height:1.35; white-space:pre-wrap;">' + escapeHtmlAttr(item.text) + '</div>' +
      '<div class="btn-stack">' + promoteBtn + blockBtn + '</div>' +
    '</div>';
  }).join("");
}

function toggleSourceSetting(key) {
  if (!isAdminRole(getCurrentUser())) return;
  const fs = getFilterSettings();
  fs[key] = !fs[key];
  state.filterSettings = fs;
  populateFilterInputs();
  pushStateToCloud();
}

function populateFilterInputs() {
  const fs = getFilterSettings();
  const gridEl = document.getElementById("source-toggle-grid");
  if (gridEl) {
    const sources = [
      { key: "captureSms", label: "Text & Picture Messages (SMS / RCS)" },
      { key: "captureReminders", label: "Reminders (Samsung / Google)" },
      { key: "captureCalendar", label: "Calendar Events" }
    ];
    gridEl.innerHTML = sources.map(function(s) {
      const isOn = Boolean(fs[s.key]);
      const rowCls = isOn ? "user-pick-row selected" : "user-pick-row";
      return '<div class="' + rowCls + '" onclick="toggleSourceSetting(\'' + s.key + '\')">' +
        '<span>' + s.label + '</span>' +
        '<div class="pick-indicator">' + (isOn ? "✓" : "") + '</div>' +
      '</div>';
    }).join("");
  }

  const workInput = document.getElementById("filter-work-keywords");
  const ignoredInput = document.getElementById("filter-ignored-senders");
  if (workInput && document.activeElement !== workInput) {
    workInput.value = fs.workKeywords || "";
  }
  if (ignoredInput && document.activeElement !== ignoredInput) {
    ignoredInput.value = fs.ignoredSenders || "";
  }
}

function saveFilterSettings() {
  if (!isAdminRole(getCurrentUser())) return;
  const fs = getFilterSettings();
  const workInput = document.getElementById("filter-work-keywords");
  const ignoredInput = document.getElementById("filter-ignored-senders");
  if (workInput) fs.workKeywords = workInput.value.trim();
  if (ignoredInput) fs.ignoredSenders = ignoredInput.value.trim();
  state.filterSettings = fs;
  toggleDropdownPanel("captureRules", false);
  pushStateToCloud("Filter Rules Saved", "Notification scanning preferences updated.", "ADMINS");
}

/********************************************************************
 * MULTI-STAGE NOTIFICATION CLASSIFIER & LIST PARSER
 ********************************************************************/
function checkHardIgnoreRules(text, sourceType, senderName, isManualEntry) {
  const fs = getFilterSettings();
  const cleanSender = String(senderName || "").trim().toLowerCase();
  const cleanText = String(text || "").trim();

  if (!isManualEntry) {
    if (sourceType === "SMS" && !fs.captureSms) {
      return { ignored: true, reason: "SMS auto-capture is turned off" };
    }
    if (sourceType === "SAMSUNG" && !fs.captureReminders) {
      return { ignored: true, reason: "Reminder auto-capture is turned off" };
    }
    if (sourceType === "CAL" && !fs.captureCalendar) {
      return { ignored: true, reason: "Calendar auto-capture is turned off" };
    }
  }

  if (cleanSender && fs.ignoredSenders) {
    const blockedList = fs.ignoredSenders.split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
    for (let i = 0; i < blockedList.length; i++) {
      if (cleanSender.indexOf(blockedList[i]) !== -1) {
        return { ignored: true, reason: "Sender is in Ignored Senders list" };
      }
    }
  }

  if (/^(?:\d+\s+new\s+messages?|messages\s+is\s+doing\s+work|syncing\s+messages|checking\s+for\s+messages|connected\s+to\s+chat)/i.test(cleanText)) {
    return { ignored: true, reason: "System status notification" };
  }

  if (/^(?:liked|loved|laughed at|emphasized|questioned|disliked|reacted\b.*?\bto)\s+[“"'«]/i.test(cleanText)) {
    return { ignored: true, reason: "Message reaction" };
  }

  const strippedReply = cleanText.replace(/[.!?👍👌🙏]+$/g, "").trim();
  if (/^(?:ok|okay|k|kk|yep|yup|yes|yeah|no|nope|nah|sounds good|sound good|10-4|copy|copy that|got it|will do|on it|thanks|thank you|thx|ty|appreciate it|on my way|omw|be right there|heading that way|here|i'm here|im here|just left|alright|cool|bet|nice|great|perfect|see you soon|talk soon)$/i.test(strippedReply)) {
    return { ignored: true, reason: "Short conversational acknowledgment" };
  }

  if (/\b(?:verification code|security code|one-time passcode|otp|do not share this code|unsubscribe|reply stop|text stop to end|your package has shipped|out for delivery from amazon|fedex|ups My Choice|uspsInformedDelivery|autopay|statement is ready)\b/i.test(cleanText)) {
    return { ignored: true, reason: "Automated code, promo, or carrier alert" };
  }

  return { ignored: false };
}

function detectUrgentKeyword(text) {
  return /\b(?:urgent|asap|emergency|immediately|right away|right now|critical|rush)\b/i.test(String(text || ""));
}

function extractTitleAndChecklist(text, defaultDue, senderName) {
  let due = defaultDue || "Today";
  const rawLines = text.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  let cleanTitle = "";
  let extractedItems = [];

  if (rawLines.length >= 2) {
    const firstLineRaw = rawLines[0];
    const restLinesRaw = rawLines.slice(1);
    const firstIsBullet = /^[•*▪▫‣⁃\-]/.test(firstLineRaw);
    const restAreBulletsOrQuantities = restLinesRaw.filter(isLikelyBulletOrQuantityLine).length >= Math.ceil(restLinesRaw.length * 0.5);

    if (!firstIsBullet && restAreBulletsOrQuantities) {
      cleanTitle = cleanBulletPrefix(firstLineRaw);
      extractedItems = restLinesRaw.map(cleanBulletPrefix).filter(Boolean);
    } else {
      extractedItems = rawLines.map(cleanBulletPrefix).filter(Boolean);
      const locMatch = text.match(/\b(?:for|to|at)\s+([A-Z][a-zA-Z0-9\s]{2,20}?)(?:\.|\r|\n|$)/);
      if (locMatch) {
        cleanTitle = "Materials List for " + locMatch[1].trim();
      } else if (senderName) {
        cleanTitle = "Material List from " + senderName;
      } else {
        cleanTitle = "Material & Item Checklist (" + extractedItems.length + " items)";
      }
    }
  } else {
    if (text.indexOf("•") !== -1) {
      const bulletParts = text.split("•").map(function(p) { return p.trim(); }).filter(Boolean);
      if (bulletParts.length >= 2) {
        cleanTitle = bulletParts[0];
        extractedItems = bulletParts.slice(1).map(cleanBulletPrefix).filter(Boolean);
      }
    } else {
      let listBody = text;
      const listTrigger = text.match(/(?:need|bring|pick up|get|load|deliver|include|items|materials|list)\s*:?\s*(.+)/i);
      if (listTrigger && listTrigger[1]) listBody = listTrigger[1];

      listBody = listBody.replace(/\s+(?:delivered|brought|taken)\s+to\s+.+$/i, "")
                         .replace(/\s+(?:before|by|at)\s+\d{1,2}.*$/i, "");

      if (listBody.indexOf(",") !== -1) {
        const parts = listBody.split(/,|(?:\s+and\s+)/i).map(function(p) {
          return cleanBulletPrefix(p).replace(/\.$/, "");
        }).filter(function(p) {
          return p.length > 1 && p.length < 70;
        });
        if (parts.length >= 2) extractedItems = parts;
      }

      cleanTitle = text.trim() || "Material List";
      if (extractedItems.length >= 2) {
        const locMatch = text.match(/\b(?:to|at|for)\s+([A-Z][a-zA-Z0-9\s]{2,20}?)(?:\s+before|\s+by|\s+today|\.|$)/);
        if (locMatch) {
          cleanTitle = "Prepare & Deliver Materials (" + locMatch[1].trim() + ")";
        } else if (cleanTitle.length > 65) {
          cleanTitle = "Material & Item Checklist (" + extractedItems.length + " items)";
        }
      }
    }
  }

  if (senderName && cleanTitle.indexOf(senderName) === -1) {
    cleanTitle = cleanTitle + " (" + senderName + ")";
  }

  const checklist = extractedItems.map(function(itemText, idx) {
    return {
      id: "chk_" + Date.now() + "_" + idx,
      text: itemText,
      done: false,
      delivered: false,
      deliveredBy: null,
      deliveredAt: null
    };
  });

  return {
    title: cleanTitle,
    due: due,
    urgent: detectUrgentKeyword(text),
    checklist: checklist
  };
}

async function evaluateIncomingMessage(rawText, sourceType, defaultDue, senderName, attachedPhotos, isManualEntry) {
  const text = (rawText || "").trim();
  const photos = normalizeArray(attachedPhotos);
  if (!text && photos.length === 0) return null;

  if (photos.length === 0) {
    const hardCheck = checkHardIgnoreRules(text, sourceType, senderName, isManualEntry);
    if (hardCheck.ignored) {
      return { isWorkRelated: false, reason: hardCheck.reason };
    }
  }

  if (photos.length > 0 && !text) {
    const scanRes = await extractChecklistFromPhotosWithGemini(photos);
    if (scanRes && scanRes.items && scanRes.items.length > 0) {
      return {
        isWorkRelated: true,
        title: scanRes.title || "Material List",
        due: defaultDue || "Today",
        urgent: false,
        reason: "Scanned " + scanRes.items.length + " items from photo",
        checklist: scanRes.items.map(function(item, idx) {
          return {
            id: "chk_" + Date.now() + "_" + idx,
            text: item,
            done: false,
            delivered: false,
            deliveredBy: null,
            deliveredAt: null
          };
        })
      };
    }
    return {
      isWorkRelated: true,
      title: "Material List (Photo Attached)",
      due: defaultDue || "Today",
      urgent: false,
      reason: "Photo material list attached",
      checklist: []
    };
  }

  const rawLines = text.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  if (isManualEntry && rawLines.length >= 2) {
    const extracted = extractTitleAndChecklist(text, defaultDue, senderName);
    return {
      isWorkRelated: true,
      title: extracted.title,
      due: extracted.due,
      urgent: extracted.urgent,
      reason: "Multi-line work checklist",
      checklist: extracted.checklist
    };
  }

  const fs = getFilterSettings();
  const apiKey = (state.geminiApiKey || "").trim();

  if (apiKey) {
    try {
      const prompt = "You are a strict operations task filter and checklist extractor for a construction, excavation, concrete form, and fleet management team.\n" +
        "Known Work Contacts, Crew & Job Sites: " + (fs.workKeywords || "None specified") + "\n" +
        "Incoming Source: " + sourceType + (senderName ? (" | Sender: " + senderName) : "") + "\n" +
        "Message Text: " + text + "\n\n" +
        "DECISION RULES FOR isWorkRelated:\n" +
        "- Set isWorkRelated = true ONLY if this is an actionable work task, material/form/equipment request, pickup/delivery instruction, machine repair/maintenance issue, or job site schedule item.\n" +
        "- Set isWorkRelated = false if this is personal/family chat (dinner, groceries, kids, casual check-ins), a non-actionable status reply ('I am here', 'Just left', 'Sounds good'), a greeting, or spam.\n" +
        "- urgent: true if the message indicates urgent, ASAP, emergency, or immediate priority.\n" +
        "- checklist: If there are multiple materials/items, extract each line keeping ALL quantities, dashes, feet ('), and inches (\") intact.\n" +
        "Return ONLY valid JSON: {\"isWorkRelated\": boolean, \"urgent\": boolean, \"title\": string, \"due\": string, \"reason\": string, \"checklist\": string[]}";

      const genResult = await callGeminiGenerateContent([{ text: prompt }]);
      if (genResult.ok && genResult.text) {
        let jsonText = genResult.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        let parsed = JSON.parse(jsonMatch ? jsonMatch[0] : jsonText);
        if (Array.isArray(parsed)) parsed = parsed[0] || {};
        const rawList = normalizeArray(parsed.checklist);
        let finalTitle = parsed.title || text || "Work Task";
        if (senderName && finalTitle.indexOf(senderName) === -1 && parsed.isWorkRelated) {
          finalTitle = finalTitle + " (" + senderName + ")";
        }
        return {
          isWorkRelated: Boolean(parsed.isWorkRelated),
          urgent: Boolean(parsed.urgent) || detectUrgentKeyword(text),
          title: finalTitle,
          due: parsed.due || defaultDue || "Today",
          reason: parsed.reason || (parsed.isWorkRelated ? "AI matched work task" : "AI filtered non-work message"),
          checklist: rawList.map(function(item, idx) {
            return {
              id: "chk_" + Date.now() + "_" + idx,
              text: String(item).trim(),
              done: false,
              delivered: false,
              deliveredBy: null,
              deliveredAt: null
            };
          }).filter(function(i) { return Boolean(i.text); })
        };
      }
    } catch (err) {}
  }

  return runBuiltInIntelligentParser(text, sourceType, defaultDue, senderName, photos.length > 0);
}

function runBuiltInIntelligentParser(text, sourceType, defaultDue, senderName, hasPhotos) {
  const lower = text.toLowerCase();
  const cleanSender = String(senderName || "").toLowerCase();
  const fs = getFilterSettings();

  let score = 0;
  let reasons = [];

  const rawLines = text.split(/\r?\n/).map(function(l) { return l.trim(); }).filter(Boolean);
  const bulletCount = rawLines.filter(isLikelyBulletOrQuantityLine).length;
  if (bulletCount >= 2) {
    score += 3;
    reasons.push("Multi-item quantity/material list");
  }

  if (fs.workKeywords) {
    const customTerms = fs.workKeywords.split(",").map(function(s) { return s.trim().toLowerCase(); }).filter(Boolean);
    for (let i = 0; i < customTerms.length; i++) {
      const term = customTerms[i];
      if (term && (lower.indexOf(term) !== -1 || cleanSender.indexOf(term) !== -1)) {
        score += 2;
        reasons.push("Matched work contact/site (" + customTerms[i] + ")");
        break;
      }
    }
  }

  const fieldNouns = /\b(concrete|rebar|lumber|trench|plate|plates|grinder|excavator|mini ex|skid steer|bobcat|loader|trailer|dump trailer|truck|f-150|silverado|crane|trowel|power trowel|fuel|diesel|hydraulic|job site|footing|footings|pour|forms|form|outside corners|inside corners|turnbuckles|flat ties|ties|stakes|grade|laser|transit|bucket|hose|fittings|plywood|2x4|2x6|4x4|anchor bolts|wedge bolts|bolts|generator|compressor|pump|backhoe|dozer|culvert|gravel|base rock|topsoil|silt fence)\b/i;
  if (fieldNouns.test(lower)) {
    score += 2;
    reasons.push("Matched construction/equipment terms");
  }

  const actionVerbs = /\b(need|needs|bring|pick up|pickup|drop off|deliver|delivery|load|unload|haul|move|check|fix|repair|service|replace|install|dig|excavate|set|strip|pour|order|grab|schedule|inspect)\b/i;
  if (actionVerbs.test(lower)) {
    score += 1;
    reasons.push("Actionable verb");
  }

  const personalNoise = /\b(dinner|supper|breakfast|groceries|milk|bread|eggs|kids|bedtime|movie|love you|miss you|netflix|doctor|dentist|pharmacy|birthday|anniversary)\b/i;
  if (personalNoise.test(lower)) {
    score -= 3;
    reasons.push("Personal/household topic");
  }

  if (sourceType === "SAMSUNG" || sourceType === "CAL") {
    score += 1;
  }

  const requiredScore = sourceType === "SMS" ? 2 : 1;
  if (!hasPhotos && score < requiredScore) {
    return {
      isWorkRelated: false,
      reason: reasons.length > 0 ? ("Low work score (" + reasons.join(", ") + ")") : "No construction, site, or work task indicators"
    };
  }

  const extracted = extractTitleAndChecklist(text, defaultDue, senderName);
  return {
    isWorkRelated: true,
    urgent: extracted.urgent,
    title: extracted.title,
    due: extracted.due,
    reason: reasons.join(" + ") || "Work reminder/event",
    checklist: extracted.checklist
  };
}

function parseManualChecklistText(rawChecklistText) {
  if (!rawChecklistText || !rawChecklistText.trim()) return [];
  const raw = rawChecklistText.trim();
  const parts = raw.indexOf("\n") !== -1 ? raw.split(/\r?\n/) : raw.split(",");
  return parts.map(cleanBulletPrefix).filter(Boolean).map(function(text, idx) {
    return {
      id: "chk_" + Date.now() + "_" + Math.floor(Math.random() * 1000) + "_" + idx,
      text: text,
      done: false,
      delivered: false,
      deliveredBy: null,
      deliveredAt: null
    };
  });
}

/********************************************************************
 * ANDROID NATIVE NOTIFICATION & CALENDAR CAPTURE BRIDGE
 ********************************************************************/
function hasNativeBridge() {
  return typeof window.AndroidNative !== "undefined" && typeof window.AndroidNative.isCaptureEnabled === "function";
}

function openNativeCaptureSettings() {
  if (!isAdminRole(getCurrentUser())) return;
  if (hasNativeBridge()) {
    window.AndroidNative.openCaptureSettings();
  } else {
    showBanner("Android App Feature", "Background notification capture is active when running the installed Android APK.");
  }
}

async function pollNativePhoneCaptures(manualTrigger) {
  if (!hasNativeBridge()) {
    if (manualTrigger) {
      showBanner("Android App Feature", "Phone calendar & message scanning runs inside the installed Android APK.");
    }
    return;
  }
  if (!hasCompletedInitialCloudPull) return;
  const user = getCurrentUser();
  if (!isAdminRole(user)) return;

  try {
    const enabled = window.AndroidNative.isCaptureEnabled();
    const descEl = document.getElementById("native-listener-desc");
    const btnEl = document.getElementById("btn-enable-listener");
    if (descEl && btnEl) {
      if (enabled) {
        descEl.textContent = "Automatic background capture is active. Incoming notifications are filtered using your Smart Filter Rules below.";
        btnEl.textContent = "Notification Access Enabled (Tap to Manage)";
        btnEl.className = "btn btn-secondary";
      } else {
        descEl.textContent = "Enable Notification Access once so Command Center can automatically read incoming work text messages and reminders.";
        btnEl.textContent = "Enable Notification Access";
        btnEl.className = "btn";
      }
    }
  } catch (e) {}

  let addedCount = 0;
  const todayIso = getTodayIso();

  try {
    const rawJson = window.AndroidNative.getPendingCaptures();
    const items = normalizeArray(JSON.parse(rawJson || "[]"));
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const rawBody = item.text || item.combined || "";
      const sender = item.sender || "";
      const src = item.source || "SMS";
      const result = await evaluateIncomingMessage(rawBody, src, "Today • AM", sender, [], false);

      recordScanDecision({
        source: src,
        sender: sender,
        text: rawBody,
        accepted: Boolean(result && result.isWorkRelated),
        reason: result && result.reason ? result.reason : "Evaluated"
      });

      if (result && result.isWorkRelated) {
        state.tasks.unshift({
          id: "t_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          title: result.title,
          source: src,
          dueDate: todayIso,
          duePeriod: "AM",
          due: formatFriendlyDueLabel(todayIso, "AM", "Today"),
          urgent: Boolean(result.urgent),
          checklist: result.checklist || [],
          images: [],
          notes: [],
          visibility: "triage",
          assignedTo: [],
          createdBy: user.id,
          completed: false,
          completedBy: null,
          completedAt: null,
          completedTimestamp: null
        });
        addedCount++;
      }
    }
  } catch (e) {}

  try {
    const calJson = window.AndroidNative.syncCalendarEvents();
    const calEvents = normalizeArray(JSON.parse(calJson || "[]"));
    for (let j = 0; j < calEvents.length; j++) {
      const ev = calEvents[j];
      const fullText = ev.text ? (ev.title + "\n" + ev.text) : ev.title;
      const result = await evaluateIncomingMessage(fullText, "CAL", ev.due || "Today • AM", "", [], false);

      recordScanDecision({
        source: "CAL",
        sender: "Calendar",
        text: fullText,
        accepted: Boolean(result && result.isWorkRelated),
        reason: result && result.reason ? result.reason : "Evaluated"
      });

      if (result && result.isWorkRelated) {
        state.tasks.unshift({
          id: "t_" + Date.now() + "_" + Math.floor(Math.random() * 1000),
          title: result.title,
          source: "CAL",
          dueDate: todayIso,
          duePeriod: "AM",
          due: ev.due || formatFriendlyDueLabel(todayIso, "AM", "Today"),
          urgent: Boolean(result.urgent),
          checklist: result.checklist || [],
          images: [],
          notes: [],
          visibility: "triage",
          assignedTo: [],
          createdBy: user.id,
          completed: false,
          completedBy: null,
          completedAt: null,
          completedTimestamp: null
        });
        addedCount++;
      }
    }
  } catch (e) {}

  if (addedCount > 0) {
    pushStateToCloud("Work Items Captured", addedCount + " new work item(s) added to Triage Queue.", "ADMINS");
  } else if (manualTrigger) {
    showBanner("Scan Complete", "No new work tasks found. Check the Recent Scan Log to review evaluated notifications.");
  }
}
