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
    const name = formData.get("name")?.toString().trim() || "there";
    const email = formData.get("email")?.toString().trim() || "";
    const phone = formData.get("phone")?.toString().trim() || "Not provided";
    const subject = formData.get("subject")?.toString() || "General Inquiry";
    const message = formData.get("message")?.toString().trim() || "No message provided";

    if (submitButton) submitButton.disabled = true;
    status.classList.remove("form-status--error");
    status.textContent = "Sending your message...";

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

      status.textContent = "Thanks! We've received your message and will get back to you shortly.";
      form.reset();

      // Bonus: also open the visitor's mail client if they have one set up.
      // Not required for delivery — the message above is already saved.
      const mailtoLink = `mailto:support@CARRENTPE.com?subject=${encodeURIComponent(
        subject
      )}&body=${encodeURIComponent(
        `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\n\nMessage:\n${message}`
      )}`;
      window.location.href = mailtoLink;
    } catch (error) {
      console.error("Error saving contact message:", error);
      status.textContent = "Couldn't send your message — please try again or call us directly.";
      status.classList.add("form-status--error");
    } finally {
      if (submitButton) submitButton.disabled = false;
    }
  });
}
