# Ares FrontKick SF2 Reduction Critique

## Source Read
- Source clip: `FrontKick`
- Runtime attack name: `FrontKick`
- Original keyed frames: `26` over `0.867s`
- Gameplay attack end from metadata: `0.660s`
- Tail beyond gameplay window: `0.207s`
- Peak left-side reach occurs at frame `10` time `0.367s`

## Reduction Verdict
- Reduced schedule keeps `7` read poses across `40` 60fps gameplay frames.
- `21` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.033s`: guard extended leg, low foot, held pose
- `anticipation` at `0.200s`: guard extended leg, low foot, snappy transition
- `contact` at `0.367s`: strike full leg extension, high foot, snappy transition
- `recoil` at `0.567s`: strike chambered leg, low foot, readable shift
- `settle` at `0.867s`: settle extended leg, low foot, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
 - FrontKick contact needs enough pelvis drive to clear the ballistic drive contract; when it is just under threshold, nudge `contact` and `contactHold` hips rather than stretching the extension.
