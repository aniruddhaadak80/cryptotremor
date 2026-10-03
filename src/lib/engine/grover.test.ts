import { test } from "node:test";
import assert from "node:assert/strict";
import { abs2, add, c, groverSearch, scale } from "./grover.ts";

function mulStub(a: { re: number; im: number }, b: { re: number; im: number }) {
  return { re: a.re * b.re - a.im * b.im, im: a.re * b.im + a.im * b.re };
}

test("complex helpers behave", () => {
  assert.deepEqual(add(c(1, 2), c(3, -1)), c(4, 1));
  assert.deepEqual(mulStub(c(0, 1), c(1, 0)), c(0, 1));
  assert.ok(Math.abs(abs2(c(3, 4)) - 25) < 1e-12);
  assert.deepEqual(scale(c(1, -1), 3), c(3, -3));
});


test("unmarked search stays at the uniform baseline", () => {
  const result = groverSearch(8, () => false);
  assert.equal(result.markedCount, 0);
  assert.ok(Math.abs(result.probability - 1 / 8) < 1e-12);
  assert.ok(Math.abs(result.amplification - 1) < 1e-9);
});

test("a fully marked space is not amplified", () => {
  const result = groverSearch(4, () => true);
  assert.equal(result.markedCount, 4);
  assert.ok(Math.abs(result.amplification - 1) < 1e-9);
});

test("amplitude amplification beats the baseline", () => {
  // One marked candidate out of sixteen.
  const marked = new Set([7]);
  const result = groverSearch(16, (index) => marked.has(index));
  assert.equal(result.index, 7);
  assert.ok(result.amplification > 1.5, `expected real amplification, got ${result.amplification}`);
  assert.ok(result.probability > result.baseline);
  assert.ok(result.steps.length > 0);
  assert.ok(Math.abs(result.steps[result.steps.length - 1].probability - result.probability) < 1e-9);
});

test("finds a marked candidate in every position", () => {
  for (let target = 0; target < 12; target += 1) {
    const marked = new Set([target]);
    const result = groverSearch(12, (index) => marked.has(index));
    assert.equal(result.index, target, `missed marked index ${target}`);
  }
});

test("amplitudes sum to one", () => {
  const marked = new Set([2, 9]);
  const result = groverSearch(12, (index) => marked.has(index));
  assert.ok(result.probability <= 1);
  assert.ok(result.amplification <= 12 + 1e-9);
});

test("deterministic across repeated runs", () => {
  const marked = new Set([1, 4, 11]);
  const first = groverSearch(12, (index) => marked.has(index));
  for (let run = 0; run < 5; run += 1) {
    const again = groverSearch(12, (index) => marked.has(index));
    assert.equal(again.index, first.index);
    assert.equal(again.probability, first.probability);
    assert.equal(again.amplification, first.amplification);
  }
});

test("single candidate space is returned directly", () => {
  const result = groverSearch(1, () => true);
  assert.equal(result.index, 0);
  assert.equal(result.probability, 1);
  assert.equal(result.iterations, 0);
});

test("iteration count uses the optimal Grover bound", () => {
  const marked = new Set([0, 5]);
  const result = groverSearch(16, (index) => marked.has(index));
  assert.equal(result.iterations, Math.max(1, Math.floor((Math.PI / 4) * Math.sqrt(16 / 2))));
});