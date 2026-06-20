export function preferSavedClipForActor(actorInfo) {
  return !actorInfo?.startupClip;
}

export function resolveStartupActorKey({ labMode = 'standard', visualActorKey = '', savedActorKey = '', availableKeys = [], startupActorKey = 'player' } = {}) {
  const available = new Set(Array.isArray(availableKeys) ? availableKeys : []);
  const defaultActorKey = available.has('ares') ? 'ares' : (available.has(startupActorKey) ? startupActorKey : (available.has('player') ? 'player' : [...available][0] || startupActorKey || 'player'));
  if (visualActorKey && available.has(visualActorKey)) return visualActorKey;
  if (String(labMode || '').trim().toLowerCase() === 'critique') return defaultActorKey;
  if (savedActorKey && available.has(savedActorKey)) return savedActorKey;
  return defaultActorKey;
}
