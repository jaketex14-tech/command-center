/********************************************************************
 * UNIFIED PUSH NOTIFICATIONS (IOS/ANDROID PWA + NATIVE ANDROID APK)
 ********************************************************************/
let activePushToken = null;
let firebaseMessagingInstance = null;

function hashTokenToKey(token) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const str = String(token || "");
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 16777619) >>> 0;
    h2 = Math.imul(h2 ^ (ch + i), 2654435761) >>> 0;
  }
  return "tok_" + h1.toString(36) + "_" + h2.toString(36);
}

function getWebPushConfig() {
  const cfg = window.APP_CONFIG && window.APP_CONFIG.FIREBASE_WEB_CONFIG;
  if (!cfg || typeof cfg !== "object" || !cfg.projectId || !cfg.messagingSenderId) {
    return null;
  }
  return cfg;
}

function isPushActiveOnThisDevice() {
  return Boolean(activePushToken);
}

async function saveDeviceTokenToFirebase(userId, token, platform) {
  const dbUrl = getFirebaseUrl();
  if (!userId || !token || !dbUrl || dbUrl.indexOf("PLACEHOLDER") !== -1) return false;

  const tokenKey = hashTokenToKey(token);
  try {
    const res = await fetch(
      dbUrl + "/command_center_push_tokens/" + encodeURIComponent(userId) + "/" + tokenKey + ".json",
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: token,
          platform: platform || "web",
          updatedAt: Date.now()
        })
      }
    );
    if (res.ok) {
      activePushToken = token;
      localStorage.setItem("cc_last_push_token", token);
      updatePushOptInBanner();
      return true;
    }
  } catch (e) {}
  return false;
}

async function removeCurrentDeviceToken(userId) {
  const dbUrl = getFirebaseUrl();
  const tok = activePushToken || localStorage.getItem("cc_last_push_token");
  if (!userId || !tok || !dbUrl || dbUrl.indexOf("PLACEHOLDER") !== -1) return;

  const tokenKey = hashTokenToKey(tok);
  try {
    await fetch(
      dbUrl + "/command_center_push_tokens/" + encodeURIComponent(userId) + "/" + tokenKey + ".json",
      { method: "DELETE" }
    );
  } catch (e) {}
  activePushToken = null;
}

function getFirebaseMessagingInstance() {
  if (firebaseMessagingInstance) return firebaseMessagingInstance;
  const cfg = getWebPushConfig();
  if (!cfg || typeof firebase === "undefined" || !firebase.messaging) return null;

  try {
    if (!firebase.apps || firebase.apps.length === 0) {
      firebase.initializeApp(cfg);
    }
    firebaseMessagingInstance = firebase.messaging();
    firebaseMessagingInstance.onMessage(function() {
      // Pull immediately so the in-app banner & task board update without waiting for the 3.5s poll
      pullStateFromCloud();
    });
    return firebaseMessagingInstance;
  } catch (e) {
    return null;
  }
}

async function registerWebPushToken(userId, promptIfNeeded) {
  const cfg = getWebPushConfig();
  if (!cfg || !cfg.vapidKey) return false;
  if (!("Notification" in window) || !("serviceWorker" in navigator)) return false;

  let perm = Notification.permission;
  if (perm === "default" && promptIfNeeded) {
    perm = await Notification.requestPermission();
  }
  if (perm !== "granted") {
    updatePushOptInBanner();
    return false;
  }

  const messaging = getFirebaseMessagingInstance();
  if (!messaging) return false;

  try {
    const reg = await navigator.serviceWorker.register("./firebase-messaging-sw.js");
    await navigator.serviceWorker.ready;
    const token = await messaging.getToken({
      vapidKey: cfg.vapidKey,
      serviceWorkerRegistration: reg
    });
    if (token) {
      const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
      return await saveDeviceTokenToFirebase(userId, token, isIos ? "ios-pwa" : "web-pwa");
    }
  } catch (err) {
    if (promptIfNeeded) {
      showBanner("Push Setup Issue", "Could not register push alerts on this browser. Make sure the app is installed to your Home Screen on iPhone.");
    }
  }
  return false;
}

async function enablePushNotificationsFromClick() {
  const user = getCurrentUser();
  if (!user) return;

  const btn = document.getElementById("btn-enable-push");
  if (btn) btn.textContent = "Enabling...";

  const ok = await registerWebPushToken(user.id, true);
  if (btn) btn.textContent = "Enable Push Alerts";

  if (ok) {
    showBanner("Push Alerts Enabled", "You will now receive instant alerts even when Command Center is closed.");
  }
}

function updatePushOptInBanner() {
  const card = document.getElementById("push-optin-card");
  if (!card) return;

  const user = getCurrentUser();
  const isNativeApk = window.AndroidNative && typeof window.AndroidNative.getNativeFcmToken === "function";

  if (!user || isNativeApk || activePushToken || !getWebPushConfig()) {
    card.classList.add("hidden");
    return;
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    card.classList.add("hidden");
    return;
  }

  if (Notification.permission === "denied") {
    card.classList.add("hidden");
    return;
  }

  card.classList.remove("hidden");
}

function syncNativeAndroidPushToken(userId, attempt) {
  if (!window.AndroidNative || typeof window.AndroidNative.getNativeFcmToken !== "function") return;
  const tok = window.AndroidNative.getNativeFcmToken();
  if (tok && String(tok).trim()) {
    saveDeviceTokenToFirebase(userId, String(tok).trim(), "android-apk");
  } else if ((attempt || 0) < 8) {
    setTimeout(function() {
      syncNativeAndroidPushToken(userId, (attempt || 0) + 1);
    }, 1500);
  }
}

async function initPushForCurrentUser() {
  const user = getCurrentUser();
  if (!user) {
    updatePushOptInBanner();
    return;
  }

  // Path A: Native Android APK
  if (window.AndroidNative && typeof window.AndroidNative.getNativeFcmToken === "function") {
    syncNativeAndroidPushToken(user.id, 0);
    updatePushOptInBanner();
    return;
  }

  // Path B: iOS / Android / Desktop PWA
  if ("Notification" in window && Notification.permission === "granted") {
    await registerWebPushToken(user.id, false);
  }
  updatePushOptInBanner();
}
