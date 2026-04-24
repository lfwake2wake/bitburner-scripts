/** prep.js - Grow + weaken a target across all servers, no hacking
 *  run batch/prep.js <target>
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  if (!target) { ns.tprint("Usage: run batch/prep.js <target>"); return; }

  const growScript = "core/attack-grow.js";
  const weakenScript = "core/attack-weaken.js";

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

  ns.tprint(`Prepping ${target} — running grow + weaken across all servers...`);

  let totalGrow = 0;
  let totalWeaken = 0;

  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;

    // Ensure both scripts exist on host
    if (!ns.fileExists(growScript, h)) ns.scp(growScript, h);
    if (!ns.fileExists(weakenScript, h)) ns.scp(weakenScript, h);

    const growRam = ns.getScriptRam(growScript, h);
    const weakenRam = ns.getScriptRam(weakenScript, h);
    const freeRam = ns.getServerMaxRam(h) - ns.getServerUsedRam(h);

    // Split RAM 50/50
    const halfRam = freeRam / 2;
    const growThreads = Math.floor(halfRam / growRam);
    const weakenThreads = Math.floor(halfRam / weakenRam);

    if (growThreads < 1 && weakenThreads < 1) continue;

    if (growThreads > 0) ns.exec(growScript, h, growThreads, target);
    if (weakenThreads > 0) ns.exec(weakenScript, h, weakenThreads, target);

    totalGrow += growThreads;
    totalWeaken += weakenThreads;
    ns.tprint(`  ${h}: grow x${growThreads} / weaken x${weakenThreads}`);
  }

  ns.tprint(`Done — grow x${totalGrow} / weaken x${totalWeaken} total threads launched.`);
  ns.tprint(`Wait ~${Math.ceil(ns.getWeakenTime(target)/1000)}s then check: analyze ${target}`);
}
