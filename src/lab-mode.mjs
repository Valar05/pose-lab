export function resolveLabMode(search = '') {
  const params = new URLSearchParams(String(search || ''));
  const mode = String(params.get('mode') || '').trim().toLowerCase();
  if (!mode || mode === 'critique' || mode === 'critique-first' || mode === 'pose-critique') return 'critique';
  if (mode === 'standard' || mode === 'full' || mode === 'lab') return 'standard';
  return 'critique';
}
