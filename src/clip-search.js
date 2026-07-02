export function fuzzyScore(query, text) {
  const q = String(query || '').trim().toLowerCase();
  const hay = String(text || '').toLowerCase();
  if (!q) return 0;
  if (hay.includes(q)) return 1000 - hay.indexOf(q);
  let score = 0;
  let qi = 0;
  let streak = 0;
  for (let i = 0; i < hay.length && qi < q.length; i += 1) {
    if (hay[i] === q[qi]) {
      qi += 1;
      streak += 1;
      score += 12 + (streak * 3);
    } else {
      streak = 0;
      score -= 0.2;
    }
  }
  return qi === q.length ? score - (hay.length * 0.02) : -Infinity;
}

export function clipLabel(clip) {
  const origin = String(clip?.userData?.origin || 'own');
  const sourceName = String(clip?.userData?.sourceName || clip?.name || 'clip');
  if (clip?.userData?.sourceReduction) return String(clip?.name || sourceName);
  if (origin.startsWith('cleanup:')) return sourceName + ' [clean]';
  if (origin.startsWith('mapped-arms:') && /\[[^\]]+\]/.test(String(clip?.name || ''))) return String(clip.name);
  if (origin.startsWith('mapped-arms:')) return sourceName + ' -> ' + origin.split('->').pop();
  if (origin.startsWith('own:')) return sourceName;
  return String(clip?.name || sourceName);
}

export function searchableClipEntries(clips = []) {
  return clips.map((clip) => ({
    clip,
    key: clip?.key || clip?.name || '',
    label: clipLabel(clip),
  }));
}

export function isSf2PoseClip(clip) {
  const reduction = clip?.userData?.sourceReduction;
  if (reduction?.schema === 'pose-lab-sf2-reduction-v1') return true;
  if (reduction?.goal && /Street Fighter 2|SF2/i.test(String(reduction.goal))) return true;
  return /\[sf2-eased\]/i.test(String(clip?.name || ''));
}

function defaultClipEntryKey(clip, fallback = '') {
  return clip ? String(clip.userData?.origin || 'own') + ':' + String(clip.name || fallback) : String(fallback || '');
}

export function defaultClipEntries(clips = [], recentKeys = [], activeKey = '') {
  const entries = searchableClipEntries(clips).map((entry) => ({
    ...entry,
    key: defaultClipEntryKey(entry.clip, entry.key),
  }));
  const rank = new Map();
  let nextRank = 0;
  if (activeKey) rank.set(activeKey, nextRank++);
  for (const key of recentKeys || []) {
    if (!rank.has(key)) rank.set(key, nextRank++);
  }
  return entries.sort((a, b) => {
    const aRank = rank.has(a.key) ? rank.get(a.key) : Number.POSITIVE_INFINITY;
    const bRank = rank.has(b.key) ? rank.get(b.key) : Number.POSITIVE_INFINITY;
    if (aRank !== bRank) return aRank - bRank;
    return a.label.localeCompare(b.label);
  });
}

export function searchClipEntries(query, clips = []) {
  const trimmed = String(query || '').trim();
  const entries = searchableClipEntries(clips);
  if (!trimmed) return entries;
  return entries
    .map((entry) => ({
      ...entry,
      score: Math.max(
        fuzzyScore(trimmed, entry.clip?.name),
        fuzzyScore(trimmed, entry.label),
        fuzzyScore(trimmed, entry.clip?.userData?.sourceName || '')
      ),
    }))
    .filter((entry) => Number.isFinite(entry.score))
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
}
