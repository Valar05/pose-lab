# Pose Lab Lagoon Roadmap

This roadmap defines the recovery direction for Pose Lab after the Meshy saber false-green failures. The goal is a calm animation authoring tool where visual experience is easy to judge and hard to misreport.

## First Principle

Pose Lab should feel like a visual review and animation craft tool, not a diagnostic maze. Metrics explain failures. Human-visible animation experience accepts or rejects work.

## Recovery Phases

### 1. Truth Before Motion

- Start every session with `node tools/pose_lab_current_truth.mjs --json`.
- Treat `AUTHORITY_REVOKED_FALSE_GREEN` as a hard stop for visual implementation.
- Keep generated evidence out of PR truth unless explicitly promoted.
- Keep tests classified as acceptance, diagnostic, guardrail, or quarantine.

### 2. Calm Review Surface

The review lane should show one coherent story:

- actor
- clip
- source of tuning
- expected visible relationship
- current screenshot/contact sheet
- Sense Simulation verdict
- open red-build blockers

A route label, marker, metric, or JSON flag must never be more visually prominent than the screenshot relationship under review.

### 3. Safe Authoring Modes

Pose Lab should separate tasks into clear modes:

- `Browse`: inspect actor and clip libraries.
- `Pose`: edit body pose controls.
- `Weapon`: edit grip/socket/mesh attachment controls.
- `Review`: compare evidence, screenshots, contact sheets, and verdicts.
- `Export`: promote accepted clips or pose data.

Normal body bones should not be selectable outside Pose mode. Weapon controls should not be editable outside Weapon mode. Review mode should be read-only unless the user explicitly starts an edit.

### 4. Disposable Candidates, Protected Goldens

- Generated candidates are disposable and never replace accepted clips automatically.
- Manual authored fixes and accepted baselines are protected records.
- Promotion requires a visible delta, current evidence, and the correct acceptance lane.
- Failed attempts stay quarantined or are removed; they do not become defaults.

### 5. Pleasurable Animation Iteration

The long-term authoring loop should support:

- fast scrub and frame stepping;
- named pose beats such as start, anticipation, contact, hold, recovery;
- onion/ghost pose comparison;
- side-by-side baseline/candidate contact sheets;
- visible “what changed” summaries;
- undo/redo and discard-live-edit for safe experimentation.

The tool is green only when the animation reads correctly to a viewer, not when the implementation found a number that makes a metric pass.

## Current Blocker

The current Meshy saber state remains red. The repository may improve doctrine, tooling, and evidence gates, but it must not claim weapon visual success until the cloud visual lane is human-green and preflight is clean.
