let hasCompletedInitialCloudPull = false;
let state = JSON.parse(JSON.stringify(DEFAULT_SHARED_STATE));
let lastRenderedHash = "";
let currentUserId = localStorage.getItem(SESSION_USER_KEY) || null;
let activeTab = "tasks";
let adminFilterUserId = "ALL";
let taskSortMode = "priority_date";
let expandedTaskIds = {};
let creatorSelectedUsers = [];
let creatorUrgent = false;
let triageCreatorUrgent = false;
let triageSelections = {};
let cloudPollTimer = null;
let activePhotoScanPromise = null;
let preferredWorkingModel = null;

let triagePendingPhotos = [];
let creatorPendingPhotos = [];

// Task Note Photo & Live Camera State
let notePendingPhotos = {};
let notePhotoSourceOpen = {};
let activeNotePhotoTaskId = null;
let activeCameraStream = null;
let currentCameraFacingMode = "environment";

// Edit Modal Draft State
let editingTaskId = null;
let editDraftChecklist = [];
let editDraftAssignees = [];
let editDraftPhotos = [];
let editDraftUrgent = false;

let dropdownState = {
  triageCreator: false,
  taskCreator: false,
  completedTasks: false,
  recoveryScanner: false,
  addUser: false,
  geminiKey: false,
  captureRules: false,
  scanLog: false
};

/********************************************************************
 * ROLE HIERARCHY HELPERS (ADMIN > DELEGATOR > CREW)
 ********************************************************************/
function isAdminRole(user) {
  return Boolean(user && user.role === "admin");
}

function isDelegatorOrAdminRole(user) {
  return Boolean(user && (user.role === "admin" || user.role === "delegator"));
}

function getRoleDisplayLabel(role) {
  if (role === "admin") return "Admin";
  if (role === "delegator") return "Delegator";
  return "Crew";
}

function getRoleBadgeClass(role) {
  if (role === "admin") return "role-admin";
  if (role === "delegator") return "role-delegator";
  return "role-member";
}

/********************************************************************
 * SHARED DATA & DOM UTILITIES
 ********************************************************************/
function normalizeArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  if (typeof val === "object") return Object.values(val).filter(Boolean);
  return [];
}

function escapeHtmlAttr(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function cleanBulletPrefix(line) {
  return String(line || "")
    .trim()
    .replace(/^(?:[•*▪▫‣⁃]+|\-\s+|\d+[\.\)]\s+)\s*/, "")
    .trim();
}

function isLikelyBulletOrQuantityLine(rawLine) {
  const s = String(rawLine || "").trim();
  if (/^[•*▪▫‣⁃\-]/.test(s)) return true;
  if (/^\d+\s*(?:x\b|-|\s+[a-zA-Z0-9"'])/i.test(s)) return true;
  return false;
}

function isUserTyping() {
  const el = document.activeElement;
  if (!el) return false;
  const tag = (el.tagName || "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(el.isContentEditable);
}

function isEditModalOpen() {
  const modal = document.getElementById("edit-modal");
  return modal && !modal.classList.contains("hidden");
}

function computeStateHash(st) {
  try {
    return JSON.stringify({
      k: st.geminiApiKey || "",
      f: st.filterSettings || {},
      u: st.users || [],
      t: st.tasks || []
    });
  } catch (e) {
    return String(Date.now());
  }
}

function getFilterSettings() {
  return Object.assign({}, DEFAULT_FILTER_SETTINGS, state.filterSettings || {});
}

function normalizeTaskObject(t) {
  const dueDate = t.dueDate || getTodayIso();
  const duePeriod = (t.duePeriod === "PM") ? "PM" : "AM";
  const normalizedNotes = normalizeArray(t.notes).map(function(n) {
    return Object.assign({}, n, {
      images: normalizeArray(n.images)
    });
  });
  const normalizedChecklist = normalizeArray(t.checklist).map(function(item) {
    return Object.assign({}, item, {
      done: Boolean(item.done),
      delivered: Boolean(item.delivered),
      deliveredBy: item.deliveredBy || null,
      deliveredAt: item.deliveredAt || null
    });
  });
  return Object.assign({}, t, {
    urgent: Boolean(t.urgent),
    dueDate: dueDate,
    duePeriod: duePeriod,
    due: t.due || formatFriendlyDueLabel(dueDate, duePeriod, "Today"),
    assignedTo: normalizeArray(t.assignedTo),
    checklist: normalizedChecklist,
    images: normalizeArray(t.images),
    notes: normalizedNotes
  });
}
