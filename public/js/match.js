// "98% Match", personalized: the same title can score differently depending on
// who's watching. Every place the UI shows a match % (hover preview, detail
// view, More Like This) goes through matchFor().
//
// Useful item fields: item.type ('project' | 'experience' | 'education' |
// 'skills' | 'series'), item.tags, item.genres, item.year, item.badge
// ('INTERN', 'QUANT', 'SYSTEMS', 'HACKATHON', ...), and item.match (the
// hand-set base score from data/portfolio.json).

const clamp = (n) => Math.max(1, Math.min(100, Math.round(n)));

/**
 * @param {object} item       a catalog item
 * @param {string} profileId  'recruiter' | 'krish' | 'bloopers'
 * @returns {number}          1–100
 */
export function matchFor(item, profileId) {
  const base = item.match ?? 90;

  // TODO(Krish): make the score depend on who's watching. For example, a
  // recruiter might weight work experience and recent, shipped projects, while
  // the "krish" profile favors the technically deep ones (SYSTEMS, QUANT).
  // Return clamp(base + adjustment).

  return clamp(base);
}
