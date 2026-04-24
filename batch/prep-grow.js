/** prep-grow.js - Grow only across all servers
 *  run batch/prep-grow.js <target>
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  if (!target) { ns.tprint("Usage: run batch/prep-grow.js <target>"); return; }

  const growScript = "core/attack-grow.js";

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

  ns.tprint(`Growing ${target} across all servers...`);
  let totalThreads = 0;

  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    if (!ns.fileExists(growScript, h)) ns.scp(growScript, h);

    const freeRam = ns.getServerMaxRam(h) - ns.getServerUsedRam(h);
    const growRam = ns.getScriptRam(growScript, h);
    const threads = Math.floor(freeRam / growRam);
    if (threads < 1) continue;

    ns.exec(growScript, h, threads, target);
    totalThreads += threads;
    ns.tprint(`  ${h}: grow x${threads}`);
  }

  ns.tprint(`Done — ${totalThreads} total grow threads launched.`);
  ns.tprint(`Wait ~${Math.ceil(ns.getGrowTime(target)/1000)}s then check: analyze ${target}`);
}
