# Ares AxleKick SF2 Reduction Critique

## Source Read
- Source clip: `AxleKick`
- Runtime attack name: `AxleKick`
- Original keyed frames: `28` over `0.933s`
- Gameplay attack end from metadata: `0.660s`
- Tail beyond gameplay window: `0.273s`
- Peak right-side reach occurs at frame `13` time `0.467s`

## Reduction Verdict
- Reduced schedule keeps `8` read poses across `40` 60fps gameplay frames.
- `21` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.033s`: guard extended leg, low foot, readable shift
- `anticipation` at `0.300s`: anticipation loaded leg, mid foot, snappy transition
- `contact` at `0.467s`: strike full leg extension, mid foot, snappy transition
- `recoil` at `0.667s`: recovery loaded leg, low foot, snappy transition
- `settle` at `0.933s`: settle extended leg, low foot, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
