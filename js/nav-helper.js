// Shared navigation helper to render dynamic staff and customer links.
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
    const normalizedRole = String(role || "customer")
      .trim()
      .toLowerCase();

    const navs = document.querySelectorAll("header .nav");
    navs.forEach((nav) => {
      // Rebuild privileged links only after the account role has been
      // verified. This also removes legacy links hard-coded in a page.
      nav.querySelectorAll(
        'a[href="executive.html"], a[href="manager.html"], a[href="admin.html"]'
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

      // Executive operations are separate from the Manager summary.
      if (normalizedRole === "executive" || normalizedRole === "admin") {
        const link = document.createElement("a");
        link.href = "executive.html";
        link.textContent = "Executive";
        if (currentPath === "executive.html") link.classList.add("active");
        const prof = nav.querySelector('a[href="profile.html"]');
        prof ? nav.insertBefore(link, prof) : nav.appendChild(link);
      }

      // Manager summary is available to manager and admin accounts.
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

      // Ensure Admin link for admin role
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

  // Always start with 'customer' — Firestore is the only source of truth
  renderNavLinks("customer");

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      renderNavLinks("customer");
      return;
    }

    let role = "customer";
    try {
      const snap = await getDoc(doc(db, "users", user.uid));
      if (snap.exists()) {
        role = String(snap.data().role || "customer")
          .trim()
          .toLowerCase();
      }
    } catch (e) {
      // Quiet fallback — default to customer
    }

    renderNavLinks(role);
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
