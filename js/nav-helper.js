// Shared navigation helper to render dynamic staff and customer links.
import { auth } from "./firebase-init.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.17.0/firebase-auth.js";
import { api } from "./kruizly-api.js?v=20260907-v5";
import { isAdminUser, getStoredUser } from "./auth.js?v=20260908-v5";

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

  const renderNavLinks = (role, userObj = null) => {
    let normalizedRole = String(role || "customer")
      .trim()
      .toLowerCase();

    // If user is admin (by role or email in userObj or localStorage), treat as admin
    const stored = userObj || getStoredUser();
    if (
      normalizedRole === "admin" ||
      normalizedRole === "super_admin" ||
      (stored && isAdminUser(stored))
    ) {
      normalizedRole = "admin";
    }

    const navs = document.querySelectorAll("header .nav");
    navs.forEach((nav) => {
      // Rebuild privileged links only after the account role has been
      // verified. This also removes legacy links hard-coded in a page.
      nav.querySelectorAll(
        'a[href="executive.html"], a[href="manager.html"], a[href="accounts.html"], a[href="admin.html"]'
      ).forEach((link) => link.remove());

      // Ensure Host Car link
      if (!nav.querySelector('a[href="partner.html"]')) {
        const link = document.createElement("a");
        link.href = "partner.html";
        link.textContent = "Host Car";
        if (currentPath === "partner.html") link.classList.add("active");
        const prof = nav.querySelector('a[href="profile.html"]');
        prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
      }

      // Executive operations (available to executive, manager, and admin)
      if (normalizedRole === "executive" || normalizedRole === "manager" || normalizedRole === "admin") {
        if (!nav.querySelector('a[href="executive.html"]')) {
          const link = document.createElement("a");
          link.href = "executive.html";
          link.textContent = "Executive";
          if (currentPath === "executive.html") link.classList.add("active");
          const prof = nav.querySelector('a[href="profile.html"]');
          prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
        }
      }

      // Manager summary (available to manager and admin)
      if (normalizedRole === "manager" || normalizedRole === "admin") {
        if (!nav.querySelector('a[href="manager.html"]')) {
          const link = document.createElement("a");
          link.href = "manager.html";
          link.textContent = "Manager Panel";
          if (currentPath === "manager.html") link.classList.add("active");
          const prof = nav.querySelector('a[href="profile.html"]');
          prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
        }
      }

      // Accounts / Financial Verification (available to accountant and admin)
      if (normalizedRole === "accountant" || normalizedRole === "admin") {
        if (!nav.querySelector('a[href="accounts.html"]')) {
          const link = document.createElement("a");
          link.href = "accounts.html";
          link.textContent = "Accounts";
          if (currentPath === "accounts.html") link.classList.add("active");
          const prof = nav.querySelector('a[href="profile.html"]');
          prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
        }
      }

      // Admin link (available to admin - full access to every page)
      if (normalizedRole === "admin") {
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

  // 1. Initial quick render from localStorage
  const storedUser = localStorage.getItem("kruizly_user");
  let userRole = "customer";
  let parsedUser = null;
  if (storedUser) {
    try {
      parsedUser = JSON.parse(storedUser);
      userRole = parsedUser.role || "customer";
      if (isAdminUser(parsedUser)) userRole = "admin";
    } catch (_) {}
  }
  renderNavLinks(userRole, parsedUser);

  // 2. Live Auth State Listener
  onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (isAdminUser(user)) {
        renderNavLinks("admin", user);
      }

      // Fetch authoritative role from MySQL
      try {
        const res = await api.get("/users/me");
        if (res && res.user && res.user.role) {
          localStorage.setItem("kruizly_user", JSON.stringify(res.user));
          const effectiveRole = isAdminUser(res.user) ? "admin" : res.user.role;
          renderNavLinks(effectiveRole, res.user);
        }
      } catch (_) {}
    } else {
      renderNavLinks("customer");
    }
  });

  // Universal Mobile Navigation Toggle
  const toggleBtn = document.getElementById("mobileNavToggle") || document.querySelector(".mobile-nav-toggle");
  const navMenu = document.getElementById("mainNav") || document.querySelector("header .nav");

  if (toggleBtn && navMenu) {
    toggleBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isOpen = navMenu.classList.toggle("is-open");
      toggleBtn.setAttribute("aria-expanded", String(isOpen));
    });

    document.addEventListener("click", (e) => {
      if (!navMenu.contains(e.target) && !toggleBtn.contains(e.target)) {
        navMenu.classList.remove("is-open");
        toggleBtn.setAttribute("aria-expanded", "false");
      }
    });
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDynamicNav);
} else {
  initDynamicNav();
}
