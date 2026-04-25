/** batch-analyzer.js - Analyze running batch setup and recommend optimal settings
 *  run analysis/batch-analyzer.js <target> <hackPercent>
 *  Example: run analysis/batch-analyzer.js phantasy 0.0075
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const hackPercent = Number(ns.args[1]);

  if (!target || isNaN(hackPercent)) {
    ns.tprint("Usage: run analysis/batch-analyzer.js <target> <hackPercent>");
    ns.tprint("Example: run analysis/batch-analyzer.js phantasy 0.0075");
    return;
  }

  // Get server stats
  const maxMoney = ns.getServerMaxMoney(target);
  const currentMoney = ns.getServerMoneyAvailable(target);
  const minSecurity = ns.getServerMinSecurityLevel(target);
  const currentSecurity = ns.getServerSecurityLevel(target);
  const hackTime = ns.getHackTime(target);
  const growTime = ns.getGrowTime(target);
  const weakenTime = ns.getWeakenTime(target);
  const hackAnalyze = ns.hackAnalyze(target);
  const WEAKEN_AMOUNT = ns.weakenAnalyze(1);
  const HACK_SECURITY = 0.002;
  const GROW_SECURITY = 0.004;

  // Scan all servers
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

  const hackScript = "core/attack-hack.js";
  const growScript = "core/attack-grow.js";
  const weakenScript = "core/attack-weaken.js";

  let hackThreads = 0, growThreads = 0, weakenThreads = 0;
  let hackRamUsed = 0, growRamUsed = 0, weakenRamUsed = 0;

  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    try {
      const procs = ns.ps(h);
      for (const p of procs) {
        if (p.args[0] !== target) continue;
        const ram = p.threads * ns.getScriptRam(p.filename, h);
        if (p.filename === hackScript)   { hackThreads += p.threads;   hackRamUsed += ram; }
        if (p.filename === growScript)   { growThreads += p.threads;   growRamUsed += ram; }
        if (p.filename === weakenScript) { weakenThreads += p.threads; weakenRamUsed += ram; }
      }
    } catch (e) { /* skip */ }
  }

  const totalThreads = hackThreads + growThreads + weakenThreads;
  const totalRamUsed = hackRamUsed + growRamUsed + weakenRamUsed;

  // What hack is actually stealing
  const moneyPerHackThread = maxMoney * hackAnalyze;
  const actualMoneyStolen = hackThreads * moneyPerHackThread;
  const actualHackPct = actualMoneyStolen / maxMoney;

  // How many grow threads are actually needed for current hack level
  const moneyAfterHack = Math.max(1, maxMoney - actualMoneyStolen);
  const growthFactor = maxMoney / moneyAfterHack;
  const timingRatio = growTime / hackTime;
  const growThreadsNeeded = Math.ceil(ns.growthAnalyze(target, growthFactor) * timingRatio);

  // How many weaken threads needed
  const secFromHack = hackThreads * HACK_SECURITY * (weakenTime / hackTime);
  const secFromGrow = growThreadsNeeded * GROW_SECURITY * (weakenTime / growTime);
  const weakenThreadsNeeded = Math.ceil((secFromHack + secFromGrow) / WEAKEN_AMOUNT);

  const growSurplus = growThreads - growThreadsNeeded;
  const weakenSurplus = weakenThreads - weakenThreadsNeeded;
  const isBalanced = growSurplus >= 0 && weakenSurplus >= 0;

  // RAM costs per thread
  const growRamPer = ns.getScriptRam(growScript, "home");
  const weakenRamPer = ns.getScriptRam(weakenScript, "home");
  const hackRamPer = ns.getScriptRam(hackScript, "home");

  // How many hack threads can current grow actually support
  let recHackThreads = 1;
  for (let h = 1; h <= hackThreads * 5; h++) {
    const stolen = h * moneyPerHackThread;
    if (stolen >= maxMoney) break;
    const gFactor = maxMoney / (maxMoney - stolen);
    const gNeeded = Math.ceil(ns.growthAnalyze(target, gFactor) * timingRatio);
    if (gNeeded <= growThreads) recHackThreads = h;
    else break;
  }
  const recHackPct = Math.min(1, recHackThreads * hackAnalyze);

  // Estimate optimal RAM split
  // Total threads ratio: hack:grow:weaken based on recHackThreads
  const recMoneyStolen = recHackThreads * moneyPerHackThread;
  const recGrowFactor = maxMoney / Math.max(1, maxMoney - recMoneyStolen);
  const recGrowThreads = Math.ceil(ns.growthAnalyze(target, recGrowFactor) * timingRatio);
  const recWeakenThreads = Math.ceil(
    (recHackThreads * HACK_SECURITY * (weakenTime / hackTime) +
     recGrowThreads * GROW_SECURITY * (weakenTime / growTime)) / WEAKEN_AMOUNT
  );
  const recTotalRam = (recHackThreads * hackRamPer) + (recGrowThreads * growRamPer) + (recWeakenThreads * weakenRamPer);
  const recMaintainRam = (growSurplus > 0 ? 0 : Math.abs(growSurplus) * growRamPer) + 
                         (weakenSurplus > 0 ? 0 : Math.abs(weakenSurplus) * weakenRamPer);

  ns.tprint("");
  ns.tprint("═".repeat(60));
  ns.tprint(`  BATCH ANALYZER: ${target}`);
  ns.tprint("═".repeat(60));

  ns.tprint(`\n📊 Server State:`);
  ns.tprint(`  Money:    $${ns.formatNumber(currentMoney)} / $${ns.formatNumber(maxMoney)} (${(currentMoney/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Security: ${currentSecurity.toFixed(3)} / ${minSecurity} min`);
  ns.tprint(`  Timings:  H=${(hackTime/1000).toFixed(1)}s G=${(growTime/1000).toFixed(1)}s W=${(weakenTime/1000).toFixed(1)}s`);

  ns.tprint(`\n⚡ Actual Running Threads (targeting ${target}):`);
  ns.tprint(`  Hack:   ${hackThreads.toString().padStart(6)} threads | ${hackRamUsed.toFixed(0)}GB RAM | ${totalThreads > 0 ? (hackThreads/totalThreads*100).toFixed(1) : 0}%`);
  ns.tprint(`  Grow:   ${growThreads.toString().padStart(6)} threads | ${growRamUsed.toFixed(0)}GB RAM | ${totalThreads > 0 ? (growThreads/totalThreads*100).toFixed(1) : 0}%`);
  ns.tprint(`  Weaken: ${weakenThreads.toString().padStart(6)} threads | ${weakenRamUsed.toFixed(0)}GB RAM | ${totalThreads > 0 ? (weakenThreads/totalThreads*100).toFixed(1) : 0}%`);
  ns.tprint(`  Total:  ${totalThreads.toString().padStart(6)} threads | ${totalRamUsed.toFixed(0)}GB RAM`);

  ns.tprint(`\n💰 Hack Analysis:`);
  ns.tprint(`  Configured hackPercent: ${(hackPercent*100).toFixed(3)}%`);
  ns.tprint(`  Actual % stolen/cycle:  ${(actualHackPct*100).toFixed(3)}%`);
  ns.tprint(`  Money stolen/cycle:     $${ns.formatNumber(actualMoneyStolen)}`);

  ns.tprint(`\n⚖️  Balance Check:`);
  ns.tprint(`  Grow running vs needed:  ${growThreads} vs ${growThreadsNeeded} → ${growSurplus >= 0 ? `✓ surplus ${growSurplus}` : `⚠ deficit ${Math.abs(growSurplus)}`}`);
  ns.tprint(`  Weaken running vs needed: ${weakenThreads} vs ${weakenThreadsNeeded} → ${weakenSurplus >= 0 ? `✓ surplus ${weakenSurplus}` : `⚠ deficit ${Math.abs(weakenSurplus)}`}`);
  ns.tprint(`  Overall: ${isBalanced ? "✓ BALANCED" : "⚠ IMBALANCED — server will drift"}`);

  ns.tprint(`\n🎯 Recommendations:`);
  ns.tprint(`  Optimal hackPercent: ${(recHackPct*100).toFixed(3)}% (${recHackThreads} hack threads)`);
  ns.tprint(`  Grow threads needed for that: ${recGrowThreads}`);
  ns.tprint(`  Weaken threads needed:        ${recWeakenThreads}`);
  ns.tprint(`  Estimated batch RAM needed:   ${recTotalRam.toFixed(0)}GB`);
  if (!isBalanced) {
    ns.tprint(`  Estimated extra maintain RAM: ${recMaintainRam.toFixed(0)}GB`);
  }
  ns.tprint("");
  ns.tprint(`  Suggested command:`);
  ns.tprint(`  run batch/batch-manager.js ${target} ${recHackPct.toFixed(4)} 1.25 home --max-ram=${Math.ceil(recTotalRam)} --maintain=${Math.max(1024, Math.ceil(recMaintainRam))}`);
  ns.tprint("═".repeat(60));
}