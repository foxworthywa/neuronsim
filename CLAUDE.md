# Working in this repository

Interactive physiology simulations, one page each, published to GitHub Pages from `dist/`.
`README.md` describes each simulation; `docs/` holds the design of each.

## The home page lists every simulation

`index.html` is the home page (https://foxworthywa.github.io/neuronsim/). It draws one card per
entry in `catalog.js`, and `build.js` publishes exactly the pages in `catalog.js`. A simulation
that is not in the catalog is not built, so it cannot go live without appearing on the home page.

**Standing rule: every new simulation or model is added to the home page as part of building
it, without being asked.** A simulation is not finished until all of these are true:

1. It has an entry in `catalog.js` (title, subtitle, group, `src`, `page`, summary, scenes, colour;
   `minutes` only when the time is known; `verify: true` if it has a completion-code checker;
   `status: 'Draft, in review'` until the instructor has reviewed it, then remove that line).
   A new course or topic area gets a new `group`, added to `GROUPS` in the order it should appear.
2. Its header starts with the link back to the home page, copied from an existing page:
   `<a class="home" href="../index.html" target="_blank" rel="noopener" ...>All simulations</a>`
   (`href="index.html"` for a page at the repository root). It opens in a new tab on purpose:
   most simulations do not save progress, so leaving the page would lose a student's work.
3. `node build.js` has been run and the changed `dist/` files are committed.
4. `npm test` passes. `tests/catalog.test.js` fails if a page exists without a catalog entry, if
   an entry is incomplete, or if a page lacks the link home; `build.js` also stops on a missing link.
5. `README.md` has its paragraph.

When a simulation changes in a way the card describes (a new part, a different length, a new
name), update its `catalog.js` entry in the same commit.

`index.html` is reserved for the home page. Do not publish a simulation under that name, and do
not touch `v1/`: those are frozen copies that students have been given links to.
