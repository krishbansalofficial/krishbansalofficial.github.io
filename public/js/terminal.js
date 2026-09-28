// Terminal mode: press ` (or ~) anywhere to browse the portfolio from a shell.
// It reads the same catalog as the UI, and every line of output is inserted as
// text, so catalog content can't inject markup here either.
import { h } from './dom.js';

const PROMPT = 'guest@krish:~$';
const SECTIONS = { projects: 'project', experience: 'experience', education: 'education', skills: 'skills' };

let hooks;
let dialog, screen, input;
const history = [];
let historyIndex = 0;

export function initTerminal(options) {
  hooks = options;
  document.addEventListener('keydown', (e) => {
    if ((e.key === '`' || e.key === '~') && !isTyping(e.target) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      openTerminal();
    }
  });
}

function isTyping(el) {
  return el.closest?.('input, textarea, select, [contenteditable="true"]');
}

export function openTerminal() {
  if (!dialog) build();
  if (!dialog.open) dialog.showModal();
  input.focus();
}

function build() {
  screen = h('div', { class: 'term__screen', role: 'log', 'aria-live': 'polite' });
  input = h('input', {
    class: 'term__input', 'aria-label': 'Terminal command', autocomplete: 'off',
    autocapitalize: 'off', spellcheck: 'false',
  });
  const form = h('form', { class: 'term__line', onSubmit: (e) => { e.preventDefault(); submit(); } },
    h('span', { class: 'term__prompt' }, PROMPT), input);
  dialog = h('dialog', { class: 'term', 'aria-label': 'Terminal' },
    h('div', { class: 'term__bar' },
      h('span', {}, h('i'), h('i'), h('i')),
      h('span', { class: 'term__name' }, 'krish — zsh'),
      h('button', { class: 'term__close', type: 'button', 'aria-label': 'Close terminal', onClick: () => dialog.close() }, '×')),
    h('div', { class: 'term__body', onClick: () => input.focus() }, screen, form));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  input.addEventListener('keydown', onKey);
  document.body.append(dialog);

  print('Welcome to KrishOS. Type `help` to see what you can do, or `exit` to go back.', 'dim');
}

function print(text, tone) {
  screen.append(h('div', { class: tone ? `term__out term__out--${tone}` : 'term__out' }, text));
  screen.parentElement.scrollTop = screen.parentElement.scrollHeight;
}

function onKey(e) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    historyIndex = Math.max(0, Math.min(history.length, historyIndex + (e.key === 'ArrowUp' ? -1 : 1)));
    input.value = history[historyIndex] ?? '';
  } else if (e.key === 'Tab') {
    e.preventDefault();
    complete();
  } else if (e.key === 'l' && e.ctrlKey) {
    e.preventDefault();
    screen.replaceChildren();
  }
}

async function complete() {
  const parts = input.value.split(' ');
  const partial = parts.at(-1).toLowerCase();
  const pool = parts.length === 1
    ? Object.keys(COMMANDS)
    : parts[0] === 'ls' ? Object.keys(SECTIONS) : (await hooks.items()).map((i) => i.id);
  const hits = pool.filter((w) => w.startsWith(partial));
  if (hits.length === 1) {
    parts[parts.length - 1] = hits[0];
    input.value = `${parts.join(' ')} `;
  } else if (hits.length > 1) {
    print(hits.join('  '), 'dim');
  }
}

async function submit() {
  const line = input.value.trim();
  input.value = '';
  print(`${PROMPT} ${line}`, 'echo');
  if (!line) return;
  history.push(line);
  historyIndex = history.length;

  const [cmd, ...args] = line.split(/\s+/);
  const run = COMMANDS[cmd.toLowerCase()];
  if (!run) {
    print(`zsh: command not found: ${cmd}. Try \`help\`.`, 'err');
    return;
  }
  try {
    await run(args, line);
  } catch (err) {
    print(err.message, 'err');
  }
}

async function findItem(id) {
  if (!id) throw new Error('Which title? Try `ls` to see ids.');
  const items = await hooks.items();
  const item = items.find((i) => i.id === id.toLowerCase());
  if (!item) throw new Error(`No such title: ${id}. Try \`ls\` or press Tab to complete.`);
  return item;
}

function leaveAnd(action) {
  dialog.close();
  action();
}

const COMMANDS = {
  help() {
    print([
      'whoami              who is this guy',
      'ls [section]        list titles: projects, experience, education, skills',
      'cat <id>            print a title',
      'open <id>           open a title in the UI',
      'search <terms>      full-text search',
      'backtest            launch Backtest Theater',
      'resume              download the resume',
      'contact             send Krish a message',
      'profile <name>      switch profile (recruiter, krish)',
      'clear               clear the screen (or Ctrl+L)',
      'exit                back to the site',
    ].join('\n'));
  },
  async whoami() {
    const { owner } = await hooks.owner();
    print(`${owner.name}: ${owner.headline}.\n${owner.email} · ${owner.links.map((l) => l.url).join(' · ')}`);
  },
  async ls([section]) {
    const items = (await hooks.items()).filter((i) => i.type !== 'series');
    const type = section && SECTIONS[section.toLowerCase().replace(/\/$/, '')];
    if (section && !type) throw new Error(`ls: ${section}: No such section. Try: ${Object.keys(SECTIONS).join(', ')}`);
    const shown = type ? items.filter((i) => i.type === type) : items;
    const width = Math.max(...shown.map((i) => i.id.length)) + 2;
    print(shown.map((i) => `${i.id.padEnd(width)}${i.title}${i.period ? `  (${i.period})` : ''}`).join('\n'));
  },
  async cat([id]) {
    const item = await findItem(id);
    const lines = [item.title.toUpperCase(), item.subtitle, item.period, '', item.summary];
    if (item.bullets?.length) lines.push('', ...item.bullets.map((b) => `  • ${b}`));
    if (item.tags?.length) lines.push('', `stack: ${item.tags.join(', ')}`);
    for (const link of item.links ?? []) lines.push(`${link.label.toLowerCase()}: ${link.url}`);
    print(lines.filter((l) => l != null).join('\n'));
  },
  async open([id]) {
    const item = await findItem(id);
    leaveAnd(() => hooks.openDetail(item.id));
  },
  async search(args) {
    const q = args.join(' ');
    if (!q) throw new Error('search: what should I look for?');
    const items = await hooks.items();
    const terms = q.toLowerCase().split(/\s+/);
    const hits = items.filter((item) => {
      const text = [item.title, item.subtitle, item.summary, ...(item.bullets ?? []), ...(item.tags ?? [])].join(' ').toLowerCase();
      return terms.every((t) => text.includes(t));
    });
    print(hits.length ? hits.map((i) => `${i.id}  ${i.title}`).join('\n') : `No matches for “${q}”.`, hits.length ? null : 'dim');
  },
  backtest() {
    leaveAnd(() => hooks.openLab());
  },
  async resume() {
    const { owner } = await hooks.owner();
    const a = h('a', { href: owner.resumeUrl, download: true });
    a.click();
    print('Downloading Krish_Bansal_Resume.pdf…', 'ok');
  },
  contact() {
    leaveAnd(() => hooks.openContact());
  },
  profile([name]) {
    if (!name) throw new Error('profile: which one? recruiter or krish');
    leaveAnd(() => { location.hash = `#/browse/${encodeURIComponent(name.toLowerCase())}`; });
  },
  clear() {
    screen.replaceChildren();
  },
  exit() {
    dialog.close();
  },
  sudo(args, line) {
    if (/^sudo\s+hire\s+krish$/i.test(line)) {
      print('[sudo] password for recruiter: ********\nAccess granted. Opening a line to Krish…', 'ok');
      setTimeout(() => leaveAnd(() => hooks.openContact()), 1200);
    } else {
      print('guest is not in the sudoers file. This incident will be reported. (Hint: sudo hire krish)', 'err');
    }
  },
  rm(args) {
    print(args.includes('-rf') ? 'Nice try. This portfolio has backups.' : 'rm: permission denied', 'err');
  },
  vim() {
    print('You are now trapped in vim. Just kidding: type `exit`.', 'dim');
  },
  netflix() {
    print('…and chill? Try `open portfolio`.', 'dim');
  },
};
