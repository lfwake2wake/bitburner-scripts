/** kill-target.js - Kill scripts targeting a specific server
 *  run utils/kill-target.js <target> [--hack] [--grow] [--weaken]
 *  No flags = kill all three
 *  Example: run utils/kill-target.js sigma-cosmetics --grow --weaken
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  if (!target) {
    ns.tprint("Usage: run utils/kill-target.js <target> [--hack] [--grow] [--weaken]");
    ns.tprint("No flags = kill all. Example: run utils/kill-target.js phantasy --grow");
    return;
  }

  const flags = ns.args.slice(1).map(String);
  const killHack   = flags.includes("--hack")   || flags.length === 0;
  const killGrow   = flags.includes("--grow")   || flags.length === 0;
  const killWeaken = flags.includes("--weaken") || flags.length === 0;

  const hackScript   = "core/attack-hack.js";
  const growScript   = "core/attack-grow.js";
  const weakenScript = "core/attack-weaken.js";

  const toKill = [];
  if (killHack)   toKill.push(hackScript);
  if (killGrow)   toKill.push(growScript);
  if (killWeaken) toKill.push(weakenScript);

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

  let totalKilled = 0;
  let serversAffected = 0;

  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    let killedOnHost = 0;
    try {
      const procs = ns.ps(h);
      for (const p of procs) {
        if (toKill.includes(p.filename) && p.args[0] === target) {
          ns.kill(p.pid);
          killedOnHost++;
          totalKilled++;
        }
      }
    } catch (e) { /* skip */ }
    if (killedOnHost > 0) {
      ns.tprint(`  ${h}: killed ${killedOnHost} process(es)`);
      serversAffected++;
    }
  }

  ns.tprint("═".repeat(50));
  ns.tprint(`  Killed ${totalKilled} process(es) across ${serversAffected} server(s)`);
  ns.tprint(`  Target: ${target} | Scripts: ${toKill.map(s => s.split("/")[1]).join(", ")}`);
  ns.tprint("═".repeat(50));
}