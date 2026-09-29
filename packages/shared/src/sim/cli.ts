// Prints the solo week curve for both profiles: pnpm --filter @mycelium/shared simulate
import { formatReport, PROFILES, simulateWeek } from "./week";

for (const profile of Object.values(PROFILES)) {
  const started = performance.now();
  const reports = simulateWeek(profile);
  console.log(`\n${profile.name} (${Math.round(performance.now() - started)} ms)`);
  console.log(formatReport(reports));
}
