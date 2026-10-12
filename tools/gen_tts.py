"""Generate Mama G TTS clips from tools/clips.json into assets/tts/.

    node tools/make_manifest.js
    python tools/gen_tts.py                 (only clips that don't exist yet)
    python tools/gen_tts.py ex_CKS ex_PSQ   (also regenerate these keys)

Same voice and pace as the original clips (calm Christopher, -15%).
"""

import asyncio
import json
import sys
from pathlib import Path

import edge_tts

VOICE = "en-US-ChristopherNeural"
RATE = "-15%"
ROOT = Path(__file__).resolve().parent
OUT_DIR = ROOT.parent / "assets" / "tts"


async def synth(sem, key, text):
    async with sem:
        await edge_tts.Communicate(text, VOICE, rate=RATE).save(str(OUT_DIR / f"{key}.mp3"))
        print("made", key)


async def main():
    clips = json.loads((ROOT / "clips.json").read_text(encoding="utf-8"))
    force = set(sys.argv[1:])
    todo = {k: v for k, v in clips.items() if k in force or not (OUT_DIR / f"{k}.mp3").exists()}
    print(f"{len(todo)} of {len(clips)} clips to make")
    sem = asyncio.Semaphore(4)
    await asyncio.gather(*(synth(sem, k, v) for k, v in todo.items()))


asyncio.run(main())
