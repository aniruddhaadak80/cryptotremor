/**
 * Canonical JSON.
 *
 * Two events that mean the same thing must produce the same bytes, otherwise
 * the seal chain is decoration. Rules:
 *  - object keys are sorted by code unit;
 *  - arrays keep their order (order is meaning here);
 *  - `undefined` members are dropped, `null` is preserved;
 *  - numbers must be finite; -0 is normalized to 0, and floats are emitted with
 *    a stable representation;
 *  - no whitespace is emitted.
 */

export type Canonical = null | boolean | number | string | Canonical[] | { [key: string]: Canonical };

function normalizeNumber(value: number): number {
  if (!Number.isFinite(value)) {
    throw new TypeError(`canonicalJson: non-finite number ${String(value)}`);
  }
  return value === 0 ? 0 : value;
}

function normalize(value: unknown): Canonical {
  if (value === null) return null;
  if (Array.isArray(value)) return value.map(normalize);
  if (value instanceof Date) return value.toISOString();
  switch (typeof value) {
    case "boolean":
      return value;
    case "number":
      return normalizeNumber(value);
    case "string":
      return value;
    case "bigint":
      return value.toString();
    case "undefined":
      return null;
    case "object": {
      const source = value as Record<string, unknown>;
      const out: { [key: string]: Canonical } = {};
      for (const key of Object.keys(source).sort()) {
        if (source[key] === undefined) continue;
        out[key] = normalize(source[key]);
      }
      return out;
    }
    default:
      throw new TypeError(`canonicalJson: unsupported type ${typeof value}`);
  }
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalize(value));
}