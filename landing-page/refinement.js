'use strict';

const track = document.getElementById('case-track');
const control = document.getElementById('case-control');
const phrases = Array.from(track.children);
const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
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
