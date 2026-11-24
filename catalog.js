/*
 * The catalog: the one list of every simulation in this repository.
 *
 * Two things read it, so they cannot disagree:
 *   - index.html (the home page) draws one card per entry;
 *   - build.js publishes exactly these pages, and nothing else.
 * A simulation that is not listed here is not built and not deployed, so "add it to the home
 * page" is not a separate chore that can be forgotten. tests/catalog.test.js fails if a page
 * exists in the repository without an entry here. See CLAUDE.md, "Adding a simulation".
 *
 * Fields:
 *   id        short unique name, lower case
 *   title     the name on the card
 *   subtitle  one line under the title
 *   group     the heading it is listed under on the home page (see GROUPS for the order)
 *   src       the page in this repository
 *   page      the published file name (flat, at the site root); may equal src
 *   summary   two or three sentences: what the student does and finds out
 *   scenes    number of scenes
 *   minutes   class time, only where it has been measured or decided (omit otherwise)
 *   format    optional short note, e.g. 'Groups'
 *   verify    true if instructors can check a completion code at <page>#verify
 *   frozen    optional { label, href }: an unchanging copy that is safe to assign
 *   color     accent colour of the card
 */
(function (root) {
  'use strict';

  const GROUPS = [
    { name: 'Excitable cells', note: 'How a cell turns a signal into a response. MuscleSim is taught first and assumes nothing.' },
    { name: 'BIO 142', note: 'Anatomy and Physiology II. BloodSim comes before ImmuneSim and does not assume it.' },
  ];

  const SIMS = [
    {
      id: 'muscle', title: 'MuscleSim', subtitle: 'From a shock to a twitch', group: 'Excitable cells',
      src: 'muscle.html', page: 'muscle.html', scenes: 13, color: '#c0584f',
      summary: 'One skeletal muscle fibre: the resting membrane, threshold and the action potential, calcium release, force, relaxation, summation and tetanus, then the neuromuscular junction. Ends with a lab of clinical scenarios.',
      frozen: { label: 'Version 1 (unchanging, safe to assign)', href: 'v1/muscle.html' },
    },
    {
      id: 'neuron', title: 'NeuronSim', subtitle: 'How a neuron receives, decides, sends', group: 'Excitable cells',
      src: 'neuron.html', page: 'neuron.html', scenes: 10, color: '#8e5cf0',
      summary: 'One neuron: synaptic input, summation and threshold, the action potential built from channel behaviour, propagation along the axon and release onto the next cell. Ends with a free-play lab.',
      frozen: { label: 'Version 1 (unchanging, safe to assign)', href: 'v1/index.html' },
    },
    {
      id: 'heart', title: 'HeartSim', subtitle: 'Part A · The heart as a pump', group: 'BIO 142',
      src: 'heart/index.html', page: 'heart.html', scenes: 6, minutes: 40, color: '#d24b3f', verify: true,
      summary: 'The beating heart and its parts, the path of a red blood cell, pressure and valves, the cardiac cycle with heart sounds, the pressure–volume loop and Frank–Starling. Follows Dana, two weeks after a heart attack.',
    },
    {
      id: 'endo', title: 'EndoSim', subtitle: 'Part A · Hormones and feedback', group: 'BIO 142',
      src: 'endo/index.html', page: 'endo.html', scenes: 8, color: '#c98a1b', format: 'Groups', verify: true,
      summary: 'The thyroid and adrenal axes: the student plays the pituitary, builds the feedback loop, then removes, replaces and blocks glands to find where a fault lies. Follows Maria (Hashimoto’s) and Daniel (adrenal crisis).',
    },
    {
      id: 'blood', title: 'BloodSim', subtitle: 'The white blood cell differential', group: 'BIO 142',
      src: 'blood/index.html', page: 'blood.html', scenes: 5, minutes: 20, color: '#a8436f', format: 'Pre-lab', verify: true,
      summary: 'Find the five kinds of white cell in a smear, discover each one’s job by experiment, see the count as a balance between marrow and tissue, then count 100 cells and learn how far a count strays by chance.',
    },
    {
      id: 'immune', title: 'ImmuneSim', subtitle: 'The immune response', group: 'BIO 142',
      src: 'immune/index.html', page: 'immune.html', scenes: 13, minutes: 90, color: '#2f9e5b', format: 'Groups or alone', verify: true,
      summary: 'Part A, outside the cells: barriers, phagocytes, inflammation, lymphocyte clones, antibody and memory. Part B, inside the cells: viruses, MHC class I and cytotoxic T-lymphocytes, vaccines. Four patient cases.',
    },
  ];

  const api = { GROUPS, SIMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CATALOG = api;
})(typeof window !== 'undefined' ? window : this);
