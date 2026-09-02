/**
 * Runs the suites with live network tests enabled.
 *
 * `PB_LIVE=1 npm test` is not portable to Windows shells, and a cross-env
 * dependency is not worth carrying for one variable, so the flag is set here
 * and the CLI inherits it.
 */
import { spawnSync } from "node:child_process";

const result = spawnSync(
  "npx",
  ["paperback-cli", "test", "--noConsole", "--output", "./bundles/tests-live.json"],
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, PB_LIVE: "1" },
  },
);

process.exit(result.status ?? 1);
