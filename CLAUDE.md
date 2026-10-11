# Mama G Moves — Claude Instructions

Falls-prevention exercise PWA for Jayant Capoor ("Mama G"), built by Ambar Capoor.
Live at https://ambarcapoor.github.io/mama-g/
Repo: https://github.com/AMBARCAPOOR/mama-g

## What this is

A stripped-down sibling of the DaddyKool app (D:\DaddyKool). Same exercise engine,
flavors, progression system, and accessibility design — but no Firebase, no personal
voice recordings, no photo stories, no Telegram. Progress lives in localStorage.

## Architecture

- Pure vanilla JS/HTML/CSS — no framework, no build step
- Single file: `app.js` (~900 lines), `index.html`, `styles.css`
- 140 TTS audio clips in `assets/tts/` (edge-tts, calm Christopher voice)
- localStorage keys: `mg_trail` (session count), `mg_progress` (dose progression), `mg_speed_offset`
- No backend, no database, no server — fully static

## Deploying

```
cd D:\MamaG
git add .
git commit -m "vN — description"
git push
```

GitHub Pages auto-deploys from master root. Live in ~60 seconds.
**Bump `VERSION` in app.js on every deploy** — shown tiny bottom-right.

## Hard rules (do not break)

- One element per screen, black background, huge text, nothing near edges
- Audio-first: screens never auto-advance until audio finishes (timers chain after say())
- No equipment required — chair and counter only, Jayant is home alone
- FASTER/SLOWER buttons adjust rep cadence (localStorage `mg_speed_offset`, ±0.5s steps)
- `bodyN = 3`, `shuffle()` for body block order — never revert to head-to-toe sort

## Exercise bank

- **Leg strength (STRENGTH_IDS):** 21 exercises including STS, KE, HB, CKS, WSQ, LSQ,
  HAB, HE, STSp, SU, SCR, WDS, TKE and more
- **Balance (BALANCE_IDS):** 16 exercises including OLB, TS, HTW, STW, SLS, CLK and more
- **5 flavors:** STEADY LEGS (0.6 balance), STRONG SIT (0.4), TALL & PROUD (0.5),
  GROUND SCHOOL (0.35, fr:true), THE WALKABOUT (0.6)
- **TTS clips for new exercises** (SCR, WDS, TKE, CLK) not yet generated — app silently
  skips the intro clip; regenerate with DaddyKool's `tools/gen_tts.py` if wanted

## Progression system

3 consecutive full completions at current dose → +2 reps / +5s (capped at 15 reps / 45s).
Stored in localStorage `mg_progress` as `{ exerciseId: { currentDose, streakAtDose } }`.

## Milestones

Text-only (no audio, no photos) at steps 5, 10, 20, 40, 60, 80, 100.
Edit the `MILESTONES` array in app.js to change captions.

## What's missing vs DaddyKool

- No admin page
- No Firebase / cloud sync (progress lost if browser data cleared)
- No personal voice recordings (uses TTS only)
- No photo stories or trail photos
- No Telegram notifications
- No 30th-session gift celebration

## If you want to add personal voice notes later

Record .mp3 files, drop in `assets/voice/`, reference them in app.js similar to
DaddyKool's WELCOME_VOICE / MID_VOICE / COMPLETION_VOICE pattern.
