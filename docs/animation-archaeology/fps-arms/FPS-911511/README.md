# FPS-911511

Clip name: **pending Drew identification**

Actor: `FPS Arms`  
View: `FPV`  
Sword: intentionally visible during review

## Why this sample matters

This is the motion Drew originally meant when describing the FPSPlayer donor's unusual anatomy.

The upper arm / shoulder assembly performs an **orbital rotation around the body axis** that would be mechanically and visually blocked by a conventional torso. Because this rig has no torso mass between the arm system and the root, the animation can pass through those normally forbidden orientations without a ribcage or chest mesh self-intersecting.

This is not merely a missing-body artifact. The missing torso is an animation affordance.

## Source evidence

Phone source:

`/storage/emulated/0/Movies/screen-20260921-121112-1790010658482.mp4`

Uploaded-chat filename: `911511.mp4`

- SHA-256: `6ee009e91eb424a5ecc075df572822a9446fe8993ede853ee6eba91aa9b0123e`
- bytes: `8,428,608`
- resolution: `1080 x 2404`
- duration: `14.156733 s`
- frames: `906`

The phone source and chat upload matched exactly by SHA-256 and byte count.

The clean repeated animation before the later timeline / notification UI has an estimated period of about `1.28 s`.

Representative cycle starts used for review are approximately `1.02`, `2.30`, `3.58`, `4.86`, and `6.14 s`.

## One-cycle contact sheet

![One-cycle contact sheet](contact-sheet-cycle.png)

- 4 x 4 sheet
- source window `1.020–2.300 s`
- captures one full orbit / attack / recovery cycle
- PNG SHA-256: `2613aad197adf831c2ea3aeb73a0ae17445b96a18ec4f7cfb38512d0e063b56a`

## Shoulder-orbit detail sheet

![Shoulder-orbit detail sheet](contact-sheet-shoulder-orbit.png)

- 6 x 3 sheet
- source window `1.100–1.920 s`
- deliberately concentrates samples around the anatomically impossible-looking rotational passage
- PNG SHA-256: `410ce89e4d1625f97fff6d3a37e51b73f2ecaf8b069606db2ae489b8a12efc37`

## Loop-consistency contact sheet

![Loop-consistency contact sheet](contact-sheet-loop-consistency.png)

- five corresponding cycle samples
- approximate starts: `1.02`, `2.30`, `3.58`, `4.86`, `6.14 s`
- PNG SHA-256: `0b7ac278009a30dab8981d4ae13dd7546c649d9e238c780dc04a3f5d403a446d`

## Neutral phase description

`near-camera ready -> shoulder / arm assembly sweeps around body axis -> weapon and hands pass through normally torso-occluded orientations -> assembly reappears on opposite side -> forward recovery -> ready`

## Structural rig lesson

### Negative anatomy can create positive animation range

A conventional full-body rig pays for realism with constraints:

- shoulders are attached to a ribcage;
- clavicles have a limited believable range;
- arms cannot pass freely through the chest / back volume;
- a 360-degree shoulder-girdle turn would expose catastrophic self-intersection or anatomical inversion.

FPSPlayer removes the torso from that equation. The arm system can therefore rotate around the root far beyond ordinary anatomy while the first-person camera only sees the useful result.

The design principle is:

**Do not automatically repair missing anatomy when the absence is providing useful degrees of freedom.**

For a first-person or otherwise camera-constrained actor, invisible or omitted anatomy can be deliberately used as a motion budget.

## What transfers to other systems

This does **not** mean a normal full-body character should inherit the same transform values.

Transferable ideas include:

- treat unseen anatomy as negotiable when the camera never validates it;
- preserve screen-space continuity over anatomical purity when the presentation warrants it;
- allow rigs designed for constrained viewpoints to use impossible intermediate states;
- separate the visible end-effector path from the hidden body mechanics required to produce it;
- when retargeting to a full-body actor, reconstruct an equivalent readable path rather than copying the impossible shoulder rotation literally.

For 2D deformation, the analog is especially useful: hidden / occluded body regions can absorb rotational discontinuity while the visible hand, weapon, or striking surface follows a clean authored arc.

## Drew observation

Drew specifically called out that the **upper body appears to rotate fully around because there is no torso**. The shoulder-orbit sheet is preserved to keep that observation visually inspectable rather than reducing it to prose.

## Open questions

- Exact FPSPlayer embedded clip name.
- Which joint or combination of joints carries most of the orbital rotation in the source animation.
- Whether the source transform is literally near/full 360 degrees at one joint or distributed through Root / ShoulderCenter / arm-chain rotations.
- How much of this impossible rotation can be productively abstracted into April / other 2D deformation systems without creating visual discontinuity.
