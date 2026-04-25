/** check-targets.js - Run wait-check on all servers currently being targeted
 *  run utils/check-targets.js
 */
/** @param {NS} ns */
export async function main(ns) {
  const hackScript = "core/attack-hack.js";
  const growScript = "core/attack-grow.js";
  const weakenScript = "core/attack-weaken.js";
  const helpers = [hackScript, growScript, weakenScript];

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

  // Collect all unique targets
  const targets = new Set();
  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    try {
      const procs = ns.ps(h);
      for (const p of procs) {
        if (helpers.includes(p.filename) && p.args[0]) {
          targets.add(p.args[0]);
        }
      }
    } catch (e) { /* skip */ }
  }

  if (targets.size === 0) {
    ns.tprint("No active hack/grow/weaken targets found.");
    return;
  }

  ns.tprint("═".repeat(55));
  ns.tprint(`  ACTIVE TARGETS (${targets.size})`);
  ns.tprint("═".repeat(55));

  for (const target of [...targets].sort()) {
    const money = ns.getServerMoneyAvailable(target);
    const maxMoney = ns.getServerMaxMoney(target);
    const security = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);
    const pct = (money / maxMoney * 100).toFixed(1);
    const secFlag = security > minSecurity + 1 ? "⚠" : "✓";
    ns.tprint(`  ${target.padEnd(20)} $${ns.formatNumber(money)} (${pct}%) | sec:${security.toFixed(2)} ${secFlag}`);
  }

  ns.tprint("═".repeat(55));
}