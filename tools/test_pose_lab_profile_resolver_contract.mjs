import fs from 'node:fs';
import path from 'node:path';
import { RIG_PROFILES } from '../src/rig-profiles.js';
import { resolvePoseLabActorRuntimeConfig } from '../src/pose-lab-profile-resolver.mjs';

const projectRoot = path.resolve(import.meta.dirname, '..');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

const resolved = resolvePoseLabActorRuntimeConfig('meshyCharacter');
const profile = RIG_PROFILES.meshyCharacter;
assert(resolved.actor.url === profile.url, 'resolver should use imported RIG_PROFILES actor url');
assert(resolved.actor.targetHeight === profile.targetHeight, 'resolver should use imported RIG_PROFILES targetHeight');
for (const key of ['handBone', 'leftHandBone', 'socketBone', 'syntheticSourceSocketBone', 'parentMode', 'positionMode', 'allowAnimatedSocketAnimation']) {
  assert(resolved.proxy[key] === profile.weaponProxy[key], `resolver proxy ${key} should match imported profile`);
}
for (const key of ['handLocalOffset', 'modelLocalOffset', 'gripOffset', 'tipOffset', 'rotationDeg']) {
  assert(same(resolved.proxy[key], profile.weaponProxy[key]), `resolver proxy ${key} should match imported profile`);
}
for (const key of ['url', 'name', 'socketBone', 'tipMarker', 'scale']) {
  assert(resolved.attachment[key] === profile.weaponAttachment[key], `resolver attachment ${key} should match imported profile`);
}
for (const key of ['position', 'rotationDeg', 'gripLocalPosition', 'tipLocalPosition']) {
  assert(same(resolved.attachment[key], profile.weaponAttachment[key]), `resolver attachment ${key} should match imported profile`);
}

resolved.proxy.modelLocalOffset[0] += 1;
assert(!same(resolved.proxy.modelLocalOffset, profile.weaponProxy.modelLocalOffset), 'resolver should return a clone, not mutate RIG_PROFILES');
assert(same(RIG_PROFILES.meshyCharacter.weaponProxy.modelLocalOffset, profile.weaponProxy.modelLocalOffset), 'imported profile should remain unchanged after resolver clone mutation');

const tierOneFiles = [
  'tools/pose_lab_offline_render.mjs',
  'tools/meshy_fk_path_divergence.mjs',
  'tools/weapon_fk_follow_offline.mjs',
  'tools/test_weapon_fk_driver_invariant.mjs',
];
for (const file of tierOneFiles) {
  const source = fs.readFileSync(path.join(projectRoot, file), 'utf8');
  assert(source.includes('resolvePoseLabActorRuntimeConfig'), `${file} should import the shared profile resolver`);
  for (const forbidden of ['function profileBlock', 'function objectBlock', 'function parseMeshyConfig', 'arrayFor(block']) {
    assert(!source.includes(forbidden), `${file} must not scrape src/rig-profiles.js with ${forbidden}`);
  }
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['imported-rig-profile-resolver-parity', 'tier-one-profile-scraping-ban'],
  actor: resolved.actorKey,
}, null, 2));
