/** upgrade-servers.js - Upgrade all purchased servers to target RAM
 *  run utils/upgrade-servers.js <targetRam>          # shows cost preview
 *  run utils/upgrade-servers.js <targetRam> --confirm # actually upgrades
 */
/** @param {NS} ns */
export async function main(ns) {
  const args = ns.args.filter(a => !String(a).startsWith("--"));
  const flags = ns.args.filter(a => String(a).startsWith("--"));
  const confirm = flags.includes("--confirm");
  const targetRam = args[0] ? parseInt(args[0]) : null;

  const servers = ns.getPurchasedServers();
  if (servers.length === 0) { ns.tprint("No purchased servers found."); return; }

  // Validate RAM is power of 2
  const validRam = [8,16,32,64,128,256,512,1024,2048,4096,8192];
  if (!targetRam || !validRam.includes(targetRam)) {
    ns.tprint(`Usage: run utils/upgrade-servers.js <targetRam> [--confirm]`);
    ns.tprint(`Valid RAM sizes: ${validRam.join(", ")}`);
    return;
  }

  const money = ns.getPlayer().money;
  ns.tprint("═".repeat(55));
  ns.tprint(`  SERVER UPGRADE PREVIEW → ${targetRam}GB`);
  ns.tprint("═".repeat(55));

  let totalCost = 0;
  let toUpgrade = 0;
  let toSkip = 0;

  for (const server of servers) {
    const currentRam = ns.getServerMaxRam(server);
    if (currentRam >= targetRam) {
      ns.tprint(`  ${server}: already ${currentRam}GB — skip`);
      toSkip++;
      continue;
    }
    const cost = ns.getPurchasedServerUpgradeCost(server, targetRam);
    totalCost += cost;
    toUpgrade++;
    ns.tprint(`  ${server}: ${currentRam}GB → ${targetRam}GB | $${ns.formatNumber(cost)}`);
  }

  ns.tprint("═".repeat(55));
  ns.tprint(`  Servers to upgrade: ${toUpgrade} | Skipping: ${toSkip}`);
  ns.tprint(`  Total cost:   $${ns.formatNumber(totalCost)}`);
  ns.tprint(`  You have:     $${ns.formatNumber(money)}`);
  ns.tprint(`  Remaining:    $${ns.formatNumber(money - totalCost)}`);
  ns.tprint(`  Can afford:   ${money >= totalCost ? "✓ YES" : "✗ NO"}`);
  ns.tprint("═".repeat(55));

  if (!confirm) {
    ns.tprint(`  DRY RUN — add --confirm to actually upgrade`);
    ns.tprint(`  run utils/upgrade-servers.js ${targetRam} --confirm`);
    return;
  }

  if (money < totalCost) {
    ns.tprint(`✗ Cannot afford full upgrade. Aborting.`);
    return;
  }

  // Proceed with upgrades
  let upgraded = 0;
  let failed = 0;

  for (const server of servers) {
    const currentRam = ns.getServerMaxRam(server);
    if (currentRam >= targetRam) continue;

    const ok = ns.upgradePurchasedServer(server, targetRam);
    if (ok) {
      ns.tprint(`  ✓ ${server}: → ${targetRam}GB`);
      upgraded++;
    } else {
      ns.tprint(`  ERROR: ${server} upgrade failed.`);
      failed++;
    }
  }

  ns.tprint("═".repeat(55));
  ns.tprint(`Done — upgraded: ${upgraded} | failed: ${failed}`);
}
