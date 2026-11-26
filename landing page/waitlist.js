'use strict';

const form = document.getElementById('waitlist');
const email = document.getElementById('email');
const statusMessage = document.getElementById('waitlist-progress');
const confirmation = document.getElementById('waitlist-confirmation');
const submit = form.querySelector('button[type="submit"]');

function showConfirmation() {
  statusMessage.textContent = '';
  confirmation.classList.add('confirmed');
  confirmation.parentElement.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    confirmation.animate(
      [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)' }],
      { duration: 1150, easing: 'cubic-bezier(.25, .1, .25, 1)' },
    );
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submit.disabled || !form.reportValidity()) return;
  const address = email.value.trim();

  const data = new URLSearchParams(new FormData(form));
  data.set('email', address);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  submit.disabled = true;
  form.setAttribute('aria-busy', 'true');
  statusMessage.textContent = 'Joining the waitlist…';
  try {
    const response = await fetch(form.action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: data,
      signal: controller.signal,
    });
    if (!response.ok) throw new Error('Waitlist rejected the request');
    const receipt = await response.json();
    if (receipt?.ok !== true) throw new Error('Waitlist did not return its receipt');
    form.reset();
    email.disabled = true;
    document.getElementById('consent').disabled = true;
    submit.setAttribute('aria-label', 'Joined');
    submit.classList.add('joined');
    showConfirmation();
  } catch {
    statusMessage.textContent = 'We couldn’t confirm your signup. Please try again.';
    submit.disabled = false;
  } finally {
    clearTimeout(timeout);
    form.removeAttribute('aria-busy');
  }
});
