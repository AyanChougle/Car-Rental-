/* ==========================================================================
   KRUIZLY LUXURY MOTION & ANIMATION ENGINE
   ========================================================================== */
(() => {
  // 1. SPLASH PRELOADER (ONLY ON INITIAL ARRIVAL AT LANDING PAGE)
  function initSplashScreen() {
    const splash = document.getElementById('kruizlySplash');
    if (!splash) return;

    // Check if on landing page
    const pathname = window.location.pathname.split('/').pop() || 'index.html';
    const isLanding = (pathname === 'index.html' || pathname === '' || pathname === '/');

    // Check if already shown in this session
    const alreadyShown = sessionStorage.getItem('kruizly_splash_shown') === '1';

    if (!isLanding || alreadyShown) {
      splash.remove();
      return;
    }

    // Mark as shown for the rest of the session
    sessionStorage.setItem('kruizly_splash_shown', '1');

    const dismissSplash = () => {
      if (splash.classList.contains('is-hidden')) return;
      splash.classList.add('is-hidden');
      splash.setAttribute('aria-hidden', 'true');
      setTimeout(() => {
        try { splash.remove(); } catch (_) {}
      }, 550);
    };

    const start = Date.now();
    const handleLoad = () => {
      const elapsed = Date.now() - start;
      const delay = Math.max(0, 450 - elapsed);
      setTimeout(dismissSplash, delay);
    };

    if (document.readyState === 'complete') {
      handleLoad();
    } else {
      window.addEventListener('load', handleLoad, { once: true });
      setTimeout(dismissSplash, 1800);
    }
  }

  // 2. SCROLL REVEAL OBSERVER WITH STAGGER
  function initScrollReveals() {
    const targetSelectors = [
      '.vehicle-card',
      '.feature-card',
      '.stat-card',
      '.benefit-card',
      '.service-card',
      '.review-card',
      '.testimonial-card',
      '.faq-item',
      '.section-head',
      '.section-header',
      '.contact-card',
      '.pricing-card',
      '.about-grid > div',
      '.how-it-works-step',
      '.footer-col',
      '.partner-benefit-card',
      '.perk-card'
    ];

    const elements = document.querySelectorAll(targetSelectors.join(', '));
    if (!elements.length) return;

    elements.forEach((el) => {
      if (!el.classList.contains('kr-reveal') && !el.closest('.site-header')) {
        el.classList.add('kr-reveal');
        const parent = el.parentElement;
        if (parent) {
          const siblings = Array.from(parent.children);
          const index = siblings.indexOf(el);
          if (index > 0 && index < 7) {
            el.classList.add('kr-delay-' + index);
          }
        }
      }
    });

    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('kr-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.1
    });

    document.querySelectorAll('.kr-reveal').forEach((el) => observer.observe(el));
  }

  // 3. HEADER SCROLL DETECTION
  function initHeaderScroll() {
    const header = document.querySelector('.site-header');
    if (!header) return;

    const onScroll = () => {
      if (window.scrollY > 20) {
        header.classList.add('is-scrolled');
      } else {
        header.classList.remove('is-scrolled');
      }
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // 4. SMOOTH ANCHOR SCROLLING WITH OFFSET
  function initSmoothAnchorScroll() {
    document.addEventListener('click', (e) => {
      const anchor = e.target.closest('a[href^="#"]');
      if (!anchor) return;

      const targetId = anchor.getAttribute('href');
      if (!targetId || targetId === '#' || targetId.length < 2) return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        const headerHeight = document.querySelector('.site-header')?.offsetHeight || 66;
        const targetPos = targetEl.getBoundingClientRect().top + window.pageYOffset - headerHeight - 16;
        window.scrollTo({
          top: targetPos,
          behavior: 'smooth'
        });
      }
    });
  }

  // 5. ANIMATED STAT NUMBER COUNTERS (Landing pages & static marketing elements only)
  function initStatCounters() {
    // Exclude live dashboard stats in admin/manager/profile panels
    const statElements = Array.from(
      document.querySelectorAll('.stat-number, .landing-stat, [data-counter]')
    ).filter(el => !el.closest('.admin-wrapper, .manager-wrapper, .staff-page, .stat-card, [id^="stat"]'));

    if (!statElements.length) return;

    const counterObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const el = entry.target;
          counterObserver.unobserve(el);

          const rawText = el.textContent.trim();
          const match = rawText.match(/^([^\d]*)(\d+[\d,.]*)(.*)$/);
          if (!match) return;

          const prefix = match[1] || '';
          const targetNum = parseFloat(match[2].replace(/,/g, ''));
          const suffix = match[3] || '';
          const isDecimal = match[2].includes('.');

          if (isNaN(targetNum) || targetNum === 0) return;

          const duration = 1400;
          const startTime = performance.now();

          const update = (now) => {
            const progress = Math.min(1, (now - startTime) / duration);
            const ease = 1 - Math.pow(1 - progress, 3);
            const current = targetNum * ease;

            el.textContent = prefix + (isDecimal ? current.toFixed(1) : Math.round(current).toLocaleString()) + suffix;

            if (progress < 1) {
              requestAnimationFrame(update);
            } else {
              el.textContent = prefix + (isDecimal ? targetNum.toFixed(1) : Math.round(targetNum).toLocaleString()) + suffix;
            }
          };

          requestAnimationFrame(update);
        }
      });
    }, { threshold: 0.5 });

    statElements.forEach(el => counterObserver.observe(el));
  }

  const startMotion = () => {
    initSplashScreen();
    initScrollReveals();
    initHeaderScroll();
    initSmoothAnchorScroll();
    initStatCounters();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startMotion);
  } else {
    startMotion();
  }
})();
