import { api } from './api.js';
import { openLab } from './backtest.js';
import { avatar, h, icons, svg } from './dom.js';
import { initKonami, initStillWatching } from './extras.js';
import { matchFor } from './match.js';
import { playTadum } from './sound.js';
import { initTerminal, openTerminal } from './terminal.js';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const screens = { intro: $('#intro'), picker: $('#picker'), browse: $('#browse') };
const detail = $('#detail');
const contact = $('#contact');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const canHover = matchMedia('(hover: hover) and (min-width: 760px)');

const state = { page: null, owner: null };

const TYPE_LABEL = { series: 'Series', project: 'Project', experience: 'Experience', education: 'Education', skills: 'Skills' };

// ------------------------------------------------------------------ routing

function showScreen(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  document.body.style.overflow = name === 'intro' ? 'hidden' : '';
}

async function route() {
  closePreview();
  const match = location.hash.match(/^#\/browse\/([\w-]+)/);
  if (match) return showBrowse(match[1]);
  if (!sessionStorage.getItem('introPlayed')) await playIntro();
  return showPicker();
}

// ------------------------------------------------------------------ intro

function playIntro() {
  try { sessionStorage.setItem('introPlayed', '1'); } catch { /* private mode */ }
  if (reducedMotion.matches) return Promise.resolve();
  showScreen('intro');
  return new Promise((resolve) => {
    const letter = $('.intro__letter');
    const done = () => {
      letter.removeEventListener('animationend', done);
      resolve();
    };
    letter.addEventListener('animationend', done);
    $('.intro__skip').addEventListener('click', done, { once: true });
    setTimeout(done, 3200); // safety net if animationend never fires
  });
}

// ------------------------------------------------------------------ picker

async function showPicker() {
  showScreen('picker');
  document.title = 'Who’s watching? · Krish Bansal';
  const list = $('.picker__list');
  if (list.childElementCount) return;
  try {
    const { owner, profiles } = await api.profiles();
    const tagline = { recruiter: 'Start here · 30-second view', krish: 'The director’s cut' };
    // For visitors who only want the PDF, don't make them pick a profile first.
    $('.picker__quick').replaceChildren(
      h('a', { href: owner.resumeUrl, download: true, dataset: { track: 'resume' } }, svg(icons.download), 'Download resume (PDF)'),
      ...owner.links.map((link) => h('a', { href: link.url, target: '_blank', rel: 'noopener' }, link.label)));
    list.replaceChildren(
      ...profiles.map((p) =>
        h('li', {},
          h('button', {
            class: 'profile-tile', type: 'button',
            onClick: () => {
              playTadum();
              api.track('profile_select', p.id);
              location.hash = `#/browse/${p.id}`;
            },
          },
          avatar(p),
          h('span', { class: 'profile-tile__name' }, p.name),
          h('span', { class: 'profile-tile__tag' }, tagline[p.id] ?? '')),
        ),
      ),
    );
    list.querySelector('button')?.focus({ preventScroll: true });
  } catch (err) {
    list.replaceChildren(h('li', { class: 'picker__hint' }, `Couldn’t load profiles: ${err.message}`));
  }
}

// ------------------------------------------------------------------ browse

async function showBrowse(profileId) {
  showScreen('browse');
  resetSearch();
  window.scrollTo(0, 0);
  const rows = $('.rows');
  const hero = $('.hero');

  if (state.page?.profile.id !== profileId) {
    hero.replaceChildren();
    rows.replaceChildren(...skeletonRows());
  }

  let page;
  try {
    page = await api.browse(profileId);
  } catch (err) {
    if (err.status === 404) { location.hash = '#/'; return; }
    rows.replaceChildren(h('p', { class: 'results__empty row__title' }, `Couldn’t load this profile: ${err.message}`));
    return;
  }

  state.page = page;
  state.owner = page.owner;
  document.title = `${page.profile.name} · Krish Bansal`;
  renderAccount(page);
  renderHero(page);
  renderRows(page);
  renderFooter(page.owner);
  renderContactLinks(page.owner);
  observeSections();
  renderBecauseRow();
}

function skeletonRows() {
  return [0, 1, 2].map(() =>
    h('section', { class: 'row skeleton' },
      h('div', { class: 'row__title' }),
      h('div', { class: 'row__track' }, ...Array.from({ length: 6 }, () => h('div', { class: 'card' })))));
}

function renderAccount(page) {
  $('.account__avatar').replaceChildren(avatar(page.profile));
  const menu = $('.account__menu');
  menu.replaceChildren(
    ...page.others.map((p) =>
      h('button', { type: 'button', role: 'menuitem', onClick: () => { location.hash = `#/browse/${p.id}`; } },
        avatar(p), p.name)),
    h('hr'),
    h('button', { type: 'button', role: 'menuitem', onClick: () => { location.hash = '#/'; } }, 'Switch Profiles'),
    h('a', { href: page.owner.resumeUrl, download: true, role: 'menuitem', dataset: { track: 'resume' } }, 'Download Resume'),
    h('button', { type: 'button', role: 'menuitem', onClick: openContact }, 'Contact Krish'),
  );
}

function renderHero({ hero: item, owner }) {
  const isSeries = item.type === 'series';
  const actions = isSeries
    ? [
      h('a', { class: 'btn btn--white', href: owner.resumeUrl, download: true, dataset: { track: 'resume' } }, svg(icons.download), 'Resume'),
      h('button', { class: 'btn btn--grey', type: 'button', onClick: () => openDetail(item.id) }, svg(icons.info), 'More Info'),
      h('button', { class: 'btn btn--red', type: 'button', onClick: openContact }, svg(icons.mail), 'Contact'),
    ]
    : [
      h('button', { class: 'btn btn--white', type: 'button', onClick: () => openDetail(item.id) }, svg(icons.play), 'Play'),
      h('button', { class: 'btn btn--grey', type: 'button', onClick: () => openDetail(item.id) }, svg(icons.info), 'More Info'),
    ];

  $('.hero').replaceChildren(
    h('div', { class: 'hero__art', dataset: { glyph: item.art.glyph }, vars: artVars(item) }),
    h('div', { class: 'hero__content' },
      h('div', { class: 'hero__kicker' }, h('b', {}, 'K'), TYPE_LABEL[item.type] ?? item.type),
      h('h1', { class: 'hero__title' }, item.title),
      h('p', { class: 'hero__subtitle' }, item.subtitle),
      isSeries && heroFacts(owner),
      h('p', { class: 'hero__summary' }, item.summary),
      h('div', { class: 'hero__actions' }, ...actions),
      isSeries && heroLinks(owner)),
    item.rating && h('div', { class: 'hero__rating' }, item.rating),
  );
  // The hero's backdrop reuses the item's gradient.
  $('.hero__art').style.background = `linear-gradient(120deg, ${item.art.to} 0%, ${item.art.from} 100%)`;
}

// The five-second read for a recruiter: degree, graduation, and whether I'm
// looking, above the summary so it lands before any scrolling or clicking.
function heroFacts(owner) {
  if (!owner.facts?.length && !owner.availability) return null;
  return h('ul', { class: 'hero__facts' },
    owner.availability && h('li', { class: 'hero__status' }, owner.availability),
    ...(owner.facts ?? []).map((fact) => h('li', {}, fact)));
}

function heroLinks(owner) {
  return h('p', { class: 'hero__links' },
    h('a', { href: `mailto:${owner.email}` }, owner.email),
    ...owner.links.map((link) => h('a', { href: link.url, target: '_blank', rel: 'noopener' }, link.label)));
}

function renderRows(page) {
  const seenSections = new Set();
  $('.rows').replaceChildren(
    ...page.rows.map((row) => {
      // Only the first row of each section is the nav target.
      const anchor = row.section && !seenSections.has(row.section) ? row.section : null;
      if (anchor) seenSections.add(row.section);
      return renderRow(row, anchor);
    }),
  );
}

function renderRow(row, anchor) {
  const track = h('div', { class: 'row__track', role: 'list' },
    ...row.items.map((item, i) => {
      if (row.variant === 'ranked') {
        return h('div', { class: 'ranked', role: 'listitem' },
          h('span', { class: 'ranked__num', 'aria-hidden': 'true' }, String(i + 1)),
          card(item, { label: `Number ${i + 1}: ${item.title}` }));
      }
      const c = card(item, { progress: row.variant === 'progress' });
      c.setAttribute('role', 'listitem');
      return c;
    }));

  const prev = h('button', { class: 'row__arrow row__arrow--prev', type: 'button', 'aria-label': `Scroll ${row.title} left`, disabled: true }, svg(icons.chevronL));
  const next = h('button', { class: 'row__arrow row__arrow--next', type: 'button', 'aria-label': `Scroll ${row.title} right` }, svg(icons.chevronR));
  const scroll = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  prev.addEventListener('click', () => scroll(-1));
  next.addEventListener('click', () => scroll(1));
  const sync = () => {
    prev.disabled = track.scrollLeft <= 4;
    next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 4;
  };
  track.addEventListener('scroll', () => { closePreview(); sync(); }, { passive: true });
  requestAnimationFrame(sync);
  new ResizeObserver(sync).observe(track);

  return h('section', { class: `row row--${row.variant}`, id: anchor, 'aria-label': row.title },
    h('h2', { class: 'row__title' }, row.title),
    h('div', { class: 'row__viewport' }, prev, track, next));
}

function artVars(item) {
  return { '--from': item.art?.from ?? '#333', '--to': item.art?.to ?? '#111' };
}

// Watch progress comes from the item's `progress` (0–100) in the catalog.
// Without one, fall back to a deterministic stand-in so the bar doesn't jump
// around between renders.
function progressFor(item) {
  if (Number.isFinite(item.progress)) return Math.max(0, Math.min(100, item.progress));
  let hash = 0;
  for (const ch of item.id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return 25 + (hash % 60);
}

// "Continue S1:E3 · The Deadlock": the episode the progress bar is sitting in.
function nextEpisode(item) {
  const titles = item.episodeTitles;
  if (!titles?.length) return null;
  const n = Math.min(titles.length, Math.floor((progressFor(item) / 100) * titles.length) + 1);
  return `S1:E${n} · ${titles[n - 1]}`;
}

function card(item, { progress = false, label } = {}) {
  return h('button', {
    class: 'card', type: 'button',
    'aria-label': label ?? `${item.title}: ${item.subtitle ?? ''}`,
    dataset: { id: item.id },
    vars: artVars(item),
  },
  h('span', { class: 'card__art', dataset: { glyph: item.art?.glyph ?? '' } }),
  h('span', { class: 'card__k', 'aria-hidden': 'true' }, 'K'),
  item.badge && h('span', { class: 'card__badge' }, item.badge),
  h('span', { class: 'card__title' }, item.title),
  progress && h('span', { class: 'card__progress', vars: { '--p': `${progressFor(item)}%` } }, h('i')));
}

const matchPct = (item) => matchFor(item, state.page?.profile.id ?? 'recruiter');

function metaLine(item) {
  return [
    h('span', { class: 'match' }, `${matchPct(item)}% Match`),
    item.rating && h('span', { class: 'rating' }, item.rating),
    item.period && h('span', {}, item.period),
  ];
}

// ------------------------------------------------------------------ hover preview

let previewTimer = 0;
let previewEl = null;

function findItem(id) {
  if (state.page?.hero.id === id) return state.page.hero;
  for (const row of state.page?.rows ?? []) {
    const hit = row.items.find((i) => i.id === id);
    if (hit) return hit;
  }
  return state.becauseItems?.find((i) => i.id === id)
    ?? state.searchResults?.find((i) => i.id === id) ?? null;
}

function closePreview() {
  clearTimeout(previewTimer);
  if (!previewEl) return;
  const el = previewEl;
  previewEl = null;
  el.classList.remove('is-on');
  setTimeout(() => el.remove(), 200);
}

function openPreview(cardEl) {
  const item = findItem(cardEl.dataset.id);
  if (!item || !cardEl.isConnected) return;
  closePreview();

  const rect = cardEl.getBoundingClientRect();
  const width = Math.max(rect.width * 1.5, 300);
  const artHeight = (width * 9) / 16;
  const left = Math.min(Math.max(rect.left + rect.width / 2 - width / 2, 8), innerWidth - width - 8);
  const top = rect.top + rect.height / 2 - artHeight / 2;

  // A real trailer (short muted clip, `trailer` in the catalog) if there is
  // one; otherwise the card art plays a slow animated teaser.
  const art = card(item);
  if (item.trailer && !reducedMotion.matches) {
    const video = h('video', { class: 'preview__trailer', src: item.trailer, loop: true, playsinline: true, preload: 'auto', 'aria-hidden': 'true' });
    video.muted = true; // must be the property, not just the attribute, for autoplay
    video.addEventListener('canplay', () => { video.classList.add('is-playing'); video.play().catch(() => {}); }, { once: true });
    art.append(video);
  }
  const continuing = cardEl.querySelector('.card__progress') && nextEpisode(item);

  const el = h('div', {
    class: `preview${item.trailer ? '' : ' preview--teaser'}`, role: 'presentation',
    onClick: () => openDetail(item.id),
    onMouseleave: closePreview,
  },
  art,
  h('div', { class: 'card__info' },
    continuing && h('p', { class: 'card__continue' }, 'Continue ', h('b', {}, continuing)),
    h('div', { class: 'card__buttons' },
      h('span', { class: 'card__round card__round--play' }, svg(icons.play)),
      h('span', { class: 'card__round' }, svg(icons.plus)),
      h('span', { class: 'card__round card__round--more' }, svg(icons.down))),
    h('div', { class: 'card__meta' }, ...metaLine(item)),
    item.summary && h('p', { class: 'card__summary' }, truncate(item.summary, 120)),
    h('div', { class: 'card__genres' }, ...(item.genres ?? []).slice(0, 3).map((g) => h('span', {}, g)))));

  el.style.width = `${width}px`;
  el.style.left = `${left + scrollX}px`;
  el.style.top = `${top + scrollY}px`;
  el.style.transformOrigin = `${rect.left + rect.width / 2 - left}px ${rect.height / 2 + (artHeight - rect.height) / 2}px`;
  document.body.append(el);
  previewEl = el;
  requestAnimationFrame(() => el.classList.add('is-on'));
}

function truncate(text, n) {
  return text.length > n ? `${text.slice(0, n).replace(/\s+\S*$/, '')}…` : text;
}

document.addEventListener('mouseover', (e) => {
  if (!canHover.matches) return;
  const cardEl = e.target.closest?.('.rows .card, .results__grid .card');
  if (!cardEl || cardEl.closest('.preview') || cardEl.closest('.skeleton')) return;
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => openPreview(cardEl), 450);
});
document.addEventListener('mouseout', (e) => {
  const cardEl = e.target.closest?.('.rows .card, .results__grid .card');
  if (cardEl && !cardEl.contains(e.relatedTarget) && !e.relatedTarget?.closest?.('.preview')) {
    clearTimeout(previewTimer);
  }
});
window.addEventListener('resize', closePreview);

// Cards anywhere (rows, search results) open the detail modal.
document.addEventListener('click', (e) => {
  const cardEl = e.target.closest('.card[data-id]');
  if (cardEl && !cardEl.closest('.preview')) openDetail(cardEl.dataset.id);
});

// ------------------------------------------------------------------ detail modal

async function openDetail(id) {
  closePreview();
  const body = $('.modal__body', detail);
  let data;
  try {
    data = await api.item(id);
  } catch (err) {
    toast(`Couldn’t open that title: ${err.message}`);
    return;
  }
  const { item, similar } = data;
  api.track('item_open', item.id);
  rememberWatched(item);

  const actions = [];
  if (item.lab === 'backtest') {
    actions.push(h('button', { class: 'btn btn--red', type: 'button', onClick: () => { detail.close(); openLab(); } }, svg(icons.play), 'Run a Backtest'));
  }
  for (const link of item.links ?? []) {
    actions.push(h('a', { class: 'btn btn--white', href: link.url, target: '_blank', rel: 'noopener' }, svg(icons.code), link.label));
  }
  if (item.type === 'series') {
    actions.push(h('a', { class: 'btn btn--white', href: state.owner.resumeUrl, download: true, dataset: { track: 'resume' } }, svg(icons.download), 'Download Resume'));
  }
  actions.push(h('button', { class: 'btn btn--grey', type: 'button', onClick: () => { detail.close(); openContact(); } }, svg(icons.mail), 'Ask me about this'));

  const isSkills = item.type === 'skills';
  const main = h('div', {},
    h('div', { class: 'detail__meta' }, ...metaLine(item), h('span', { class: 'rating' }, 'HD')),
    h('p', { class: 'detail__summary' }, item.summary),
    isSkills
      ? h('ul', { class: 'chips' }, ...item.tags.map((t) => h('li', {}, t)))
      : !item.episodeTitles && item.bullets?.length && h('ul', { class: 'detail__bullets' }, ...item.bullets.map((b) => h('li', {}, b))),
    state.page?.profile.commentary === true && item.commentary?.length > 0 && h('aside', { class: 'commentary' },
      h('h3', { class: 'commentary__label' }, 'Director’s Commentary'),
      ...item.commentary.map((note) => h('p', {}, note))));

  const side = h('div', { class: 'detail__side' },
    !isSkills && item.tags?.length && h('p', {}, h('span', { class: 'label' }, 'Stack: '), item.tags.join(', ')),
    item.genres?.length && h('p', {}, h('span', { class: 'label' }, 'Genres: '), item.genres.join(', ')),
    h('p', {}, h('span', { class: 'label' }, 'Type: '), TYPE_LABEL[item.type] ?? item.type),
    item.period && h('p', {}, h('span', { class: 'label' }, 'Released: '), item.period));

  body.replaceChildren(
    h('div', { class: 'detail__banner', dataset: { glyph: item.art?.glyph ?? '' }, vars: artVars(item) },
      h('div', { class: 'detail__head' },
        h('h2', { class: 'detail__title', id: 'detail-title' }, item.title),
        item.subtitle && h('p', { class: 'detail__subtitle' }, item.subtitle),
        h('div', { class: 'detail__actions' }, ...actions))),
    h('div', { class: 'detail__content' }, main, side),
    item.episodeTitles && episodeList(item),
    similar?.length > 0 && h('section', { class: 'detail__more' },
      h('h3', {}, 'More Like This'),
      h('div', { class: 'more-grid' },
        ...similar.map((s) =>
          h('button', { class: 'more-card', type: 'button', onClick: () => openDetail(s.id) },
            h('span', { class: 'more-card__art', vars: artVars(s) }, s.title),
            h('span', { class: 'more-card__body' },
              h('span', { class: 'match' }, `${matchPct(s)}% Match · ${s.period ?? ''}`),
              truncate(s.summary ?? '', 110),
              s.because && h('span', { class: 'more-card__why', title: `Jaccard similarity of tags and genres: ${s.because.score}` },
                h('span', { class: 'label' }, 'In common: '), s.because.shared.slice(0, 3).join(', '))))))),
  );

  if (!detail.open) detail.showModal();
  detail.scrollTop = 0;
}

// A project's bullets, presented as a season of episodes.
function episodeList(item) {
  return h('section', { class: 'episodes' },
    h('div', { class: 'episodes__head' },
      h('h3', {}, 'Episodes'),
      h('span', { class: 'episodes__season' }, `Season 1${item.period ? ` · ${item.period}` : ''}`)),
    h('ol', { class: 'episodes__list' },
      ...item.episodeTitles.map((title, i) =>
        h('li', { class: 'episode' },
          h('span', { class: 'episode__num', 'aria-hidden': 'true' }, String(i + 1)),
          h('span', { class: 'episode__thumb', vars: artVars(item), 'aria-hidden': 'true' }, `E${i + 1}`),
          h('div', { class: 'episode__body' },
            h('h4', { class: 'episode__title' }, title),
            h('p', { class: 'episode__desc' }, item.bullets[i]))))));
}

// ------------------------------------------------------------------ because you watched

const WATCHED_KEY = 'lastWatched';

function rememberWatched(item) {
  if (item.type === 'series' || item.type === 'skills') return;
  try { localStorage.setItem(WATCHED_KEY, JSON.stringify({ id: item.id, title: item.title })); } catch { /* storage blocked */ }
}

function lastWatched() {
  try { return JSON.parse(localStorage.getItem(WATCHED_KEY)); } catch { return null; }
}

// Slots a "Because you watched X" row in under the first row, built from the
// same tag-similarity ranking as "More Like This".
async function renderBecauseRow() {
  const last = lastWatched();
  const current = $('.row--because');
  if (!last?.id || !state.page || current?.dataset.source === last.id) return;
  let similar;
  try {
    ({ similar } = await api.item(last.id));
  } catch {
    return; // the title was removed from the catalog: just skip the row
  }
  if (!similar?.length || lastWatched()?.id !== last.id) return;
  state.becauseItems = similar;
  const row = renderRow({ title: `Because you watched ${last.title}`, variant: 'because', items: similar });
  row.dataset.source = last.id;
  $('.row--because')?.remove();
  $('.rows > .row')?.after(row);
}

// ------------------------------------------------------------------ contact

function openContact() {
  closePreview();
  $('.account__menu').hidden = true;
  if (!contact.open) contact.showModal();
  $('input[name="name"]', contact).focus();
}

function renderContactLinks(owner) {
  $('.contact__direct').replaceChildren(
    h('a', { href: `mailto:${owner.email}` }, owner.email),
    ...owner.links.map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label)),
  );
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function validateContact(data) {
  const errors = {};
  if (!data.name.trim()) errors.name = 'Please tell me your name.';
  if (!EMAIL_RE.test(data.email.trim())) errors.email = 'That email doesn’t look right.';
  if (data.message.trim().length < 10) errors.message = 'Message should be at least 10 characters.';
  return errors;
}

function showFieldErrors(form, errors) {
  for (const field of $$('.field', form)) {
    const input = $('input, textarea', field);
    const msg = errors[input.name] ?? '';
    field.classList.toggle('is-invalid', Boolean(msg));
    $('.field__error', field).textContent = msg;
    input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  const first = Object.keys(errors)[0];
  if (first) form.elements[first].focus();
}

$('.contact__form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  const status = $('.contact__status', form);
  const button = $('button[type="submit"]', form);
  const data = Object.fromEntries(new FormData(form));

  const errors = validateContact(data);
  showFieldErrors(form, errors);
  if (Object.keys(errors).length) return;

  button.disabled = true;
  button.textContent = 'Sending…';
  status.className = 'contact__status';
  status.textContent = '';
  try {
    const result = await api.contact(data);
    status.classList.add('is-ok');
    if (result?.via === 'email') {
      status.textContent = 'Your email app should open with the message ready to send.';
    } else {
      form.reset();
      status.textContent = 'Message sent. I’ll get back to you soon!';
      toast('Message sent ✓');
    }
  } catch (err) {
    if (err.body?.fields) showFieldErrors(form, err.body.fields);
    status.classList.add('is-err');
    status.textContent = err.message;
  } finally {
    button.disabled = false;
    button.textContent = 'Send message';
  }
});

// ------------------------------------------------------------------ search

let searchTimer = 0;
const searchForm = $('.search');
const searchInput = $('.search__input');

function resetSearch() {
  searchInput.value = '';
  searchForm.classList.remove('is-open');
  showResults(null);
}

function showResults(query, results = []) {
  const searching = query != null;
  $('.hero').hidden = searching;
  $('.rows').hidden = searching;
  $('.results').hidden = !searching;
  state.searchResults = results;
  if (!searching) return;

  $('.results__title').replaceChildren('Results for ', h('b', {}, `“${query}”`));
  $('.results__grid').replaceChildren(
    ...(results.length
      ? results.map((item) => card(item))
      : [h('p', { class: 'results__empty' },
        `No titles match “${query}”. Try a language (Python), a tool (Docker), or a topic (quant).`)]),
  );
}

$('.search__toggle').addEventListener('click', () => {
  const open = searchForm.classList.toggle('is-open');
  if (open) searchInput.focus();
  else resetSearch();
});
searchForm.addEventListener('submit', (e) => e.preventDefault());
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimer);
  const q = searchInput.value.trim();
  if (!q) { showResults(null); return; }
  searchTimer = setTimeout(async () => {
    try {
      const { results } = await api.search(q);
      if (searchInput.value.trim() === q) {
        window.scrollTo(0, 0);
        showResults(q, results);
      }
    } catch (err) {
      toast(`Search failed: ${err.message}`);
    }
  }, 220);
});
searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    resetSearch();
    searchInput.blur(); // the box collapses; don't leave focus (and keystrokes) in it
  }
});
searchInput.addEventListener('blur', () => {
  if (!searchInput.value) searchForm.classList.remove('is-open');
});

// ------------------------------------------------------------------ nav & chrome

const nav = $('#nav');
window.addEventListener('scroll', () => {
  nav.classList.toggle('is-solid', scrollY > 10);
  closePreview();
}, { passive: true });

$$('[data-scroll]').forEach((link) => link.addEventListener('click', (e) => {
  e.preventDefault();
  resetSearch();
  const target = link.dataset.scroll === 'top' ? null : document.getElementById(link.dataset.scroll);
  if (target) target.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth' });
  else window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' });
}));

$$('[data-action="contact"]').forEach((el) => el.addEventListener('click', (e) => {
  e.preventDefault();
  openContact();
}));

let sectionObserver;
function observeSections() {
  sectionObserver?.disconnect();
  const links = $$('.nav__links a[data-scroll]');
  sectionObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const key = entry.target.classList.contains('hero') ? 'top' : entry.target.id;
      links.forEach((a) => a.classList.toggle('is-active', a.dataset.scroll === key));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('.row[id]').forEach((row) => sectionObserver.observe(row));
  sectionObserver.observe($('.hero'));
}

// Account dropdown
const accountBtn = $('.account__btn');
const accountMenu = $('.account__menu');
accountBtn.addEventListener('click', () => {
  const open = accountMenu.hidden;
  accountMenu.hidden = !open;
  accountBtn.setAttribute('aria-expanded', String(open));
});
document.addEventListener('click', (e) => {
  if (!e.target.closest('.account')) {
    accountMenu.hidden = true;
    accountBtn.setAttribute('aria-expanded', 'false');
  }
});

// Modals: close button + click on backdrop
for (const dialog of [detail, contact, $('#lab')]) {
  $('.modal__close', dialog).addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
}
// Coming back from a title updates the "Because you watched" row.
detail.addEventListener('close', renderBecauseRow);

// Resume download analytics (delegated so dynamically rendered links count too)
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-track="resume"]')) api.track('resume_download', 'resume');
});

function renderFooter(owner) {
  $('.footer__year').textContent = new Date().getFullYear();
  $('.footer__links').replaceChildren(
    ...owner.links.map((l) => h('a', { href: l.url, target: '_blank', rel: 'noopener' }, l.label)),
    h('a', { href: `mailto:${owner.email}` }, 'Email'),
    h('a', { href: owner.resumeUrl, download: true, dataset: { track: 'resume' } }, 'Resume (PDF)'),
    h('button', { type: 'button', onClick: openContact }, 'Contact'),
    h('button', { type: 'button', onClick: () => { location.hash = '#/'; } }, 'Switch Profile'),
    h('button', { type: 'button', onClick: openTerminal, title: 'Or press ` anywhere' }, 'Terminal Mode'),
  );
}

let toastTimer = 0;
function toast(message) {
  const el = $('.toast');
  el.textContent = message;
  el.classList.add('is-on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('is-on'), 2600);
}

// ------------------------------------------------------------------ extras

// Every title reachable from the visible profiles, for the terminal.
async function allItems() {
  const { profiles } = await api.profiles();
  const pages = await Promise.all(profiles.map((p) => api.browse(p.id)));
  const byId = new Map();
  for (const page of pages) {
    for (const item of [page.hero, ...page.rows.flatMap((r) => r.items)]) byId.set(item.id, item);
  }
  return [...byId.values()];
}

initTerminal({ items: allItems, owner: api.profiles, openDetail, openContact, openLab });

initKonami(() => {
  playTadum();
  toast('Secret profile unlocked: Bloopers');
  location.hash = '#/browse/bloopers';
});

initStillWatching({
  isWatching: () => !screens.browse.hidden,
  resumeUrl: () => state.owner?.resumeUrl ?? 'Krish_Bansal_Resume.pdf',
  openContact,
});

// ------------------------------------------------------------------ boot

window.addEventListener('hashchange', route);
route();
