import assert from 'node:assert/strict';
import {
  PENELOPE_LENSES,
  drewEyeFirewall,
  makeCandidate,
  runRegnet,
  validateCandidate,
} from '../src/embodied-kinesis-core.js';

const phases = [
  ['entry', 0.00, 0.00],
  ['anticipation', 0.10, 0.10],
  ['commitment', 0.20, 0.20],
  ['contact', 0.34, 0.34],
  ['force-transfer', 0.38, 0.38],
  ['reaction', 0.43, 0.43],
  ['recovery', 0.58, 0.58],
  ['exit', 0.72, 0.72],
].map(([phase, referenceTime, targetTime]) => ({
  phase, referenceTime, targetTime, confidence: 0.95, occluded: false,
  actionableAs: phase === 'contact' ? 'Hand.R contact anchor' : 'authoritative rig key',
}));

const keys = phases.map((p, index) => ({
  keyId: `key-${String(index + 1).padStart(2, '0')}`,
  phase: p.phase,
  targetTime: p.targetTime,
  bones: ['Shoulder.R', 'UpperArm.R', 'Forearm.R', 'Hand.R'],
  authoritative: true,
  interpolation: 'LINEAR',
  holdFrames: p.phase === 'contact' ? 2 : 1,
}));

function goodCandidate() {
  return makeCandidate({
    candidateId: 'fps-strike-canary-001',
    action: {name: 'straight-strike', intent: 'extend through target then recover to guard', family: 'first-person', requiresWeapon: false},
    source: {name: 'real-reference.mp4', sha256: 'a'.repeat(64), kind: 'video', durationSeconds: 1.2, identityAuthority: 'reference-performance'},
    model: {name: 'FPSPlayer', path: 'assets/models/FPSPlayer.glb', sha256: 'b'.repeat(64), rigVersion: 'fpsplayer-glb-main', actorId: 'player'},
    target: {cameraMode: 'firstPerson', cameraIdentity: 'FPSPlayer.Camera', runtimeSurface: 'pose-lab'},
    phases,
    authoredKeys: keys,
    contacts: [{phase: 'contact', subject: 'HitboxHandR', anchor: 'reference-target-plane'}],
    interpolation: {default: 'LINEAR', protectedExactKeys: true},
    evidence: {
      runtimePreview: {kind: 'video', id: 'preview-001'},
      keySheet: {kind: 'png', id: 'keysheet-001'},
      comparisonReceipt: {kind: 'json', id: 'compare-001'},
    },
    deterministic: true,
    rootPolicy: 'camera-relative-upper-body',
  });
}

{
  const good = goodCandidate();
  assert.equal(validateCandidate(good, {requireVisualEvidence: true}).pass, true);
  assert.equal(runRegnet(good).verdict, 'PASS');
}

{
  const broken = goodCandidate();
  broken.target.cameraMode = 'orbit';
  const result = validateCandidate(broken);
  assert.equal(result.pass, false);
  assert.ok(result.defects.some((d) => d.code === 'target-camera'));
}

{
  const broken = goodCandidate();
  broken.phases = broken.phases.filter((p) => p.phase !== 'contact');
  const result = validateCandidate(broken);
  assert.ok(result.defects.some((d) => d.code === 'missing-phase' && d.phase === 'contact'));
}

{
  const broken = goodCandidate();
  broken.phases = broken.phases.map((p) => p.phase === 'contact' ? {...p, occluded: true, confidence: 0.95} : p);
  const result = validateCandidate(broken);
  assert.ok(result.defects.some((d) => d.code === 'occlusion-overclaim'));
}

{
  const broken = goodCandidate();
  broken.interpolation.protectedExactKeys = false;
  const result = validateCandidate(broken);
  assert.ok(result.defects.some((d) => d.code === 'key-protection'));
}

{
  const broken = goodCandidate();
  broken.authoredKeys = broken.authoredKeys.filter((k) => k.phase !== 'recovery');
  const result = validateCandidate(broken);
  assert.ok(result.defects.some((d) => d.code === 'missing-authored-key' && d.phase === 'recovery'));
}

{
  const candidate = goodCandidate();
  candidate.reviews.regnet = runRegnet(candidate);
  candidate.reviews.penelope = PENELOPE_LENSES.map((lens, index) => ({
    reviewerId: `penelope-${index + 1}`,
    lens,
    verdict: 'PASS',
    severity: 'low',
    defect: '',
    evidence: `frame-${index + 1}`,
    negativeTaster: lens === 'negative-human-animator',
  }));
  candidate.reviews.venice = {verdict: 'PRESENTABLE_TO_DREW', evidence: 'coherence-sheet-001'};
  candidate.corrections = [{evidence: 'penelope-timing@0.34', change: 'held contact key for two frames'}];
  assert.equal(drewEyeFirewall(candidate).presentable, true);

  candidate.reviews.penelope[0] = {...candidate.reviews.penelope[0], verdict: 'REVISE', severity: 'high', defect: 'silhouette collapses at contact'};
  assert.equal(drewEyeFirewall(candidate).presentable, false);
}

{
  const candidate = goodCandidate();
  candidate.reviews.regnet = runRegnet(candidate);
  candidate.reviews.penelope = PENELOPE_LENSES.map((lens, index) => ({reviewerId: `p-${index}`, lens, verdict: 'PASS', severity: 'low', negativeTaster: lens === 'negative-human-animator'}));
  candidate.reviews.venice = {verdict: 'PRESENTABLE_TO_DREW'};
  candidate.corrections = [{evidence: 'visible defect', change: 'sparse bridge key'}];
  candidate.state = 'accepted';
  const firewall = drewEyeFirewall(candidate);
  assert.equal(firewall.presentable, false, 'internal gauntlet must never self-accept for Drew');
  assert.ok(firewall.reasons.some((reason) => reason.includes('never self-accept')));
}

console.log('Embodied Kinesis core negative fixtures: PASS');
