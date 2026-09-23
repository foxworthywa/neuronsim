# Muscle Explorer

An interactive 3D model of the human muscles on the **ESCC Muscle List**, for undergraduate anatomy & physiology
students. Every muscle on the list can be selected and is labelled with its section and function; a quiz mode tests
students on the sections they choose.

**Live site:** https://foxworthywa.github.io/muscle-explorer/ (rebuilt automatically on every push to `main`).

Runs in any modern browser, including Chromebooks, tablets and phones. No login, no tracking, nothing is collected.
The only thing stored is each student's quiz settings, in their own browser.

## For students

- **Rotate**: drag. **Zoom**: scroll or pinch. **Pan**: right-drag or two-finger drag.
  **Double-click** a spot to rotate around it.
- **Click a muscle** to see its name, section, function and depth. Its partner on the other side lights up too, but
  rotation stays centred on the side you clicked.
- Muscles on the list are **red**; other muscles are **grey**, shown only so the body looks real.
- **Deep muscles**: choose one from the list and whatever covers it turns see-through. You can also drag
  **Peel away** to remove layers, or click a covering muscle and press **Hide**.
- **Think about it** prompts (forearm flexors/extensors, thigh adductors) reveal where each group is.
- **Quiz**: pick sections and question types. *Find it* (click it on the model), *Name it* (type it, with small
  misspellings accepted, or choose from four), *What does it do?* (pick its function). Missed questions can be retried.

A link can point straight at a muscle, e.g. `…/muscle-explorer/#rotator-cuff` or `#vastus-intermedius`.

## For the instructor

### Changing the muscle list

Everything about the list lives in [`public/js/catalog.js`](public/js/catalog.js): the sections, their order, each
muscle's name, other accepted names (`aka`), function, note, group, and which 3D parts make it up.

- To **reword a function**, edit its `fn` text.
- To **remove a muscle**, delete its entry from `ITEMS` and its id from its section's `entries`. Its 3D parts turn
  into grey "not on the list" muscles.
- To **add a muscle**, add an entry listing its part ids (FMA numbers) for both sides. The ids and names of all 714
  parts in the model are in `public/model/parts.json`. It works straight away. Rebuilding the model (below) is optional:
  it gives the new muscle extra detail and a precomputed best camera angle.

Run `npm test` after any change. It checks that every listed part exists, has a left and right side, and that the
quiz can build questions.

Changes from the handout: spelling fixes (*semitendinosus*, *semimembranosus*, "adducts arm", "stabilize and abduct"),
section titles made grammatical, and **subscapularis** added to the rotator cuff. The handout's bracketed remarks
(fiber directions, "deep to …", the calcaneal tendon) are shown on a separate *Note* line under the function.

### Running it locally

```
npm test            # checks the list, the model index and the quiz (Node 18+, no install needed)
npm start           # serves public/ on http://localhost:8080
```

The site is plain static files in `public/`; no build step is needed to change text, the list or the styling.

### Rebuilding the 3D model (optional)

```
npm install
git clone --depth 1 https://github.com/Kevin-Mattheus-Moerman/BodyParts3D   # ~1.8 GB
node tools/build-model.mjs --data BodyParts3D/assets/BodyParts3D_data
```

This writes `public/model/body.glb` (≈4.4 MB) and `public/model/parts.json` in about two minutes. The script:

1. keeps muscles, tendons and bones (no skin, organs, vessels or nerves: 714 parts);
2. removes the anterior rectus sheath so rectus abdominis is visible (see *Credits*);
3. simplifies each part to an even level of detail (~21 M → ~0.76 M triangles), with the most detail on listed muscles;
4. assigns every muscle a **depth layer** by "onion peeling". A muscle is in layer 1 if enough of its surface can see
   out of the body, then layer 1 is removed and the process repeats. This drives **Peel away** and the depth shown on
   each card;
5. scores 24 viewing angles for each listed part, so the camera flies to an angle where the muscle can be seen.

`node tools/vendor.mjs` regenerates `public/vendor/three-bundle.js` (three.js + add-ons) from `node_modules`.

## Credits and licenses

- **3D anatomy: BodyParts3D**, © The Database Center for Life Science, licensed under
  [CC Attribution-Share Alike 2.1 Japan](https://creativecommons.org/licenses/by-sa/2.1/jp/deed.en).
  Mitsuhashi N, et al. BodyParts3D: 3D structure database for anatomical concepts. *Nucleic Acids Res.*
  2009;37:D782–5. [doi:10.1093/nar/gkn613](https://doi.org/10.1093/nar/gkn613).
  STL conversion by K. M. Moerman ([BodyParts3D on GitHub](https://github.com/Kevin-Mattheus-Moerman/BodyParts3D)).
  The model is a single adult male.
  The derived model files in `public/model/` are shared under the same CC BY-SA license; the changes are listed in
  [`public/model/LICENSE.txt`](public/model/LICENSE.txt).
- **Code**: MIT (see [`LICENSE`](LICENSE)). Built with [three.js](https://threejs.org),
  [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh), [meshoptimizer](https://github.com/zeux/meshoptimizer)
  and [glTF-Transform](https://gltf-transform.dev).
