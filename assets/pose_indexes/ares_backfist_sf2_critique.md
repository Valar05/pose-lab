# Ares Backfist SF2 Reduction Critique

## Source Read
- Source clip: `Backfist`
- Runtime attack name: `Backfist`
- Original keyed frames: `24` over `0.767s`
- Gameplay attack end from metadata: `0.660s`
- Tail beyond gameplay window: `0.107s`
- Peak right-side reach occurs at frame `9` time `0.300s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `40` 60fps gameplay frames.
- `22` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.000s`: start half extension, low hands, snappy transition
- `anticipation` at `0.233s`: anticipation guarded, high hands, snappy transition
- `contact` at `0.300s`: strike full extension, high hands, snappy transition
- `recoil` at `0.333s`: strike guarded, mid guard, snappy transition
- `settle` at `0.667s`: recovery half extension, high hands, readable shift

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
