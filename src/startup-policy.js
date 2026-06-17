export function preferSavedClipForActor(actorInfo) {
  return !actorInfo?.startupClip;
}
