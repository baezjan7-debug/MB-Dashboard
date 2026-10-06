import { initializeApp, getApps, deleteApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

// ── Single shared Firebase project ───────────────────────────────────────────
const firebaseConfig = {
  apiKey:            "AIzaSyANj9e62rLJvuwpjkxrXqk4oGsCWVeOdWk",
  authDomain:        "mb-invoice-ee9fc.firebaseapp.com",
  projectId:         "mb-invoice-ee9fc",
  storageBucket:     "mb-invoice-ee9fc.firebasestorage.app",
  messagingSenderId: "175690254937",
  appId:             "1:175690254937:web:fce3945aa4dd14a129ff48"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db   = getFirestore(app);

// Keep original email convention so existing accounts still work
export const toEmail = (u) => `${u.toLowerCase().trim()}@mbdasboard.internal`;

// Notification stubs (no FCM needed)
export const requestNotificationPermission = async () => null;
export const onForegroundMessage = () => () => {};

// Creates a login on a throwaway app instance, so the admin creating the
// account stays signed in on the main one (no need to know their password).
export const createAccount = async (email, password) => {
  const tmp = initializeApp(firebaseConfig, `create-account-${Date.now()}`);
  try {
    const cred = await createUserWithEmailAndPassword(getAuth(tmp), email, password);
    return cred.user.uid;
  } finally {
    await deleteApp(tmp);
  }
};
