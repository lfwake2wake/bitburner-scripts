/** wait-check.js - Wait X seconds then print server stats
 *  run utils/wait-check.js <target> [seconds]
 *  Example: run utils/wait-check.js phantasy 110
 *  Example: run utils/wait-check.js phantasy       # checks immediately
 *  Updated vis VSCode 2024-06-17
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const seconds = ns.args[1] !== undefined ? Number(ns.args[1]) : 0;

  if (!target) {
    ns.tprint("Usage: run utils/wait-check.js <target> [seconds]");
    return;
  }

  if (seconds > 0) ns.tprint(`Waiting ${seconds}s then checking ${target}...`);
  await ns.sleep(seconds * 1000);

  const money = ns.getServerMoneyAvailable(target);
  const maxMoney = ns.getServerMaxMoney(target);
  const security = ns.getServerSecurityLevel(target);
  const minSecurity = ns.getServerMinSecurityLevel(target);
  const pct = (money / maxMoney * 100).toFixed(1);

  ns.tprint("═".repeat(50));
  ns.tprint(`  ${target} @ ${new Date().toLocaleTimeString()}`);
  ns.tprint("═".repeat(50));
  ns.tprint(`  Money:    $${ns.formatNumber(money)} / $${ns.formatNumber(maxMoney)} (${pct}%)`);
  ns.tprint(`  Security: ${security.toFixed(3)} / ${minSecurity} min`);
  ns.tprint("═".repeat(50));
}
