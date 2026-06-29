import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const output = execFileSync('node', [path.join(projectRoot, 'tools', 'meshy_fps_rest_segment_audit.mjs')], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const audit = JSON.parse(fs.readFileSync(path.join(projectRoot, result.path), 'utf8'));
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(result.ok === true, 'rest segment audit should complete');
assert(audit.schema === 'pose-lab-meshy-fps-rest-segment-audit-v1', `unexpected schema ${audit.schema}`);
assert(audit.segments.length === 4, `expected 4 arm segments, got ${audit.segments.length}`);
assert(audit.handRolls.length === 1, `expected 1 right-hand roll correction, got ${audit.handRolls.length}`);
assert(audit.metrics.maxBeforeDeg > 10, `uncorrected Meshy rest should be measurably off FPS T-pose, got ${audit.metrics.maxBeforeDeg}`);
assert(audit.metrics.maxAfterDeg <= 0.1, `corrected Meshy rest segments should align to FPS T-pose, got ${audit.metrics.maxAfterDeg}`);
assert(audit.handRolls[0].sourceHand === 'Hand.R', `right-hand roll should be calibrated from FPS Hand.R, got ${audit.handRolls[0].sourceHand}`);
assert(audit.handRolls[0].strength === 1, `source-axis roll calibration should use full source-rest alignment, got ${audit.handRolls[0].strength}`);
assert(audit.handRolls[0].rollOffsetDeg === -120, `accepted visual hand-roll offset should be -120, got ${audit.handRolls[0].rollOffsetDeg}`);
assert(audit.metrics.maxHandDownBeforeDeg > 1 && audit.metrics.maxHandDownBeforeDeg < 6, `source-axis hand roll should start near aligned after segment solve, got ${audit.metrics.maxHandDownBeforeDeg}`);
assert(audit.metrics.maxHandRollAfterDeg > 115 && audit.metrics.maxHandRollAfterDeg < 125, `accepted visual -120 offset should intentionally move away from pure source-axis alignment, got ${audit.metrics.maxHandRollAfterDeg}`);
assert(audit.metrics.maxHandRollAppliedDeg > 115 && audit.metrics.maxHandRollAppliedDeg < 125, `accepted visual hand roll should apply the -120 offset plus measured rest-basis delta, got ${audit.metrics.maxHandRollAppliedDeg}`);
assert(js.includes('correctedTargetRestMapFromSegments'), 'runtime should compute rest correction from world segment positions');
assert(js.includes('restSegmentCorrection.maxHandRollAfterDeg'), 'runtime should store rest hand roll correction diagnostics');
assert(js.includes('restSegmentCorrection.maxHandRollAppliedDeg'), 'runtime should store applied rest hand roll diagnostics');
assert(js.includes('rollOffsetDeg'), 'runtime should support explicit forearm roll calibration offsets');
assert(profiles.includes('function meshyFpsRestSegmentCorrection') && profiles.includes("sourceUpper: 'Arm.R'") && profiles.includes("targetUpper: 'RightArm'"), 'Meshy profile should enable FPS arm rest segment correction through the shared helper');
assert(profiles.includes('handDownReferencePairs: [') && profiles.includes("sourceHand: 'Hand.R'") && profiles.includes('sourceLocalAxis: [0, 0, 1]') && profiles.includes('targetLocalAxis: [0, -1, 0]'), 'Meshy profile should map FPS Hand.R +Z to Meshy RightHand -Y instead of world-down roll');
assert(profiles.includes('restSegmentCorrection: meshyFpsRestSegmentCorrection(-120)'), 'accepted Meshy FPS rest calibration should use -120 hand-roll offset');
assert(profiles.includes("clipSuffix: '-> meshyCharacter [FPS-REST-ARMS roll -120]'"), 'Meshy profile should keep only the accepted CAL--120 RestProbe calibration clip');
assert(profiles.includes("originPrefix: 'mapped-arms:player->meshyCharacter:FPS-REST-ARMS-CAL--120'"), 'Meshy profile should preserve the accepted CAL--120 RestProbe origin path');
assert(!profiles.includes('...[-150') && !profiles.includes('FPS-REST-ARMS-CAL-120') && !profiles.includes('FPS-REST-ARMS-CAL-90') && !profiles.includes('FPS-REST-ARMS-CAL--90'), 'Meshy profile should remove rejected positive and sweep RestProbe hand-roll clips');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-rest-segment-audit', 'world-position-rest-delta', 'runtime-rest-segment-correction', 'accepted-right-hand-roll-neg120'], metrics: audit.metrics }, null, 2));
