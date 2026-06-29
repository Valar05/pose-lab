import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('preferredCombatClip(actor, clip)'), 'Pose Lab should keep a combat clip resolver for saved/alias selections');
assert(js.includes('/\\[FPS-SWORD-UPPER\\]/.test(String(name || \'\'))'), 'saved clip preference should favor FPS-SWORD-UPPER clips');
assert(profiles.includes("SwordReady: ['OneHandReady -> meshyCharacter [FPS-SWORD-UPPER]', 'OneHandReady']"), 'Meshy SwordReady alias should select FPS-SWORD-UPPER OneHandReady');
for (const alias of ['SwordReadied', 'SwordAttack1', 'SwordAttack2', 'SwordAttack3', 'SwordAttack4', 'SwordAttack5', 'SwordAirForward']) {
  assert(!profiles.includes(`${alias}: [`), `Meshy should defer ${alias} alias until attack conversion resumes`);
}
assert(profiles.includes("sourceKey: 'player'"), 'Meshy generated sword clips should source from FPS Arms');
assert(profiles.includes("clipTag: 'FPS-SWORD-UPPER'"), 'Meshy generated sword clips should use FPS-SWORD-UPPER');
for (const rejected of ["clipTag: 'IB-MC'", "clipTag: 'RA-FULL'", "clipTag: 'GRIP'", "clipTag: 'CORE'", "sourceKey: 'orc'", "sourceKey: 'ruinedAir'", 'Armature|Swing1 -> meshyCharacter']) {
  assert(!profiles.includes(rejected), `Meshy should not select rejected generated path: ${rejected}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['meshy-fps-sword-selection', 'rejected-full-body-and-scavenger-clips-not-selected'] }, null, 2));
