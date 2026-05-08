import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging, getToken, onMessage } from "firebase/messaging";

const firebaseConfig = {
  apiKey:            "AIzaSyCoTmHR6LUgV4u6Qcz2ERZkBZzaSH_xR0A",
  authDomain:        "mbdasboard.firebaseapp.com",
  projectId:         "mbdasboard",
  storageBucket:     "mbdasboard.firebasestorage.app",
  messagingSenderId: "806064547678",
  appId:             "1:806064547678:web:115907d020c0192b8211cf",
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth      = getAuth(app);
export const db        = getFirestore(app);
export const messaging = getMessaging(app);

export const ADMIN_EMAIL    = "mbaez86@mbdasboard.internal";
export const ADMIN_PASSWORD = "141414";
export const toEmail = (u) => `${u.toLowerCase()}@mbdasboard.internal`;

// Replace with your VAPID key from Firebase Console → Project Settings → Cloud Messaging
export const VAPID_KEY = "YOUR_VAPID_KEY_HERE";

export const requestNotificationPermission = async () => {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return null;
    const token = await getToken(messaging, { vapidKey: VAPID_KEY });
    return token;
  } catch (e) {
    console.error("Notification permission error:", e);
    return null;
  }
};

export const onForegroundMessage = (callback) => onMessage(messaging, callback);
