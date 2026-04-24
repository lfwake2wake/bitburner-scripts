/** prep.js - Grow + weaken a target across all servers, no hacking
 *  run batch/prep.js <target> [--max-ram=N]
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  if (!target) { ns.tprint("Usage: run batch/prep.js <target> [--max-ram=N]"); return; }

  const growScript = "core/attack-grow.js";
  const weakenScript = "core/attack-weaken.js";

  // Parse --max-ram flag
  const args = ns.args.slice();
  let maxRamBudget = Infinity;
  const maxRamFlag = args.find(a => typeof a === "string" && a.startsWith("--max-ram="));
  const maxRamArgIdx = args.indexOf("--max-ram");
  if (maxRamFlag) {
    maxRamBudget = Number(maxRamFlag.split("=")[1]);
  } else if (maxRamArgIdx !== -1 && args[maxRamArgIdx + 1]) {
    maxRamBudget = Number(args[maxRamArgIdx + 1]);
  }

  // BFS all servers
  const visited = new Set();
  const queue = ["home"];
  const hosts = [];
  while (queue.length) {
    const h = queue.shift();
    if (visited.has(h)) continue;
    visited.add(h);
    hosts.push(h);
    for (const n of ns.scan(h)) if (!visited.has(n)) queue.push(n);
  }

  ns.tprint(`Prepping ${target} — grow + weaken across all servers...`);
  if (maxRamBudget !== Infinity) ns.tprint(`RAM cap: ${maxRamBudget}GB`);

  let totalGrow = 0;
  let totalWeaken = 0;
  let remainingBudget = maxRamBudget;

  for (const h of hosts) {
    if (remainingBudget <= 0) break;
    if (!ns.hasRootAccess(h)) continue;

    if (!ns.fileExists(growScript, h)) ns.scp(growScript, h);
    if (!ns.fileExists(weakenScript, h)) ns.scp(weakenScript, h);

    const growRam = ns.getScriptRam(growScript, h);
    const weakenRam = ns.getScriptRam(weakenScript, h);
    const freeRam = Math.min(ns.getServerMaxRam(h) - ns.getServerUsedRam(h), remainingBudget);

    const halfRam = freeRam / 2;
    const growThreads = Math.floor(halfRam / growRam);
    const weakenThreads = Math.floor(halfRam / weakenRam);

    if (growThreads < 1 && weakenThreads < 1) continue;

    if (growThreads > 0) ns.exec(growScript, h, growThreads, target);
    if (weakenThreads > 0) ns.exec(weakenScript, h, weakenThreads, target);

    remainingBudget -= (growThreads * growRam) + (weakenThreads * weakenRam);
    totalGrow += growThreads;
    totalWeaken += weakenThreads;
    ns.tprint(`  ${h}: grow x${growThreads} / weaken x${weakenThreads}`);
  }

  ns.tprint(`Done — grow x${totalGrow} / weaken x${totalWeaken} total threads launched.`);
  ns.tprint(`Wait ~${Math.ceil(ns.getWeakenTime(target)/1000)}s then check: analyze ${target}`);
}
