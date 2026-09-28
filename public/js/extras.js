// Small hidden touches: the Konami code unlocks a secret profile, and an idle
// visitor gets Netflix's "Are you still watching?" prompt.
import { h, icons, svg } from './dom.js';

const KONAMI = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
const IDLE_MS = 2 * 60 * 1000;

export function initKonami(onUnlock) {
  let progress = 0;
  document.addEventListener('keydown', (e) => {
    if (e.target.closest?.('input, textarea, select')) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    // On a miss, the key may itself start a new attempt.
    progress = key === KONAMI[progress] ? progress + 1 : key === KONAMI[0] ? 1 : 0;
    if (progress === KONAMI.length) {
      progress = 0;
      onUnlock();
    }
  });
}

// Shows the prompt once per session, after IDLE_MS without input, and only
// while `isWatching()` says the visitor is on the browse screen.
export function initStillWatching({ isWatching, resumeUrl, openContact }) {
  let timer = 0;
  let dialog;
  const shown = () => {
    try { return sessionStorage.getItem('stillWatching') === '1'; } catch { return false; }
  };

  const arm = () => {
    clearTimeout(timer);
    if (!shown()) timer = setTimeout(prompt, IDLE_MS);
  };

  function prompt() {
    // Don't cover a half-written message or an open terminal.
    if (!isWatching() || document.querySelector('dialog[open]')) return arm();
    try { sessionStorage.setItem('stillWatching', '1'); } catch { /* private mode */ }
    dialog ??= build();
    dialog.showModal();
    dialog.querySelector('.still__continue').focus();
  }

  function build() {
    const el = h('dialog', { class: 'still', 'aria-labelledby': 'still-title' },
      h('p', { class: 'still__kicker' }, 'Still there?'),
      h('h2', { class: 'still__title', id: 'still-title' }, 'Are you still watching Krish’s portfolio?'),
      h('div', { class: 'still__actions' },
        h('button', { class: 'btn btn--white still__continue', type: 'button', onClick: () => el.close() }, svg(icons.play), 'Continue Watching'),
        h('a', { class: 'btn btn--grey', href: resumeUrl(), download: true, dataset: { track: 'resume' }, onClick: () => el.close() }, svg(icons.download), 'Take the Resume to Go'),
        h('button', { class: 'btn btn--red', type: 'button', onClick: () => { el.close(); openContact(); } }, svg(icons.mail), 'Talk to Krish')));
    document.body.append(el);
    return el;
  }

  for (const type of ['pointermove', 'pointerdown', 'keydown', 'scroll', 'touchstart']) {
    addEventListener(type, arm, { passive: true });
  }
  arm();
}
