import { preferSavedClipForActor } from '../src/startup-policy.js';

const cases = [
  { label: 'Ares startup clip overrides saved clip', actorInfo: { startupClip: { name: 'Jab [sf2-eased]' } }, expected: false },
  { label: 'Titan startup clip overrides saved clip', actorInfo: { startupClip: { name: 'Idle-Cross' } }, expected: false },
  { label: 'Orc startup clip overrides saved clip', actorInfo: { startupClip: { name: 'standing_melee_attack_horizontal [smooth]' } }, expected: false },
  { label: 'Actors without startup clips may restore saved clip', actorInfo: {}, expected: true },
];

let failures = 0;
for (const testCase of cases) {
  const actual = preferSavedClipForActor(testCase.actorInfo);
  if (actual !== testCase.expected) {
    failures += 1;
    console.error('FAIL', testCase.label, 'expected=', testCase.expected, 'actual=', actual);
  } else {
    console.log('PASS', testCase.label, '=>', actual);
  }
}
if (failures) process.exit(1);
