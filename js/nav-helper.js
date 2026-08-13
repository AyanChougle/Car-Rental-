// Shared navigation helper to render dynamic role links (Admin, Manager, Partner)
import { auth, db } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";

export function initDynamicNav() {
  const currentPath = window.location.pathname.split("/").pop() || "index.html";

  // Ensure active class matches current page
  document.querySelectorAll("header .nav a").forEach((a) => {
    const href = a.getAttribute("href");
    if (href === currentPath || (currentPath === "" && href === "index.html")) {
      a.classList.add("active");
    } else {
      a.classList.remove("active");
    }
  });

  const renderNavLinks = (role) => {
    const navs = document.querySelectorAll("header .nav");
    navs.forEach((nav) => {
      // Ensure Host Car link
      if (!nav.querySelector('a[href="partner.html"]')) {
        const link = document.createElement("a");
        link.href = "partner.html";
        link.textContent = "Host Car";
        if (currentPath === "partner.html") link.classList.add("active");
        const prof = nav.querySelector('a[href="profile.html"]');
        prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
      }

      // Ensure Manager link for manager/admin roles
      if (role === "manager" || role === "admin") {
        if (!nav.querySelector('a[href="manager.html"]')) {
          const link = document.createElement("a");
          link.href = "manager.html";
          link.textContent = "Manager";
          if (currentPath === "manager.html") link.classList.add("active");
          const prof = nav.querySelector('a[href="profile.html"]');
          prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
        }
      }

      // Ensure Admin link for admin role
      if (role === "admin") {
        if (!nav.querySelector('a[href="admin.html"]')) {
          const link = document.createElement("a");
          link.href = "admin.html";
          link.textContent = "Admin";
          if (currentPath === "admin.html") link.classList.add("active");
          const prof = nav.querySelector('a[href="profile.html"]');
          prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
        }
      }
    });
  };

  // Always start with 'customer' — Firestore is the only source of truth
  renderNavLinks("customer");

  onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    let role = "customer";
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        role = snap.data().role || "customer";
      }
    } catch (e) {
      // Quiet fallback — default to customer
    }

    renderNavLinks(role);
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDynamicNav);
} else {
  initDynamicNav();
}
