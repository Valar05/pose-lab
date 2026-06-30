import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'pose_lab_latest.json');
const htmlPath = path.join(projectRoot, 'pose-lab.html');
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

  if (evidence.liveVisualQa?.status === 'blocked' || evidence.captureKind === 'visual-qa-blocked') {
      assert(false, 'missing fresh visual evidence: capture Meshy Character accepted T-pose calibration on the current cache token before promoting any OneHandReady candidate');
  } else {
    assert(['android-screenshot', 'visual-qa-capture'].includes(evidence.captureKind), 'visual evidence should record a supported capture kind');
    assert(typeof evidence.capturePath === 'string' && fs.existsSync(evidence.capturePath), 'visual evidence should point at an existing capture image');
    assert(typeof evidence.reportPath === 'string' && fs.existsSync(evidence.reportPath), 'visual evidence should point at an existing visual QA report');
    const report = JSON.parse(fs.readFileSync(evidence.reportPath, 'utf8'));
    assert(report.ok === true, 'visual QA report referenced by evidence should be green');
    assert(report.loadedBuild === expectedRuntimeBuild, `visual QA loadedBuild should match LAB_BUILD ${expectedRuntimeBuild}`);
    assert(report.buildInfo?.cacheTokens?.includes(expectedCacheToken), `visual QA report should include cache token ${expectedCacheToken}`);
    assert(report.beacons?.some((beacon) => beacon.stage === 'rendered'), 'visual QA report should include a rendered beacon');
    assert(report.captures?.length >= 1, 'visual QA report should include captured frames');

    const visual = evidence.visualAssertions || {};
    for (const key of ['moduleLoaded', 'actorRendered', 'clipActive', 'basicControlsVisible', 'uiRendered']) {
      assert(visual[key] === true, `visual assertion must be true: ${key}`);
    }
    for (const key of ['meshyFpsSwordActorUpright', 'meshyFpsSwordNotCollapsed', 'landscapeCritiqueUsable', 'rightHandDisplacedFromIdle', 'upperBodySwordMotionReadable', 'lowerBodyNotAuthoredBySwordClip', 'realMeshySabreRequested', 'weaponRSocketImplemented']) {
      assert(visual[key] === true, `visual assertion must be true: ${key}`);
    }
    assert(evidence.actorKey === 'meshyCharacter', 'visual evidence should cover Meshy Character');
    assert(String(evidence.clipName || '').includes('0T-Pose'), 'visual evidence should cover accepted FPS/Meshy T-pose calibration');
    assert(String(evidence.clipName || '').includes('[FPS-REST-ARMS'), 'visual evidence should cover the accepted [FPS-REST-ARMS] calibration clip');
    assert(evidence.motionEvidencePending === false, 'usable-app evidence should include live visual capture, not defer motion evidence');
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-visual-evidence'], evidencePath: path.relative(projectRoot, evidencePath), cacheToken: expectedCacheToken }, null, 2));
