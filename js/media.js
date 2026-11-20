/********************************************************************
 * FULL-SCREEN IMAGE VIEWER & IN-APP WEBRTC CAMERA
 ********************************************************************/
function openImageViewer(src) {
  if (!src) return;
  document.getElementById("viewer-full-img").src = src;
  document.getElementById("image-viewer-modal").classList.remove("hidden");
}

function closeImageViewer() {
  document.getElementById("viewer-full-img").src = "";
  document.getElementById("image-viewer-modal").classList.add("hidden");
}

function toggleNotePhotoSourceMenu(taskId) {
  const inputEl = document.getElementById("note-input-" + taskId);
  const savedDraftText = inputEl ? inputEl.value : "";

  notePhotoSourceOpen[taskId] = !notePhotoSourceOpen[taskId];
  expandedTaskIds[taskId] = true;
  renderAll();

  const restoredInput = document.getElementById("note-input-" + taskId);
  if (restoredInput && savedDraftText) {
    restoredInput.value = savedDraftText;
  }
}

async function openLiveCameraForNote(taskId, facingMode) {
  activeNotePhotoTaskId = taskId;
  notePhotoSourceOpen[taskId] = false;
  currentCameraFacingMode = facingMode || "environment";

  if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== "function") {
    const fallbackInput = document.getElementById("note-camera-input");
    if (fallbackInput) {
      fallbackInput.value = "";
      fallbackInput.click();
    }
    return;
  }

  try {
    if (activeCameraStream) {
      activeCameraStream.getTracks().forEach(function(tr) { tr.stop(); });
      activeCameraStream = null;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: currentCameraFacingMode },
        width: { ideal: 1280 },
        height: { ideal: 960 }
      },
      audio: false
    });

    activeCameraStream = stream;
    const videoEl = document.getElementById("camera-live-video");
    if (videoEl) {
      videoEl.srcObject = stream;
      await videoEl.play().catch(function() {});
    }
    document.getElementById("camera-capture-modal").classList.remove("hidden");
  } catch (err) {
    const fallbackInput = document.getElementById("note-camera-input");
    if (fallbackInput) {
      fallbackInput.value = "";
      fallbackInput.click();
    }
  }
}

function switchCameraFacingMode() {
  const nextMode = currentCameraFacingMode === "environment" ? "user" : "environment";
  openLiveCameraForNote(activeNotePhotoTaskId, nextMode);
}

function closeLiveCameraModal() {
  if (activeCameraStream) {
    activeCameraStream.getTracks().forEach(function(tr) { tr.stop(); });
    activeCameraStream = null;
  }
  const videoEl = document.getElementById("camera-live-video");
  if (videoEl) {
    videoEl.srcObject = null;
  }
  document.getElementById("camera-capture-modal").classList.add("hidden");
}

function snapLiveCameraFrame() {
  const taskId = activeNotePhotoTaskId;
  const videoEl = document.getElementById("camera-live-video");
  if (!taskId || !videoEl || !videoEl.videoWidth) {
    closeLiveCameraModal();
    return;
  }

  const prevInput = document.getElementById("note-input-" + taskId);
  const savedDraftText = prevInput ? prevInput.value : "";

  const maxDim = 960;
  let w = videoEl.videoWidth;
  let h = videoEl.videoHeight;
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
  ctx.drawImage(videoEl, 0, 0, w, h);
  const dataUrl = canvas.toDataURL("image/jpeg", 0.72);

  closeLiveCameraModal();

  if (!notePendingPhotos[taskId]) {
    notePendingPhotos[taskId] = [];
  }
  notePendingPhotos[taskId].push(dataUrl);
  expandedTaskIds[taskId] = true;
  renderAll();

  const restoredInput = document.getElementById("note-input-" + taskId);
  if (restoredInput && savedDraftText) {
    restoredInput.value = savedDraftText;
  }
}

function triggerNotePhotoInput(taskId, sourceType) {
  if (sourceType === "camera") {
    openLiveCameraForNote(taskId, "environment");
    return;
  }

  activeNotePhotoTaskId = taskId;
  notePhotoSourceOpen[taskId] = false;
  const fileInput = document.getElementById("note-gallery-input");
  if (fileInput) {
    fileInput.value = "";
    fileInput.click();
  }
}

async function handleNotePhotoInput(inputElem) {
  const taskId = activeNotePhotoTaskId;
  const files = inputElem.files ? Array.from(inputElem.files) : [];
  if (!taskId || files.length === 0) {
    inputElem.value = "";
    return;
  }

  const prevInput = document.getElementById("note-input-" + taskId);
  const savedDraftText = prevInput ? prevInput.value : "";

  if (!notePendingPhotos[taskId]) {
    notePendingPhotos[taskId] = [];
  }

  for (let i = 0; i < files.length; i++) {
    try {
      const dataUrl = await compressImageFile(files[i]);
      notePendingPhotos[taskId].push(dataUrl);
    } catch (err) {
      showBanner("Photo Error", "Could not process the selected note image.");
    }
  }

  inputElem.value = "";
  expandedTaskIds[taskId] = true;
  renderAll();

  const restoredInput = document.getElementById("note-input-" + taskId);
  if (restoredInput && savedDraftText) {
    restoredInput.value = savedDraftText;
  }
}

function removeStagedNotePhoto(taskId, index) {
  const prevInput = document.getElementById("note-input-" + taskId);
  const savedDraftText = prevInput ? prevInput.value : "";

  if (notePendingPhotos[taskId]) {
    notePendingPhotos[taskId].splice(index, 1);
  }
  expandedTaskIds[taskId] = true;
  renderAll();

  const restoredInput = document.getElementById("note-input-" + taskId);
  if (restoredInput && savedDraftText) {
    restoredInput.value = savedDraftText;
  }
}
