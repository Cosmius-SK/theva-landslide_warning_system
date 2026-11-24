export function isCurrentOrNewerUpdate(nextUpdatedAt, currentUpdatedAt) {
  const next = Date.parse(nextUpdatedAt || "");
  const current = Date.parse(currentUpdatedAt || "");
  if (!Number.isFinite(current)) return true;
  if (!Number.isFinite(next)) return false;
  return next >= current;
}
