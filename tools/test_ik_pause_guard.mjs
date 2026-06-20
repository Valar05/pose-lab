import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const endpointFn = js.match(/function isEndpointBoneName\(name\) \{[\s\S]*?\n\}/)?.[0] || '';
assert(endpointFn.includes('return isIkControlBoneName(name);'), 'IK endpoints should be only canonical Rigify-style hand/foot controls');
assert(js.includes('if (/toe|finger|thumb|index|middle|ring|pinky|hitbox|end/.test(value)) return false;'), 'thumb/finger/end bones must not become IK controls');
assert(js.includes("const mode = kind === 'ik' && endpoint ? 'ik' : 'fk';"), 'invalid IK selections should downgrade to FK instead of pretending to be IK');
assert(js.includes('control.material.opacity = selected ? 0.72 : 0.5;'), 'detached IK hit controls must be visibly large, not invisible ray targets');
assert(js.includes('this.poseCorrectionSessionActive = false;'), 'pose corrections must be inactive by default so saved edits cannot hijack playback');
assert(js.includes('this.poseOverlayEnabled = false;'), 'pose correction overlay must be off by default');

const overlayFn = js.match(/  applyPoseCorrectionOverlay\(actor = this\.actors\.get\(this\.selected\)\) \{[\s\S]*?\n  \}/)?.[0] || '';
const openCorrectPoseFn = js.match(/  openCorrectPose\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(openCorrectPoseFn.includes('this.poseCorrectionSessionActive = true;'), 'opening Pose mode should activate the correction session');
assert(openCorrectPoseFn.includes('this.poseOverlayEnabled = false;'), 'opening Pose mode must not auto-apply saved corrections');
assert(overlayFn.includes('if (!this.poseCorrectionSessionActive || !this.poseOverlayEnabled) return;'), 'pose correction overlay must be gated behind active Pose mode');
assert(overlayFn.includes('actor.resetPoseCorrectionBase();'), 'pose correction overlay must reset to the current animation sample before applying edits');
assert(overlayFn.indexOf('actor.resetPoseCorrectionBase();') < overlayFn.indexOf('actor.applyPoseCorrection(correction);'), 'reset must happen before applying IK/FK correction');

const resetFn = js.match(/  resetPoseCorrectionBase\(\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(!resetFn.includes('this.mixer.setTime('), 'pose overlay reset must not use mixer-global setTime, which can jump local action time');
assert(resetFn.includes('this.activeAction.time = clampValue(this.activeAction.time || 0, 0, duration);'), 'reset should preserve the current action-local time');
assert(resetFn.includes('this.mixer.update(0);'), 'reset should resample the current local action pose without advancing time');
assert(resetFn.includes('this.reapplyBoneEdits();'), 'reset should preserve legacy bone edits after mixer sampling');
assert(resetFn.includes('this.applyGrounding();'), 'reset should preserve grounding after mixer sampling');

const ikFn = js.match(/  applyPoseIkEdit\(name, edit = \{\}\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(ikFn.includes('this.ikChainForEndpoint(name);'), 'IK edits should still solve a chain from the selected canonical endpoint');
assert(ikFn.includes('solveTwoBoneIk('), 'IK edit should use two-bone solve, not FK rotation of the touched bone');

const beginDragFn = js.match(/  beginTouchPoseDrag\(event\) \{[\s\S]*?\n  \}/)?.[0] || '';
assert(beginDragFn.includes('actor.pauseActive(true);'), 'pose gesture should pause playback before selecting or editing a limb');
assert(beginDragFn.includes('actor.seek(actor.activeAction?.time || 0);'), 'pose gesture should resample the exact visible frame before editing');
assert(beginDragFn.includes('this.applyPoseCorrectionOverlay(actor);'), 'pose gesture should preserve already-visible corrections after resampling the frame');
assert(beginDragFn.indexOf('this.selectBone(boneName, selectKind,') < beginDragFn.indexOf('this.applyPoseCorrectionOverlay(actor);'), 'pose selection should happen before correction replay so first drag uses the intended target');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['ik-pause-idempotence', 'canonical-rigify-controls'] }, null, 2));
