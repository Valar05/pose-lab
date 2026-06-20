import { resolveLabMode } from '../src/lab-mode.mjs';
import { resolveStartupActorKey } from '../src/startup-policy.mjs';

const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(resolveLabMode('') === 'critique', 'bare pose-lab load should default to critique');
assert(resolveLabMode('?mode=critique') === 'critique', 'critique mode should stay critique');
assert(resolveLabMode('?mode=standard') === 'standard', 'standard mode should remain available');
assert(resolveLabMode('?mode=full') === 'standard', 'full mode should map to standard');
assert(resolveLabMode('?mode=lab') === 'standard', 'lab alias should map to standard');
assert(resolveLabMode('?mode=unknown') === 'critique', 'unknown mode should fail closed to critique');

assert(resolveStartupActorKey({ labMode: 'critique', savedActorKey: 'orc', availableKeys: ['orc', 'player', 'ares'], startupActorKey: 'ares' }) === 'ares', 'critique mode should ignore saved orc and land on ares');
assert(resolveStartupActorKey({ labMode: 'standard', savedActorKey: 'orc', availableKeys: ['orc', 'player'], startupActorKey: 'player' }) === 'orc', 'standard mode may restore saved actor');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({ checked: ['default', 'critique', 'standard', 'fallback', 'startup-actor'] }, null, 2));
