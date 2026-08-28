(() => {
  // Mobile Nav Toggle
  const toggle = document.getElementById('mobileNavToggle');
  const nav = document.getElementById('mainNav');
  if (toggle && nav) {
    toggle.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
    });
    nav.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
      nav.classList.remove('open');
      toggle.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    }));
  }

  // Active Link Highlighting
  document.querySelectorAll('a[href]').forEach(a => {
    try {
      if (new URL(a.href, location.href).pathname === location.pathname) a.classList.add('active');
    } catch (_) {}
  });

  // =========================================================
  // SMART CONTEXTUAL WHATSAPP AUTOMATION
  // Automatically personalizes the WhatsApp message depending
  // on which page, car, booking, or section the user clicked from!
  // =========================================================
  function getSmartWhatsAppUrl() {
    const phone = '919167164547';
    const path = window.location.pathname.split('/').pop() || 'index.html';
    const params = new URLSearchParams(window.location.search);
    let msg = '';

    if (path === 'contact.html') {
      const nameInput = document.getElementById('name');
      const subjectSelect = document.getElementById('subject');
      const name = nameInput?.value?.trim() || '';
      const subject = subjectSelect?.value || 'General Inquiry';
      if (name) {
        msg = `Hi KRUIZLY, I'm ${name}. I'm reaching out regarding *${subject}*.`;
      } else {
        msg = `Hi KRUIZLY, I would like to get in touch with your team regarding a reservation / inquiry.`;
      }
    } else if (path === 'partner.html') {
      msg = `Hi KRUIZLY, I would like to host/list my car on your platform. Please share the partner onboarding details and revenue share info.`;
    } else if (path === 'fleet.html' || path === 'vehicle.html') {
      const vehicle = params.get('vehicle') || params.get('car') || params.get('model');
      if (vehicle) {
        msg = `Hi KRUIZLY, I'm interested in booking the *${vehicle}*. Is it available for my dates?`;
      } else {
        msg = `Hi KRUIZLY, I'm browsing your fleet and would like to check self-drive car availability and rates.`;
      }
    } else if (path === 'booking.html') {
      const carName = document.getElementById('vehicleTitle')?.textContent?.trim() ||
                      document.getElementById('carName')?.textContent?.trim() ||
                      params.get('vehicle') ||
                      params.get('car') ||
                      'a self-drive car';
      const pickupDate = document.getElementById('pickupDate')?.value || '';
      if (pickupDate) {
        msg = `Hi KRUIZLY, I need assistance with my booking for the *${carName}* (Pickup: ${pickupDate}).`;
      } else {
        msg = `Hi KRUIZLY, I need assistance with booking the *${carName}*.`;
      }
    } else if (path === 'payment.html') {
      const ref = params.get('ref') || params.get('bookingId') || sessionStorage.getItem('kruizly_last_booking_ref') || '';
      if (ref) {
        msg = `Hi KRUIZLY, I have a query regarding payment & verification for Booking ID: *${ref}*.`;
      } else {
        msg = `Hi KRUIZLY, I need help with UPI payment & verification for my reservation.`;
      }
    } else if (path === 'profile.html' || path === 'bookings.html') {
      msg = `Hi KRUIZLY, I need support regarding my account / booking status.`;
    } else if (path === 'about.html') {
      msg = `Hi KRUIZLY, I was exploring your About page and would like to learn more about your self-drive fleet and doorstep delivery.`;
    } else {
      msg = `Hi KRUIZLY, I would like to inquire about renting a luxury self-drive car in Mumbai / Maharashtra.`;
    }

    return `https://wa.me/${phone}?text=${encodeURIComponent(msg)}`;
  }

  // Update all generic WhatsApp links on the page dynamically
  function applySmartWhatsAppLinks() {
    document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"], .social-pill.whatsapp, .whatsapp-pill').forEach(anchor => {
      const currentHref = anchor.getAttribute('href') || '';
      if (!currentHref.includes('text=') || currentHref === 'https://wa.me/919167164547') {
        anchor.href = getSmartWhatsAppUrl();
      }
    });
  }

  // On page load and dynamic click
  applySmartWhatsAppLinks();
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a[href*="wa.me"], a[href*="whatsapp.com"], .social-pill.whatsapp, .whatsapp-pill');
    if (anchor) {
      anchor.href = getSmartWhatsAppUrl();
    }
  });

  // Enhance selects helper (no-op: native selects are styled natively via glass CSS)
  window.enhanceKruizlySelects = () => {};
})();
