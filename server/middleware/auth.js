// middleware/auth.js
const admin = require("../firebaseAdmin");

// In-memory role cache so we're not hitting Firestore on every single
// request. 60s TTL — short enough that a role change (admin promotes/demotes
// someone) takes effect fast, long enough to matter for a busy upload page.
const userCache = new Map(); // uid -> { role, username, name, expiresAt }
const USER_CACHE_MS = 60_000;

async function getUserProfile(uid, decoded) {
  const cached = userCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached;

  let role = "user";
  let username = null;
  let name = null;

  try {
    const snap = await admin.firestore().collection("users").doc(uid).get();
    if (snap.exists) {
      const data = snap.data();
      role = data.role || "user";
      name = data.fullName || data.name || decoded?.name || null;
      username = data.username || data.fullName || (decoded?.email ? decoded.email.split("@")[0] : null) || uid;
    } else {
      username = (decoded?.email ? decoded.email.split("@")[0] : null) || uid;
      name = decoded?.name || null;
    }
  } catch (e) {
    username = (decoded?.email ? decoded.email.split("@")[0] : null) || uid;
  }

  const cleanUsername = String(username)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 50) || uid;

  const result = { role, username: cleanUsername, name, expiresAt: Date.now() + USER_CACHE_MS };
  userCache.set(uid, result);
  return result;
}

// requireAuth: verifies the ID token, attaches req.user = { uid, email, role, username, name }.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <idToken> header." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const profile = await getUserProfile(decoded.uid, decoded);
    req.user = {
      uid: decoded.uid,
      email: decoded.email,
      role: profile.role,
      username: profile.username,
      name: profile.name
    };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token.", detail: err.message });
  }
}

// requireRole(...roles): use after requireAuth to gate staff-only endpoints,
// e.g. requireRole('admin', 'manager') for reviewing payment screenshots.
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You don't have permission to do that." });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
