import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
const poseclip = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_headbutt_sf2.poseclip.json'), 'utf8'));
const evidence = JSON.parse(fs.readFileSync(path.join(projectRoot, 'assets/pose_indexes/ares_headbutt_sf2_visual_evidence.json'), 'utf8'));
const userData = poseclip.clip.userData || {};

function assert(condition, message) {
  if (!condition) failures.push(message);
}

assert(userData.guardRuleException?.enabled === true, 'Headbutt should publish a guardRuleException');
assert(userData.guardRuleException?.kind === 'sf2-guard-rule-exception', `unexpected Headbutt exception kind ${userData.guardRuleException?.kind}`);
assert(!userData.contactGuardStabilization, 'Headbutt must not receive generic contactGuardStabilization');
assert(!userData.headGazeStabilization, 'Headbutt must not receive AxeKick head gaze stabilization');
assert(evidence.guardRuleException?.enabled === true, 'Headbutt visual evidence should carry guardRuleException');

if (failures.length) throw new Error(failures.join('\n'));

console.log('PASS test_headbutt_guard_exception');
console.log(JSON.stringify({
  attackName: userData.attackName,
  exception: userData.guardRuleException.kind,
}, null, 2));
