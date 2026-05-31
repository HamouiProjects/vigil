/** @param {import('./resolve.js').ReturnType<typeof import('./resolve.js').resolveEntitlements>} ent */
export function can(ent, cap) {
  return ent.capabilities.has(cap)
}

/** @param {import('./resolve.js').ReturnType<typeof import('./resolve.js').resolveEntitlements>} ent */
export function limit(ent, name) {
  return ent.limits[name] ?? 0
}

/** @param {import('./resolve.js').ReturnType<typeof import('./resolve.js').resolveEntitlements>} ent */
export function withinLimit(ent, name, count) {
  const lim = limit(ent, name)
  return count <= lim
}

/** @param {import('./resolve.js').ReturnType<typeof import('./resolve.js').resolveEntitlements>} ent */
export function priceMode(ent) {
  return ent.priceMode
}
