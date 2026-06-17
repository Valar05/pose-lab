import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const projectRoot = path.resolve(import.meta.dirname, '..');
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'poseclip-workflow-tools-'));
const poseclip = 'assets/pose_indexes/ares_axekick_sf2.poseclip.json';
const failures = [];

function runJson(command, args) {
  const output = execFileSync(command, args, { cwd: projectRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(output);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}

const score = runJson('python3', ['tools/score_poseclip_sf2.py', '--poseclip', poseclip, '--out', path.join(tmpRoot, 'score.json')]);
assert(score.schema === 'pose-lab-sf2-local-score-v1', 'score schema mismatch');
assert(score.attackName === 'AxeKick', 'score attack mismatch');
assert(score.localFailures.length === 0, `expected no local SF2 failures, got ${score.localFailures.join(', ')}`);
assert(score.phaseScores.contactHoldFrames >= 10, `contact hold too short in score: ${score.phaseScores.contactHoldFrames}`);
assert(fs.existsSync(path.join(tmpRoot, 'score.json')), 'score --out did not write file');

const anticipation = runJson('python3', ['tools/find_source_anticipation.py', '--poseclip', poseclip, '--limit', '4', '--out', path.join(tmpRoot, 'anticipation.json')]);
assert(anticipation.schema === 'pose-lab-source-anticipation-candidates-v1', 'anticipation schema mismatch');
assert(anticipation.candidates.length === 4, `expected 4 anticipation candidates, got ${anticipation.candidates.length}`);
assert(anticipation.candidates.every((item) => Number(item.time) < Number(anticipation.contactSourceTime)), 'anticipation candidate after contact');

const phases = runJson('python3', ['tools/extract_phase_candidates.py', '--poseclip', poseclip, '--out', path.join(tmpRoot, 'phases.json')]);
assert(phases.schema === 'pose-lab-phase-candidates-v1', 'phase schema mismatch');
const phaseTags = new Set(phases.phases.map((phase) => phase.tag));
for (const tag of ['start', 'anticipation', 'apex', 'snap', 'contact', 'recoil', 'settle']) assert(phaseTags.has(tag), `missing phase ${tag}`);

const timing = runJson('python3', ['tools/tune_sf2_timing.py', '--poseclip', poseclip, '--variant', 'heavy', '--out', path.join(tmpRoot, 'timing.json')]);
assert(timing.schema === 'pose-lab-sf2-timing-variant-v1', 'timing schema mismatch');
const timingByTag = new Map(timing.spriteFrames.map((frame) => [frame.tag, frame]));
assert(timingByTag.get('contactHold').spriteFrame - timingByTag.get('contact').spriteFrame >= 10, 'heavy timing did not preserve long contact hold');

const sameCompare = runJson('python3', ['tools/compare_poseclip_versions.py', '--base', poseclip, '--candidate', poseclip]);
assert(sameCompare.schema === 'pose-lab-poseclip-version-compare-v1', 'compare schema mismatch');
assert(sameCompare.meaningfulDelta === false, 'same poseclip should not have meaningful delta');

const mutatedPath = path.join(tmpRoot, 'mutated.poseclip.json');
const mutated = JSON.parse(fs.readFileSync(path.join(projectRoot, poseclip), 'utf8'));
mutated.clip.tracks[0].values[0] = Number(mutated.clip.tracks[0].values[0]) + 0.25;
fs.writeFileSync(mutatedPath, JSON.stringify(mutated, null, 2));
const changedCompare = runJson('python3', ['tools/compare_poseclip_versions.py', '--base', poseclip, '--candidate', mutatedPath]);
assert(changedCompare.meaningfulDelta === true, 'mutated poseclip should have meaningful delta');
assert(changedCompare.changedTrackCount >= 1, 'mutated poseclip should report changed tracks');

const packetOut = path.join(tmpRoot, 'packet');
const packet = runJson('python3', ['tools/build_critique_packet.py', '--poseclip', poseclip, '--out', packetOut, '--view', 'xz']);
assert(packet.schema === 'pose-lab-critique-packet-build-v1', 'packet schema mismatch');
assert(packet.frames === 12, `expected 12 packet frames, got ${packet.frames}`);
assert(packet.critiquePacket && fs.existsSync(path.isAbsolute(packet.critiquePacket) ? packet.critiquePacket : path.join(projectRoot, packet.critiquePacket)), 'packet critique markdown missing');
assert(fs.existsSync(path.join(packetOut, 'manifest.json')), 'packet manifest missing');

const overlay = runJson('python3', ['tools/overlay_motion.py', '--target', poseclip, '--donor', 'assets/pose_indexes/ares_headbutt_sf2.poseclip.json', '--out', path.join(tmpRoot, 'overlay.json')]);
assert(overlay.schema === 'pose-lab-overlay-motion-plan-v1', 'overlay schema mismatch');
assert(overlay.trackCount === 8, `expected 8 overlay arm tracks, got ${overlay.trackCount}`);
assert(overlay.safeToApply === true, 'overlay plan should be safe with full arm tracks');

const audit = runJson('node', ['tools/poseclip_cache_key_audit.mjs']);
assert(audit.schema === 'pose-lab-cache-key-audit-v1', 'cache audit schema mismatch');
assert(audit.clipCount === 13, `expected 13 sf2 clips in cache audit, got ${audit.clipCount}`);
assert(audit.failures.length === 0, `cache audit failures: ${audit.failures.join(', ')}`);

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_poseclip_workflow_tools');
console.log(JSON.stringify({ tmpRoot, checked: ['score', 'anticipation', 'phases', 'timing', 'compare', 'packet', 'overlay', 'cacheAudit'] }, null, 2));
