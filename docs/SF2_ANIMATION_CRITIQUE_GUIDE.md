# SF2 Animation Critique & Pose Evaluation Guide

## Purpose

This document defines the visual grammar of Street Fighter II-inspired combat animation.

The goal is not realism or motion-capture accuracy. The goal is readability, impact, character, move identity, and combat clarity.

A move should feel authored, intentional, and iconic.

## Prime Directive

A move must read clearly in a single glance.

If the player can identify the move from one frame, the animation is succeeding. If the move only makes sense when viewed at full speed, the animation is failing.

## SF2 Timing Model

Every attack should contain visually distinct phases:

1. Anticipation
2. Commitment
3. Contact
4. Recovery

Never blend phases together until they lose identity.

## Anticipation

Goal: create tension. The audience should know something powerful is about to happen.

Good signs: body coil, weight shift, guard change, hip rotation, foot loading.

Bad signs: immediate attack, tiny anticipation, pure arm movement.

Score 0-10:

- Is the attack telegraphed?
- Does the body prepare?
- Is energy visibly stored?

## Commitment

Goal: the attack should feel irreversible. The fighter is spending momentum.

Good signs: weight transfer, hip drive, torso rotation, center-of-mass movement.

Bad signs: floating limbs, isolated arm motion, no body involvement.

Score 0-10:

- Does the body commit?
- Is momentum visible?
- Does the fighter look invested?

## Contact

Goal: this is the most important frame. The viewer should want to stop here.

Rules: contact frames should often be held. Never rush through contact. The strongest pose usually occurs here.

Good signs: maximum extension, strong silhouette, weapon readability, clear direction of force.

Bad signs: weak extension, no hold, ambiguous impact.

Score 0-10:

- Would this frame make a good screenshot?
- Is force obvious?
- Is the attack direction obvious?

## Recovery

Goal: show the cost of commitment. Recovery is not a return-to-idle interpolation. Recovery is a combat action.

Good signs: rebalancing, re-centering, guard restoration.

Bad signs: automatic snap back, symmetrical interpolation, motion without intention.

Score 0-10:

- Does recovery feel earned?
- Does it preserve character?
- Does it maintain combat readiness?

## Move Identity

Every move must have a unique identity. Different attacks should not collapse into generic motion.

Axe Kick requires high leg chamber, held high-foot pose, heavy downward motion, and held contact.

Snap Kick requires burst acceleration, fast extension, minimal chamber, and quick recovery.

Shield Bash requires shield leading body, forward weight transfer, and impact hold.

Sword Cut requires clear blade path, commitment through hips, and follow-through preserving cut direction.

## Silhouette Test

Pause the animation at anticipation, contact, and recovery.

Ask: can the move be identified instantly?

If not, redesign the pose. Good silhouette beats realistic anatomy.

## Combat Readability Test

Ask:

- Which limb is attacking?
- Which direction is force moving?
- Where is the threat?
- What is the intended range?

If any answer is unclear, the pose fails.

## Weight Test

Check that hips initiate motion, torso follows, and limbs finish.

Avoid arms moving independently, upper-body-only attacks, and floating motion.

## Frame Hold Rules

Street Fighter II frequently exaggerates holds.

Prefer holding anticipation, contact, and extreme poses. Do not evenly distribute timing.

Favor `Hold -> Burst -> Hold` over constant motion.

## Agent Critique Checklist

For every attack, score each category from 0-10:

- Readability
- Anticipation
- Commitment
- Contact
- Recovery
- Weight
- Silhouette
- Move Identity
- SF2 Feel

Overall score is the average of all categories.

## Final Rule

Never optimize for realism. Optimize for readability.

A player should understand the attack instantly. Street Fighter II remains influential because every attack is readable, iconic, and memorable. That standard should guide all animation decisions.
