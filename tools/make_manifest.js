// Loads app.js with browser stubs and writes tools/clips.json: every voice
// clip the app can ask for, with the sentence to speak. Source of truth is
// app.js, so spoken text can never drift from the on-screen text.
//   node tools/make_manifest.js && python tools/gen_tts.py
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadApp(extra) {
  const noop = () => {};
  const el = () => ({ style: {}, classList: { add: noop, remove: noop }, addEventListener: noop,
    querySelector: () => el(), querySelectorAll: () => [], appendChild: noop, remove: noop });
  const store = {};
  const ctx = {
    document: { getElementById: el, addEventListener: noop, createElement: el, body: el(), visibilityState: 'visible' },
    location: { search: '' },
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    navigator: {}, window: { innerWidth: 400, innerHeight: 800 },
    Audio: function () { this.play = () => Promise.resolve(); this.pause = noop; },
    requestAnimationFrame: noop, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
    performance: { now: () => 0 }, console, URLSearchParams, Math, JSON, Promise, Date, parseInt, parseFloat, isNaN, Set, Object, Array, Number, String,
  };
  ctx.globalThis = ctx;
  const src = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
  vm.runInNewContext(src + '\n;globalThis.__api = {' + extra + '};', ctx);
  return ctx.__api;
}
module.exports = { loadApp };

if (require.main === module) {
  const api = loadApp('EXERCISES, FLAVORS, FLAVOR_AUDIO, SAFETY_CARDS, TIPS');
  const say = (t) => t.toLowerCase().replace(/(^|[.!?]\s+)([a-z])/g, (m, a, b) => a + b.toUpperCase());
  const clips = {};
  for (const [id, ex] of Object.entries(api.EXERCISES)) {
    clips['ex_' + id] = say(ex.name + '. ' + ex.instruction);
    if (ex.dose.ownAudio) ex.dose.steps.forEach((t, i) => { clips[id + '_s' + (i + 1)] = say(t); });
  }
  const flavorSay = { fl_belly: 'Belly burner.', fl_knees: 'Strong knees.', fl_getup: 'Get up and go.' };
  Object.assign(clips, flavorSay);
  api.SAFETY_CARDS.forEach((t, i) => { clips['safe' + (i + 1)] = say(t); });
  api.TIPS.forEach((t, i) => { clips['tip' + (i + 1)] = say('Belly tip. ' + t); });
  Object.assign(clips, {
    feel_q: 'How did that feel? Top button, easy. Middle button, just right. Bottom button, too hard, or your knee hurt.',
    lvl_up: 'New level. Well done.',
    lvl_back: "No problem. We'll take a step back. Slow is safe.",
    lvl_hard: 'No problem. Slow is safe. If your knee stays sore, call your doctor.',
  });
  fs.writeFileSync(path.join(__dirname, 'clips.json'), JSON.stringify(clips, null, 2));
  console.log(Object.keys(clips).length + ' clips in tools/clips.json');
}
