/**
 * Balance variants for the simulations (M9): numbers of `balance.ts` changed for one run, without
 * editing the file, e.g. `{"ZONES": {"cost": [1, 2, 3, 4, 5, 6, 7]}, "ECONOMY": {"sizeFactor": 1.012}}`.
 * Only for simulations: the game always plays with the numbers of the file.
 */
import * as balance from "../balance";

/** Applies a variant: each key names a table of `balance.ts`; objects are merged, numbers and arrays replaced. */
export function applyVariant(overrides: Record<string, unknown>): void {
  for (const [name, value] of Object.entries(overrides)) {
    const target = (balance as Record<string, unknown>)[name];
    if (target === null || typeof target !== "object") throw new Error(`Unknown balance table: ${name}`);
    merge(target as Record<string, unknown>, value, name);
  }
}

function merge(target: Record<string, unknown>, value: unknown, path: string): void {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${path}: expected an object`);
  for (const [k, v] of Object.entries(value)) {
    if (!(k in target)) throw new Error(`Unknown balance value: ${path}.${k}`);
    const current = target[k];
    if (current !== null && typeof current === "object" && !Array.isArray(current) && v !== null && typeof v === "object" && !Array.isArray(v)) {
      merge(current as Record<string, unknown>, v, `${path}.${k}`);
    } else if (Array.isArray(current)) {
      if (!Array.isArray(v) || v.length !== current.length) throw new Error(`${path}.${k}: expected ${current.length} values`);
      for (let i = 0; i < v.length; i++) current[i] = v[i];
    } else {
      if (typeof v !== typeof current) throw new Error(`${path}.${k}: expected a ${typeof current}`);
      target[k] = v;
    }
  }
}

/** The variant of the `SIM_VARIANT` environment variable (JSON), if any. */
export function variantFromEnv(): Record<string, unknown> | null {
  const raw = process.env.SIM_VARIANT;
  if (!raw || raw.trim() === "" || raw.trim() === "{}") return null;
  return JSON.parse(raw) as Record<string, unknown>;
}
