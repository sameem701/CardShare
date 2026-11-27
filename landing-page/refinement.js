'use strict';

const track = document.getElementById('case-track');
const control = document.getElementById('case-control');
const phrases = Array.from(track.children);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
const sectionLinks = new Set(['#join', '#how', '#faq', '#main']);

function clearSectionFragment() {
  if (!sectionLinks.has(window.location.hash)) return;
  const { pathname, search } = window.location;
  window.history.replaceState(window.history.state, '', pathname + search);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

clearSectionFragment();
window.addEventListener('hashchange', clearSectionFragment);

document.addEventListener('click', (event) => {
  if (
    event.defaultPrevented || event.button !== 0 ||
    event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
  ) return;

  const fragment = event.target.closest('a[href]')?.getAttribute('href');
  if (!sectionLinks.has(fragment)) return;
  const section = document.getElementById(fragment.slice(1));
  if (!section) return;

  event.preventDefault();
  section.tabIndex = -1;
  section.focus({ preventScroll: true });
  section.scrollIntoView({ behavior: reduced.matches || fragment === '#main' ? 'instant' : 'smooth' });
});

let active = 0;
let paused = false;
let visible = false;
let timer;

function updateRotation() {
  clearInterval(timer);
  control.hidden = reduced.matches;
  control.setAttribute('aria-pressed', String(paused));
  control.textContent = paused ? 'Resume examples' : 'Pause examples';
  if (paused || reduced.matches || document.hidden || !visible) return;
  timer = setInterval(() => {
    phrases[active].classList.remove('current');
    active = (active + 1) % phrases.length;
    phrases[active].classList.add('current');
  }, 3400);
}

function toggleRotation() {
  if (reduced.matches) return;
  paused = !paused;
  updateRotation();
}

track.addEventListener('click', toggleRotation);
control.addEventListener('click', toggleRotation);
document.addEventListener('click', (event) => {
  if (paused && !track.contains(event.target) && !control.contains(event.target)) {
    paused = false;
    updateRotation();
  }
});
document.addEventListener('visibilitychange', updateRotation);
reduced.addEventListener('change', updateRotation);
if ('IntersectionObserver' in window) {
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    updateRotation();
  }).observe(track);
} else {
  visible = true;
  updateRotation();
}
