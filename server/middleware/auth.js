// middleware/auth.js
const admin = require("../firebaseAdmin");

// In-memory role cache so we're not hitting Firestore on every single
// request. 60s TTL — short enough that a role change (admin promotes/demotes
// someone) takes effect fast, long enough to matter for a busy upload page.
const roleCache = new Map(); // uid -> { role, expiresAt }
const ROLE_CACHE_MS = 60_000;

async function getUserRole(uid) {
  const cached = roleCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.role;

  const snap = await admin.firestore().collection("users").doc(uid).get();
  const role = snap.exists ? (snap.data().role || "user") : "user";
  roleCache.set(uid, { role, expiresAt: Date.now() + ROLE_CACHE_MS });
  return role;
}

// requireAuth: verifies the ID token, attaches req.user = { uid, role }.
// Any signed-in user passes this — role checks happen in requireRole.
async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <idToken> header." });
  }

  try {
    const decoded = await admin.auth().verifyIdToken(token);
    const role = await getUserRole(decoded.uid);
    req.user = { uid: decoded.uid, email: decoded.email, role };
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
