'use strict';

// ---------------------------------------------------------------- config

const VERSION = 'v2';

const JAYANT_NAME = 'JAYANT';

const FAST = new URLSearchParams(location.search).has('fast');
const T = (ms) => (FAST ? Math.max(80, ms / 10) : ms);

const REST_SECONDS = 20;
const FADE_MS = 600;

const DEFAULT_REP_SECONDS = 3;
let speedOffset = parseFloat(localStorage.getItem('mg_speed_offset'));
if (isNaN(speedOffset)) speedOffset = 0;

function adjustSpeed(deltaSeconds) {
  speedOffset = Math.min(4, Math.max(-2, speedOffset + deltaSeconds));
  localStorage.setItem('mg_speed_offset', String(speedOffset));
}

function repMs(ex) {
  const base = ex.dose.repSeconds || DEFAULT_REP_SECONDS;
  return Math.min(8, Math.max(1.5, base + speedOffset)) * 1000;
}

// ---------------------------------------------------------------- audio engine

const audio = (() => {
  const cache = {};
  let token = 0;
  let current = null;

  function get(key) {
    let a = cache[key];
    if (!a) {
      const src = key.indexOf('/') >= 0 ? key : 'assets/tts/' + key + '.mp3';
      a = new Audio(src);
      a.preload = 'auto';
      cache[key] = a;
    }
    return a;
  }

  function playOne(key) {
    return new Promise((resolve) => {
      const a = get(key);
      current = a;
      const done = (ok) => { a.onended = a.onerror = null; resolve(ok); };
      a.onended = () => done(true);
      a.onerror = () => done(false);
      try { a.currentTime = 0; } catch (e) {}
      const p = a.play();
      if (p && p.catch) p.catch(() => done(false));
    });
  }

  async function say(keys) {
    keys = [].concat(keys);
    const my = ++token;
    if (current) current.pause();
    if (FAST) return true;
    let ok = true;
    for (const k of keys) {
      if (my !== token) return false;
      ok = (await playOne(k)) && ok;
    }
    return ok;
  }

  function stop() {
    token++;
    if (current) current.pause();
  }

  return { say, stop };
})();

// ---------------------------------------------------------------- localStorage persistence

const progressCache = {};
let trailSteps = 0;
// Floor ladder: which stage (1-7) he is on, and how many good sessions in a row.
const floorState = { stage: 1, streak: 0 };

function loadLocalState() {
  const t = parseInt(localStorage.getItem('mg_trail'), 10);
  if (!isNaN(t)) trailSteps = t;
  try {
    const p = JSON.parse(localStorage.getItem('mg_progress') || '{}');
    Object.assign(progressCache, p);
  } catch (e) {}
  try {
    const f = JSON.parse(localStorage.getItem('mg_floor') || '{}');
    if (f.stage >= 1 && f.stage <= 7) floorState.stage = f.stage;
    if (f.streak >= 0) floorState.streak = f.streak;
  } catch (e) {}
}

function saveLocalState() {
  try {
    localStorage.setItem('mg_trail', String(trailSteps));
    localStorage.setItem('mg_progress', JSON.stringify(progressCache));
    localStorage.setItem('mg_floor', JSON.stringify(floorState));
  } catch (e) {}
}

loadLocalState();

// ---------------------------------------------------------------- exercise bank
//
// v2 design notes (knee-protective, belly-focused, floor-transfer ladder):
//  - No lunges, step-ups, kneeling drills, wall-sit holds or one-leg-only
//    loading in the random pools. Squat-pattern moves are shallow + supported.
//  - Floor-transfer work is a 7-stage LADDER (L1..L7) that goes from a chair
//    to the floor in small steps, one stage per session, gated by how it felt.
//  - Cardio + core pools give the calorie burn / trunk work for the belly goal.

const EXERCISES = {
  // ---- legs: strength (supported, knee-friendly ranges) ----
  STS: {
    name: 'SIT TO STAND', type: 'strength',
    instruction: 'RISE FROM YOUR CHAIR. SIT BACK DOWN SLOWLY.',
    dose: { reps: 8, repSeconds: 4 },
  },
  STSp: {
    name: 'SIT-STAND WITH PAUSE', type: 'strength',
    instruction: 'RISE FROM THE CHAIR. PAUSE HALFWAY. THEN RISE ALL THE WAY.',
    dose: { reps: 6, repSeconds: 5 },
  },
  KE: {
    name: 'KNEE EXTENSIONS', type: 'strength',
    instruction: 'SIT TALL. STRAIGHTEN ONE KNEE. HOLD, THEN LOWER.',
    dose: { reps: 10, perSide: true, betweenText: 'OTHER LEG' },
  },
  QSQ: {
    name: 'THIGH SQUEEZES', type: 'strength',
    instruction: 'SIT TALL, ONE LEG STRAIGHT. TIGHTEN THE TOP OF YOUR THIGH. HOLD, THEN RELAX.',
    dose: { reps: 8, repSeconds: 5, perSide: true, betweenText: 'OTHER LEG' },
  },
  TKE: {
    name: 'TERMINAL KNEE EXTENSION', type: 'strength',
    instruction: 'HOLD THE CHAIR BACK. SLIGHT BEND IN YOUR KNEE. SLOWLY STRAIGHTEN IT. SQUEEZE AT THE TOP.',
    dose: { reps: 10, perSide: true, betweenText: 'OTHER LEG' },
  },
  CKS: {
    name: 'CHAIR KNEE BENDS', type: 'strength',
    instruction: 'HOLD THE CHAIR BACK. BEND YOUR KNEES JUST A LITTLE, THEN RISE TALL.',
    dose: { reps: 8, repSeconds: 4 },
  },
  PSQ: {
    name: 'SHALLOW SQUATS', type: 'strength',
    instruction: 'HOLD THE COUNTER. BEND ONLY AS FAR AS FEELS EASY, THEN BACK UP.',
    dose: { reps: 6, repSeconds: 4 },
  },
  WDS: {
    name: 'WIDE STANCE SQUAT', type: 'strength',
    instruction: 'HOLD THE COUNTER. FEET WIDE APART. BEND YOUR KNEES A LITTLE AND RISE.',
    dose: { reps: 8, repSeconds: 4 },
  },
  HB: {
    name: 'HIP BRIDGES', type: 'strength',
    instruction: 'LIE ON THE BED, KNEES BENT. LIFT YOUR HIPS UP.',
    dose: { reps: 8 },
  },
  CPU: {
    name: 'CHAIR PRESS-UPS', type: 'strength',
    instruction: 'SIT TALL, HANDS BESIDE YOU. PRESS DOWN AND LIFT YOUR HIPS A LITTLE.',
    dose: { reps: 8, repSeconds: 4 },
  },
  HR: {
    name: 'HEEL RAISES', type: 'strength',
    instruction: 'HOLD THE COUNTER. RISE UP ON YOUR TOES. LOWER SLOWLY.',
    dose: { reps: 10 },
  },
  SCR: {
    name: 'SEATED CALF RAISES', type: 'strength',
    instruction: 'SIT TALL. RISE UP ON YOUR TOES AS HIGH AS YOU CAN. LOWER SLOWLY.',
    dose: { reps: 12 },
  },
  TR: {
    name: 'TOE RAISES', type: 'strength',
    instruction: 'HOLD THE COUNTER. LIFT YOUR TOES. ROCK BACK ON YOUR HEELS.',
    dose: { reps: 10 },
  },
  SLR: {
    name: 'SIDE LEG RAISES', type: 'strength',
    instruction: 'HOLD THE CHAIR BACK. LIFT ONE LEG OUT TO THE SIDE.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER LEG' },
  },
  HAB: {
    name: 'HIP ABDUCTION', type: 'strength',
    instruction: 'HOLD THE COUNTER. LIFT ONE LEG OUT TO THE SIDE. SLOW AND CONTROLLED.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER LEG' },
  },
  HE: {
    name: 'HIP EXTENSION', type: 'strength',
    instruction: 'HOLD THE COUNTER. GENTLY LIFT ONE LEG BACK. SLOW AND EASY.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER LEG' },
  },
  RKS: {
    name: 'REVERSE KNEE LIFTS', type: 'strength',
    instruction: 'HOLD THE CHAIR BACK. LIFT YOUR HEEL UP BEHIND YOU.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER LEG' },
  },

  // ---- upper body: strength (supports pushing up from the floor) ----
  WP: {
    name: 'WALL PUSH-UPS', type: 'strength',
    instruction: 'HANDS ON THE WALL. LEAN IN, PUSH BACK.',
    dose: { reps: 8 },
  },
  WPU: {
    name: 'WIDE WALL PUSH-UPS', type: 'strength',
    instruction: 'HANDS WIDE ON THE WALL. LEAN IN, PUSH BACK.',
    dose: { reps: 8 },
  },
  TPU: {
    name: 'TABLE PUSH-UPS', type: 'strength',
    instruction: 'HANDS ON THE TABLE EDGE. LEAN IN, PUSH BACK.',
    dose: { reps: 6 },
  },
  ARC: {
    name: 'ARM CIRCLES', type: 'strength',
    instruction: 'HOLD THE CHAIR WITH ONE HAND. CIRCLE THE OTHER ARM SLOWLY.',
    dose: { reps: 10, repSeconds: 3, perSide: true, betweenText: 'NOW THE OTHER WAY' },
  },
  WTW: {
    name: 'WALL REACHES', type: 'strength',
    instruction: 'STAND NEAR THE WALL. REACH UP, DOWN, AND OUT TO THE SIDE.',
    dose: { reps: 8, perSide: true, betweenText: 'CHANGE DIRECTION' },
  },
  CRL: {
    name: 'WALL ROLLS', type: 'strength',
    instruction: 'HANDS ON THE WALL. ROLL YOUR SHOULDERS AND CHEST SLOWLY.',
    dose: { reps: 10 },
  },

  // ---- cardio: low-impact, seated or counter-held, timed ----
  BRM: {
    name: 'BRISK MARCH', type: 'cardio',
    instruction: 'HOLD THE COUNTER. MARCH IN PLACE, QUICK AND LIGHT. BREATHE HARD BUT STAY ABLE TO TALK.',
    dose: { seconds: 30 },
  },
  SBX: {
    name: 'SEATED BOXING', type: 'cardio',
    instruction: 'SIT TALL. PUNCH FORWARD, ONE ARM THEN THE OTHER. FAST AND LOOSE.',
    dose: { seconds: 30 },
  },
  SJK: {
    name: 'SEATED JACKS', type: 'cardio',
    instruction: 'SIT TALL. ARMS UP AND FEET OUT, THEN ARMS DOWN AND FEET IN.',
    dose: { seconds: 30 },
  },
  SSS: {
    name: 'SIDE STEPS', type: 'cardio',
    instruction: 'HOLD THE COUNTER. STEP SIDEWAYS, THEN BACK. KEEP YOUR KNEES SOFT.',
    dose: { seconds: 30 },
  },
  HDG: {
    name: 'HEEL TAPS', type: 'cardio',
    instruction: 'HOLD THE COUNTER. TAP ONE HEEL FORWARD, THEN THE OTHER. KEEP A STEADY BEAT.',
    dose: { seconds: 30 },
  },
  SMB: {
    name: 'SEATED HIGH MARCH', type: 'cardio',
    instruction: 'SIT TALL. MARCH YOUR KNEES UP AS HIGH AS FEELS GOOD. SLOW AND STEADY.',
    dose: { seconds: 30 },
  },
  HK: {
    name: 'HIGH-KNEE MARCH', type: 'cardio',
    instruction: 'HOLD THE COUNTER. MARCH IN PLACE, LIFTING YOUR KNEES AS HIGH AS FEELS GOOD.',
    dose: { seconds: 30 },
  },
  WLK: {
    name: 'HOUSE WALK', type: 'cardio',
    instruction: 'WALK BRISKLY THROUGH THE HOUSE, ARMS SWINGING. KEEP A HAND NEAR THE WALLS.',
    dose: { seconds: 45 },
  },

  // ---- core: belly work that is safe for the knees and back ----
  CTP: {
    name: 'COUNTER PLANK', type: 'core',
    instruction: 'HANDS ON THE COUNTER EDGE. BODY IN ONE LINE. TIGHTEN YOUR BELLY. KEEP BREATHING.',
    dose: { seconds: 15 },
  },
  BRC: {
    name: 'BELLY BRACE', type: 'core',
    instruction: 'SIT TALL. BREATHE OUT AND PULL YOUR BELLY IN. HOLD, THEN RELAX. NEVER HOLD YOUR BREATH.',
    dose: { reps: 8, repSeconds: 5 },
  },
  SEK: {
    name: 'ELBOW TO KNEE', type: 'core',
    instruction: 'SIT TALL. BRING ONE ELBOW TOWARD THE OPPOSITE KNEE. TWIST FROM YOUR BELLY.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER SIDE' },
  },
  SBD: {
    name: 'STANDING SIDE BEND', type: 'core',
    instruction: 'HOLD THE COUNTER. REACH THE OTHER ARM OVER YOUR HEAD AND LEAN. SLOWLY.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER SIDE' },
  },
  SCH: {
    name: 'SEATED CHOPS', type: 'core',
    instruction: 'SIT TALL, HANDS CLASPED. SWING FROM HIGH ON ONE SIDE DOWN TO THE OTHER KNEE.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER SIDE' },
  },
  PTL: {
    name: 'WALL PELVIC TILT', type: 'core',
    instruction: 'BACK AGAINST THE WALL. FLATTEN YOUR LOWER BACK TO THE WALL. HOLD, THEN RELEASE.',
    dose: { reps: 10, repSeconds: 4 },
  },
  SKL: {
    name: 'SEATED KNEE LIFTS', type: 'core',
    instruction: 'SIT TALL, HANDS ON THE CHAIR. LIFT BOTH KNEES A LITTLE. LOWER SLOWLY.',
    dose: { reps: 8, repSeconds: 4 },
  },

  // ---- balance (always at the counter, chair or wall) ----
  MIP: {
    name: 'MARCHING IN PLACE', type: 'balance',
    instruction: 'HOLD THE CHAIR BACK. MARCH IN PLACE, NICE AND EASY.',
    dose: { seconds: 30 },
  },
  TS: {
    name: 'TANDEM STANCE', type: 'balance',
    instruction: 'HOLD THE TABLE EDGE. ONE FOOT IN FRONT OF THE OTHER. HOLD STEADY.',
    dose: { seconds: 15, perSide: true, betweenText: 'SWITCH FEET' },
  },
  HTW: {
    name: 'HEEL TO TOE WALK', type: 'balance',
    instruction: 'WALK ALONG THE TABLE, HEEL TOUCHING TOE.',
    dose: { reps: 8, perSide: true, betweenText: 'NOW WALK BACK' },
  },
  OLB: {
    name: 'ONE-LEG BALANCE', type: 'balance',
    instruction: 'HOLD THE CHAIR. FIND YOUR BALANCE ON ONE LEG.',
    dose: { seconds: 15, perSide: true, betweenText: 'OTHER LEG' },
  },
  FBW: {
    name: 'ROCK FORWARD AND BACK', type: 'balance',
    instruction: 'HANDS ON THE WALL. ROCK GENTLY FORWARD AND BACK.',
    dose: { seconds: 20 },
  },
  SBW: {
    name: 'ROCK SIDE TO SIDE', type: 'balance',
    instruction: 'HANDS ON THE WALL. SWAY GENTLY SIDE TO SIDE.',
    dose: { seconds: 20 },
  },
  TND: {
    name: 'TANDEM WALKING', type: 'balance',
    instruction: 'WALK SLOWLY ALONG THE WALL, ONE FOOT IN FRONT OF THE OTHER.',
    dose: { reps: 10 },
  },
  CBL: {
    name: 'CROSS-BODY LEG LIFTS', type: 'balance',
    instruction: 'HOLD THE CHAIR. LIFT ONE LEG ACROSS IN FRONT OF THE OTHER.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER LEG' },
  },
  STW: {
    name: 'TANDEM WALK', type: 'balance',
    instruction: 'HOLD THE COUNTER. WALK FORWARD, ONE FOOT DIRECTLY IN FRONT OF THE OTHER.',
    dose: { reps: 8 },
  },
  SLS: {
    name: 'SINGLE-LEG STANCE', type: 'balance',
    instruction: 'HOLD THE COUNTER. GENTLY LIFT ONE FOOT. FIND YOUR BALANCE.',
    dose: { seconds: 10, perSide: true, betweenText: 'OTHER LEG' },
  },
  WSS: {
    name: 'WEIGHT SHIFT SIDEWAYS', type: 'balance',
    instruction: 'HOLD THE COUNTER. SHIFT YOUR WEIGHT SLOWLY FROM LEFT TO RIGHT.',
    dose: { seconds: 30 },
  },
  WSF: {
    name: 'WEIGHT SHIFT FRONT-BACK', type: 'balance',
    instruction: 'HOLD THE COUNTER. ROCK GENTLY FORWARD THEN BACK.',
    dose: { seconds: 30 },
  },
  THR: {
    name: 'TOE-HEEL ROCK', type: 'balance',
    instruction: 'HOLD THE COUNTER. RISE ON YOUR TOES, THEN ROCK BACK ON YOUR HEELS.',
    dose: { reps: 12 },
  },
  F8: {
    name: 'FIGURE-8 WEIGHT SHIFT', type: 'balance',
    instruction: 'HOLD THE COUNTER. TRACE A SLOW FIGURE-8 PATTERN WITH YOUR WEIGHT.',
    dose: { seconds: 30 },
  },
  CLK: {
    name: 'CLOCK STEPS', type: 'balance',
    instruction: 'HOLD THE COUNTER. STEP OUT LIKE THE HANDS OF A CLOCK. FRONT, DIAGONAL, SIDE, BACK. RETURN EACH TIME.',
    dose: { reps: 6, perSide: true, betweenText: 'OTHER LEG' },
  },

  // ---- warm-up mobility ----
  AC: {
    name: 'ANKLE CIRCLES', type: 'mobility',
    instruction: 'SIT TALL. CIRCLE YOUR ANKLES, SLOW AND EASY.',
    dose: { reps: 10, repSeconds: 3, perSide: true, betweenText: 'OTHER DIRECTION' },
  },
  NST: {
    name: 'NECK STRETCHES', type: 'mobility',
    instruction: 'SIT TALL. TURN YOUR HEAD SLOWLY, SIDE TO SIDE.',
    dose: { reps: 5, repSeconds: 3, perSide: true, betweenText: 'OTHER DIRECTION' },
  },
  SST: {
    name: 'SHOULDER STRETCHES', type: 'mobility',
    instruction: 'SIT TALL. PULL ONE ARM GENTLY ACROSS YOUR CHEST.',
    dose: { reps: 5, perSide: true, betweenText: 'OTHER SIDE' },
  },
  HST: {
    name: 'HIP STRETCHES', type: 'mobility',
    instruction: 'SIT TALL. REST ONE ANKLE ON YOUR KNEE. LEAN FORWARD GENTLY.',
    dose: { seconds: 30, perSide: true, betweenText: 'OTHER SIDE' },
  },
  CST: {
    name: 'CALF STRETCHES', type: 'mobility',
    instruction: 'HANDS ON THE WALL. STEP ONE FOOT BACK, HEEL DOWN.',
    dose: { seconds: 20, perSide: true, betweenText: 'OTHER LEG' },
  },
  AST: {
    name: 'OVERHEAD STRETCHES', type: 'mobility',
    instruction: 'SIT TALL. REACH ONE ARM UP HIGH AND HOLD.',
    dose: { seconds: 20, perSide: true, betweenText: 'OTHER ARM' },
  },
  CS: {
    name: 'CALF STRETCH', type: 'mobility',
    instruction: 'HANDS ON THE WALL. ONE FOOT BACK, HEEL FLAT. HOLD THE STRETCH.',
    dose: { seconds: 20, perSide: true, betweenText: 'OTHER LEG' },
  },
  WS: {
    name: 'WALL SLIDES', type: 'mobility',
    instruction: 'BACK AGAINST THE WALL. SLIDE YOUR ARMS SLOWLY UP THE WALL AND DOWN.',
    dose: { reps: 8 },
  },
  NR: {
    name: 'NECK ROTATIONS', type: 'mobility',
    instruction: 'SIT TALL. SLOWLY TURN YOUR HEAD TO ONE SIDE, THEN THE OTHER.',
    dose: { reps: 6, perSide: true, betweenText: 'OTHER SIDE' },
  },
  SR: {
    name: 'SHOULDER ROLLS', type: 'mobility',
    instruction: 'SIT TALL. ROLL YOUR SHOULDERS SLOWLY FORWARD, THEN BACKWARD.',
    dose: { reps: 10 },
  },
  TT: {
    name: 'TORSO TWIST', type: 'mobility',
    instruction: 'SIT TALL, ARMS FOLDED. TWIST GENTLY TO ONE SIDE, THEN THE OTHER.',
    dose: { reps: 6, perSide: true, betweenText: 'OTHER SIDE' },
  },
  CY: {
    name: 'CHAIR CAT-COW', type: 'mobility',
    instruction: 'SIT TALL. ARCH YOUR BACK AND LOOK UP, THEN ROUND IT AND LOOK DOWN.',
    dose: { reps: 8 },
  },
  RD: {
    name: 'REACH DRILL', type: 'mobility',
    instruction: 'HOLD THE COUNTER. REACH UP HIGH AND ACROSS YOUR BODY, BOTH SIDES.',
    dose: { reps: 6, perSide: true, betweenText: 'OTHER SIDE' },
  },
  SHR: {
    name: 'SHOULDER ROLLS', type: 'mobility',
    instruction: 'STAND TALL. ROLL YOUR SHOULDERS SLOWLY.',
    dose: { reps: 10, repSeconds: 2, perSide: true, betweenText: 'NOW BACKWARD' },
  },

  // ---- cooldown / breathing ----
  SB: {
    name: 'EASY BREATHING', type: 'cooldown',
    instruction: 'SIT TALL. BREATHE SLOW AND DEEP.',
    dose: { seconds: 60 },
  },
  BDC: {
    name: 'BELLY BREATHING', type: 'breathing',
    instruction: 'SIT TALL. HAND ON YOUR BELLY. BREATHE SLOW AND DEEP.',
    dose: { reps: 10 },
  },
  BOX: {
    name: 'BOX BREATHING', type: 'breathing',
    instruction: 'BREATHE IN, HOLD, OUT, HOLD. FOUR SLOW COUNTS EACH.',
    dose: { reps: 5 },
  },
  PSB: {
    name: 'PURSED-LIP BREATHING', type: 'breathing',
    instruction: 'BREATHE IN THROUGH YOUR NOSE. OUT SLOWLY THROUGH PURSED LIPS.',
    dose: { reps: 10 },
  },
  BAW: {
    name: 'BREATH AND ARM WAVES', type: 'breathing',
    instruction: 'BREATHE IN, ARMS FLOAT UP. BREATHE OUT, ARMS FLOAT DOWN.',
    dose: { seconds: 20 },
  },
  HS: {
    name: 'HAMSTRING STRETCH', type: 'mobility',
    instruction: 'SIT AT THE CHAIR EDGE. STRAIGHTEN ONE LEG, LEAN FORWARD GENTLY.',
    dose: { seconds: 20, perSide: true, betweenText: 'OTHER LEG' },
  },
  BB: {
    name: 'BOX BREATHING', type: 'cooldown',
    instruction: 'IN FOUR COUNTS. HOLD FOUR. OUT FOUR. HOLD FOUR. SLOW AND EASY.',
    dose: { seconds: 60 },
  },
  CD: {
    name: 'FULL-BODY STRETCH', type: 'cooldown',
    instruction: 'STAND AGAINST THE WALL. REACH TALL AND STRETCH YOUR WHOLE BODY OUT.',
    dose: { seconds: 60 },
  },

  // ---- FLOOR LADDER: chair -> bed -> floor, one stage per session ----
  // Each stage is unlocked by 3 sessions that felt EASY or JUST RIGHT.
  // "TOO HARD / KNEE HURT" drops back one stage. Nothing here asks him to
  // kneel on a bare floor; stages 6-7 use a padded mat + the bed as support.
  L1: {
    name: 'CHAIR RISE, HANDS HELP', type: 'ladder', stage: 1,
    instruction: 'SCOOT TO THE CHAIR EDGE. FEET BACK. LEAN FORWARD. PUSH WITH YOUR HANDS AND STAND.',
    dose: { reps: 8, repSeconds: 4 },
  },
  L2: {
    name: 'CHAIR RISE, NO HANDS', type: 'ladder', stage: 2,
    instruction: 'ARMS CROSSED. NOSE OVER TOES. STAND UP. SIT BACK DOWN SLOWLY.',
    dose: { reps: 8, repSeconds: 4 },
  },
  L3: {
    name: 'LOW SEAT RISE', type: 'ladder', stage: 3,
    instruction: 'SIT ON THE BED EDGE. LEAN FORWARD. STAND UP. HANDS MAY HELP. SIT BACK DOWN SLOWLY.',
    dose: { reps: 6, repSeconds: 5 },
  },
  L4: {
    name: 'SLOW LOWERING', type: 'ladder', stage: 4,
    instruction: 'HAND ON THE COUNTER. LOWER SLOWLY ONTO THE BED EDGE. TAKE FOUR SECONDS.',
    dose: { reps: 6, repSeconds: 6 },
  },
  L5: {
    name: 'CUSHION SEAT RISE', type: 'ladder', stage: 5,
    instruction: 'FIRM CUSHIONS BESIDE THE BED. SIT ON THEM. HANDS ON THE BED. PUSH UP TO STAND.',
    dose: { reps: 4, repSeconds: 8 },
  },
  L6: {
    name: 'FLOOR SIT AND BED RISE', type: 'ladder', stage: 6,
    instruction: 'PHONE IN YOUR POCKET. A SOFT MAT BESIDE THE BED. WE GO ONE STEP AT A TIME.',
    dose: { cycles: 2, stepSeconds: 15, ownAudio: true, steps: [
      'PHONE IN YOUR POCKET. STAND BESIDE THE BED.',
      'HANDS ON THE BED. LOWER SLOWLY TO SIT ON THE MAT.',
      'REST HERE. BREATHE. FEET FLAT, KNEES BENT.',
      'TURN SIDEWAYS. BOTH HANDS ON THE BED.',
      'PUSH DOWN. LIFT YOUR HIPS ONTO THE BED EDGE.',
      'REST SITTING. THEN STAND TALL.',
    ]},
  },
  L7: {
    name: 'FULL FLOOR RISE', type: 'ladder', stage: 7,
    instruction: 'THE WHOLE JOURNEY, ON THE MAT BESIDE THE BED. ANY SHARP KNEE PAIN, STOP AND USE THE BED SEAT.',
    dose: { cycles: 2, stepSeconds: 15, ownAudio: true, steps: [
      'PHONE IN YOUR POCKET. SIT ON THE MAT BESIDE THE BED.',
      'ROLL TO YOUR SIDE. THEN ONTO HANDS AND KNEES ON THE PAD.',
      'CRAWL TO THE BED. HANDS FLAT ON THE BED.',
      'STRONGER FOOT FLAT ON THE FLOOR.',
      'PUSH WITH YOUR HANDS AND FOOT. STAND TALL.',
    ]},
  },
};

const LADDER_LAST = 7;
const LADDER_NEEDED = 3; // good sessions in a row to unlock the next stage

function getDose(id) {
  const base = EXERCISES[id].dose;
  const p = progressCache[id];
  if (!p || !p.currentDose) return base;
  if (base.reps) return { ...base, reps: p.currentDose };
  if (base.seconds) return { ...base, seconds: p.currentDose };
  return base;
}

// ---------------------------------------------------------------- flavors

const CARDIO_IDS = ['BRM', 'SBX', 'SJK', 'SSS', 'HDG', 'SMB', 'HK', 'WLK'];
const CORE_IDS = ['CTP', 'BRC', 'SEK', 'SBD', 'SCH', 'PTL', 'SKL'];
const BALANCE_IDS = [
  'TS', 'HTW', 'OLB', 'FBW', 'SBW', 'TND', 'CBL',
  'STW', 'SLS', 'WSS', 'WSF', 'THR', 'F8', 'CLK',
];
const STRENGTH_IDS = [
  'STS', 'STSp', 'KE', 'QSQ', 'TKE', 'CKS', 'PSQ', 'WDS', 'HB', 'CPU',
  'HR', 'SCR', 'TR', 'SLR', 'HAB', 'HE', 'RKS',
  'WP', 'WPU', 'TPU', 'ARC', 'WTW', 'CRL',
];
const WARMUP_MOBILITY_IDS = [
  'AC', 'NST', 'SST', 'HST', 'CST', 'AST',
  'CS', 'NR', 'SR', 'WS', 'CY', 'TT', 'RD',
];
const WARMUP_MOVEMENT_IDS = ['MIP', 'FBW', 'SBW', 'SHR', 'ARC'];
const COOLDOWN_IDS = ['SB', 'BDC', 'BOX', 'PSB', 'BAW', 'BB', 'CD', 'HS'];

// `mix` = how many body exercises of each kind. Every session also gets a
// 2-exercise warm-up, one floor-ladder stage, and a cooldown (~11 exercises,
// roughly 20-25 minutes). `fr` flavors add a review of the previous stage.
const FLAVORS = [
  {
    name: 'BELLY BURNER', mix: { cardio: 3, core: 2, strength: 2, balance: 0 },
    weights: {
      BRM: 3, SBX: 3, SJK: 2, SSS: 3, HDG: 2, SMB: 2, HK: 2, WLK: 3,
      CTP: 3, BRC: 2, SEK: 3, SBD: 2, SCH: 3, SKL: 2,
      STS: 3, HB: 2, CKS: 2, HAB: 2, HE: 2,
    },
  },
  {
    name: 'STRONG KNEES', mix: { cardio: 1, core: 1, strength: 4, balance: 1 },
    weights: {
      TKE: 4, QSQ: 4, KE: 3, STS: 3, STSp: 3, CKS: 2, PSQ: 2, HB: 2, HR: 2, SCR: 2, WDS: 2,
      SMB: 3, SSS: 2, BRC: 2, OLB: 2, TS: 2,
    },
  },
  {
    name: 'GET UP & GO', mix: { cardio: 2, core: 1, strength: 3, balance: 0 }, fr: true,
    weights: {
      STS: 3, CPU: 4, HB: 3, STSp: 3, TKE: 2, QSQ: 2, KE: 2, CKS: 2,
      SEK: 2, BRC: 2, BRM: 2, SBX: 2, WP: 2, WPU: 2,
    },
  },
  {
    name: 'STEADY LEGS', mix: { cardio: 1, core: 1, strength: 2, balance: 3 },
    weights: {
      TS: 3, HTW: 3, OLB: 3, SLS: 2, STW: 3, CLK: 3, TND: 2, THR: 2, F8: 2, WSS: 2, WSF: 2,
      TKE: 2, STS: 2, HAB: 2, HE: 2, SMB: 2, SSS: 2,
    },
  },
  {
    name: 'THE WALKABOUT', mix: { cardio: 3, core: 1, strength: 2, balance: 1 },
    weights: {
      WLK: 4, BRM: 3, SSS: 3, HDG: 3, HK: 2, HR: 3, TR: 3, STW: 3, HTW: 3,
      STS: 2, CKS: 2, HAB: 2, HE: 2, SBD: 2,
    },
  },
];

// ---------------------------------------------------------------- messages

const SPLASH_CARDS = [
  `<div class="splash-lg accent">MAMA G!</div>
   <div class="splash-md">WELCOME TO YOUR WORKOUT.</div>
   <div class="splash-sm">LET'S DO THIS.</div>`,

  `<div class="splash-md">WELCOME BACK,</div>
   <div class="splash-lg accent">JAYANT.</div>
   <div class="splash-sm">YOUR LEGS SAY THANK YOU.</div>`,

  `<div class="splash-md">THE CHAMP</div>
   <div class="splash-lg accent">IS HERE.</div>`,

  `<div class="splash-md">READY WHEN YOU ARE,</div>
   <div class="splash-lg accent">MAMA G.</div>`,

  `<div class="splash-md">STRONG LEGS.</div>
   <div class="splash-md">STEADY FEET.</div>
   <div class="splash-lg accent">LET'S GO.</div>`,
];

const GREETINGS = [
  "LET'S GO, MAMA G!",
  "GOOD TO SEE YOU, JAYANT.",
  "TIME TO MOVE!",
  "YOU SHOWED UP. THAT'S EVERYTHING.",
  "ANOTHER SESSION. ANOTHER WIN.",
];

const MILESTONES = [
  { step: 5,   caption: "5 SESSIONS. THE HABIT IS FORMING." },
  { step: 10,  caption: "10 SESSIONS. YOU ARE DOING THIS." },
  { step: 20,  caption: "20 SESSIONS. STRONGER EVERY WEEK." },
  { step: 40,  caption: "40 SESSIONS. INCREDIBLE." },
  { step: 60,  caption: "60 SESSIONS. STILL GOING STRONG." },
  { step: 80,  caption: "80 SESSIONS. REMARKABLE." },
  { step: 100, caption: "ONE HUNDRED SESSIONS. UNSTOPPABLE." },
];

const FLAVOR_AUDIO = {
  'BELLY BURNER': 'fl_belly',
  'STRONG KNEES': 'fl_knees',
  'GET UP & GO': 'fl_getup',
  'STEADY LEGS': 'fl_steady',
  'THE WALKABOUT': 'fl_walkabout',
};

// Shown once, the first time the app opens.
const SAFETY_CARDS = [
  'TALK TO YOUR DOCTOR BEFORE YOU START THIS PLAN.',
  'EFFORT IS GOOD. SHARP KNEE PAIN IS NOT. IF YOU FEEL IT, STOP AND SIT.',
  'BREATHE OUT ON THE HARD PART. NEVER HOLD YOUR BREATH.',
  'KEEP YOUR PHONE IN YOUR POCKET.',
];

// One per session, in order. The belly only shrinks when eating changes too.
const TIPS = [
  'NO EXERCISE REMOVES BELLY FAT ALONE. MOVING PLUS EATING LESS DOES.',
  'SMALLER PLATES. SLOWER BITES. STOP WHEN COMFORTABLY FULL.',
  'PUT PROTEIN IN EVERY MEAL. IT KEEPS YOU FULL AND KEEPS YOUR MUSCLE.',
  'WALK TEN MINUTES AFTER EACH MEAL.',
  'NO SNACKING AFTER DINNER.',
  'A GLASS OF WATER BEFORE EACH MEAL.',
  'SWAP SWEET DRINKS FOR WATER OR TEA.',
  'SLEEP SEVEN HOURS. TIRED BODIES HOLD ON TO BELLY FAT.',
  'MEASURE YOUR WAIST AT THE NAVEL ONCE A MONTH. THE SCALE CAN LIE.',
];

const BETWEEN_AUDIO = {
  'OTHER LEG': 'b_other_leg',
  'OTHER SIDE': 'b_other_side',
  'OTHER DIRECTION': 'b_other_direction',
  'OTHER ARM': 'b_other_arm',
  'NOW WALK BACK': 'b_walk_back',
  'SWITCH FEET': 'b_switch_feet',
  'NOW THE OTHER WAY': 'b_other_way',
  'CHANGE DIRECTION': 'b_change_direction',
  'NOW BACKWARD': 'b_backward',
};

const PRAISE_KEYS = ['good1', 'good2', 'good3'];

// ---------------------------------------------------------------- helpers

const stage = document.getElementById('stage');
const appEl = document.getElementById('app');
const byId = (id) => document.getElementById(id);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function weightedSample(pool, weights, n) {
  const result = [];
  const remaining = [...pool];
  for (let i = 0; i < n && remaining.length > 0; i++) {
    const w = remaining.map((id) => weights[id] || 1);
    const total = w.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < w.length - 1; idx++) { r -= w[idx]; if (r <= 0) break; }
    result.push(remaining.splice(idx, 1)[0]);
  }
  return result;
}

// ---------------------------------------------------------------- timer utilities

let activeTimer = null;
let paused = false;

function clearTimer() {
  if (activeTimer) { clearInterval(activeTimer); clearTimeout(activeTimer); activeTimer = null; }
}

function after(ms, fn) {
  clearTimer();
  activeTimer = setTimeout(fn, ms);
}

function every(ms, fn) {
  clearTimer();
  activeTimer = setInterval(fn, ms);
}

// ---------------------------------------------------------------- screen management

let mountTimer = null;
let screenSeq = 0;

function setScreen(html, wire) {
  screenSeq++;
  clearTimer();
  clearTimeout(mountTimer);
  stage.style.opacity = '0';
  mountTimer = setTimeout(() => {
    stage.innerHTML = html;
    if (wire) wire();
    requestAnimationFrame(() => { stage.style.opacity = '1'; });
  }, FADE_MS);
}

// ---------------------------------------------------------------- progression

const PROGRESSION_TYPES = { strength: true, balance: true, cardio: true, core: true };

function progressExercise(id) {
  const ex = EXERCISES[id];
  if (!PROGRESSION_TYPES[ex.type]) return;
  const kind = ex.dose.reps ? 'reps' : ex.dose.seconds ? 'seconds' : null;
  if (!kind) return;
  const p = progressCache[id] || { currentDose: ex.dose[kind], streakAtDose: 0 };
  p.streakAtDose = (p.streakAtDose || 0) + 1;
  if (p.streakAtDose >= 3) {
    p.streakAtDose = 0;
    // cardio steps 30 -> 45 -> 60s (those number clips exist); the rest +2 reps / +5s
    const rule = ex.type === 'cardio' ? { inc: 15, cap: 60 }
      : kind === 'reps' ? { inc: 2, cap: 15 } : { inc: 5, cap: 45 };
    p.currentDose = Math.min(rule.cap, p.currentDose + rule.inc);
  }
  progressCache[id] = p;
}

// ---------------------------------------------------------------- session composer

function composeSession(lengthMin, flavor) {
  const warmup = [pick(WARMUP_MOBILITY_IDS), pick(WARMUP_MOVEMENT_IDS)];
  const used = new Set(warmup);
  const take = (pool, n) => {
    const got = weightedSample(pool.filter((id) => !used.has(id)), flavor.weights, n);
    got.forEach((id) => used.add(id));
    return got;
  };
  const m = flavor.mix;
  const body = shuffle([
    ...take(CARDIO_IDS, m.cardio),
    ...take(STRENGTH_IDS, m.strength),
    ...take(CORE_IDS, m.core),
    ...take(BALANCE_IDS, m.balance),
  ]);
  // Floor ladder goes right after warm-up, while his legs are fresh.
  const ladder = [];
  if (flavor.fr && floorState.stage > 1) ladder.push({ id: 'L' + (floorState.stage - 1), review: true });
  ladder.push({ id: 'L' + floorState.stage });
  const entries = [
    ...warmup.map((id) => ({ id })),
    ...ladder,
    ...body.map((id) => ({ id })),
    { id: pick(COOLDOWN_IDS) },
  ];
  return entries.map((e) => ({ ...e, ...EXERCISES[e.id], dose: getDose(e.id) }));
}

// Called after a ladder stage. Returns 'up' | 'back' | 'same' | 'top'.
function recordFeel(choice) {
  let result = 'same';
  if (choice === 'hard') {
    floorState.streak = 0;
    if (floorState.stage > 1) { floorState.stage--; result = 'back'; }
  } else {
    floorState.streak++;
    if (floorState.streak >= LADDER_NEEDED) {
      if (floorState.stage < LADDER_LAST) { floorState.stage++; floorState.streak = 0; result = 'up'; }
      else result = 'top';
    }
  }
  saveLocalState();
  return result;
}

// ---------------------------------------------------------------- persistence

function persistSession() {
  trailSteps += 1;
  session.trailStep = trailSteps;
  session.milestone = MILESTONES.find((m) => m.step === trailSteps) || null;
  session.results.forEach((r) => { if (r.completed) progressExercise(r.id); });
  saveLocalState();
}

// ---------------------------------------------------------------- state

let state = 'WELCOME';
let session = null;
const inSession = () => state === 'SESSION';

// ---------------------------------------------------------------- screens

function launchConfetti(then) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:999';
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx    = canvas.getContext('2d');
  const cx     = canvas.width / 2;
  const cy     = canvas.height * 0.5;
  const colors = ['#FFD700','#FF6B6B','#4ECDC4','#45B7D1','#FFA07A','#FFEAA7','#DDA0DD','#90EE90'];
  const bits   = Array.from({ length: 90 }, () => ({
    x: cx + (Math.random() - 0.5) * 30,
    y: cy,
    vx: (Math.random() - 0.5) * 22,
    vy: Math.random() * -20 - 4,
    color: colors[Math.floor(Math.random() * colors.length)],
    w: Math.random() * 12 + 5,
    h: Math.random() * 7  + 4,
    rot: Math.random() * 360,
    rotV: (Math.random() - 0.5) * 12,
  }));
  const start = performance.now(), dur = 2000;
  function frame(now) {
    const t = (now - start) / dur;
    if (t >= 1) { canvas.remove(); then(); return; }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const alpha = t < 0.55 ? 1 : 1 - (t - 0.55) / 0.45;
    bits.forEach((p) => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.6; p.vx *= 0.98; p.rot += p.rotV;
      ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = p.color;
      ctx.translate(p.x, p.y); ctx.rotate(p.rot * Math.PI / 180);
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

function showSplash() {
  state = 'WELCOME';
  const card = SPLASH_CARDS[Math.floor(Math.random() * SPLASH_CARDS.length)];
  setScreen(
    `<div class="tap-all">
       <div class="splash-msg">${card}</div>
       <div class="tap-prompt">TAP ANYWHERE TO BEGIN</div>
     </div>`,
    () => {
      let tapped = false;
      stage.onclick = () => {
        if (tapped) return;
        tapped = true;
        stage.onclick = null;
        launchConfetti(firstRunDone() ? showTrail : () => showSafety(0));
      };
    }
  );
}

function firstRunDone() {
  try { return localStorage.getItem('mg_safety') === '1'; } catch (e) { return true; }
}

function showSafety(i) {
  state = 'WELCOME';
  audio.say(['safe' + (i + 1)]);
  setScreen(
    `<div class="tap-all"><div class="sub">${SAFETY_CARDS[i]}</div></div>`,
    () => {
      stage.querySelector('.tap-all').onclick = () => {
        if (i + 1 < SAFETY_CARDS.length) return showSafety(i + 1);
        try { localStorage.setItem('mg_safety', '1'); } catch (e) {}
        showTrail();
      };
    }
  );
}

function showTrail() {
  state = 'WELCOME';
  session = null;
  paused = false;
  releaseWake();

  const nextMilestone = MILESTONES.find((m) => m.step > trailSteps);
  const greeting = GREETINGS[trailSteps % GREETINGS.length];
  let goalLine, distLine;
  if (trailSteps === 0) {
    goalLine = "YOUR FIRST STOP: 5 SESSIONS";
    distLine = "5 SESSIONS AWAY";
  } else if (nextMilestone) {
    const dist = nextMilestone.step - trailSteps;
    goalLine = nextMilestone.caption.replace(/\.$/, '');
    distLine = dist === 1 ? "1 SESSION AWAY" : `${dist} SESSIONS AWAY`;
  } else {
    goalLine = "INCREDIBLE.";
    distLine = "YOUR TRAIL CONTINUES";
  }

  setScreen(
    `<div class="tap-all">
       <div class="sub">${greeting}</div>
       <div class="title-sm accent">${goalLine}</div>
       <div class="sub">${distLine}</div>
     </div>`,
    () => {
      stage.querySelector('.tap-all').onclick = () => showFlavor(25);
    }
  );
}

function showFlavor(lengthMin) {
  state = 'FLAVOR';
  const options = shuffle(FLAVORS).slice(0, 3);
  audio.say([
    'flavor_intro',
    'pos_top', FLAVOR_AUDIO[options[0].name],
    'pos_middle', FLAVOR_AUDIO[options[1].name],
    'pos_bottom', FLAVOR_AUDIO[options[2].name],
  ]);
  setScreen(
    options.map((f, i) => `<button class="btn" data-i="${i}">${f.name}</button>`).join(''),
    () => {
      stage.querySelectorAll('.btn').forEach((b) => {
        b.onclick = () => startSession(lengthMin, options[Number(b.dataset.i)]);
      });
    }
  );
}

// ---------------------------------------------------------------- session runner

let wakeLock = null;

async function keepAwake() {
  if (!('wakeLock' in navigator)) return;
  try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}

function releaseWake() {
  if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && session) keepAwake();
});

function startSession(lengthMin, flavor) {
  state = 'SESSION';
  keepAwake();
  session = {
    lengthMin,
    flavor: flavor.name,
    plan: composeSession(lengthMin, flavor),
    idx: 0,
    results: [],
    midShown: false,
  };
  showExerciseIntro();
}

const currentEx = () => session.plan[session.idx];

function showExerciseIntro() {
  const ex = currentEx();
  audio.say(['ex_' + ex.id, 'ready_prompt']);
  setScreen(
    `<div class="grow">
       <div class="title-sm">${ex.name}</div>
       <div class="sub">${ex.instruction}</div>
     </div>
     <button class="btn done-btn" id="done">START</button>`,
    () => { byId('done').onclick = runWork; }
  );
}

function runWork() {
  const ex = currentEx();
  if (ex.dose.steps) return runFloorRecovery(ex);
  if (ex.dose.reps) return runReps(ex, 1);
  return runHold(ex, 1);
}

function countScreen(initial, withSpeed, wire) {
  const speedRow = withSpeed
    ? `<div class="btn-row">
         <button class="btn row-btn" id="slower">SLOWER</button>
         <button class="btn row-btn" id="faster">FASTER</button>
       </div>`
    : '';
  setScreen(
    `<div class="grow"><div class="count" id="count">${initial}</div></div>
     ${speedRow}
     <button class="btn done-btn" id="done">DONE</button>`,
    wire
  );
}

function runReps(ex, side) {
  let count = 1;
  countScreen(count, true, () => {
    const seq = screenSeq;
    byId('done').onclick = () => { clearTimer(); segmentDone(ex, side); };
    const tick = () => {
      if (count >= ex.dose.reps) { clearTimer(); return segmentDone(ex, side); }
      count++;
      byId('count').textContent = count;
      audio.say(['n' + count]);
    };
    const start = () => every(T(repMs(ex)), tick);
    byId('faster').onclick = () => { adjustSpeed(-0.5); audio.say(['faster']); start(); };
    byId('slower').onclick = () => { adjustSpeed(0.5); audio.say(['slower']); start(); };
    audio.say(side === 1 ? ['here_we_go', 'n1'] : ['n1']).then(() => {
      if (seq === screenSeq) start();
    });
  });
}

function runHold(ex, side) {
  const total = ex.dose.seconds;
  let remaining = total;
  countScreen(remaining, false, () => {
    const seq = screenSeq;
    byId('done').onclick = () => { clearTimer(); segmentDone(ex, side); };
    audio.say(['hold', 'n' + total, 'seconds']).then(() => {
      if (seq !== screenSeq) return;
      every(T(1000), () => {
        remaining--;
        if (remaining <= 0) {
          clearTimer();
          return setTimeout(() => segmentDone(ex, side), T(900));
        }
        byId('count').textContent = remaining;
        if (remaining === Math.floor(total / 2) && total >= 20) audio.say(['halfway']);
        else if (remaining <= 5) audio.say(['n' + remaining]);
      });
    });
  });
}

function segmentDone(ex, side) {
  if (!session || ex !== currentEx()) return;
  if (ex.dose.perSide && side === 1) return showBetweenSides(ex);
  recordResult(ex);
  afterExercise();
}

function showBetweenSides(ex) {
  audio.say([BETWEEN_AUDIO[ex.dose.betweenText]]);
  setScreen(
    `<div class="grow"><div class="title-sm accent">${ex.dose.betweenText}</div></div>
     <button class="btn done-btn" id="done">READY</button>`,
    () => {
      const go = () => {
        clearTimer();
        if (ex.dose.reps) runReps(ex, 2); else runHold(ex, 2);
      };
      byId('done').onclick = go;
      after(T(6000), go);
    }
  );
}

function runFloorRecovery(ex) {
  const d = ex.dose;
  let cycle = 1;
  let stepIdx = 0;

  function showStep() {
    const text = d.steps[stepIdx];
    const keys = [ex.id + '_s' + (stepIdx + 1)];
    if (stepIdx === 0 && cycle === 2) keys.unshift('fr_again');
    setScreen(
      `<div class="grow">
         <div class="sub accent">ROUND ${cycle} OF ${d.cycles}</div>
         <div class="title-sm">${text}</div>
       </div>
       <button class="btn done-btn" id="done">NEXT</button>`,
      () => {
        const seq = screenSeq;
        byId('done').onclick = advance;
        audio.say(keys).then(() => {
          if (seq === screenSeq) after(T(d.stepSeconds * 1000), advance);
        });
      }
    );
  }

  function advance() {
    clearTimer();
    stepIdx++;
    if (stepIdx >= d.steps.length) {
      stepIdx = 0;
      cycle++;
      if (cycle > d.cycles) { recordResult(ex); return afterExercise(); }
    }
    showStep();
  }

  showStep();
}

function recordResult(ex) {
  const d = ex.dose;
  session.results.push({
    id: ex.id,
    name: ex.name,
    amount: d.reps || d.seconds || d.cycles,
    completed: true,
  });
}

function afterExercise() {
  const ex = currentEx();
  if (ex.type === 'ladder' && !ex.review && !ex.felt) return showFeel(ex);
  session.idx++;
  if (session.idx >= session.plan.length) return showConfidence();
  if (!session.midShown && session.idx >= Math.ceil(session.plan.length / 2)) {
    session.midShown = true;
    return showMidMessage();
  }
  showRest();
}

// After a floor-ladder stage: did it feel okay? Decides whether he moves up or back.
function showFeel(ex) {
  audio.say(['feel_q']);
  setScreen(
    `<button class="btn" data-c="easy">EASY</button>
     <button class="btn" data-c="right">JUST RIGHT</button>
     <button class="btn" data-c="hard">TOO HARD OR KNEE HURT</button>`,
    () => {
      stage.querySelectorAll('.btn').forEach((b) => {
        b.onclick = () => {
          ex.felt = true;
          const result = recordFeel(b.dataset.c);
          if (result === 'up') return showFloorMsg('NEW LEVEL.<br>WELL DONE.', 'lvl_up');
          if (result === 'back') return showFloorMsg('NO PROBLEM. WE TAKE A STEP BACK. SLOW IS SAFE.', 'lvl_back');
          if (b.dataset.c === 'hard') return showFloorMsg('NO PROBLEM. SLOW IS SAFE. IF YOUR KNEE STAYS SORE, CALL YOUR DOCTOR.', 'lvl_hard');
          afterExercise();
        };
      });
    }
  );
}

function showFloorMsg(html, audioKey) {
  audio.say([audioKey]).then(() => {});
  setScreen(
    `<div class="tap-all"><div class="sub accent">${html}</div></div>`,
    () => {
      const go = () => { clearTimer(); afterExercise(); };
      stage.querySelector('.tap-all').onclick = go;
      after(T(10000), go);
    }
  );
}

function showRest() {
  let remaining = REST_SECONDS;
  audio.say([pick(PRAISE_KEYS), 'rest']);
  setScreen(
    `<div class="grow">
       <div class="sub accent">REST</div>
       <div class="count" id="count">${remaining}</div>
     </div>
     <button class="btn done-btn" id="done">NEXT</button>`,
    () => {
      byId('done').onclick = () => { clearTimer(); showExerciseIntro(); };
      every(T(1000), () => {
        remaining--;
        if (remaining <= 0) { clearTimer(); return showExerciseIntro(); }
        byId('count').textContent = remaining;
      });
    }
  );
}

function showMidMessage() {
  setScreen(
    `<div class="grow">
       <div class="sub accent">HALFWAY THERE,</div>
       <div class="title accent">${JAYANT_NAME}.</div>
       <div class="sub">KEEP GOING!</div>
     </div>
     <button class="btn done-btn" id="done">NEXT</button>`,
    () => {
      audio.say(['halfway']);
      byId('done').onclick = () => { clearTimer(); showExerciseIntro(); };
      after(T(8000), showExerciseIntro);
    }
  );
}

// ---------------------------------------------------------------- closing screens

function sessionStat() {
  const sts = session.results.find((r) => r.id === 'STS');
  if (sts) return `YOU DID ${sts.amount} SIT-TO-STANDS TODAY.`;
  return `YOU FINISHED ${session.results.length} EXERCISES TODAY.`;
}

function sessionStatAudio() {
  const sts = session.results.find((r) => r.id === 'STS');
  if (sts) return ['stat_you_did', 'statn' + sts.amount, 'stat_sit_to_stands'];
  return ['stat_you_finished', 'statn' + session.results.length, 'stat_exercises'];
}

function showConfidence() {
  state = 'CONFIDENCE';
  persistSession();
  const line = sessionStat();
  const keys = sessionStatAudio();
  audio.say(keys);
  setScreen(
    `<div class="tap-all"><div class="title-sm">${line}</div></div>`,
    () => {
      const next = () => { clearTimer(); showTip(); };
      stage.querySelector('.tap-all').onclick = next;
      after(T(30000), next);
    }
  );
}

function showTip() {
  state = 'TIP';
  const i = (trailSteps - 1 + TIPS.length) % TIPS.length;
  audio.say(['tip' + (i + 1)]);
  setScreen(
    `<div class="tap-all">
       <div class="sub accent">BELLY TIP</div>
       <div class="sub">${TIPS[i]}</div>
     </div>`,
    () => {
      const next = () => { clearTimer(); showMessage(); };
      stage.querySelector('.tap-all').onclick = next;
      after(T(30000), next);
    }
  );
}

function showMessage() {
  state = 'MESSAGE';
  if (session.milestone) return showMilestoneMessage(session.milestone);
  showGoodbye(true);
}

function showMilestoneMessage(m) {
  setScreen(
    `<div class="tap-all">
       <div class="title-sm accent">${m.caption}</div>
     </div>`,
    () => {
      const go = () => { if (state !== 'MESSAGE') return; showGoodbye(true); };
      stage.querySelector('.tap-all').onclick = go;
      after(T(15000), go);
    }
  );
}

function showGoodbye(finished) {
  state = 'GOODBYE';
  releaseWake();
  audio.stop();
  setScreen(
    `<div class="tap-all">
       <div class="title-sm">SEE YOU NEXT TIME,<br><span class="accent">${JAYANT_NAME}.</span></div>
     </div>`,
    () => { stage.querySelector('.tap-all').onclick = showTrail; }
  );
}

// ---------------------------------------------------------------- pause (long-press 3s)

function showPauseMenu() {
  if (paused || !inSession()) return;
  paused = true;
  audio.stop();
  audio.say(['pause_menu']);
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `
    <button class="btn" id="resume">RESUME</button>
    <button class="btn" id="stop">STOP</button>`;
  document.body.appendChild(ov);

  const openedAt = Date.now();
  const guard = (fn) => () => { if (Date.now() - openedAt > 500) fn(); };

  ov.querySelector('#resume').onclick = guard(() => {
    paused = false;
    ov.remove();
    audio.say(['resume']);
  });
  ov.querySelector('#stop').onclick = guard(() => {
    paused = false;
    ov.remove();
    clearTimer();
    showGoodbye(false);
  });
}

let longPressTimer = null;

appEl.addEventListener('pointerdown', () => {
  if (!inSession() || paused) return;
  clearTimeout(longPressTimer);
  longPressTimer = setTimeout(showPauseMenu, 3000);
});
['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) =>
  appEl.addEventListener(ev, () => clearTimeout(longPressTimer))
);
document.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------------------------------------------------------------- go

document.getElementById('version').textContent = VERSION;
showSplash();
