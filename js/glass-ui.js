(() => {
  const toggle = document.getElementById('mobileNavToggle');
  const nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => nav.classList.remove('open')));
  }
  document.querySelectorAll('a[href]').forEach(a => {
    try {
      if (new URL(a.href, location.href).pathname === location.pathname) a.classList.add('active');
    } catch (_) {}
  });
})();
