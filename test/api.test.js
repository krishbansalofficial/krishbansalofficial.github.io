import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createApp } from '../server/app.js';
import { loadCatalog } from '../server/catalog.js';

let server;
let base;
let storageDir;
const ADMIN = 'test-admin-token';

before(async () => {
  storageDir = await mkdtemp(path.join(tmpdir(), 'portfolio-'));
  const app = createApp({ storageDir, adminToken: ADMIN, contactLimit: { windowMs: 60_000, max: 3 } });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await rm(storageDir, { recursive: true, force: true });
});

const get = (p, headers) => fetch(base + p, { headers });
const post = (p, body) => fetch(base + p, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});

describe('catalog API', () => {
  it('lists both profiles', async () => {
    const res = await get('/api/profiles');
    assert.equal(res.status, 200);
    const { profiles } = await res.json();
    assert.deepEqual(profiles.map((p) => p.id), ['recruiter', 'krish']);
  });

  it('composes a different home screen per profile', async () => {
    const recruiter = await (await get('/api/browse/recruiter')).json();
    const krish = await (await get('/api/browse/krish')).json();
    assert.equal(recruiter.hero.id, 'about-krish');
    assert.equal(krish.hero.id, 'behind-the-scenes');
    // Director's commentary is a Krish-profile feature.
    assert.equal(krish.profile.commentary, true);
    assert.equal(recruiter.profile.commentary, false);
    const sections = (page) => page.rows.map((r) => r.section).filter(Boolean);
    for (const page of [recruiter, krish]) {
      for (const s of ['education', 'experience', 'projects', 'skills']) {
        assert.ok(sections(page).includes(s), `${page.profile.id} is missing ${s}`);
      }
    }
    // "Where It Started" throwbacks are director's-cut only.
    const ids = (page) => page.rows.flatMap((r) => r.items.map((i) => i.id));
    assert.ok(ids(krish).includes('vex'));
    assert.ok(!ids(recruiter).includes('vex'));
    assert.deepEqual(recruiter.others.map((p) => p.id), ['krish']);
  });

  it('404s an unknown profile or item', async () => {
    assert.equal((await get('/api/browse/nobody')).status, 404);
    assert.equal((await get('/api/items/nope')).status, 404);
    assert.equal((await get('/api/does-not-exist')).status, 404);
  });

  it('returns an item with tag-similar titles', async () => {
    const { item, similar } = await (await get('/api/items/regime')).json();
    assert.equal(item.title, 'Regime Detection');
    assert.ok(similar.length > 0);
    assert.ok(!similar.some((s) => s.id === 'regime' || s.type === 'skills'));
  });

  it('searches across titles, bullets, and tags (all terms must match)', async () => {
    const { results } = await (await get('/api/search?q=prophet')).json();
    const ids = results.map((r) => r.id);
    assert.ok(ids.includes('keshav'));
    assert.ok(ids.includes('skills-libraries'));
    const none = await (await get('/api/search?q=prophet%20robotics')).json();
    assert.equal(none.results.length, 0);
    const empty = await (await get('/api/search?q=')).json();
    assert.equal(empty.results.length, 0);
  });

  it('serves the frontend and resume with security headers', async () => {
    const res = await get('/');
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(await res.text(), /Who’s watching\?/);
    const pdf = await get('/Krish_Bansal_Resume.pdf');
    assert.equal(pdf.status, 200);
    assert.equal(pdf.headers.get('content-type'), 'application/pdf');
  });
});

describe('contact + admin', () => {
  it('rejects invalid messages with per-field errors', async () => {
    const res = await post('/api/contact', { name: '', email: 'nope', message: 'hi' });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.deepEqual(Object.keys(body.fields).sort(), ['email', 'message', 'name']);
  });

  it('rejects malformed JSON cleanly', async () => {
    const res = await fetch(`${base}/api/contact`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{oops',
    });
    assert.equal(res.status, 400);
  });

  it('silently drops honeypot submissions', async () => {
    const res = await post('/api/contact', { name: 'Bot', email: 'b@b.co', message: 'buy stuff now!!', website: 'spam.biz' });
    assert.equal(res.status, 201);
  });

  it('stores a valid message and exposes it only to the admin', async () => {
    const res = await post('/api/contact', {
      name: 'Jane Recruiter', email: 'jane@acme.com', company: 'Acme', message: 'Would love to chat about our ML internship.',
    });
    assert.equal(res.status, 201);

    assert.equal((await get('/api/admin/messages')).status, 401);
    assert.equal((await get('/api/admin/messages', { Authorization: 'Bearer wrong' })).status, 401);

    const admin = await (await get('/api/admin/messages', { Authorization: `Bearer ${ADMIN}` })).json();
    assert.equal(admin.count, 1); // honeypot message was not stored
    assert.equal(admin.messages[0].company, 'Acme');
  });

  it('rate-limits the contact endpoint', async () => {
    // Limit is 3/window and 3 requests were already made in this suite.
    const res = await post('/api/contact', { name: 'x', email: 'x@y.zz', message: 'one more message' });
    assert.equal(res.status, 429);
    assert.ok(res.headers.get('retry-after'));
  });

  it('counts tracked events and validates targets', async () => {
    assert.equal((await post('/api/track', { event: 'profile_select', target: 'recruiter' })).status, 204);
    assert.equal((await post('/api/track', { event: 'profile_select', target: 'recruiter' })).status, 204);
    assert.equal((await post('/api/track', { event: 'profile_select', target: 'hacker' })).status, 400);
    assert.equal((await post('/api/track', { event: 'rm -rf', target: 'x' })).status, 400);
    const stats = await (await get('/api/admin/stats', { Authorization: `Bearer ${ADMIN}` })).json();
    assert.equal(stats.events.profile_select.recruiter, 2);
  });
});

describe('catalog validation', () => {
  it('refuses to boot when a profile references a missing item', async () => {
    const file = path.join(storageDir, 'bad.json');
    await writeFile(file, JSON.stringify({
      owner: {}, items: [{ id: 'a' }],
      profiles: [{ id: 'p', hero: 'a', rows: [{ title: 'Row', items: ['a', 'ghost'] }] }],
    }));
    assert.throws(() => loadCatalog(file), /unknown item "ghost"/);
  });
});
