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
assert(source.includes('captureWeaponPinningRuntimeState') && source.includes('appliedHiltPinnedToWeaponGrip'), 'offline renderer must use shared pinning state and fail unless the applied hilt is pinned to WeaponGrip');
assert(source.includes('weaponMeshRendered') && source.includes('collectMeshWorldPoints'), 'offline renderer must draw the real sabre mesh, not only synthetic markers');
assert(source.includes('--assert-repro') && source.includes('reproducesLiveRed'), 'offline renderer must have a red-build reproduction mode for known visual-red classes');
assert(source.includes('generatedClipResolved'), 'offline renderer must explicitly report whether the requested generated clip was resolved offline');
assert(!/screencap|-p\s+\/storage\/emulated\/0\/Pictures|debugBridge|termux-open-url|am start/.test(source), 'offline renderer must not depend on browser bridge, Android screencap, or URL launch');

const cacheToken = poseSource.match(/const LAB_CACHE_TOKEN = '([^']+)'/)?.[1] || '';
assert(cacheToken, 'browser runtime must declare a cache token');
assert(poseSource.includes(`from './weapon-runtime-rules.mjs?v=${cacheToken}'`), 'browser runtime must import the shared weapon runtime module with the current cache token');
assert(poseSource.includes(`from './meshy-ready-runtime.mjs?v=${cacheToken}'`), 'browser runtime must import the shared Meshy ready runtime module with the current cache token');
assert(readySource.includes("sourceHand: 'Hand.R'") && readySource.includes("targetHand: 'RightHand'") && readySource.includes('targetLocalAxis: [0, -1, 0]') && readySource.includes('rollOffsetDeg: -120'), 'shared ready builder should keep the accepted right-hand rest correction axis');
assert(!readySource.includes("sourceHand: 'Hand.L', sourceLocalAxis") && !readySource.includes("targetHand: 'LeftHand', targetLocalAxis"), 'shared ready builder must not apply a hidden left-hand rest-roll override');
assert(readySource.includes('experimentalWeaponTrack') && readySource.includes('experimentalWeaponSwing === true'), 'ready builder must quarantine generated weapon tracks behind an explicit experimental flag');

const output = execFileSync('node', [
  toolPath,
  '--actor', 'meshyCharacter',
  '--clip', '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]',
  '--out', out,
  '--samples', '3',
], { cwd: projectRoot, encoding: 'utf8' });
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
assert(artifact.generatedClipResolved === true, `renderer did not resolve the accepted T-pose clip: ${artifact.generatedClipReason}`);
assert(artifact.clipRequested === '0T-Pose -> meshyCharacter [FPS-REST-ARMS roll -120]', `unexpected requested clip ${artifact.clipRequested}`);
assert(artifact.clipApplied === artifact.clipRequested, `renderer applied ${artifact.clipApplied} instead of requested ${artifact.clipRequested}`);
assert(artifact.checks?.poseChecksPresent === true, 'artifact missing pose checks');
assert(artifact.checks?.weaponChecksPresent === true, 'artifact missing weapon checks');
assert(artifact.checks?.allKeyBonesFinite === true, 'artifact did not prove key pose bones finite');
assert(artifact.checks?.weaponFinite === true, 'artifact did not prove weapon landmarks finite');
assert(artifact.checks?.weaponMeshRendered === true, 'artifact did not render the real sabre mesh point cloud');
assert(artifact.checks?.parentChainMatchesPureFkShape === true, `offline render did not prove restored ownership chain: ${JSON.stringify(artifact.sampleData?.[0]?.parentChain)}`);
assert(artifact.checks?.appliedHiltPinnedToWeaponGrip === true, `offline render did not prove hilt pinning to WeaponGrip: ${JSON.stringify(artifact.hiltSocketDistances)}`);
assert(artifact.checks?.visibleMeshHiltLandmarkPresent === true, 'offline render should expose a real-mesh hilt landmark');
assert(artifact.checks?.visibleMeshTipLandmarkPresent === true, 'offline render should expose a real-mesh tip landmark');
assert(artifact.checks?.visibleMeshHiltPinnedToWeaponGrip === true, `offline render did not prove real mesh hilt near WeaponGrip: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.visibleMeshHiltMatchesAppliedHilt === true, `offline render did not prove mesh hilt matches applied hilt: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.visibleMeshBladeLengthFinite === true, `offline render did not prove a visible blade landmark span: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.checks?.appliedHiltInHandRegion === true, `offline render did not prove applied hilt stays in the restored hand region: ${JSON.stringify(artifact.maxDistances)}`);
assert(artifact.generatedClipStats?.weaponTrackEnabled !== true && artifact.generatedClipStats?.weaponTrackTarget == null, `accepted T-pose baseline must not emit generated weapon tracks: ${JSON.stringify(artifact.generatedClipStats)}`);
assert(artifact.truthLedger?.repo && artifact.truthLedger?.runtime && artifact.truthLedger?.visual && artifact.truthLedger?.human, 'artifact should include a truth ledger');
assert(artifact.reproducesLiveRed === false, `accepted T-pose baseline should not reproduce the visual-red class: ${JSON.stringify(artifact.maxLocalDrift)}`);
assert(artifact.ok === true, `accepted T-pose baseline should be green: ${JSON.stringify(artifact.checks)}`);
assert(Array.isArray(artifact.sampleData) && artifact.sampleData.length === 3, 'artifact should contain three sampled pose frames');
assert(artifact.sampleData.every((sample) => Array.isArray(sample.chains) && sample.chains.length >= 5), 'each sample should include full-body chains');
assert(artifact.sampleData.every((sample) => sample.weapon?.rightHand && sample.weapon?.palmTarget && sample.weapon?.socket && sample.weapon?.appliedHilt && sample.weapon?.tip), 'each sample should include raw hand, palm target, and weapon landmarks');
assert(artifact.sampleData.every((sample) => sample.weaponPinning?.checks?.appliedHiltPinnedToSocket === true), 'each sample should include shared weapon pinning checks');
assert(String(artifact.actualVisibleRead || '').length >= 20, `artifact should report a concrete visible read, got: ${artifact.actualVisibleRead}`);

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['offline-pose-weapon-render-contract', 'restored-tpose-baseline', 'diagnostic-artifacts'],
  artifact: result.path,
  png: result.png,
  generatedClipResolved: artifact.generatedClipResolved,
}, null, 2));
