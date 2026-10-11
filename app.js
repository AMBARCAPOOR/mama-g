'use strict';

// ---------------------------------------------------------------- config

const VERSION = 'v1';

const JAYANT_NAME = 'JAYANT';

const FAST = new URLSearchParams(location.search).has('fast');
const T = (ms) => (FAST ? Math.max(80, ms / 10) : ms);

const REST_SECONDS = 25;
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

function loadLocalState() {
  const t = parseInt(localStorage.getItem('mg_trail'), 10);
  if (!isNaN(t)) trailSteps = t;
  try {
    const p = JSON.parse(localStorage.getItem('mg_progress') || '{}');
    Object.assign(progressCache, p);
  } catch (e) {}
}

function saveLocalState() {
  try {
    localStorage.setItem('mg_trail', String(trailSteps));
    localStorage.setItem('mg_progress', JSON.stringify(progressCache));
  } catch (e) {}
}

loadLocalState();

// ---------------------------------------------------------------- exercise bank

const FR_STEPS = [
  'SIT ON THE EDGE OF THE BED',
  'LOWER DOWN TO KNEELING. HANDS ON THE BED.',
  'SIT TO THE SIDE ON THE FLOOR',
  'LIE DOWN. SLOW AND EASY.',
  'ROLL ONTO YOUR SIDE',
  'PRESS UP TO SITTING',
  'COME UP TO KNEELING. HANDS ON THE BED.',
  'STRONG FOOT FLAT ON THE FLOOR',
  'PUSH UP TO STANDING. TAKE YOUR TIME.',
];

const EXERCISES = {
  STS: {
    name: 'SIT TO STAND', type: 'strength',
    instruction: 'RISE FROM YOUR CHAIR. SIT BACK DOWN SLOWLY.',
    dose: { reps: 8 },
  },
  HR: {
    name: 'HEEL RAISES', type: 'strength',
    instruction: 'HOLD THE COUNTER. RISE UP ON YOUR TOES. LOWER SLOWLY.',
    dose: { reps: 10 },
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
  KE: {
    name: 'KNEE EXTENSIONS', type: 'strength',
    instruction: 'SIT TALL. STRAIGHTEN ONE KNEE. HOLD, THEN LOWER.',
    dose: { reps: 10, perSide: true, betweenText: 'OTHER LEG' },
  },
  AC: {
    name: 'ANKLE CIRCLES', type: 'mobility',
    instruction: 'SIT TALL. CIRCLE YOUR ANKLES, SLOW AND EASY.',
    dose: { reps: 10, repSeconds: 3, perSide: true, betweenText: 'OTHER DIRECTION' },
  },
  HB: {
    name: 'HIP BRIDGES', type: 'strength',
    instruction: 'LIE ON THE BED, KNEES BENT. LIFT YOUR HIPS UP.',
    dose: { reps: 8 },
  },
  WP: {
    name: 'WALL PUSH-UPS', type: 'strength',
    instruction: 'HANDS ON THE WALL. LEAN IN, PUSH BACK.',
    dose: { reps: 8 },
  },
  SB: {
    name: 'EASY BREATHING', type: 'cooldown',
    instruction: 'SIT TALL. BREATHE SLOW AND DEEP.',
    dose: { seconds: 60 },
  },
  FR: {
    name: 'GROUND SCHOOL', type: 'skill',
    instruction: 'YOUR WAY UP FROM THE FLOOR. SLOW AND STEADY. YOU KNOW THIS.',
    dose: { cycles: 2, stepSeconds: 12, steps: FR_STEPS },
  },
  CKS: {
    name: 'CHAIR KNEE SQUATS', type: 'strength',
    instruction: 'HOLD THE CHAIR BACK. BEND YOUR KNEES GENTLY, THEN RISE TALL.',
    dose: { reps: 8 },
  },
  WSQ: {
    name: 'WALL SQUATS', type: 'strength',
    instruction: 'BACK AGAINST THE WALL. SLIDE DOWN A LITTLE AND HOLD.',
    dose: { seconds: 20 },
  },
  PSQ: {
    name: 'PARTIAL SQUATS', type: 'strength',
    instruction: 'HOLD THE TABLE. BEND YOUR KNEES HALFWAY, THEN BACK UP.',
    dose: { reps: 6 },
  },
  LSQ: {
    name: 'LUNGE STEPS', type: 'strength',
    instruction: 'HOLD THE CHAIR. STEP ONE FOOT FORWARD AND BEND GENTLY.',
    dose: { reps: 5, perSide: true, betweenText: 'OTHER LEG' },
  },
  RKS: {
    name: 'REVERSE KNEE LIFTS', type: 'strength',
    instruction: 'HOLD THE CHAIR BACK. LIFT YOUR HEEL UP BEHIND YOU.',
    dose: { reps: 8, perSide: true, betweenText: 'OTHER LEG' },
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
  TPU: {
    name: 'TABLE PUSH-UPS', type: 'strength',
    instruction: 'HANDS ON THE TABLE EDGE. LEAN IN, PUSH BACK.',
    dose: { reps: 6 },
  },
  WPU: {
    name: 'WIDE WALL PUSH-UPS', type: 'strength',
    instruction: 'HANDS WIDE ON THE WALL. LEAN IN, PUSH BACK.',
    dose: { reps: 8 },
  },
  TRO: {
    name: 'CHAIR DIPS', type: 'strength',
    instruction: 'HANDS ON THE CHAIR EDGE. BEND YOUR ELBOWS A LITTLE, PRESS BACK UP.',
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
  SHR: {
    name: 'SHOULDER ROLLS', type: 'strength',
    instruction: 'STAND TALL. ROLL YOUR SHOULDERS SLOWLY.',
    dose: { reps: 10, repSeconds: 2, perSide: true, betweenText: 'NOW BACKWARD' },
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
  SFR: {
    name: 'SIT FROM FLOOR', type: 'skill',
    instruction: 'USING THE BED, LOWER DOWN TO SIT ON THE FLOOR, THEN BACK UP.',
    dose: { reps: 2 },
  },
  GSR: {
    name: 'GET-UP REVIEW', type: 'skill',
    instruction: 'ONE SLOW WALK-THROUGH OF YOUR WAY UP FROM THE FLOOR.',
    dose: { cycles: 1, stepSeconds: 12, steps: FR_STEPS },
  },
  FR2: {
    name: 'KNEEL TO STAND', type: 'skill',
    instruction: 'HOLD THE CHAIR. KNEEL DOWN THEN PRESS BACK UP TO STANDING.',
    dose: { cycles: 2, stepSeconds: 10, steps: [
      'HOLD THE CHAIR SEAT. LOWER SLOWLY TO KNEELING.',
      'BRING ONE FOOT FORWARD, FLAT ON THE FLOOR.',
      'HANDS ON CHAIR ARMS. PRESS UP TO STANDING.',
    ]},
  },
  FR3: {
    name: 'FULL FLOOR TO STAND', type: 'skill',
    instruction: 'BACKWARD-CHAINED PRACTICE. WE BUILD FROM THE LAST STEP FIRST.',
    dose: { cycles: 2, stepSeconds: 12, steps: [
      'STAND NEAR THE WALL. LOWER TO HALF-KNEEL.',
      'SIT DOWN TO THE FLOOR. TAKE YOUR TIME.',
      'ROLL ONTO YOUR SIDE. EASY.',
      'PRESS UP TO SEATED. HANDS ON WALL.',
      'COME UP TO KNEELING.',
      'STEP ONE FOOT FORWARD. PUSH TO STANDING.',
    ]},
  },
  FR4: {
    name: 'CONTROLLED LOWERING', type: 'skill',
    instruction: 'HOLD THE CHAIR ARMS. LOWER YOURSELF DOWN TO SEATED. NICE AND SLOW.',
    dose: { reps: 5 },
  },
  FR5: {
    name: 'SIDE-LIE TO SEATED', type: 'skill',
    instruction: 'LIE ON YOUR SIDE ON THE BED. PRESS UP TO SEATED USING YOUR ARMS.',
    dose: { reps: 3 },
  },
  FR6: {
    name: 'FOUR-POINT HOLD', type: 'skill',
    instruction: 'ON HANDS AND KNEES ON THE MAT. HOLD STEADY AND BREATHE.',
    dose: { seconds: 15 },
  },
  FR7: {
    name: 'BEAR CRAWL TO BED', type: 'skill',
    instruction: 'ON ALL FOURS ON THE MAT. WALK YOUR HANDS TOWARD THE BED.',
    dose: { reps: 3 },
  },
  FR8: {
    name: 'FORWARD STAGGER STEP', type: 'skill',
    instruction: 'STEP FORWARD AND CATCH YOURSELF. CONTROL THE STEP, THEN RECOVER.',
    dose: { reps: 5 },
  },
  FR9: {
    name: 'BACKWARD STAGGER STEP', type: 'skill',
    instruction: 'STEP BACKWARD AND CATCH YOURSELF. STAY IN CONTROL.',
    dose: { reps: 5 },
  },
  FR10: {
    name: 'SIDEWAYS STAGGER STEP', type: 'skill',
    instruction: 'STEP TO THE SIDE AND CATCH YOURSELF. CONTROL THE MOVEMENT.',
    dose: { reps: 5, perSide: true, betweenText: 'OTHER SIDE' },
  },
  FR11: {
    name: 'SWAY AND CATCH', type: 'skill',
    instruction: 'STAND AT THE COUNTER. SWAY FORWARD THEN CATCH YOURSELF.',
    dose: { reps: 5 },
  },
  FR12: {
    name: 'HALF-KNEEL TO STAND', type: 'skill',
    instruction: 'HOLD THE COUNTER. LOWER TO HALF-KNEEL, THEN PUSH BACK UP TO STANDING.',
    dose: { reps: 3 },
  },
  FR13: {
    name: 'LOG ROLL PRACTICE', type: 'skill',
    instruction: 'LIE ON THE BED. ROLL SLOWLY FROM YOUR BACK TO YOUR SIDE AND BACK.',
    dose: { reps: 4 },
  },
  FR14: {
    name: 'REACH PHONE FROM FLOOR', type: 'skill',
    instruction: 'PRACTICE GETTING DOWN AND REACHING YOUR PHONE. THEN BACK UP.',
    dose: { cycles: 1, stepSeconds: 15, steps: [
      'LOWER TO THE FLOOR USING THE BED. SLOW AND STEADY.',
      'REACH OUT FOR YOUR PHONE. NICE AND CONTROLLED.',
      'PRESS BACK UP TO SITTING USING THE BED.',
    ]},
  },
  FR15: {
    name: 'CHAIR SCOOT TO RISE', type: 'skill',
    instruction: 'SIT AT THE CHAIR EDGE. SCOOT FORWARD. THEN STAND.',
    dose: { reps: 5 },
  },
  FR16: {
    name: 'PUSH-UP RISE FROM CUSHION', type: 'skill',
    instruction: 'ON A LOW CUSHION. TWO HANDS DOWN. PUSH YOURSELF UP.',
    dose: { reps: 3 },
  },
  FR17: {
    name: 'RECOVERY STEP WITH RAIL', type: 'skill',
    instruction: 'HOLD THE RAIL. TAKE A BIG RECOVERY STEP AND CATCH YOURSELF.',
    dose: { reps: 5 },
  },
  FR18: {
    name: 'CONTROLLED KNEE LOWER', type: 'skill',
    instruction: 'LET YOUR KNEES LOWER SLOWLY TO THE PADDED MAT. IN CONTROL.',
    dose: { reps: 3 },
  },
  FR19: {
    name: 'RISE FROM SOFT COUCH', type: 'skill',
    instruction: 'SCOOT FORWARD TO THE COUCH EDGE. THEN PUSH UP TO STANDING.',
    dose: { reps: 5 },
  },
  FR20: {
    name: 'GET-UP VIA BOTTOM STAIR', type: 'skill',
    instruction: 'USE THE BOTTOM STAIR AS YOUR STEP. HANDS ON THE RAIL. PUSH UP.',
    dose: { reps: 3 },
  },
  FR21: {
    name: 'REACH AND RECOVER', type: 'skill',
    instruction: 'HOLD THE COUNTER. REACH OUT. THEN PULL YOURSELF BACK TO UPRIGHT.',
    dose: { reps: 5 },
  },
  FR22: {
    name: "GOLFER'S PICKUP", type: 'skill',
    instruction: 'HOLD THE COUNTER. REACH DOWN AS ONE LEG LIFTS BACK. PICK IT UP.',
    dose: { reps: 5 },
  },
  FR23: {
    name: 'LOW-LIGHT GET-UP', type: 'skill',
    instruction: 'EYES MOSTLY CLOSED. FEEL YOUR WAY FROM THE BED USING YOUR HANDS.',
    dose: { cycles: 2, stepSeconds: 12, steps: [
      'SIT ON THE BED EDGE. EYES HALF-CLOSED.',
      'FEET FLAT ON THE FLOOR. FEEL FOR THE GROUND.',
      'HANDS ON THE BED. LOWER TO KNEELING.',
      'FEEL FOR THE BED EDGE. PRESS BACK UP TO STANDING.',
    ]},
  },
  FR24: {
    name: 'WEIGHT-SHIFT ON PAD', type: 'skill',
    instruction: 'STAND ON THE FOAM PAD. SHIFT YOUR WEIGHT SLOWLY SIDE TO SIDE.',
    dose: { seconds: 30 },
  },
  FR25: {
    name: 'FREEZE AND ASSESS', type: 'skill',
    instruction: 'STEP OUT AND STUMBLE SLIGHTLY. FREEZE. CHECK YOUR BALANCE BEFORE MOVING.',
    dose: { reps: 5 },
  },
  FR26: {
    name: 'FULL GET-UP TIMED', type: 'skill',
    instruction: "ONE FULL GET-UP FROM THE FLOOR. YOUR WAY. YOUR TIME. LET'S SEE IT.",
    dose: { cycles: 1, stepSeconds: 12, steps: FR_STEPS },
  },
  CS: {
    name: 'CALF STRETCH', type: 'mobility',
    instruction: 'HANDS ON THE WALL. ONE FOOT BACK, HEEL FLAT. HOLD THE STRETCH.',
    dose: { seconds: 20, perSide: true, betweenText: 'OTHER LEG' },
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
  SMB: {
    name: 'SEATED HIGH MARCH', type: 'strength',
    instruction: 'SIT TALL. MARCH YOUR KNEES UP AS HIGH AS FEELS GOOD. SLOW AND STEADY.',
    dose: { seconds: 30 },
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
  STSp: {
    name: 'SIT-STAND WITH PAUSE', type: 'strength',
    instruction: 'RISE FROM THE CHAIR. PAUSE HALFWAY. THEN RISE ALL THE WAY.',
    dose: { reps: 6 },
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
  GS: {
    name: 'GRIP SQUEEZE', type: 'strength',
    instruction: 'SQUEEZE THE BALL IN YOUR HAND, HOLD A MOMENT, THEN RELAX.',
    dose: { reps: 10 },
  },
  FC: {
    name: "FARMER'S CARRY", type: 'strength',
    instruction: 'HOLD SOMETHING LIGHT IN EACH HAND. WALK SLOWLY ACROSS THE ROOM AND BACK.',
    dose: { seconds: 30 },
  },
  SU: {
    name: 'STEP-UPS', type: 'strength',
    instruction: 'HOLD THE RAIL. STEP UP ONTO THE LOW STEP. STEP BACK DOWN.',
    dose: { reps: 6, perSide: true, betweenText: 'OTHER LEG' },
  },
  CY: {
    name: 'CHAIR CAT-COW', type: 'mobility',
    instruction: 'SIT TALL. ARCH YOUR BACK AND LOOK UP, THEN ROUND IT AND LOOK DOWN.',
    dose: { reps: 8 },
  },
  HS: {
    name: 'HAMSTRING STRETCH', type: 'mobility',
    instruction: 'SIT AT THE CHAIR EDGE. STRAIGHTEN ONE LEG, LEAN FORWARD GENTLY.',
    dose: { seconds: 20, perSide: true, betweenText: 'OTHER LEG' },
  },
  QS: {
    name: 'QUAD STRETCH', type: 'mobility',
    instruction: 'HOLD THE WALL. LIFT YOUR HEEL BEHIND YOU, KNEES TOGETHER. HOLD.',
    dose: { seconds: 20, perSide: true, betweenText: 'OTHER LEG' },
  },
  RD: {
    name: 'REACH DRILL', type: 'mobility',
    instruction: 'HOLD THE COUNTER. REACH UP HIGH AND ACROSS YOUR BODY, BOTH SIDES.',
    dose: { reps: 6, perSide: true, betweenText: 'OTHER SIDE' },
  },
  F8: {
    name: 'FIGURE-8 WEIGHT SHIFT', type: 'balance',
    instruction: 'HOLD THE COUNTER. TRACE A SLOW FIGURE-8 PATTERN WITH YOUR WEIGHT.',
    dose: { seconds: 30 },
  },
  BB: {
    name: 'BOX BREATHING', type: 'cooldown',
    instruction: 'IN FOUR COUNTS. HOLD FOUR. OUT FOUR. HOLD FOUR. SLOW AND EASY.',
    dose: { seconds: 60 },
  },
  HK: {
    name: 'HIGH-KNEE MARCH', type: 'balance',
    instruction: 'HOLD THE COUNTER. MARCH IN PLACE, LIFTING YOUR KNEES AS HIGH AS FEELS GOOD.',
    dose: { seconds: 30 },
  },
  CD: {
    name: 'FULL-BODY STRETCH', type: 'cooldown',
    instruction: 'STAND AGAINST THE WALL. REACH TALL AND STRETCH YOUR WHOLE BODY OUT.',
    dose: { seconds: 60 },
  },
  SCR: {
    name: 'SEATED CALF RAISES', type: 'strength',
    instruction: 'SIT TALL. RISE UP ON YOUR TOES AS HIGH AS YOU CAN. LOWER SLOWLY.',
    dose: { reps: 12 },
  },
  WDS: {
    name: 'WIDE STANCE SQUAT', type: 'strength',
    instruction: 'HOLD THE COUNTER. FEET WIDE APART. BEND YOUR KNEES GENTLY AND RISE.',
    dose: { reps: 8 },
  },
  TKE: {
    name: 'TERMINAL KNEE EXTENSION', type: 'strength',
    instruction: 'HOLD THE CHAIR BACK. SLIGHT BEND IN YOUR KNEE. SLOWLY STRAIGHTEN IT FULLY. SQUEEZE AT THE TOP.',
    dose: { reps: 10, perSide: true, betweenText: 'OTHER LEG' },
  },
  CLK: {
    name: 'CLOCK STEPS', type: 'balance',
    instruction: 'HOLD THE COUNTER. STEP OUT LIKE THE HANDS OF A CLOCK. FRONT, DIAGONAL, SIDE, BACK. RETURN EACH TIME.',
    dose: { reps: 6, perSide: true, betweenText: 'OTHER LEG' },
  },
};

function getDose(id) {
  const base = EXERCISES[id].dose;
  const p = progressCache[id];
  if (!p || !p.currentDose) return base;
  if (base.reps) return { ...base, reps: p.currentDose };
  if (base.seconds) return { ...base, seconds: p.currentDose };
  return base;
}

// ---------------------------------------------------------------- flavors

const BALANCE_IDS = [
  'MIP', 'TS', 'HTW', 'OLB', 'FBW', 'SBW', 'TND', 'CBL',
  'STW', 'SLS', 'WSS', 'WSF', 'THR', 'F8', 'HK', 'CLK',
];
const STRENGTH_IDS = [
  'STS', 'HR', 'TR', 'SLR', 'KE', 'HB', 'WP',
  'CKS', 'WSQ', 'PSQ', 'LSQ', 'RKS',
  'TPU', 'WPU', 'TRO', 'ARC', 'WTW', 'CRL', 'SHR',
  'HAB', 'HE', 'SMB', 'STSp', 'GS', 'FC', 'SU',
  'SCR', 'WDS', 'TKE',
];
const WARMUP_MOBILITY_IDS = [
  'AC', 'NST', 'SST', 'HST', 'CST', 'AST',
  'CS', 'NR', 'SR', 'WS', 'CY', 'TT', 'RD',
];
const WARMUP_MOVEMENT_IDS = ['MIP', 'FBW', 'SBW', 'SHR', 'ARC', 'HK'];
const COOLDOWN_BREATHING_IDS = ['SB', 'BDC', 'BOX', 'PSB', 'BAW', 'BB', 'CD', 'HS', 'QS'];

const SKILL_POOL = [
  'FR', 'FR', 'FR', 'FR',
  'FR2', 'FR3', 'FR4', 'FR5', 'FR6', 'FR7', 'FR8', 'FR9', 'FR10',
  'FR11', 'FR12', 'FR13', 'FR14', 'FR15', 'FR16', 'FR17', 'FR18',
  'FR19', 'FR20', 'FR21', 'FR22', 'FR23', 'FR24', 'FR25', 'FR26',
  'SFR', 'GSR',
];

const FLAVORS = [
  {
    name: 'STEADY LEGS', balanceRatio: 0.6,
    weights: {
      TS: 3, HTW: 3, OLB: 3, TND: 2, FBW: 2, SBW: 2, CBL: 2, MIP: 2, STS: 2, SLR: 2, CKS: 2, LSQ: 2,
      STW: 3, SLS: 3, WSS: 2, WSF: 2, THR: 3, F8: 2, HK: 2, STSp: 2, HAB: 2, HE: 2,
      CLK: 3, TKE: 2, SCR: 2, WDS: 2,
    },
  },
  {
    name: 'STRONG SIT', balanceRatio: 0.4,
    weights: {
      STS: 3, KE: 3, CKS: 3, PSQ: 2, SLR: 2, HB: 2, TRO: 1, RKS: 2,
      STSp: 3, SMB: 2, GS: 1, HR: 2, TR: 2, OLB: 2, TS: 2,
      TKE: 3, SCR: 2, WDS: 2,
    },
  },
  {
    name: 'TALL & PROUD', balanceRatio: 0.5,
    weights: {
      WP: 1, WPU: 1, HR: 3, HTW: 3, TPU: 1, TR: 3, WSQ: 2, WTW: 1, CRL: 1, ARC: 2, SHR: 2,
      WS: 2, STW: 2, SU: 3, HAB: 2, OLB: 2, TS: 2,
      SCR: 3, TKE: 2, WDS: 2, CLK: 2,
    },
  },
  {
    name: 'GROUND SCHOOL', balanceRatio: 0.35, fr: true,
    weights: { HB: 2, STS: 2, CKS: 2, PSQ: 2, STSp: 2, SMB: 2, KE: 3, SU: 2, OLB: 2, TKE: 3, WDS: 2 },
  },
  {
    name: 'THE WALKABOUT', balanceRatio: 0.6,
    weights: {
      MIP: 3, HTW: 3, TND: 3, FBW: 2, SBW: 2, LSQ: 2, STS: 2, HR: 3, TR: 3,
      STW: 3, HK: 3, SU: 3, HAB: 2, HE: 2, FC: 2, THR: 2,
      CLK: 3, SCR: 2, WDS: 2,
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
  'STEADY LEGS': 'fl_steady',
  'STRONG SIT': 'fl_strongsit',
  'TALL & PROUD': 'fl_tall',
  'GROUND SCHOOL': 'fl_ground',
  'THE WALKABOUT': 'fl_walkabout',
};

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

const PROGRESSION_TYPES = { strength: true, balance: true, skill: true };

function progressExercise(id) {
  const ex = EXERCISES[id];
  if (!PROGRESSION_TYPES[ex.type]) return;
  const kind = ex.dose.reps ? 'reps' : ex.dose.seconds ? 'seconds' : null;
  if (!kind) return;
  const p = progressCache[id] || { currentDose: ex.dose[kind], streakAtDose: 0 };
  p.streakAtDose = (p.streakAtDose || 0) + 1;
  if (p.streakAtDose >= 3) {
    p.streakAtDose = 0;
    const inc = kind === 'reps' ? 2 : 5;
    const cap = kind === 'reps' ? 15 : 45;
    p.currentDose = Math.min(cap, p.currentDose + inc);
  }
  progressCache[id] = p;
}

// ---------------------------------------------------------------- session composer

function composeSession(lengthMin, flavor) {
  const warmup = [pick(WARMUP_MOBILITY_IDS), pick(WARMUP_MOVEMENT_IDS)];
  const notInWarmup = (id) => !warmup.includes(id);
  const bodyN  = 3;
  const picksN = bodyN - (flavor.fr ? 1 : 0);
  const balanceN = Math.min(Math.round(picksN * flavor.balanceRatio), picksN - 1);
  const strength = weightedSample(STRENGTH_IDS.filter(notInWarmup), flavor.weights, picksN - balanceN);
  const balance  = weightedSample(BALANCE_IDS.filter(notInWarmup), flavor.weights, balanceN);
  const body = shuffle([...strength, ...balance]);
  const ids = [
    ...warmup,
    ...body,
    ...(flavor.fr ? [pick(SKILL_POOL)] : []),
    pick(COOLDOWN_BREATHING_IDS),
  ];
  return ids.map((id) => ({ id, ...EXERCISES[id], dose: getDose(id) }));
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
        launchConfetti(showTrail);
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
      stage.querySelector('.tap-all').onclick = () => showFlavor(15);
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
    const keys = ['fr_step' + (stepIdx + 1)];
    if (stepIdx === 0 && cycle === 2) keys.unshift('fr_again');
    audio.say(keys);
    setScreen(
      `<div class="grow">
         <div class="sub accent">ROUND ${cycle} OF ${d.cycles}</div>
         <div class="title-sm">${text}</div>
       </div>
       <button class="btn done-btn" id="done">NEXT</button>`,
      () => {
        byId('done').onclick = advance;
        after(T(d.stepSeconds * 1000), advance);
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
  session.idx++;
  if (session.idx >= session.plan.length) return showConfidence();
  if (!session.midShown && session.idx >= Math.ceil(session.plan.length / 2)) {
    session.midShown = true;
    return showMidMessage();
  }
  showRest();
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
