import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const evidencePath = path.join(projectRoot, 'generated', 'visual_red_build', 'pose_lab_interaction_latest.json');
const failures = [];

function assert(condition, message) {
  if (!condition) failures.push(message);
}

function existsProjectPath(relativePath) {
  return typeof relativePath === 'string' && fs.existsSync(path.join(projectRoot, relativePath));
}

assert(fs.existsSync(evidencePath), `missing interaction evidence artifact: ${path.relative(projectRoot, evidencePath)}`);

if (fs.existsSync(evidencePath)) {
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert(evidence.schema === 'pose-lab-interaction-evidence-v1', 'interaction evidence should use schema pose-lab-interaction-evidence-v1');
  assert(evidence.cacheToken === 'pose-editor-22', 'interaction evidence should use the current cache token pose-editor-22');
  assert(evidence.runtimeBuild === 'clean-sf2', 'interaction evidence should use runtime build clean-sf2');
  assert(typeof evidence.visualRead === 'string' && evidence.visualRead.length >= 30, 'interaction evidence should include a concrete read of the current validation state');

  const behavior = evidence.behaviorAssertions || {};
  for (const key of [
    'clipSelectionChangesActiveClip',
    'selectedClipKeepsPlaying',
    'modelContinuesAnimatingAfterClipSelect',
    'boneSelectionAvailable',
    'boneEditMovesRigState',
  ]) {
    assert(behavior[key] === true, `interaction behavior assertion must be true: ${key}`);
  }

  const tests = evidence.testEvidence || {};
  for (const key of [
    'startupRenderBeacon',
    'clipPlaybackSourceContract',
    'debugBridgeBoneIntegration',
    'debugBridgeRouting',
    'worldQuatCorrectionPlayback',
    'hingeTwistBoneDrag',
    'pinnedHingeBoneDrag',
    'firstDragTargeting',
    'floatingPoseDock',
    'persistentPoseHistory',
    'layoutViewPersistence',
    'dragReselectFlow',
    'arbitraryBoneUndoRedoReset',
  ]) {
    assert(tests[key]?.passed === true, `interaction evidence should include passing test: ${key}`);
    assert(existsProjectPath(tests[key]?.path), `interaction evidence test path should exist: ${key}`);
  }

  if (evidence.liveVisualQa?.status === 'blocked') {
    assert(typeof evidence.liveVisualQa.reason === 'string' && evidence.liveVisualQa.reason.length >= 20, 'blocked live visual QA should include a concrete reason');
    assert(typeof evidence.liveVisualQa.reportPath === 'string' && fs.existsSync(evidence.liveVisualQa.reportPath), 'blocked live visual QA should point at the failed report');
  } else {
    assert(typeof evidence.capturePath === 'string' && fs.existsSync(evidence.capturePath), 'green live visual QA should point at an existing capture');
    assert(typeof evidence.reportPath === 'string' && fs.existsSync(evidence.reportPath), 'green live visual QA should point at an existing visual QA report');
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['pose-lab-interaction-evidence'], evidencePath: path.relative(projectRoot, evidencePath) }, null, 2));
