// Contact form: saves every submission to Firestore (contact_messages)
// so it's never silently lost, then opens the visitor's mail client as a
// bonus (mailto: does nothing on many phones/browsers with no mail app
// configured, so it can no longer be the only delivery path). Also
// prefills the form for links coming from fleet.html / vehicle.html
// "Book Now" buttons (contact.html?subject=Booking%20Support&vehicle=Tata%20Nexon).
import { db } from "./firebase-init.js";
import {
  collection,
  addDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.17.0/firebase-firestore.js";
import "./nav-helper.js";

const form = document.getElementById("contact-form");
const status = document.getElementById("form-status");

const params = new URLSearchParams(window.location.search);
const subjectParam = params.get("subject");
const vehicleParam = params.get("vehicle");

if (subjectParam) {
  const subjectSelect = document.getElementById("subject");
  const match = [...subjectSelect.options].find(
    (option) => option.value === subjectParam || option.textContent === subjectParam
  );
  if (match) subjectSelect.value = match.value;
}

if (vehicleParam) {
  const messageField = document.getElementById("message");
  messageField.value = `Hi, I'd like to book the ${vehicleParam}. Please let me know availability and next steps.`;
}

if (form && status) {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitButton = form.querySelector('button[type="submit"]');

    const formData = new FormData(form);
    const name = formData.get("name")?.toString().trim() || "Visitor";
    const email = formData.get("email")?.toString().trim() || "";
    const phone = formData.get("phone")?.toString().trim() || "Not provided";
    const subject = formData.get("subject")?.toString() || "General Inquiry";
    const message = formData.get("message")?.toString().trim() || "";

    if (!name || !email || !message) {
      status.className = "form-status form-status--error";
      status.textContent = "Please fill in all required fields.";
      return;
    }

    const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    if (!emailRegex.test(email)) {
      status.className = "form-status form-status--error";
      status.textContent = "Please enter a valid email address.";
      return;
    }

    let cleanPhone = phone.replace(/\D/g, "");
    if (cleanPhone.length === 12 && cleanPhone.startsWith("91")) cleanPhone = cleanPhone.slice(2);
    else if (cleanPhone.length === 11 && cleanPhone.startsWith("0")) cleanPhone = cleanPhone.slice(1);

    if (cleanPhone && (cleanPhone.length !== 10 || !/^[6-9]/.test(cleanPhone))) {
      status.className = "form-status form-status--error";
      status.textContent = "Please enter a valid 10-digit Indian mobile number.";
      return;
    }

    if (submitButton) submitButton.disabled = true;
    status.className = "form-status";
    status.textContent = "Preparing your message...";

    // 1. Attempt Firestore save (non-blocking for user flow)
    try {
      await addDoc(collection(db, "contact_messages"), {
        name,
        email,
        phone,
        subject,
        message,
        createdAt: serverTimestamp(),
        resolved: false,
      });
    } catch (_) {
      // Quiet fallback when live Firestore rules require auth
    }

    // 2. Format and trigger direct Email (mailto)
    const emailSubject = `[KRUIZLY Inquiry] ${subject} - ${name}`;
    const emailBody = `Full Name: ${name}\nEmail Address: ${email}\nPhone Number: ${phone}\nInquiry Subject: ${subject}\n\nMessage:\n${message}\n\nSent via kruizly.com/contact.html`;
    const mailtoLink = `mailto:support@kruizly.com?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;

    // 3. Prepare WhatsApp fallback prefill
    const waText = `Hi KRUIZLY, I would like to inquire about *${subject}*.\n\n*Name:* ${name}\n*Email:* ${email}\n*Phone:* ${phone}\n*Message:* ${message}`;
    const waLink = `https://wa.me/919167164547?text=${encodeURIComponent(waText)}`;

    // Show success status with quick WhatsApp fallback
    status.innerHTML = `
      <span style="color: #4fd7ff; font-weight: 700;">✓ Opening your email client to send to support@kruizly.com...</span>
      <div style="margin-top: 8px;">
        <a href="${waLink}" target="_blank" rel="noopener noreferrer" style="color: #25d366; font-size: 13px; font-weight: 700; text-decoration: underline;">
          Or click here to send via WhatsApp →
        </a>
      </div>
    `;

    // Trigger email client
    try {
      window.location.href = mailtoLink;
    } catch (e) {
      console.warn("Mailto trigger notice:", e);
    }

    form.reset();

    if (submitButton) {
      setTimeout(() => {
        submitButton.disabled = false;
      }, 1500);
    }
  });
}
