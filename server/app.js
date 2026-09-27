import express from 'express';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.js';
import { JsonStore } from './jsonStore.js';
import { rateLimit } from './rateLimit.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const TRACKABLE_EVENTS = new Set(['profile_select', 'item_open', 'resume_download']);

export function createApp({
  catalogFile = path.join(ROOT, 'data', 'portfolio.json'),
  storageDir = path.join(ROOT, 'storage'),
  adminToken = process.env.ADMIN_TOKEN,
  contactLimit = { windowMs: 10 * 60 * 1000, max: 5 },
} = {}) {
  const catalog = loadCatalog(catalogFile);
  const messages = new JsonStore(path.join(storageDir, 'messages.json'), []);
  const stats = new JsonStore(path.join(storageDir, 'stats.json'), { events: {} });

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '16kb' }));

  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' data:",
        "frame-ancestors 'none'",
      ].join('; '),
    });
    next();
  });

  // ---------- Public read API ----------
  const api = express.Router();

  api.get('/health', (req, res) => res.json({ ok: true }));

  api.get('/profiles', (req, res) => {
    res.json({ owner: catalog.owner, profiles: catalog.listProfiles() });
  });

  api.get('/browse/:profileId', (req, res) => {
    const page = catalog.browse(req.params.profileId);
    if (!page) return res.status(404).json({ error: 'Unknown profile' });
    res.json(page);
  });

  api.get('/items/:id', (req, res) => {
    const item = catalog.getItem(req.params.id);
    if (!item) return res.status(404).json({ error: 'Unknown title' });
    res.json({ item, similar: catalog.similar(item.id) });
  });

  api.get('/search', (req, res) => {
    const q = String(req.query.q ?? '').slice(0, 100);
    res.json({ query: q, results: catalog.search(q) });
  });

  // ---------- Writes ----------
  api.post('/contact', rateLimit(contactLimit), async (req, res, next) => {
    const body = req.body ?? {};
    // Honeypot: real users never see the "website" field; bots fill it in.
    // Pretend success so the bot learns nothing.
    if (body.website) return res.status(201).json({ ok: true });

    const clean = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
    const msg = {
      name: clean(body.name, 100),
      email: clean(body.email, 200),
      company: clean(body.company, 120),
      message: clean(body.message, 2000),
    };
    const errors = {};
    if (!msg.name) errors.name = 'Please tell me your name.';
    if (!EMAIL_RE.test(msg.email)) errors.email = 'That email doesn’t look right.';
    if (msg.message.length < 10) errors.message = 'Message should be at least 10 characters.';
    if (Object.keys(errors).length) return res.status(400).json({ error: 'Invalid message', fields: errors });

    try {
      const record = { id: randomUUID(), ...msg, createdAt: new Date().toISOString() };
      await messages.update((list) => list.push(record));
      res.status(201).json({ ok: true, id: record.id });
    } catch (err) {
      next(err);
    }
  });

  api.post('/track', async (req, res, next) => {
    const { event, target } = req.body ?? {};
    if (!TRACKABLE_EVENTS.has(event) || typeof target !== 'string' || target.length > 60) {
      return res.status(400).json({ error: 'Invalid event' });
    }
    const valid = event === 'profile_select' ? catalog.hasProfile(target) : event === 'resume_download' || catalog.getItem(target);
    if (!valid) return res.status(400).json({ error: 'Unknown target' });
    try {
      await stats.update((s) => {
        s.events[event] ??= {};
        s.events[event][target] = (s.events[event][target] ?? 0) + 1;
      });
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  });

  // ---------- Admin (bearer token) ----------
  const requireAdmin = (req, res, next) => {
    const given = Buffer.from((req.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
    const expected = Buffer.from(adminToken ?? '');
    const ok = expected.length > 0 && given.length === expected.length && timingSafeEqual(given, expected);
    if (!ok) return res.status(401).json({ error: 'Unauthorized' });
    next();
  };

  api.get('/admin/messages', requireAdmin, async (req, res, next) => {
    try {
      const list = await messages.read();
      res.json({ count: list.length, messages: list.slice().reverse() });
    } catch (err) {
      next(err);
    }
  });

  api.get('/admin/stats', requireAdmin, async (req, res, next) => {
    try {
      res.json(await stats.read());
    } catch (err) {
      next(err);
    }
  });

  api.use((req, res) => res.status(404).json({ error: 'Not found' }));

  app.use('/api', api);
  app.use(express.static(path.join(ROOT, 'public'), { extensions: ['html'], maxAge: '1h' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed JSON' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Payload too large' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });

  return app;
}
