/** prep.js - Grow + weaken a target across all servers, no hacking
 *  run batch/prep.js <target> [--max-ram=N]
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  if (!target) { ns.tprint("Usage: run batch/prep.js <target> [--max-ram=N]"); return; }

  const growScript = "core/attack-grow.js";
  const weakenScript = "core/attack-weaken.js";

  // Parse --max-ram flag
  const args = ns.args.slice();
  let maxRamBudget = Infinity;
  const maxRamFlag = args.find(a => typeof a === "string" && a.startsWith("--max-ram="));
  const maxRamArgIdx = args.indexOf("--max-ram");
  if (maxRamFlag) {
    maxRamBudget = Number(maxRamFlag.split("=")[1]);
  } else if (maxRamArgIdx !== -1 && args[maxRamArgIdx + 1]) {
    maxRamBudget = Number(args[maxRamArgIdx + 1]);
  }

  // ═══════════════════════════════════════════════════════════════
  // CALCULATE OPTIMAL GROW/WEAKEN RATIO based on server state
  // ═══════════════════════════════════════════════════════════════
  const WEAKEN_AMOUNT = ns.weakenAnalyze(1);
  const GROW_SECURITY = 0.004;

  const currentSecurity = ns.getServerSecurityLevel(target);
  const minSecurity = ns.getServerMinSecurityLevel(target);
  const currentMoney = ns.getServerMoneyAvailable(target);
  const maxMoney = ns.getServerMaxMoney(target);

  // How much weaken needed just to fix existing security
  const securityExcess = Math.max(0, currentSecurity - minSecurity);
  const weakenForSecurity = Math.ceil(securityExcess / WEAKEN_AMOUNT);

  // How much grow needed to fill money
  let growThreadsNeeded = 0;
  if (currentMoney < maxMoney) {
    const growthFactor = maxMoney / Math.max(1, currentMoney);
    growThreadsNeeded = Math.ceil(ns.growthAnalyze(target, growthFactor));
  }

  // Weaken needed to counteract security from grow threads
  const weakenForGrow = Math.ceil((growThreadsNeeded * GROW_SECURITY) / WEAKEN_AMOUNT);
  const weakenThreadsNeeded = weakenForSecurity + weakenForGrow;

  // Calculate ratio
  const totalNeeded = growThreadsNeeded + weakenThreadsNeeded;
  const growRatio = totalNeeded > 0 ? growThreadsNeeded / totalNeeded : 0.5;
  const weakenRatio = totalNeeded > 0 ? weakenThreadsNeeded / totalNeeded : 0.5;

  // Display analysis
  ns.tprint("═".repeat(55));
  ns.tprint(`  PREP: ${target}`);
  ns.tprint("═".repeat(55));
  ns.tprint(`  Money:    $${ns.formatNumber(currentMoney)} / $${ns.formatNumber(maxMoney)} (${(currentMoney/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Security: ${currentSecurity.toFixed(3)} / ${minSecurity} min (+${securityExcess.toFixed(3)} excess)`);
  ns.tprint(`  Grow threads needed:   ${growThreadsNeeded}`);
  ns.tprint(`  Weaken threads needed: ${weakenThreadsNeeded} (${weakenForSecurity} for security + ${weakenForGrow} for grow)`);
  ns.tprint(`  Ratio: ${(growRatio*100).toFixed(1)}% grow / ${(weakenRatio*100).toFixed(1)}% weaken`);
  if (maxRamBudget !== Infinity) ns.tprint(`  RAM cap: ${maxRamBudget}GB`);
  ns.tprint("═".repeat(55));

  // If already prepped
  if (growThreadsNeeded === 0 && weakenThreadsNeeded === 0) {
    ns.tprint(`✓ ${target} is already fully prepped!`);
    return;
  }

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

  let totalGrow = 0;
  let totalWeaken = 0;
  let remainingBudget = maxRamBudget;

  for (const h of hosts) {
    if (remainingBudget <= 0) break;
    if (!ns.hasRootAccess(h)) continue;

    if (!ns.fileExists(growScript, h)) ns.scp(growScript, h);
    if (!ns.fileExists(weakenScript, h)) ns.scp(weakenScript, h);

    const growRam = ns.getScriptRam(growScript, h);
    const weakenRam = ns.getScriptRam(weakenScript, h);
    const freeRam = Math.min(ns.getServerMaxRam(h) - ns.getServerUsedRam(h), remainingBudget);

    if (freeRam <= 0) continue;

    // Allocate RAM by ratio
    const growRamAlloc = freeRam * growRatio;
    const weakenRamAlloc = freeRam * weakenRatio;

    const growThreads = growRatio > 0 ? Math.floor(growRamAlloc / growRam) : 0;
    const weakenThreads = weakenRatio > 0 ? Math.floor(weakenRamAlloc / weakenRam) : 0;

    if (growThreads < 1 && weakenThreads < 1) continue;

    if (growThreads > 0) ns.exec(growScript, h, growThreads, target);
    if (weakenThreads > 0) ns.exec(weakenScript, h, weakenThreads, target);

    remainingBudget -= (growThreads * growRam) + (weakenThreads * weakenRam);
    totalGrow += growThreads;
    totalWeaken += weakenThreads;
    ns.tprint(`  ${h}: grow x${growThreads} / weaken x${weakenThreads}`);
  }

  ns.tprint("═".repeat(55));
  ns.tprint(`Done — grow x${totalGrow} / weaken x${totalWeaken} total threads launched.`);
  ns.tprint(`Wait ~${Math.ceil(ns.getWeakenTime(target)/1000)}s then check: analyze ${target}`);
}
