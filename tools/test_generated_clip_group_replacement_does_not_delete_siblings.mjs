import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

assert(js.includes('function validateAutoRetargetGenerationGroups'), 'runtime should validate generated clip groups before generation');
assert(js.includes('function shouldReplaceGeneratedClip'), 'runtime should replace generated clips through an exact group helper');
assert(js.includes('function stampGeneratedClipGroup'), 'runtime should stamp generated clips with a stable group');
assert(js.includes('generationGroup'), 'generated clips should carry exact ownership metadata');
assert(!js.includes('startsWith(originPrefix)'), 'generated clip replacement must not delete by broad originPrefix prefix');
assert(!js.includes('key.startsWith(originPrefix)'), 'generated action cleanup must not delete by broad originPrefix prefix');

const customStart = js.indexOf('  addCustomClips(clips, originPrefix, channels) {');
const customEnd = js.indexOf('  addCleanupClip(clip)', customStart);
const customMethod = customStart >= 0 && customEnd > customStart ? js.slice(customStart, customEnd) : '';
assert(customMethod.includes('shouldReplaceGeneratedClip(clip, generationGroup)'), 'custom clip replacement should use exact generationGroup matching');
assert(customMethod.includes('stampGeneratedClipGroup(clip, generationGroup)'), 'custom clip registration should stamp generationGroup centrally');
assert(customMethod.includes('removedKeys.add(clipKey(clip))'), 'custom clip replacement should delete only actions for actually removed clips');
assert(!/originPrefix[^;\n]*startsWith|startsWith[^;\n]*originPrefix/.test(customMethod), 'custom clip replacement should not use originPrefix prefix matching');

const retargetBlocks = Array.from(profiles.matchAll(/\n      \{[\s\S]*?sourceKey:\s*'player',[\s\S]*?originPrefix:\s*'(mapped-arms:player->meshyCharacter:[^']+)'[\s\S]*?\n      \},/g)).map((entry) => entry[0]);
const originGroups = retargetBlocks.map((block) => block.match(/originPrefix:\s*'([^']+)'/)?.[1]).filter(Boolean);
const clipTags = retargetBlocks.map((block) => block.match(/clipTag:\s*'([^']+)'/)?.[1]).filter(Boolean);
assert(originGroups.length > 0, 'Meshy auto-retarget sources should declare explicit originPrefix groups');
assert(originGroups.length === retargetBlocks.length && clipTags.length === retargetBlocks.length, 'each auto-retarget source should declare both clipTag and originPrefix');
assert(new Set(originGroups).size === originGroups.length, 'generated clip groups should be unique');
for (let i = 0; i < originGroups.length; i += 1) {
  for (let j = i + 1; j < originGroups.length; j += 1) {
    assert(!originGroups[i].startsWith(originGroups[j]) && !originGroups[j].startsWith(originGroups[i]), `generated clip groups must not be prefix-related: ${originGroups[i]} vs ${originGroups[j]}`);
  }
}
assert(originGroups.includes('mapped-arms:player->meshyCharacter:FPS-VISUAL-IK-GOLDEN'), 'golden mixed right/left roll record should be protected by generated-group tests');
assert(!originGroups.some((group) => /ROLL-[MP]\d+-FPS-VISUAL-IK/.test(group)), 'invalid one-size roll sweep candidates should be removed after accepting the golden record');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['exact-generated-clip-group-replacement', 'no-prefix-sibling-deletion', 'auto-retarget-group-collision-guard'],
  originGroups,
}, null, 2));
