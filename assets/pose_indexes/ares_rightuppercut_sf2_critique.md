# Ares RightUppercut SF2 Reduction Critique

## Source Read
- Source clip: `RightUppercut`
- Runtime attack name: `RightUppercut`
- Original keyed frames: `21` over `0.667s`
- Gameplay attack end from metadata: `0.550s`
- Tail beyond gameplay window: `0.117s`
- Peak right-side reach occurs at frame `14` time `0.467s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `33` 60fps gameplay frames.
- `19` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.000s`: start half extension, mid guard, snappy transition
- `anticipation` at `0.033s`: guard guarded, high hands, snappy transition
- `contact` at `0.267s`: strike extended, high hands, snappy transition
- `recoil` at `0.333s`: strike half extension, high hands, readable shift
- `settle` at `0.667s`: recovery half extension, mid guard, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
