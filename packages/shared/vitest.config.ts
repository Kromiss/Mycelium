import { defineConfig } from "vitest/config";

// The rule tests check the M7 numbers: the ×5 tiles experiment is switched off here (see TILE_SCALE).
export default defineConfig({ define: { __TILE_SCALE__: 1 } });
