# FPS-911509

Clip name: **pending Drew identification**

Actor: `FPS Arms`  
View: `FPV`  
Sword: intentionally visible during review

## Source evidence

Phone source:

`/storage/emulated/0/Movies/screen-20260921-120958-1790010593369.mp4`

Uploaded-chat filename: `911509.mp4`

- SHA-256: `24383e4ee64277d277b237af934e570fa2c922e1d39f544f40ee5b43ed560616`
- bytes: `8,398,601`
- resolution: `2404 x 1080`
- duration: `4.982767 s`
- frames: `357`

The phone source and chat upload matched exactly by SHA-256 and byte count.

The clean motion repeats approximately every `1.05 s` before Android notification UI intrudes. Representative corresponding starts are about `0.00`, `1.05`, `2.10`, and `3.15 s`.

## One-cycle contact sheet

![One-cycle contact sheet](contact-sheet-cycle.png)

- 4 x 4 sheet
- source window `0.000–1.050 s`
- PNG SHA-256: `5a5fd6c3c12c466fe1090dca0379aa985765cfde03f6aa27c51147a3820ba05f`

## Impact-path contact sheet

![Impact-path contact sheet](contact-sheet-impact-path.png)

- 6 x 3 sheet
- source window `0.100–0.960 s`
- purpose: isolate the broad delivery path and recoil
- PNG SHA-256: `9540150aa1c25a0fb2f21ee706e46abbb84361aa93cd341969da050a602d0deb`

## Loop-consistency contact sheet

![Loop-consistency contact sheet](contact-sheet-loop-consistency.png)

- four corresponding cycle-start samples
- approximate starts: `0.00`, `1.05`, `2.10`, `3.15 s`
- PNG SHA-256: `aad7d884dff50502c1efba85cf1a74229d48a79dc329d8ea9cd78ed2b4498c84`

## Neutral phase description

`compact near-camera guard -> broad lateral / forward delivery -> extended leading-surface phase -> low recoil -> reset`

## Drew interpretation

Drew's immediate read: **it looks like a shield bash, but the same motion also works as a backhand.**

This is recorded as a motion interpretation, not as the canonical embedded clip name.

## Transferable motion-family lesson

This sample is useful because the **trajectory is semantically underdetermined**. The gross motion can support more than one attack identity depending on what becomes the leading striking surface.

Potential interpretations without changing the main path:

- shield face leading -> shield bash;
- forearm / elbow structure leading -> forearm smash;
- back of hand / knuckles leading -> backhand;
- armored gauntlet or weapon pommel leading -> close-range strike.

The action identity is therefore carried heavily by **surface orientation, hand/wrist presentation, and contact pose**, not only by the shoulder/elbow trajectory.

That makes this a promising reusable motion family rather than a one-prop animation.

## Source-motion observations

- The attack leaves a compact near-camera guard with a broad sweep rather than a narrow straight thrust.
- The forearm/hand mass becomes the dominant screen-space shape during delivery.
- The extended phase reads as a surface impact more readily than a point-first stab.
- Recovery drops lower before returning, preventing the motion from feeling like a simple mirrored ping-pong.
- First-person foreshortening exaggerates the incoming surface area, so target-character transfers should preserve the timing and leading-surface logic without blindly copying screen-space scale.

## Open questions

- Exact FPSPlayer embedded clip name.
- Which body surface Drew wants to treat as canonical if this becomes a reusable backhand / bash family.
- Whether a target-character version should keep the low recovery or tighten it for faster chaining.
