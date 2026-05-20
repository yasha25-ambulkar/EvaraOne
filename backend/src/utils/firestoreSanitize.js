/**
 * Recursive sanitizer to remove `undefined` values from objects
 * so Firestore `update()` calls don't fail with undefined values.
 */
'use strict';

function sanitizeForFirestore(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj
      .map((v) => sanitizeForFirestore(v))
      .filter((v) => v !== undefined);
  }

  if (typeof obj === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === undefined) continue;
      const cleaned = sanitizeForFirestore(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }

  // primitives (string, number, boolean)
  return obj;
}

module.exports = { sanitizeForFirestore };
