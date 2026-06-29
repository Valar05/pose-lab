import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const playerStart = profiles.indexOf('  player: {');
const arcaneStart = profiles.indexOf('  arcane: {', playerStart);
const player = profiles.slice(playerStart, arcaneStart);
assert(player.includes("handBone: 'HandR'") && player.includes("leftHandBone: 'HandL'") && player.includes("sourceSocketBone: 'WeaponR'"), 'FPS weapon grip should expose hands but inherit the authored WeaponR socket');
assert(player.includes("socketBone: 'WeaponGrip'") && player.includes("tipMarker: 'WeaponGrip_end'"), 'FPS weapon should attach to WeaponGrip');
assert(player.includes('scale: 0.323'), 'FPS weapon should use the source-tip solved scale from the Meshy saber handle to blade tip');
assert(player.includes('position: [0, 0, 0]'), 'FPS Meshy weapon should stay on the authored WeaponR grip origin; placeholder local position drifts this replacement mesh off hand');
assert(player.includes('gripLocalPosition: [0.78, -0.3, 0]'), 'FPS weapon should pin the authored WeaponR socket to the saber handle, not the broad basket/body');
assert(player.includes('tipLocalPosition: [-0.95561, 0.1368, 0]'), 'FPS weapon tip marker should be derived from the Meshy blade tip in attachment-local space');
assert(player.includes('rotationDeg: [0.99778, 0.76601, -76.72041]'), 'FPS weapon should use the handle-to-tip solved saber rotation');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['fps-weapongrip-saber-handle-tip-solved'] }, null, 2));
