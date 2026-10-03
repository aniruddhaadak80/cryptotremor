/**
 * Append-only audit seals.
 *
 * For every entity (one cryptographic asset) the events form a hash chain:
 *
 *   seal_0 = SHA-384(GENESIS || canonicalJson(event_1))
 *   seal_n = SHA-384(UTF-8(prevSeal) || canonicalJson(event_n))
 *
 * A rewrite anywhere in the middle breaks every later seal, so the chain is a
 * tamper-evident receipt rather than a log that can be quietly edited. Deletion
 * keeps a tombstone event, because a chain with a hole in it proves nothing.
 */

import { createHash } from "node:crypto";
import type { AuditEvent, AuditEventType, ReplayReport } from "../types.ts";
import { canonicalJson } from "./canonical.ts";

export const GENESIS_SEAL = "cryptotremor/genesis/v1";
export const SEAL_ALGORITHM = "SHA-384";

export interface SealableEvent {
  entityId: string;
  seq: number;
  type: AuditEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function sha384Hex(input: string): string {
  return createHash("sha384").update(Buffer.from(input, "utf8")).digest("hex");
}

/** The exact byte string that gets hashed for an event. */
export function sealInput(prevSeal: string, event: SealableEvent): string {
  return (
    prevSeal +
    canonicalJson({
      entityId: event.entityId,
      seq: event.seq,
      type: event.type,
      payload: event.payload,
      createdAt: event.createdAt,
    })
  );
}

export function computeSeal(prevSeal: string, event: SealableEvent): string {
  return sha384Hex(sealInput(prevSeal, event));
}

export function sealOf(event: AuditEvent): string {
  return event.seal;
}

export function nextSeal(previous: AuditEvent | null, event: SealableEvent): string {
  return computeSeal(previous ? previous.seal : GENESIS_SEAL, event);
}

/** Short, human-quotable reference returned by engine and mutation responses. */
export function sealReference(event: AuditEvent | null | undefined): string | null {
  if (!event) return null;
  return `sha384:${event.seal.slice(0, 16)}`;
}

export function replayEntity(events: AuditEvent[]): {
  ok: boolean;
  events: number;
  headSeal: string | null;
  brokenAt: { entityId: string; seq: number } | null;
} {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  let prevSeal = GENESIS_SEAL;
  let headSeal: string | null = null;
  for (const event of ordered) {
    if (event.prevSeal !== prevSeal) {
      return { ok: false, events: ordered.length, headSeal, brokenAt: { entityId: event.entityId, seq: event.seq } };
    }
    const expected = computeSeal(prevSeal, event);
    if (expected !== event.seal) {
      return { ok: false, events: ordered.length, headSeal, brokenAt: { entityId: event.entityId, seq: event.seq } };
    }
    prevSeal = event.seal;
    headSeal = event.seal;
  }
  return { ok: true, events: ordered.length, headSeal, brokenAt: null };
}

export function replayScope(
  allEvents: AuditEvent[],
  tombstones: string[],
): ReplayReport {
  const byEntity = new Map<string, AuditEvent[]>();
  for (const event of allEvents) {
    const list = byEntity.get(event.entityId) ?? [];
    list.push(event);
    byEntity.set(event.entityId, list);
  }

  let brokenAt: { entityId: string; seq: number } | null = null;
  let headSeal: string | null = null;
  let total = 0;
  for (const events of byEntity.values()) {
    const result = replayEntity(events);
    total += result.events;
    if (result.headSeal) headSeal = result.headSeal;
    if (!result.ok && !brokenAt) brokenAt = result.brokenAt;
  }

  return {
    ok: brokenAt === null,
    events: total,
    assets: byEntity.size,
    genesisSeal: GENESIS_SEAL,
    headSeal,
    brokenAt,
    verifiedAt: new Date().toISOString(),
    tombstones: tombstones.length,
  };
}