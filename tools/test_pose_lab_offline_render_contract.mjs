import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const toolPath = path.join(projectRoot, 'tools', 'pose_lab_offline_render.mjs');
const out = path.join(projectRoot, 'generated', 'test_runs', `offline-pose-render-${process.pid}`);
const source = fs.readFileSync(toolPath, 'utf8');
const poseSource = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const readySource = fs.readFileSync(path.join(projectRoot, 'src', 'meshy-ready-runtime.mjs'), 'utf8');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(source.includes("from '../src/pose-runtime-rules.mjs'"), 'offline renderer must use shared pose runtime rules');
assert(source.includes("from '../src/weapon-runtime-rules.mjs'"), 'offline renderer must use shared weapon runtime rules');
assert(source.includes("from '../src/meshy-ready-runtime.mjs'"), 'offline renderer must use the shared Meshy generated-ready runtime builder');
assert(source.includes('pose-lab-offline-pose-weapon-render-v1'), 'offline renderer must write the canonical pose+weapon schema');
assert(source.includes('diagnosticOnly: true') && source.includes('productionBehaviorModified: false'), 'offline renderer must be diagnostic-only');
assert(source.includes('poseChecksPresent') && source.includes('weaponChecksPresent'), 'offline renderer must assert both pose and weapon checks');
assert(source.includes('parentChainMatchesFpsArmsShape'), 'offline renderer must check the FPS Arms-style weapon parent chain');
assert(source.includes('captureWeaponPinningRuntimeState') && source.includes('appliedHiltPinnedToWeaponGrip'), 'offline renderer must use shared pinning state and fail unless the applied hilt is pinned to WeaponGrip');
assert(source.includes('appliedHiltAwayFromRawHand') && source.includes('weaponGripDisplacedFromWeaponR'), 'offline renderer must fail if the authored hilt displacement collapses onto the wrist/WeaponR origin');
assert(source.includes('weaponBladeDirectionMatchesFpsSource') && source.includes('weaponBladeDirectionErrorsDeg'), 'offline renderer must compare visible Meshy blade direction against mapped FPS Weapon.R blade direction');
assert(source.includes('weaponMeshRendered') && source.includes('collectMeshWorldPoints'), 'offline renderer must draw the real sabre mesh, not only synthetic markers');
assert(source.includes('--assert-repro') && source.includes('reproducesLiveRed'), 'offline renderer must have a red-build reproduction mode for the live marker disparity');
assert(source.includes('generatedClipResolved'), 'offline renderer must explicitly report whether the browser-generated ready clip was resolved offline');
assert(source.includes('FK close-up') && source.includes('white=WeaponR sword FK bone'), 'offline renderer must draw a screenshot-comparable FK close-up panel with unambiguous sword-bone labels');
assert(!/screencap|-p\s+\/storage\/emulated\/0\/Pictures|debugBridge|termux-open-url|am start/.test(source), 'offline renderer must not depend on browser bridge, Android screencap, or URL launch');
assert(poseSource.includes("from './weapon-runtime-rules.mjs?v=pose-editor-180'"), 'browser runtime must import the shared weapon runtime module');
assert(poseSource.includes("from './meshy-ready-runtime.mjs?v=pose-editor-180'"), 'browser runtime must import the shared Meshy ready runtime module with the current cache token');
assert(readySource.includes("sourceHand: 'Hand.R'") && readySource.includes("targetHand: 'RightHand'") && readySource.includes('targetLocalAxis: [0, -1, 0]') && readySource.includes('rollOffsetDeg: -120'), 'shared ready builder should keep the accepted right-hand rest correction axis');
assert(!readySource.includes("sourceHand: 'Hand.L', sourceLocalAxis") && !readySource.includes("targetHand: 'LeftHand', targetLocalAxis"), 'shared ready builder must not apply a hidden left-hand rest-roll override');
assert(!readySource.includes('attachment-local-blade-frame') && !readySource.includes('targetAttachmentRotationDeg: [90, 0, -55.145]'), 'ready builder must not use the Meshy sabre attachment-local blade-frame solve that moved the pin');
assert(readySource.includes("targetWeapon: 'WeaponR'") && readySource.includes('fps-weaponr-frame-solve') && readySource.includes('targetBladeLocal: [-0.4871, -0.0452, 0.87218]'), 'ready builder must frame-solve synthetic WeaponR against the restored manual Meshy sabre blade axis');
assert(!readySource.includes("targetWeapon: 'WeaponGrip'"), 'generated ready must not animate WeaponGrip; WeaponGrip owns the fixed manual hilt socket');
assert(readySource.includes("weaponTrackTarget: weaponTrack ? 'WeaponR' : null"), 'generated ready metadata must report WeaponR as the weapon track target');

const output = execFileSync('node', [toolPath, '--out', out, '--samples', '3'], { cwd: projectRoot, encoding: 'utf8' });
const result = JSON.parse(output.slice(output.indexOf('{')));
const jsonPath = path.join(projectRoot, result.path);
const pngPath = path.join(projectRoot, result.png);
const summaryPath = path.join(path.dirname(jsonPath), 'pose_weapon_render_summary.md');
const artifact = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

assert(fs.existsSync(jsonPath), `missing JSON artifact ${jsonPath}`);
assert(fs.existsSync(pngPath), `missing PNG artifact ${pngPath}`);
assert(fs.statSync(pngPath).size > 1000, `PNG artifact is too small to be a useful visual render: ${pngPath}`);
assert(fs.existsSync(summaryPath), `missing summary artifact ${summaryPath}`);
assert(artifact.schema === 'pose-lab-offline-pose-weapon-render-v1', `unexpected schema ${artifact.schema}`);
assert(artifact.diagnosticOnly === true && artifact.productionBehaviorModified === false, 'artifact must remain diagnostic-only');
assert(artifact.generatedClipResolved === true, `renderer did not resolve the browser-generated ready clip: ${artifact.generatedClipReason}`);
assert(artifact.clipApplied === artifact.clipRequested, `renderer applied ${artifact.clipApplied} instead of requested ${artifact.clipRequested}`);
assert(artifact.generatedClipStats?.sourceKeyCount === 31 && artifact.generatedClipStats?.targetKeyCount === 30, `unexpected generated ready key counts: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.generatedClipStats?.droppedInitialRestKey === true && artifact.generatedClipStats?.weaponTrackEnabled === true, `generated ready metadata missing rest-key drop or WeaponR track: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.generatedClipStats?.weaponTrackTarget === 'WeaponR', `generated ready must target WeaponR, not WeaponGrip: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.generatedClipStats?.weaponOrientationMode === 'fps-weaponr-frame-solve', `generated ready should frame-solve synthetic WeaponR from FPS blade/up directions: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(JSON.stringify(artifact.generatedClipStats?.weaponTargetBladeLocal) === JSON.stringify([-0.4871, -0.0452, 0.87218]), `generated ready should declare the restored manual Meshy sabre blade axis: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.generatedClipStats?.rightRollOffsetDeg === -120 && artifact.generatedClipStats?.leftRollOffsetDeg === -90, `generated ready final rolls changed: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(JSON.stringify(artifact.generatedClipStats?.rightRestTargetLocalAxis) === JSON.stringify([0, -1, 0]), `right rest target axis should match accepted T-pose helper: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.generatedClipStats?.leftRestRollOverride === false, `left rest roll override should be absent: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.checks?.poseChecksPresent === true, 'artifact missing pose checks');
assert(artifact.checks?.weaponChecksPresent === true, 'artifact missing weapon checks');
assert(artifact.checks?.allKeyBonesFinite === true, 'artifact did not prove key pose bones finite');
assert(artifact.checks?.weaponFinite === true, 'artifact did not prove weapon landmarks finite');
assert(artifact.checks?.weaponMeshRendered === true, 'artifact did not render the real sabre mesh point cloud');
assert(artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `offline render did not prove hilt pinning to WeaponGrip: ${JSON.stringify(artifact.hiltSocketDistances)}`);
assert(artifact.checks?.weaponRDistanceFinite === true, `offline render did not report WeaponR FK distances: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.weaponGripDisplacedFromWeaponR === true, `offline render did not prove WeaponGrip keeps authored displacement from WeaponR: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.appliedHiltDisplacedFromWeaponR === true, `offline render did not prove applied hilt keeps authored displacement from WeaponR: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.appliedHiltAwayFromRawHand === true, `offline render did not prove applied hilt stays away from the raw wrist/hand origin: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.displayRootLocalStableUnderWeaponGrip === true, `offline render did not prove displayRoot local position is stable under WeaponGrip: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.displayRootQuaternionStableUnderWeaponGrip === true, `offline render did not prove displayRoot local rotation is stable under WeaponGrip: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.weaponMeshLocalStableUnderDisplayRoot === true, `offline render did not prove weapon mesh local position is stable under displayRoot: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.weaponMeshQuaternionStableUnderDisplayRoot === true, `offline render did not prove weapon mesh local rotation is stable under displayRoot: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.weaponOrientationComparedToFpsSource === true, `offline render did not compare Meshy blade direction to FPS source: ${JSON.stringify(artifact.maxWeaponOrientationErrorDeg)}`);
assert(artifact.checks?.weaponBladeDirectionMatchesFpsSource === true, `offline render did not prove visible Meshy blade direction matches FPS source: ${JSON.stringify(artifact.maxWeaponOrientationErrorDeg)}`);
assert(artifact.checks?.weaponGripLocalStableUnderWeaponR === true, `WeaponGrip should stay locally stable under animated WeaponR: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.weaponGripQuaternionStableUnderWeaponR === true, `WeaponGrip rotation should stay locally stable under animated WeaponR: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.checks?.palmTargetDistanceFinite === true, `offline render did not report palm-target distances: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.socketPinnedToHandBaseline === true, `hand baseline should report the stable WeaponR/WeaponGrip socket target: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.appliedHiltPinnedToHandBaseline === true, `hand baseline should report the stable WeaponR/applied hilt target: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.reproducesLiveRed === false, `fixed artifact should no longer reproduce the known blade-orientation red: ${JSON.stringify(artifact.maxWeaponOrientationErrorDeg)}`);
assert(artifact.ok === true, 'fixed artifact should claim the FK sword ownership and blade direction state is green');
assert(Array.isArray(artifact.sampleData) && artifact.sampleData.length === 3, 'artifact should contain three sampled pose frames');
assert(artifact.sampleData.every((sample) => Array.isArray(sample.chains) && sample.chains.length >= 5), 'each sample should include full-body chains');
assert(artifact.sampleData.every((sample) => sample.weapon?.rightHand && sample.weapon?.syntheticSourceSocket && sample.weapon?.socketHandBaseline && sample.weapon?.palmTarget && sample.weapon?.socket && sample.weapon?.appliedHilt && sample.weapon?.tip), 'each sample should include raw hand, WeaponR FK bone, hand-baseline, palm-target, and weapon landmarks');
assert(artifact.sampleData.every((sample) => sample.weaponPinning?.checks?.appliedHiltPinnedToSocket === true), 'each sample should include shared weapon pinning checks');
assert(artifact.sampleData.every((sample) => sample.weaponPinning?.local?.socketInSourceSocket && sample.weaponPinning?.local?.socketQuaternionInSourceSocket), 'each sample should include WeaponGrip local transform under WeaponR');
assert(artifact.sampleData.every((sample) => sample.closeupPanel?.blueRightHand && sample.closeupPanel?.whiteHandBaseline && sample.closeupPanel?.magentaAppliedHilt), 'each sample should include close-up marker metadata');
assert(String(artifact.actualVisibleRead || '').includes('displaced WeaponGrip under WeaponR FK') && String(artifact.actualVisibleRead || '').includes('visible blade direction matches'), `artifact should report fixed FK ownership, displacement, and blade direction, got: ${artifact.actualVisibleRead}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['offline-pose-weapon-render-contract', 'shared-runtime-imports', 'diagnostic-artifacts'],
  artifact: result.path,
  png: result.png,
  generatedClipResolved: artifact.generatedClipResolved,
}, null, 2));
