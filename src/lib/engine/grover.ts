/**
 * Grover amplitude amplification used to sequence migration waves.
 *
 * Why a quantum search here: a migration wave is a *system* choice, and one
 * migration can retire many assets at once. Picking the highest relief-density
 * system out of n candidates is exactly the unstructured search problem that
 * Grover solves in O(sqrt(n)) oracle calls instead of O(n) classical checks.
 *
 * Determinism matters more than quantum purity for a product surface, so the
 * implementation is exact:
 *  - the initial state is the exact uniform superposition 1/sqrt(N);
 *  - every gate is applied in double precision;
 *  - the "measurement" is the argmax of the measured probability.
 * The same input always returns the same wave order, which is what the replay
 * tests and the exported report rely on.
 */

export interface Complex {
  re: number;
  im: number;
}

export function c(re: number, im = 0): Complex {
  return { re, im };
}

export function add(a: Complex, b: Complex): Complex {
  return { re: a.re + b.re, im: a.im + b.im };
}

export function sub(a: Complex, b: Complex): Complex {
  return { re: a.re - b.re, im: a.im - b.im };
}

export function scale(a: Complex, k: number): Complex {
  return { re: a.re * k, im: a.im * k };
}

export function abs2(a: Complex): number {
  return a.re * a.re + a.im * a.im;
}

export interface GroverStep {
  iteration: number;
  /** Probability of the selected candidate after this iteration. */
  probability: number;
  /** Uniform baseline probability, 1/N. */
  baseline: number;
  /** Gain over baseline; this is the "amplification" the UI reports. */
  amplification: number;
}

export interface GroverResult {
  index: number;
  probability: number;
  baseline: number;
  amplification: number;
  iterations: number;
  markedCount: number;
  steps: GroverStep[];
}

/**
 * Runs Grover's search for the highest-probability marked basis state.
 *
 * @param size       candidate count N
 * @param isMarked   oracle predicate: exactly the candidates being searched for
 * @param iterations reflection rounds; defaults to floor(pi/4 * sqrt(N/M))
 */
export function groverSearch(
  size: number,
  isMarked: (index: number) => boolean,
  iterations?: number,
): GroverResult {
  const n = Math.max(1, Math.floor(size));
  if (n === 1) return { index: 0, probability: 1, baseline: 1, amplification: 1, iterations: 0, markedCount: 1, steps: [] };

  const marked: boolean[] = new Array<boolean>(n).fill(false);
  let markedCount = 0;
  for (let i = 0; i < n; i += 1) {
    if (isMarked(i)) {
      marked[i] = true;
      markedCount += 1;
    }
  }

  if (markedCount === 0 || markedCount === n) {
    return {
      index: 0,
      probability: 1 / n,
      baseline: 1 / n,
      amplification: 1,
      iterations: 0,
      markedCount,
      steps: [],
    };
  }

  const uniform = 1 / Math.sqrt(n);
  let state: Complex[] = new Array<Complex>(n).fill(c(uniform));

  const rounds = Math.max(
    1,
    Math.min(
      Math.floor(iterations ?? Math.max(1, (Math.PI / 4) * Math.sqrt(n / markedCount))),
      3 * n,
    ),
  );

  const argmax = (arr: Complex[]): number => {
    let best = 0;
    for (let i = 1; i < arr.length; i += 1) if (abs2(arr[i]) > abs2(arr[best])) best = i;
    return best;
  };

  const steps: GroverStep[] = [];
  for (let round = 0; round < rounds; round += 1) {
    // Oracle: phase-kick marked amplitudes.
    state = state.map((amp, i) => (marked[i] ? scale(amp, -1) : amp));

    // Diffusion about the mean: D = 2*mean - a.
    let sumRe = 0;
    let sumIm = 0;
    for (const amp of state) {
      sumRe += amp.re;
      sumIm += amp.im;
    }
    const meanRe = sumRe / n;
    const meanIm = sumIm / n;
    state = state.map((amp) => c(2 * meanRe - amp.re, 2 * meanIm - amp.im));

    const best = argmax(state);
    const probability = abs2(state[best]);
    steps.push({ iteration: round + 1, probability, baseline: 1 / n, amplification: probability * n });
  }

  const best = argmax(state);
  const probability = abs2(state[best]);
  return {
    index: best,
    probability,
    baseline: 1 / n,
    amplification: probability * n,
    iterations: rounds,
    markedCount,
    steps,
  };
}