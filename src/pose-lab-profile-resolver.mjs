import { RIG_PROFILES } from './rig-profiles.js';

function cloneData(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function requireObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`missing ${label}`);
  return value;
}

function requireString(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`missing ${label}`);
  return value;
}

function requireArray(value, label, length = 3) {
  if (!Array.isArray(value) || value.length < length || !value.every((entry) => Number.isFinite(Number(entry)))) throw new Error(`missing ${label}`);
  return value.map((entry) => Number(entry));
}

function requireNumber(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`missing ${label}`);
  return number;
}

export function resolvePoseLabActorRuntimeConfig(actorKey = 'meshyCharacter') {
  const profile = requireObject(RIG_PROFILES?.[actorKey], `RIG_PROFILES.${actorKey}`);
  const proxy = requireObject(profile.weaponProxy, `${actorKey}.weaponProxy`);
  const attachment = requireObject(profile.weaponAttachment, `${actorKey}.weaponAttachment`);
  return {
    actorKey,
    profile: cloneData(profile),
    actor: {
      url: requireString(profile.url, `${actorKey}.url`),
      targetHeight: requireNumber(profile.targetHeight, `${actorKey}.targetHeight`),
    },
    proxy: {
      ...cloneData(proxy),
      handBone: requireString(proxy.handBone, `${actorKey}.weaponProxy.handBone`),
      socketBone: requireString(proxy.socketBone, `${actorKey}.weaponProxy.socketBone`),
      parentMode: requireString(proxy.parentMode, `${actorKey}.weaponProxy.parentMode`),
      positionMode: requireString(proxy.positionMode, `${actorKey}.weaponProxy.positionMode`),
      handLocalOffset: requireArray(proxy.handLocalOffset, `${actorKey}.weaponProxy.handLocalOffset`),
      modelLocalOffset: requireArray(proxy.modelLocalOffset, `${actorKey}.weaponProxy.modelLocalOffset`),
      gripOffset: requireArray(proxy.gripOffset, `${actorKey}.weaponProxy.gripOffset`),
      rotationDeg: Array.isArray(proxy.rotationDeg) ? requireArray(proxy.rotationDeg, `${actorKey}.weaponProxy.rotationDeg`) : [0, 0, 0],
      leftHandBone: typeof proxy.leftHandBone === 'string' ? proxy.leftHandBone : '',
      sourceSocketBone: typeof proxy.sourceSocketBone === 'string' ? proxy.sourceSocketBone : '',
      syntheticSourceSocketBone: typeof proxy.syntheticSourceSocketBone === 'string' ? proxy.syntheticSourceSocketBone : '',
      tipOffset: Array.isArray(proxy.tipOffset) ? requireArray(proxy.tipOffset, `${actorKey}.weaponProxy.tipOffset`) : [0, 0, 0.85],
      length: Number.isFinite(Number(proxy.length)) ? Number(proxy.length) : 0.85,
      allowAnimatedSocketAnimation: proxy.allowAnimatedSocketAnimation === true,
      compensateParentScale: proxy.compensateParentScale !== false,
      hideFallbackOnAttachment: proxy.hideFallbackOnAttachment === true,
    },
    attachment: {
      ...cloneData(attachment),
      url: requireString(attachment.url, `${actorKey}.weaponAttachment.url`),
      name: requireString(attachment.name, `${actorKey}.weaponAttachment.name`),
      socketBone: requireString(attachment.socketBone, `${actorKey}.weaponAttachment.socketBone`),
      tipMarker: requireString(attachment.tipMarker, `${actorKey}.weaponAttachment.tipMarker`),
      scale: requireNumber(attachment.scale, `${actorKey}.weaponAttachment.scale`),
      position: Array.isArray(attachment.position) ? requireArray(attachment.position, `${actorKey}.weaponAttachment.position`) : [0, 0, 0],
      rotationDeg: requireArray(attachment.rotationDeg, `${actorKey}.weaponAttachment.rotationDeg`),
      gripLocalPosition: requireArray(attachment.gripLocalPosition, `${actorKey}.weaponAttachment.gripLocalPosition`),
      tipLocalPosition: requireArray(attachment.tipLocalPosition, `${actorKey}.weaponAttachment.tipLocalPosition`),
    },
  };
}
