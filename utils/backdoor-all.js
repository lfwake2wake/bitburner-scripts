/** backdoor-all.js - Backdoor all hackable servers
 *  run utils/backdoor-all.js
 *  Requires: Source-File 4 (Singularity API)
 */
/** @param {NS} ns */
export async function main(ns) {
  const visited = new Set();
  const queue = [{ host: "home", path: ["home"] }];
  let backdoored = 0;
  let skipped = 0;

  ns.tprint("═".repeat(55));
  ns.tprint("  AUTO BACKDOOR");
  ns.tprint("═".repeat(55));

  while (queue.length) {
    const { host, path } = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    for (const n of ns.scan(host)) {
      if (!visited.has(n)) queue.push({ host: n, path: [...path, n] });
    }

    if (host === "home") continue;
    if (!ns.hasRootAccess(host)) { skipped++; continue; }
    if (ns.getServerRequiredHackingLevel(host) > ns.getHackingLevel()) { skipped++; continue; }

    try {
      // Navigate to server
      for (const h of path) {
        if (h !== "home") await ns.singularity.connect(h);
      }

      await ns.singularity.installBackdoor();
      ns.tprint(`  ✓ Backdoored: ${host}`);
      backdoored++;

      // Return home
      await ns.singularity.connect("home");
    } catch (e) {
      ns.tprint(`  ✗ Failed: ${host} — ${e}`);
      skipped++;
      await ns.singularity.connect("home");
    }
  }

  ns.tprint("═".repeat(55));
  ns.tprint(`  Done — backdoored: ${backdoored} | skipped: ${skipped}`);
  ns.tprint("═".repeat(55));
}