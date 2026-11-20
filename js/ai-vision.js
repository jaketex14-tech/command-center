/********************************************************************
 * GEMINI 3.8 FLASH ROUTER WITH 15-SECOND TIMEOUT
 ********************************************************************/
function extractNonThoughtTextFromCandidate(data) {
  if (!data || !data.candidates || !data.candidates[0] || !data.candidates[0].content) return "";
  const parts = normalizeArray(data.candidates[0].content.parts);
  if (parts.length === 0) return "";

  const outputParts = [];
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].thought && typeof parts[i].text === "string" && parts[i].text.trim()) {
      outputParts.push(parts[i].text.trim());
    }
  }
  if (outputParts.length > 0) {
    return outputParts.join("\n");
  }
  for (let j = parts.length - 1; j >= 0; j--) {
    if (typeof parts[j].text === "string" && parts[j].text.trim()) {
      return parts[j].text.trim();
    }
  }
  return "";
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(function() {
    controller.abort();
  }, timeoutMs || 15000);

  try {
    const res = await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    clearTimeout(timer);
    return res;
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

async function callGeminiGenerateContent(requestParts, statusCallback) {
  const apiKey = (state.geminiApiKey || "").trim();
  if (!apiKey) {
    return { ok: false, error: "No Gemini API Key configured in Settings." };
  }

  const modelsToTry = [];
  if (preferredWorkingModel) modelsToTry.push(preferredWorkingModel);
  const activeModels = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash"];
  for (let i = 0; i < activeModels.length; i++) {
    if (modelsToTry.indexOf(activeModels[i]) === -1) {
      modelsToTry.push(activeModels[i]);
    }
  }

  const tried = {};
  let lastErrorMsg = "";

  for (let m = 0; m < modelsToTry.length; m++) {
    const modelName = modelsToTry[m];
    if (!modelName || tried[modelName]) continue;
    tried[modelName] = true;

    if (typeof statusCallback === "function") {
      statusCallback("Scanning photo with " + modelName + "...");
    }

    const payloadVariants = [
      {
        contents: [{ role: "user", parts: requestParts }],
        generationConfig: {
          thinkingConfig: { thinkingLevel: "LOW" }
        }
      },
      {
        contents: [{ role: "user", parts: requestParts }]
      }
    ];

    for (let v = 0; v < payloadVariants.length; v++) {
      try {
        const response = await fetchWithTimeout(
          "https://generativelanguage.googleapis.com/v1beta/models/" + modelName + ":generateContent?key=" + encodeURIComponent(apiKey),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payloadVariants[v])
          },
          15000
        );

        if (!response.ok) {
          const errData = await response.json().catch(function() { return {}; });
          const msg = (errData && errData.error && errData.error.message) ? errData.error.message : ("HTTP " + response.status);
          lastErrorMsg = msg;

          const redirectMatch = msg.match(/use\s+models\/([a-zA-Z0-9.\-_]+)/i);
          if (redirectMatch && redirectMatch[1] && !tried[redirectMatch[1]]) {
            modelsToTry.splice(m + 1, 0, redirectMatch[1]);
          }

          if (response.status === 400 && v === 0) {
            continue;
          }
          break;
        }

        const data = await response.json();
        const rawOut = extractNonThoughtTextFromCandidate(data);
        if (rawOut) {
          preferredWorkingModel = modelName;
          return { ok: true, text: rawOut, model: modelName };
        }
      } catch (netErr) {
        const isTimeout = netErr && netErr.name === "AbortError";
        lastErrorMsg = isTimeout ? ("Request to " + modelName + " timed out after 15s") : (netErr && netErr.message ? netErr.message : "Network request failed");
        break;
      }
    }
  }

  return { ok: false, error: lastErrorMsg || "No compatible Gemini model responded." };
}

/********************************************************************
 * PHOTO COMPRESSION, VISION SCANNER & STAGING
 ********************************************************************/
function compressImageFile(file) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const maxDim = 960;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round(h * (maxDim / w));
            w = maxDim;
          } else {
            w = Math.round(w * (maxDim / h));
            h = maxDim;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.72));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function extractChecklistFromPhotosWithGemini(photosArray, statusCallback) {
  const apiKey = (state.geminiApiKey || "").trim();
  if (!apiKey) {
    const isAdmin = isAdminRole(getCurrentUser());
    showBanner(
      "Gemini API Key Needed",
      isAdmin
        ? "Open Settings -> Gemini API Key and save your key to scan checklists from photos."
        : "Ask an Admin to configure the Gemini API Key in Settings to enable photo checklist scanning."
    );
    return null;
  }

  const imageParts = [];
  for (let i = 0; i < photosArray.length; i++) {
    const commaIdx = photosArray[i].indexOf(",");
    if (commaIdx !== -1) {
      imageParts.push({
        inlineData: {
          mimeType: "image/jpeg",
          data: photosArray[i].slice(commaIdx + 1)
        }
      });
    }
  }
  if (imageParts.length === 0) return null;

  const prompt = "Read this image of a handwritten or printed material/task list.\n" +
    "Extract every individual line item into a JSON array of strings under the key \"checklist\", and provide a short \"title\" string.\n" +
    "CRITICAL RULES:\n" +
    "- Keep ALL quantities, numbers, dashes, feet ('), and inches (\") intact on every line (for example: \"4 - 10\\\" x 6'\", \"3 - 16\\\" x 4'\", \"20 - 2'x6'\", \"wedge bolts\", \"turn buckles\").\n" +
    "- Ignore crossed-out or scribbled-out mistakes and only output the clean intended item or dimension.\n" +
    "- Return ONLY valid JSON in this exact format: {\"title\": \"Material List\", \"checklist\": [\"item 1\", \"item 2\"]}";

  const requestParts = [{ text: prompt }].concat(imageParts);
  const genResult = await callGeminiGenerateContent(requestParts, statusCallback);

  if (!genResult.ok) {
    showBanner("Photo Scan Issue", "Gemini Vision could not scan photo: " + genResult.error);
    return null;
  }

  const cleaned = genResult.text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let items = [];
  let title = "Material List";

  try {
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleaned);
    if (Array.isArray(parsed)) {
      items = parsed.map(String);
    } else if (parsed && Array.isArray(parsed.checklist)) {
      items = parsed.checklist.map(String);
      if (parsed.title) title = String(parsed.title);
    }
  } catch (parseErr) {
    items = cleaned.split(/\r?\n/).map(cleanBulletPrefix).filter(Boolean);
  }

  items = items.map(function(s) { return s.trim(); }).filter(Boolean);
  if (items.length > 0) {
    return { title: title, items: items };
  }
  showBanner("No List Items Found", "Gemini scanned the photo but did not detect any readable list items.");
  return null;
}

async function handlePhotoInput(inputElem, targetMode) {
  const files = inputElem.files ? Array.from(inputElem.files) : [];
  if (files.length === 0) return;

  const newlyAddedPhotos = [];
  for (let i = 0; i < files.length; i++) {
    try {
      const dataUrl = await compressImageFile(files[i]);
      newlyAddedPhotos.push(dataUrl);
      if (targetMode === "triage") {
        triagePendingPhotos.push(dataUrl);
      } else if (targetMode === "creator") {
        creatorPendingPhotos.push(dataUrl);
      } else if (targetMode === "edit") {
        editDraftPhotos.push(dataUrl);
      }
    } catch (err) {
      showBanner("Photo Error", "Could not process the selected image.");
    }
  }

  inputElem.value = "";
  if (targetMode === "edit") {
    const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
    renderEditModalContents(task);
  } else {
    renderStagingPhotos();
  }

  if (newlyAddedPhotos.length > 0) {
    const statusBannerId = targetMode === "triage"
      ? "triage-scan-status"
      : (targetMode === "creator" ? "creator-scan-status" : "edit-scan-status");
    const statusBanner = document.getElementById(statusBannerId);
    if (statusBanner) {
      statusBanner.textContent = "Scanning photo with Gemini 3.8 Flash...";
      statusBanner.classList.remove("hidden");
    }

    activePhotoScanPromise = (async function() {
      try {
        const scanResult = await extractChecklistFromPhotosWithGemini(newlyAddedPhotos, function(msg) {
          if (statusBanner) statusBanner.textContent = msg;
        });

        if (scanResult && scanResult.items && scanResult.items.length > 0) {
          if (targetMode === "creator") {
            const titleEl = document.getElementById("new-task-title");
            const chkEl = document.getElementById("new-task-checklist");
            if (titleEl && !titleEl.value.trim()) {
              titleEl.value = scanResult.title || "Material List";
            }
            if (chkEl) {
              const existing = chkEl.value.trim();
              chkEl.value = existing ? (existing + "\n" + scanResult.items.join("\n")) : scanResult.items.join("\n");
            }
            showBanner("Checklist Extracted", "Scanned " + scanResult.items.length + " items from photo into the checklist box.");
          } else if (targetMode === "triage") {
            const triageInput = document.getElementById("triage-manual-input");
            if (triageInput) {
              const header = scanResult.title || "Material List";
              const formatted = header + "\n" + scanResult.items.map(function(i) { return "• " + i; }).join("\n");
              const existing = triageInput.value.trim();
              triageInput.value = existing ? (existing + "\n" + formatted) : formatted;
            }
            showBanner("Checklist Extracted", "Scanned " + scanResult.items.length + " items from photo.");
          } else if (targetMode === "edit") {
            for (let k = 0; k < scanResult.items.length; k++) {
              editDraftChecklist.push({
                id: "chk_" + Date.now() + "_" + k,
                text: scanResult.items[k],
                done: false,
                doneBy: null,
                delivered: false,
                deliveredBy: null,
                deliveredAt: null
              });
            }
            const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
            renderEditModalContents(task);
            showBanner("Checklist Extracted", "Added " + scanResult.items.length + " scanned items to this task.");
          }
        }
      } finally {
        if (statusBanner) statusBanner.classList.add("hidden");
        activePhotoScanPromise = null;
      }
    })();

    await activePhotoScanPromise;
  }
}

function removeStagedPhoto(targetMode, index) {
  if (targetMode === "triage") {
    triagePendingPhotos.splice(index, 1);
    renderStagingPhotos();
  } else if (targetMode === "creator") {
    creatorPendingPhotos.splice(index, 1);
    renderStagingPhotos();
  } else if (targetMode === "edit") {
    editDraftPhotos.splice(index, 1);
    const task = state.tasks.find(function(t) { return t.id === editingTaskId; });
    renderEditModalContents(task);
  }
}

function renderStagingPhotos() {
  const triageContainer = document.getElementById("triage-photo-preview");
  if (triageContainer) {
    triageContainer.innerHTML = triagePendingPhotos.map(function(src, idx) {
      return '<div class="photo-card">' +
        '<img src="' + src + '" onclick="openImageViewer(this.src)" alt="Staged Photo" />' +
        '<button class="btn btn-danger-outline" style="margin-top:10px; padding:10px;" onclick="removeStagedPhoto(\'triage\', ' + idx + ')">Remove Photo</button>' +
      '</div>';
    }).join("");
  }

  const creatorContainer = document.getElementById("creator-photo-preview");
  if (creatorContainer) {
    creatorContainer.innerHTML = creatorPendingPhotos.map(function(src, idx) {
      return '<div class="photo-card">' +
        '<img src="' + src + '" onclick="openImageViewer(this.src)" alt="Staged Photo" />' +
        '<button class="btn btn-danger-outline" style="margin-top:10px; padding:10px;" onclick="removeStagedPhoto(\'creator\', ' + idx + ')">Remove Photo</button>' +
      '</div>';
    }).join("");
  }
}
