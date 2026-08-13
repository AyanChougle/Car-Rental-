// Centralized Firebase setup. Every page that needs auth, Firestore, or
// Storage imports its instance from here instead of calling
// initializeApp() again — one app, one source of truth.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-app.js";
import {
  getAnalytics,
  isSupported as analyticsIsSupported,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-analytics.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-storage.js";

// Same config that was already sitting in js/auth.js. This is a public
// client identifier, not a secret — it's fine to ship in the bundle.
// Real protection comes from firestore.rules / storage.rules.
const firebaseConfig = {
  apiKey: "AIzaSyARhtzwJV90HcdN7_szUWP34ZQ7zS2iMOw",
  authDomain: "CARRENTPEweb.firebaseapp.com",
  projectId: "CARRENTPEweb",
  storageBucket: "CARRENTPEweb.firebasestorage.app",
  messagingSenderId: "903989537070",
  appId: "1:903989537070:web:98402187513738b65d32bf",
  measurementId: "G-04LJBW1137",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// Analytics throws if it's unsupported (e.g. opened straight off disk
// during local dev) — guard it instead of letting it take the page down.
analyticsIsSupported()
  .then((ok) => {
    if (ok) getAnalytics(app);
  })
  .catch(() => {});
