// Minimal hyperscript helper. Text is always inserted as text nodes, so
// catalog content can never inject markup.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'vars') for (const [k, v] of Object.entries(value)) el.style.setProperty(k, v);
    else if (key.startsWith('on')) el.addEventListener(key.slice(2).toLowerCase(), value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  el.append(...children.flat().filter((c) => c != null && c !== false));
  return el;
}

// Static, trusted SVG snippets only.
export function svg(markup) {
  const tpl = document.createElement('template');
  tpl.innerHTML = markup.trim();
  return tpl.content.firstElementChild;
}

export const icons = {
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4v16l14-8z"/></svg>',
  info: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm1 15h-2v-6h2zm0-8h-2V7h2z"/></svg>',
  download: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 3h2v10l3.5-3.5 1.4 1.4L12 16.8l-5.9-5.9 1.4-1.4L11 13zM4 19h16v2H4z"/></svg>',
  mail: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zm2 2v.4l7 4.6 7-4.6V7zm14 2.8-7 4.6-7-4.6V17h14z"/></svg>',
  code: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8.6 16.6-4.6-4.6 4.6-4.6L7.2 6 1.2 12l6 6zm6.8 0 4.6-4.6-4.6-4.6L16.8 6l6 6-6 6z"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/></svg>',
  chevronL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5 8 12l7 7"/></svg>',
  chevronR: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
};

const faces = {
  smile: '<circle cx="34" cy="40" r="5"/><circle cx="66" cy="40" r="5"/><path d="M28 62q22 20 44 0" fill="none" stroke-width="6" stroke-linecap="round"/>',
  grin: '<rect x="28" y="34" width="10" height="10" rx="2"/><rect x="62" y="34" width="10" height="10" rx="2"/><path d="M26 58h48q-4 20-24 20t-24-20z"/>',
};

export function avatar(profile, className = '') {
  const color = /^#[0-9a-f]{3,8}$/i.test(profile.color) ? profile.color : '#555';
  const el = svg(`<svg viewBox="0 0 100 100" aria-hidden="true">
    <rect width="100" height="100" fill="${color}"/>
    <g fill="#fff" stroke="#fff">${faces[profile.face] ?? faces.smile}</g>
  </svg>`);
  return h('span', { class: `avatar ${className}`.trim() }, el);
}
