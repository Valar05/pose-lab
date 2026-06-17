# Ares Jab SF2 Reduction Critique

## Source Read
- Source clip: `Jab`
- Runtime attack name: `Jab`
- Original keyed frames: `23` over `0.767s`
- Gameplay attack end from metadata: `0.250s`
- Tail beyond gameplay window: `0.517s`
- Peak left-side reach occurs at frame `4` time `0.167s`

## Reduction Verdict
- Reduced schedule keeps `5` read poses across `15` 60fps gameplay frames.
- `9` keyed source frames land in or near the useful gameplay window.
- Treat these as authored read poses; let the 3D easing carry the in-between motion.

## Anchor Frames
- `start` at `0.033s`: guard half extension, mid guard, readable shift
- `anticipation` at `0.133s`: anticipation guarded, high hands, snappy transition
- `contact` at `0.167s`: strike full extension, high hands, snappy transition
- `recoil` at `0.367s`: recovery extended, high hands, held pose
- `settle` at `0.367s`: recovery extended, high hands, held pose

## Runtime Policy
- Use the reduced poseclip for readable combat timing, not the full mocap clip for hit timing.
- Keep hit activation tied to metadata; late source tail frames are presentation only.
- If the reduced clip glides, clamp root or hip translation separately from hands and shoulders.
