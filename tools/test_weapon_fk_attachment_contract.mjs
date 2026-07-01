import fs from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname, '..');
const js = fs.readFileSync(path.join(projectRoot, 'src', 'pose-lab.js'), 'utf8');
const weaponRules = fs.readFileSync(path.join(projectRoot, 'src', 'weapon-runtime-rules.mjs'), 'utf8');
const profiles = fs.readFileSync(path.join(projectRoot, 'src', 'rig-profiles.js'), 'utf8');
const failures = [];
function assert(condition, message) { if (!condition) failures.push(message); }

const meshyStart = profiles.indexOf('meshyCharacter:');
const meshyEnd = profiles.indexOf('\n  meshyStatic:', meshyStart);
const meshy = profiles.slice(meshyStart, meshyEnd > meshyStart ? meshyEnd : undefined);
const playerStart = profiles.indexOf('player:');
const playerEnd = profiles.indexOf('\n  meshyCharacter:', playerStart);
const player = profiles.slice(playerStart, playerEnd > playerStart ? playerEnd : undefined);
const converterStart = js.indexOf('function buildFpsUpperKeyConvertClips');
const converterEnd = js.indexOf('function findBoneCanonical', converterStart);
const converter = converterStart >= 0 && converterEnd > converterStart ? js.slice(converterStart, converterEnd) : '';

assert(meshy.includes("parentMode: 'synthetic-source-socket'") && meshy.includes("syntheticSourceSocketBone: 'WeaponR'"), 'Meshy weapon should mirror FPS as RightHand -> synthetic WeaponR -> WeaponGrip');
assert(meshy.includes("positionMode: 'right-hand'"), 'Meshy WeaponGrip should remain a one-hand socket');
assert(meshy.includes('handLocalOffset: [0.095, 0.035, -0.01]'), 'Meshy rig-local hand offset must remain unchanged');
assert(meshy.includes('modelLocalOffset: [-0.11512, 0.00773, -0.01127]'), 'Meshy rig-local model offset must remain unchanged');
assert(meshy.includes('rotationDeg: [90, 0, -55.145]'), 'Meshy rig-local attachment rotation must preserve the hard-won manual visual orientation');
assert(meshy.includes('gripLocalPosition: [0.6535, -0.02302, -0.07317]'), 'Meshy rig-local grip landmark must remain unchanged');
assert(meshy.includes('weaponKeyConvert: {') && meshy.includes('enabled: true') && meshy.includes("targetWeapon: 'WeaponR'"), 'active Meshy ready path should generate authored FPS Weapon.R basis onto synthetic WeaponR');

assert(player.includes("sourceSocketBone: 'WeaponR'"), 'FPS Arms weapon should still inherit authored WeaponR FK');
assert(player.includes('modelLocalOffset: [0.00424, -0.0167, 0.01744]'), 'FPS manual model offset must remain unchanged');
assert(player.includes('rotationDeg: [-179.998, -4.747, 111.678]'), 'FPS manual attachment rotation must remain unchanged');

assert(!profiles.includes('copiedSourceLayer') && !js.includes('syncCopiedSourceLayer'), 'Meshy weapon review must not use a copied FPS actor overlay');
assert(js.includes("config.parentMode === 'synthetic-source-socket'") && js.includes('syntheticSourceSocket.add(root);'), 'Meshy sockets should be parented as RightHand -> synthetic WeaponR -> WeaponGrip');
assert(js.includes("const handFk = config.parentMode === 'hand-fk'") && js.includes('else if (handFk) rightHand.add(root);'), 'legacy hand-FK sockets should remain available for non-source-socket tools');
assert(js.includes("from './weapon-runtime-rules.mjs?v=pose-editor-180'"), 'pose-lab browser runtime should use the shared weapon runtime rules module');
assert(weaponRules.includes("config.parentMode === 'hand-fk'") && weaponRules.includes('fkLocalPosition') && weaponRules.includes('fkLocalQuaternion'), 'hand-FK socket should maintain a true hand-local transform');
assert(weaponRules.includes('socketParent.position.copy(vectorFromArray(THREE, config.handLocalOffset))') && weaponRules.includes('syntheticGripLocal.add(vectorFromArray(THREE, config.modelLocalOffset))') && weaponRules.includes('socketParent.getWorldScale') && weaponRules.includes('proxy.root.position.copy(proxy.syntheticFkLocalPosition);') && !weaponRules.includes('socketParent.worldToLocal(targetWorld.clone())'), 'synthetic source sockets should keep handLocalOffset on animated WeaponR, then preserve WeaponGrip as a stable displaced local child');
assert(js.includes('function weaponProxyPlacementSignature(config = {}, context = {})'), 'hand-FK placement cache should accept visual pose context');
assert(js.includes("clipKey: context.clipKey || ''") && js.includes("restPose: context.restPose || ''"), 'hand-FK placement cache should be invalidated by active clip/rest pose changes');
assert(js.includes("clipKey: this.activeAction?._clip ? clipKey(this.activeAction._clip) : ''") && js.includes("restPose: this.currentRestPose || ''"), 'hand-FK socket should recalibrate when the active clip or rest pose changes');
assert(weaponRules.includes('proxy.fkLocalPosition = socketWorldPosition.clone().applyMatrix4(proxy.rightHand.matrixWorld.clone().invert());'), 'hand-FK socket should derive local position from the right hand inverse matrix');
assert(weaponRules.includes('proxy.fkLocalQuaternion = weaponWorldQuaternion(THREE, proxy.rightHand).invert().multiply(socketWorldQuaternion).normalize();'), 'hand-FK socket should derive local rotation from the right hand inverse quaternion');
assert(weaponRules.includes('proxy.root.position.copy(proxy.fkLocalPosition);') && weaponRules.includes('proxy.root.quaternion.copy(proxy.fkLocalQuaternion);'), 'hand-FK socket should apply the calibrated hand-local transform to the child bone');
assert(js.includes('syncWeaponVisualAttachment(options = {})'), 'weapon visual sync should be centralized instead of split between playback and edit tools');
assert(js.includes('const forceSocket = options.forceSocket === true;'), 'shared weapon sync should only force hand-FK recalculation when explicitly requested');
assert(js.includes('updateWeaponProxyVisibility() {\n    this.syncWeaponVisualAttachment();'), 'normal playback visibility must let the hand-FK child socket ride the animated hand');
assert(!js.includes("this.syncWeaponVisualAttachment({ forceSocket: this.weaponProxy?.config?.parentMode === 'hand-fk' });"), 'normal playback must not force-rebuild hand-FK placement every frame');
assert(!js.includes("visible-attachment-mount") && !js.includes('attachmentMount.add(child);'), 'hand-FK weapon should not use a detached model-space visible mount');
assert(js.includes("displayRoot.name = root.name + '-display-root'") && js.includes('root.add(displayRoot);'), 'hand-FK weapon should use a socket-child display root, not an actor-root mirror');
assert(js.includes('displayRoot.add(weaponRoot);') && js.includes('displayRoot.add(tip);'), 'real weapon model and tip marker should be children of WeaponDisplayRoot under WeaponGrip');
assert(js.includes('this.weaponProxy = { root, displayRoot, arc') && js.includes('displayParent: proxy.displayRoot?.parent?.name'), 'weapon debug snapshot should report the display root parent chain');
assert(weaponRules.includes("proxy?.config?.parentMode === 'hand-fk' || proxy?.config?.parentMode === 'synthetic-source-socket'") && weaponRules.includes('socketScaleCompensation.set('), 'socket-child display root should compensate inherited hand-bone scale instead of disappearing');
assert(weaponRules.includes('displayRoot.scale.copy(socketScaleCompensation);') && weaponRules.includes('weaponRoot.scale.setScalar(attachmentScale);'), 'display root should own inherited-scale compensation while the model keeps attachment scale');
assert(weaponRules.includes('pinWeaponLocalPointToDisplay(THREE, weaponRoot, displayRoot, config.gripLocalPosition') && weaponRules.includes('const correction = actualLocal.sub(target);') && weaponRules.includes('weaponRoot.position.sub(correction);'), 'weapon attachment should post-pin the configured hilt local point to the display/socket origin after all transforms');
assert(weaponRules.includes('const fallbackVisible = !(proxy?.model && proxy?.attachmentConfig?.url)') && weaponRules.includes('fallbackHiddenWithRealWeapon'), 'real weapon attachments should hide fallback blade/hilt and report layer state');
assert(!js.includes('syncWeaponAttachmentMount') && js.includes('actor?.syncWeaponVisualAttachment?.({ forceSocket: true });'), 'weapon pose tool may explicitly rebuild hand-FK placement after config edits without a detached mount sync');
assert(js.includes("const frame = proxy?.config?.parentMode === 'hand-fk'\n      ? actor?.model") && js.includes('weaponWorldDeltaToOffsetFrame(actor, world)'), 'hand-FK Move should edit modelLocalOffset in actor/model space');
assert(js.includes('ensureBoneOverlayForBone(bone)') && js.includes('this.ensureBoneOverlayForBone(root);'), 'synthetic WeaponGrip should get a visible bone overlay handle');
assert(js.includes('this.mixer.update(dt);\n    this.reapplyBoneEdits();\n    this.applyGrounding();\n    this.updateWeaponProxyVisibility();'), 'frame update should sync the visible weapon after pose edits and grounding, not before them');
assert(js.includes('updateWeaponFallbackFromTipRuntime(THREE, this.weaponProxy)') || js.includes('this.updateWeaponFallbackFromTip();'), 'visible fallback/debug blade should refresh from the configured attachment tip marker');
assert(weaponRules.includes('tipLocal = proxy?.tipMarker') || js.includes('fallbackEnd.position.copy(tip.position)'), 'fallback/debug blade should use WeaponGrip_end rather than an independent local +Z direction');
assert(js.includes("group.name = 'weapon-visual-sync-overlay'") && js.includes("line.name = 'weapon-overlay-socket-tip-line'"), 'weapon gizmo/debug overlay should expose the visible socket-to-tip line');
assert(!js.includes('updateWeaponGizmo() {\n    return;\n  }'), 'weapon gizmo update must not be a no-op');
assert(js.includes('debugWeaponFollow(sampleArgs = [])') && js.includes("schema: 'pose-lab-live-weapon-follow-v1'"), 'live debug tooling should sample whether the visible weapon follows the animated hand');
assert(js.includes('debugWeaponVisualFollow(sampleArgs = [])') && js.includes("schema: 'pose-lab-live-weapon-visual-follow-v1'"), 'live debug tooling should capture a rendered visual weapon follow contact sheet');
assert(js.includes('&& checks.fallbackHiddenWithRealWeapon') && js.includes('&& checks.realWeaponVisible'), 'visual follow pass/fail should reject fake fallback weapon layers over a real sabre');
assert(js.includes("case 'weapon-follow':") && js.includes("if (subcommand === 'follow'"), 'debug CLI should expose weapon follow checks without screenshots');
assert(js.includes("case 'weapon-visual-follow':") && js.includes("subcommand === 'visual-follow'"), 'debug CLI should expose visual weapon follow checks without Android screencap');
assert(js.includes('if (forceVisible) {\n      actor.updateWeaponProxyVisibility?.();') && js.includes('if (proxy.model) proxy.model.visible = true;'), 'weapon tooling visibility should resync and show the socket-attached weapon model');
assert(weaponRules.includes("if (config.parentMode === 'hand-fk')") && weaponRules.includes("return { handled: true, mode: 'hand-fk'"), 'hand-FK update should return before legacy model-space quaternion solving');
assert(js.includes('this.weaponProxy.root.visible = true;'), 'weapon sockets must stay visible instead of hiding behind clip-pattern gates');
assert(converter.includes('const weaponTrackEnabled = weaponConfig.enabled === true'), 'weapon socket track generation should be explicit opt-in');
assert(converter.includes('if (weaponTrackEnabled && sourceWeaponTrack)'), 'synthetic WeaponR quaternion tracks should only be emitted when explicitly enabled');

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  checked: ['meshy-saber-follows-synthetic-weapongripsource-bone', 'hand-fk-cache-includes-clip-rest-context', 'synthetic-source-socket-authored-model-space-offset', 'weapon-display-root-under-weapongrip', 'socket-scale-compensated-weapon-visible', 'weapon-move-forces-socket-recalc', 'live-weapon-follow-debug', 'live-weapon-visual-follow-debug', 'synthetic-weapongrip-handle-visible', 'active-ready-keys-synthetic-weaponr', 'manual-weapon-values-preserved'],
}, null, 2));
