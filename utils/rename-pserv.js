/** rename-pservs.js - Rename all purchased servers to pserv-0 through pserv-24
 *  run utils/rename-pservs.js [--confirm]
 */
/** @param {NS} ns */
export async function main(ns) {
  const confirm = ns.args.includes("--confirm");
  const servers = ns.getPurchasedServers();

  if (servers.length === 0) { ns.tprint("No purchased servers found."); return; }

  ns.tprint("═".repeat(50));
  ns.tprint("  RENAME PURCHASED SERVERS");
  ns.tprint("═".repeat(50));

  for (let i = 0; i < servers.length; i++) {
    const oldName = servers[i];
    const newName = `pserv-${i}`;

    if (oldName === newName) {
      ns.tprint(`  ${oldName} → already named correctly, skipping.`);
      continue;
    }

    ns.tprint(`  ${oldName} → ${newName}`);

    if (!confirm) continue;

    // Kill scripts, delete, repurchase with new name at same RAM
    const ram = ns.getServerMaxRam(oldName);
    ns.killall(oldName);
    const deleted = ns.deleteServer(oldName);
    if (!deleted) { ns.tprint(`  ERROR: could not delete ${oldName}`); continue; }
    const purchased = ns.purchaseServer(newName, ram);
    if (!purchased) { ns.tprint(`  ERROR: could not create ${newName}`); continue; }
    ns.tprint(`  ✓ Done`);
    await ns.sleep(100);
  }

  ns.tprint("═".repeat(50));
  if (!confirm) {
    ns.tprint("  DRY RUN — add --confirm to actually rename");
    ns.tprint("  run utils/rename-pservs.js --confirm");
  } else {
    ns.tprint("  Rename complete.");
  }
}
