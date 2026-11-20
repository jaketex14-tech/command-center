const STORAGE_KEY = "unified_command_center_v12";
const SAFETY_BACKUP_KEY = "command_center_safety_backup_v1";
const LEGACY_KEYS = [
  "unified_command_center_v14",
  "unified_command_center_v13",
  "unified_command_center_v12",
  "unified_command_center_v11",
  "unified_command_center_v10",
  "unified_command_center_v9",
  "unified_command_center_v8"
];
const SESSION_USER_KEY = "command_center_logged_in_user";
const FIREBASE_URL_KEY = "command_center_firebase_url";
const LAST_NOTIF_KEY = "command_center_last_notif_id";
const SCAN_LOG_KEY = "command_center_scan_log_v1";

const INJECTED_CLOUD_URL = (window.APP_CONFIG && window.APP_CONFIG.CLOUD_URL)
  ? window.APP_CONFIG.CLOUD_URL
  : "PLACEHOLDER_FIREBASE_URL";

const PHOTO_RETENTION_MS = 3 * 24 * 60 * 60 * 1000;
const TASK_RETENTION_MS = 14 * 24 * 60 * 60 * 1000;

const DEFAULT_FILTER_SETTINGS = {
  captureSms: true,
  captureReminders: true,
  captureCalendar: true,
  workKeywords: "Keith Pratt, Ronnie, Ray, Terry, Bingham, Boice, Advancement Center, City Hall, Bennett, Wheeler",
  ignoredSenders: ""
};

const DEFAULT_SHARED_STATE = {
  geminiApiKey: "",
  filterSettings: DEFAULT_FILTER_SETTINGS,
  users: [
    { id: "u_admin1", name: "Admin 1", role: "admin", pin: "1234" }
  ],
  tasks: [],
  lastNotification: null
};

function getFirebaseUrl() {
  const saved = localStorage.getItem(FIREBASE_URL_KEY);
  if (saved && saved.startsWith("https://")) {
    return saved.trim().replace(/\/$/, "");
  }
  return INJECTED_CLOUD_URL.trim().replace(/\/$/, "");
}
