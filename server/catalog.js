import { readFileSync } from 'node:fs';

// The catalog is the single source of truth for portfolio content. Items are
// defined once; each profile is an ordered list of rows that reference items
// by id, so "personalization" is just a different arrangement of the same data.
export function loadCatalog(file) {
  const raw = JSON.parse(readFileSync(file, 'utf8'));
  const items = new Map(raw.items.map((item) => [item.id, item]));

  // Fail at boot, not in front of a recruiter, if a row points at nothing.
  for (const profile of raw.profiles) {
    const refs = [profile.hero, ...profile.rows.flatMap((row) => row.items)];
    for (const id of refs) {
      if (!items.has(id)) {
        throw new Error(`Profile "${profile.id}" references unknown item "${id}"`);
      }
    }
  }

  // Episode titles pair up with bullets by position, so a count mismatch
  // would silently mislabel episodes.
  for (const item of raw.items) {
    if (item.episodeTitles && item.episodeTitles.length !== (item.bullets?.length ?? 0)) {
      throw new Error(`Item "${item.id}" has ${item.episodeTitles.length} episode titles for ${item.bullets?.length ?? 0} bullets`);
    }
  }

  const profiles = new Map(raw.profiles.map((p) => [p.id, p]));

  // Hidden profiles (the Konami-code Bloopers reel) are reachable by URL but
  // never listed in the picker or the account menu.
  function listProfiles() {
    return raw.profiles
      .filter((p) => !p.hidden)
      .map(({ id, name, color, face }) => ({ id, name, color, face }));
  }

  function browse(profileId) {
    const profile = profiles.get(profileId);
    if (!profile) return null;
    return {
      owner: raw.owner,
      profile: {
        id: profile.id, name: profile.name, color: profile.color, face: profile.face,
        commentary: Boolean(profile.commentary), // show "Director's Commentary" in detail views
      },
      others: listProfiles().filter((p) => p.id !== profile.id),
      hero: items.get(profile.hero),
      rows: profile.rows.map((row, index) => ({
        id: `row-${index}`,
        title: row.title,
        section: row.section ?? null,
        variant: row.variant ?? 'default',
        items: row.items.map((id) => items.get(id)),
      })),
    };
  }

  function getItem(id) {
    return items.get(id) ?? null;
  }

  // "More Like This": rank other items by Jaccard overlap of their tags and
  // genres. Skill cards are excluded because they overlap with everything.
  function similar(id, limit = 6) {
    const source = items.get(id);
    if (!source) return null;
    const features = (item) =>
      new Set([...(item.tags ?? []), ...(item.genres ?? [])].map((t) => t.toLowerCase()));
    const a = features(source);
    return [...items.values()]
      .filter((item) => item.id !== id && item.type !== 'skills' && item.type !== 'series')
      .map((item) => {
        const b = features(item);
        const shared = [...a].filter((t) => b.has(t)).length;
        const union = new Set([...a, ...b]).size || 1;
        return { item, score: shared / union };
      })
      .filter(({ score }) => score > 0)
      .sort((x, y) => y.score - x.score || y.item.year - x.item.year)
      .slice(0, limit)
      .map(({ item }) => item);
  }

  function search(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];
    return [...items.values()].filter((item) => {
      const haystack = [
        item.title, item.subtitle, item.summary, item.period,
        ...(item.bullets ?? []), ...(item.tags ?? []), ...(item.genres ?? []),
      ].join(' ').toLowerCase();
      return terms.every((term) => haystack.includes(term));
    });
  }

  return {
    owner: raw.owner,
    listProfiles,
    // Every profile id, hidden ones included, for pre-rendering the static site.
    allProfileIds: () => raw.profiles.map((p) => p.id),
    listItems: () => [...items.values()],
    browse,
    getItem,
    similar,
    search,
    hasProfile: (id) => profiles.has(id),
  };
}
