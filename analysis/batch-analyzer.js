/** batch-analyzer.js - Analyze running batch setup using rate-based calculations
 *  run analysis/batch-analyzer.js <target>
 *  Example: run analysis/batch-analyzer.js phantasy
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  if (!target) {
    ns.tprint("Usage: run analysis/batch-analyzer.js <target>");
    return;
  }

  // Server stats
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

  // Scan all servers and count threads targeting this server
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

  // ═══════════════════════════════════════════════════════════
  // RATE-BASED ANALYSIS
  // Each script loops continuously — rates are per second
  // ═══════════════════════════════════════════════════════════

  // Money stolen per second by all hack threads
  const moneyPerHackThread = maxMoney * hackAnalyze;
  const hackRatePerSec = hackThreads * moneyPerHackThread / (hackTime / 1000);

  // Grow multiplier per thread per cycle — growthAnalyze gives multiplier for 1 thread
  // Each grow thread multiplies money by a small amount each growTime seconds
  // Rate: how much $ of "restoration capacity" per second
  // We approximate: each grow thread contributes (maxMoney * growthAnalyze(target,1+ε)) per cycle
  // Simpler: use actual current money ratio to estimate grow rate
  const growMultPerThread = Math.pow(1 + (ns.getServerGrowth(target) / 100), 1); // per cycle approx
  // More accurate: how many grow threads needed to restore hackRatePerSec * growTime dollars
  const moneyToRestore = hackRatePerSec * (growTime / 1000); // money hacked during one grow cycle
  const moneyAfterOneCycle = Math.max(1, maxMoney - moneyToRestore);
  const growthFactorNeeded = maxMoney / moneyAfterOneCycle;
  const growThreadsNeededPerCycle = Math.ceil(ns.growthAnalyze(target, growthFactorNeeded));
  const growRatePerSec = growThreads / (growTime / 1000); // effective grow cycles per second

  // Security rate analysis
  const hackSecPerSec = hackThreads * HACK_SECURITY / (hackTime / 1000);
  const growSecPerSec = growThreads * GROW_SECURITY / (growTime / 1000);
  const weakenPerSec = weakenThreads * WEAKEN_AMOUNT / (weakenTime / 1000);
  const netSecPerSec = hackSecPerSec + growSecPerSec - weakenPerSec;

  // Balance: is grow restoring as fast as hack is stealing?
  const growThreadsNeededForRate = growThreadsNeededPerCycle;
  const growBalance = growThreads - growThreadsNeededForRate;
  const secBalance = weakenPerSec - (hackSecPerSec + growSecPerSec);

  // Income rate
  const incomePerSec = hackRatePerSec;
  const incomePerMin = incomePerSec * 60;
  const incomePerHour = incomePerSec * 3600;

  // RAM costs
  const hackRamPer = ns.getScriptRam(hackScript, "home");
  const growRamPer = ns.getScriptRam(growScript, "home");
  const weakenRamPer = ns.getScriptRam(weakenScript, "home");

  // Recommendation: what hackThreads can current grow rate sustain?
  // Find max hack threads where grow rate can keep up
  let recHackThreads = 1;
  for (let h = 1; h <= hackThreads * 10; h++) {
    const stolen = h * moneyPerHackThread / (hackTime / 1000) * (growTime / 1000);
    if (stolen >= maxMoney * 0.95) break; // don't steal more than 95% per grow cycle
    const mAfter = Math.max(1, maxMoney - stolen);
    const gFactor = maxMoney / mAfter;
    const gNeeded = Math.ceil(ns.growthAnalyze(target, gFactor));
    if (gNeeded <= growThreads) recHackThreads = h;
    else break;
  }
  const recHackPct = Math.min(0.99, recHackThreads * hackAnalyze);

  // Recommended grow threads to support recHackThreads
  const recStolen = recHackThreads * moneyPerHackThread / (hackTime / 1000) * (growTime / 1000);
  const recGrowFactor = maxMoney / Math.max(1, maxMoney - recStolen);
  const recGrowThreads = Math.ceil(ns.growthAnalyze(target, recGrowFactor));
  const recWeakenThreads = Math.ceil(
    (recHackThreads * HACK_SECURITY / (hackTime / 1000) +
     recGrowThreads * GROW_SECURITY / (growTime / 1000)) *
    weakenTime / 1000 / WEAKEN_AMOUNT
  );

  const recBatchRam = (recHackThreads * hackRamPer) + (recGrowThreads * growRamPer) + (recWeakenThreads * weakenRamPer);
  const recMaintainRam = Math.max(1024, Math.abs(Math.min(0, growBalance)) * growRamPer);

  ns.tprint("");
  ns.tprint("═".repeat(60));
  ns.tprint(`  BATCH ANALYZER (RATE-BASED): ${target}`);
  ns.tprint("═".repeat(60));

  ns.tprint(`\n📊 Server State:`);
  ns.tprint(`  Money:    $${ns.formatNumber(currentMoney)} / $${ns.formatNumber(maxMoney)} (${(currentMoney/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Security: ${currentSecurity.toFixed(3)} / ${minSecurity} min`);
  ns.tprint(`  Timings:  H=${(hackTime/1000).toFixed(1)}s G=${(growTime/1000).toFixed(1)}s W=${(weakenTime/1000).toFixed(1)}s`);
  ns.tprint(`  Hack fires ${(growTime/hackTime).toFixed(1)}x per grow cycle | ${(weakenTime/hackTime).toFixed(1)}x per weaken cycle`);

  ns.tprint(`\n⚡ Running Threads (targeting ${target}):`);
  ns.tprint(`  Hack:   ${hackThreads.toString().padStart(6)} threads | ${hackRamUsed.toFixed(0)}GB | ${totalThreads > 0 ? (hackThreads/totalThreads*100).toFixed(1) : 0}%`);
  ns.tprint(`  Grow:   ${growThreads.toString().padStart(6)} threads | ${growRamUsed.toFixed(0)}GB | ${totalThreads > 0 ? (growThreads/totalThreads*100).toFixed(1) : 0}%`);
  ns.tprint(`  Weaken: ${weakenThreads.toString().padStart(6)} threads | ${weakenRamUsed.toFixed(0)}GB | ${totalThreads > 0 ? (weakenThreads/totalThreads*100).toFixed(1) : 0}%`);
  ns.tprint(`  Total:  ${totalThreads.toString().padStart(6)} threads | ${totalRamUsed.toFixed(0)}GB`);

  ns.tprint(`\n💰 Rate Analysis (per second):`);
  ns.tprint(`  Hack stealing:    $${ns.formatNumber(hackRatePerSec)}/s`);
  ns.tprint(`  Income rate:      $${ns.formatNumber(incomePerSec)}/s | $${ns.formatNumber(incomePerMin)}/min | $${ns.formatNumber(incomePerHour)}/hr`);
  ns.tprint(`  Security delta:   ${netSecPerSec >= 0 ? "+" : ""}${netSecPerSec.toFixed(4)}/s ${netSecPerSec > 0 ? "⚠ RISING" : "✓ STABLE/FALLING"}`);
  ns.tprint(`    Hack adds: +${hackSecPerSec.toFixed(4)}/s`);
  ns.tprint(`    Grow adds: +${growSecPerSec.toFixed(4)}/s`);
  ns.tprint(`    Weaken removes: -${weakenPerSec.toFixed(4)}/s`);

  ns.tprint(`\n⚖️  Balance Check (per grow cycle):`);
  ns.tprint(`  Money hacked per grow cycle: $${ns.formatNumber(moneyToRestore)} (${(moneyToRestore/maxMoney*100).toFixed(1)}% of max)`);
  ns.tprint(`  Grow threads running vs needed: ${growThreads} vs ${growThreadsNeededForRate} → ${growBalance >= 0 ? `✓ surplus ${growBalance}` : `⚠ deficit ${Math.abs(growBalance)}`}`);
  ns.tprint(`  Weaken balance: ${secBalance >= 0 ? `✓ removing ${secBalance.toFixed(4)}/s net` : `⚠ falling behind ${Math.abs(secBalance).toFixed(4)}/s`}`);
  ns.tprint(`  Overall: ${growBalance >= 0 && secBalance >= 0 ? "✓ BALANCED" : "⚠ IMBALANCED"}`);

  ns.tprint(`\n🎯 Recommendations:`);
  ns.tprint(`  Max sustainable hack threads: ${recHackThreads} (${(recHackPct*100).toFixed(3)}% per cycle)`);
  ns.tprint(`  Grow threads needed: ${recGrowThreads}`);
  ns.tprint(`  Weaken threads needed: ${recWeakenThreads}`);
  ns.tprint(`  Estimated RAM for batch: ${recBatchRam.toFixed(0)}GB`);
  ns.tprint(`  Estimated RAM for maintain: ${recMaintainRam.toFixed(0)}GB`);
  ns.tprint("");
  ns.tprint(`  Suggested command:`);
  ns.tprint(`  run batch/batch-manager.js ${target} ${recHackPct.toFixed(4)} 1.25 home --max-ram=${Math.ceil(recBatchRam)} --maintain=${Math.ceil(recMaintainRam)}`);
  ns.tprint("═".repeat(60));
}