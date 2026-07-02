import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'pose_lab_latest.json');
const htmlPath = path.join(projectRoot, 'pose-lab.html');
const deprecatedCaptureKinds = new Set([
  'android-screenshot',
  'debug-bridge-visual-follow',
  'visual-qa-blocked',
  'visual-qa-capture',
]);
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function readCacheToken() {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const match = html.match(/pose-lab\.js\?v=([^'"\s]+)/);
  return match?.[1] || null;
}

function readRuntimeBuild() {
  const runtime = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
  const match = runtime.match(/const\s+LAB_BUILD\s*=\s*['"]([^'"]+)['"]/);
  return match?.[1] || null;
}

const expectedCacheToken = readCacheToken();
const expectedRuntimeBuild = readRuntimeBuild();
assert(expectedCacheToken, 'pose-lab.html should expose a pose-lab.js cache token');
assert(expectedRuntimeBuild, 'src/pose-lab.js should expose LAB_BUILD');
assert(fs.existsSync(evidencePath), `missing visual evidence artifact: ${path.relative(projectRoot, evidencePath)}`);

if (fs.existsSync(evidencePath)) {
  const raw = fs.readFileSync(evidencePath, 'utf8');
  let evidence;
  try {
    evidence = JSON.parse(raw);
  } catch (error) {
    throw new Error(`invalid visual evidence JSON at ${path.relative(projectRoot, evidencePath)}: ${error.message}`);
  }

  assert(evidence.schema === 'pose-lab-visual-evidence-v1', 'visual evidence should use schema pose-lab-visual-evidence-v1');
  assert(evidence.cacheToken === expectedCacheToken, `visual evidence cacheToken should match served token ${expectedCacheToken}`);
  assert(evidence.runtimeBuild === expectedRuntimeBuild, `visual evidence runtimeBuild should match LAB_BUILD ${expectedRuntimeBuild}`);
  assert(typeof evidence.visualRead === 'string' && evidence.visualRead.length >= 20, 'visual evidence should include a concrete visualRead');
  assert(!deprecatedCaptureKinds.has(evidence.captureKind), `deprecated live capture evidence is not accepted for Meshy saber red builds: ${evidence.captureKind}`);
  assert(evidence.captureKind === 'offline-pose-render', `visual red-build evidence must be offline-pose-render, got ${evidence.captureKind || 'missing'}`);
  assert(evidence.actorKey === 'meshyCharacter', 'offline visual evidence should cover Meshy Character');
  assert(String(evidence.clipName || '').includes('0T-Pose'), 'offline visual evidence should cover accepted FPS/Meshy T-pose calibration');
  assert(String(evidence.clipName || '').includes('[FPS-REST-ARMS'), 'offline visual evidence should cover the accepted [FPS-REST-ARMS] calibration clip');
  assert(evidence.motionEvidencePending === false, 'offline visual evidence must not defer motion evidence to a live capture path');
  assert(evidence.liveVisualQa == null, 'offline visual evidence must not contain a liveVisualQa dependency');

  assert(typeof evidence.capturePath === 'string' && fs.existsSync(path.isAbsolute(evidence.capturePath) ? evidence.capturePath : path.join(projectRoot, evidence.capturePath)), 'offline visual evidence should point at an existing rendered PNG');
  assert(typeof evidence.reportPath === 'string' && fs.existsSync(path.isAbsolute(evidence.reportPath) ? evidence.reportPath : path.join(projectRoot, evidence.reportPath)), 'offline visual evidence should point at an existing offline render JSON');

  const reportPath = path.isAbsolute(evidence.reportPath) ? evidence.reportPath : path.join(projectRoot, evidence.reportPath);
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
  assert(report.schema === 'pose-lab-offline-pose-weapon-render-v1', 'offline report should use schema pose-lab-offline-pose-weapon-render-v1');
  assert(report.ok === true, 'offline pose+weapon report should be green');
  assert(report.generatedClipResolved === true, `offline report should resolve the generated Pose Lab clip: ${JSON.stringify(report.generatedClipStats)}`);
  assert(report.actor === evidence.actorKey, `offline report actor ${report.actor || 'missing'} should match evidence actor ${evidence.actorKey}`);
  assert(report.clipRequested === evidence.clipName, `offline report requested clip ${report.clipRequested || 'missing'} should match evidence clip ${evidence.clipName}`);
  assert(report.clipApplied === evidence.clipName, `offline report applied clip ${report.clipApplied || 'missing'} should match requested clip ${evidence.clipName}`);
  assert(report.checks?.weaponMeshRendered === true, 'offline report should prove the real sabre mesh rendered');
  assert(report.checks?.parentChainMatchesPureFkShape === true, 'offline report should prove RightHand -> WeaponGrip -> displayRoot pure FK ownership');
  assert(report.checks?.appliedHiltPinnedToWeaponGrip === true, 'offline report should prove the applied hilt is pinned to WeaponGrip');
  assert(report.checks?.weaponGripLocalStableUnderRightHand === true, 'offline report should prove WeaponGrip position stays locally stable under RightHand');
  assert(report.checks?.weaponGripQuaternionStableUnderRightHand === true, 'offline report should prove WeaponGrip rotation stays locally stable under RightHand');
  assert(report.generatedClipStats?.weaponTrackEnabled !== true && report.generatedClipStats?.weaponTrackTarget == null, 'offline report should prove normal Meshy clips do not emit WeaponR/WeaponGrip weapon tracks');
  assert(report.checks?.visibleMeshHiltLandmarkPresent === true, 'offline report should expose a hilt landmark derived from the real sabre mesh');
  assert(report.checks?.visibleMeshTipLandmarkPresent === true, 'offline report should expose a tip landmark derived from the real sabre mesh');
  assert(report.checks?.visibleMeshHiltPinnedToWeaponGrip === true, 'offline report should prove the real mesh hilt is near WeaponGrip, not only the configured grip point');
  assert(report.checks?.visibleMeshHiltMatchesAppliedHilt === true, 'offline report should prove the mesh-derived hilt matches the configured applied hilt');
  assert(Number.isFinite(report.maxDistances?.palmTargetToAppliedHilt), 'offline report must expose finite palm-target-to-hilt distance');
  assert(Number.isFinite(report.maxDistances?.rawHandToAppliedHilt), 'offline report must expose finite raw-hand-to-hilt distance');
  assert(Number.isFinite(report.maxDistances?.visibleMeshHiltToWeaponGrip), 'offline report must expose finite real-mesh-hilt-to-WeaponGrip distance');
  assert(Number.isFinite(report.maxDistances?.visibleMeshHiltToRawHand), 'offline report must expose finite real-mesh-hilt-to-raw-hand distance');
  assert(report.maxDistances.rawHandToAppliedHilt > 0.01, `offline report should not collapse applied hilt onto raw wrist: ${report.maxDistances.rawHandToAppliedHilt}`);

  const visual = evidence.visualAssertions || {};
  for (const key of [
    'offlineRendererIsTierOneTruth',
    'generatedClipResolved',
    'clipAppliedEqualsRequested',
    'realMeshySabreRendered',
    'pureFkParentChainImplemented',
    'weaponGripPinnedToRightHandFk',
    'appliedHiltPinnedToWeaponGrip',
    'visibleMeshHiltPinnedToWeaponGrip',
    'fpsWeaponRReferenceOnly',
    'hiltHandRelationshipExposed',
  ]) {
    assert(visual[key] === true, `offline visual assertion must be true: ${key}`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-offline-visual-evidence'], evidencePath: path.relative(projectRoot, evidencePath), cacheToken: expectedCacheToken }, null, 2));
