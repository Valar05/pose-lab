# Ares LowBackKick SF2 Reduction Critique

## Source Read
- Source clip: `LowBackKick`
- Runtime attack name: `LowBackKick`
- Original keyed frames: `30` over `0.967s`
- Gameplay attack end from metadata: `0.660s`
- Tail beyond gameplay window: `0.307s`
- Peak right-side reach occurs at frame `10` time `0.333s`

## Reduction Verdict
- Reduced schedule keeps `8` read poses across `40` 60fps gameplay frames.
- `22` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.000s`: start extended leg, low foot, readable shift
- `anticipation` at `0.267s`: anticipation extended leg, low foot, snappy transition
- `contact` at `0.333s`: strike full leg extension, low foot, snappy transition
- `recoil` at `0.800s`: recovery loaded leg, low foot, readable shift
- `settle` at `0.967s`: settle extended leg, low foot, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
