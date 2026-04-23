/** ram-check.js - Show RAM usage across all rooted servers
 *  run util/ram-check.js
 */
/** @param {NS} ns */
export async function main(ns) {
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

  let totalMax = 0;
  let totalUsed = 0;

  ns.tprint("═".repeat(50));
  ns.tprint("  SERVER RAM REPORT");
  ns.tprint("═".repeat(50));

  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    const max = ns.getServerMaxRam(h);
    const used = ns.getServerUsedRam(h);
    const free = max - used;
    totalMax += max;
    totalUsed += used;
    ns.tprint(`  ${h.padEnd(20)} ${used.toFixed(0).padStart(6)}/${max.toFixed(0).padEnd(6)} GB  (${free.toFixed(0)} free)`);
  }

  ns.tprint("═".repeat(50));
  ns.tprint(`  TOTAL: ${totalUsed.toFixed(0)}/${totalMax.toFixed(0)} GB used  |  ${(totalMax - totalUsed).toFixed(0)} GB free`);
  ns.tprint("═".repeat(50));
}
