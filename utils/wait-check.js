/** wait-check.js - Wait X seconds then print server stats
 *  run utils/wait-check.js <seconds> <target>
 *  Example: run utils/wait-check.js 110 phantasy
 */
/** @param {NS} ns */
export async function main(ns) {
  const seconds = Number(ns.args[0]);
  const target = ns.args[1];

  if (!seconds || !target) {
    ns.tprint("Usage: run utils/wait-check.js <seconds> <target>");
    return;
  }

  ns.tprint(`Waiting ${seconds}s then checking ${target}...`);
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
