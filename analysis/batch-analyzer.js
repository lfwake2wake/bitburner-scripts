/** batch-analyzer.js - Analyze running batch setup and recommend optimal settings
 *  run analysis/batch-analyzer.js <target> <hackPercent> <batchRam> <maintainRam>
 *  Example: run analysis/batch-analyzer.js phantasy 0.0075 1024 4000
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const hackPercent = Number(ns.args[1]);
  const batchRam = Number(ns.args[2]);
  const maintainRam = Number(ns.args[3]);

  if (!target || isNaN(hackPercent) || isNaN(batchRam) || isNaN(maintainRam)) {
    ns.tprint("Usage: run analysis/batch-analyzer.js <target> <hackPercent> <batchRam> <maintainRam>");
    ns.tprint("Example: run analysis/batch-analyzer.js phantasy 0.0075 1024 4000");
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
    const procs = ns.ps(h);
    for (const p of procs) {
      if (p.args[0] !== target) continue;
      if (p.filename === hackScript)   { hackThreads += p.threads;   hackRamUsed += p.threads * ns.getScriptRam(hackScript, h); }
      if (p.filename === growScript)   { growThreads += p.threads;   growRamUsed += p.threads * ns.getScriptRam(growScript, h); }
      if (p.filename === weakenScript) { weakenThreads += p.threads; weakenRamUsed += p.threads * ns.getScriptRam(weakenScript, h); }
    }
  }

  const totalThreads = hackThreads + growThreads + weakenThreads;
  const totalRamUsed = hackRamUsed + growRamUsed + weakenRamUsed;

  // Calculate what hack threads are actually stealing per cycle
  const moneyPerHackThread = maxMoney * hackAnalyze;
  const actualMoneyStolen = hackThreads * moneyPerHackThread;
  const actualHackPct = actualMoneyStolen / maxMoney;

  // Calculate grow threads needed to recover from actual hack
  const moneyAfterHack = Math.max(1, maxMoney - actualMoneyStolen);
  const growthFactor = maxMoney / moneyAfterHack;
  const timingRatio = growTime / hackTime;
  const growThreadsNeeded = Math.ceil(ns.growthAnalyze(target, growthFactor) * timingRatio);

  // Calculate weaken threads needed
  const secFromHack = hackThreads * HACK_SECURITY * (weakenTime / hackTime);
  const secFromGrow = growThreadsNeeded * GROW_SECURITY * (weakenTime / growTime);
  const weakenThreadsNeeded = Math.ceil((secFromHack + secFromGrow) / WEAKEN_AMOUNT);

  // Assess balance
  const growDeficit = growThreadsNeeded - growThreads;
  const isGrowDeficient = growDeficit > 0;

  // RAM per thread estimates
  const hackRamPer = ns.getScriptRam(hackScript, "home");
  const growRamPer = ns.getScriptRam(growScript, "home");
  const weakenRamPer = ns.getScriptRam(weakenScript, "home");

  // Recommend optimal hackPercent based on current grow capacity
  // Work backwards: how many hack threads can current grow support?
  // Each hack thread needs growthAnalyze threads * timingRatio grow threads
  const growThreadsAvailable = growThreads; // what's actually running
  // Solve: hackThreads * growthAnalyze(maxMoney/(maxMoney - hackThreads*moneyPerHackThread)) * timingRatio = growThreadsAvailable
  // Approximate by iterating
  let recHackThreads = hackThreads;
  for (let h = 1; h <= hackThreads * 3; h++) {
    const stolen = h * moneyPerHackThread;
    if (stolen >= maxMoney) break;
    const gFactor = maxMoney / (maxMoney - stolen);
    const gNeeded = Math.ceil(ns.growthAnalyze(target, gFactor) * timingRatio);
    if (gNeeded <= growThreadsAvailable) recHackThreads = h;
    else break;
  }
  const recHackPct = Math.min(1, recHackThreads * hackAnalyze);

  ns.tprint("");
  ns.tprint("═".repeat(60));
  ns.tprint(`  BATCH ANALYZER: ${target}`);
  ns.tprint("═".repeat(60));

  ns.tprint(`\n📊 Server State:`);
  ns.tprint(`  Money:    $${ns.formatNumber(currentMoney)} / $${ns.formatNumber(maxMoney)} (${(currentMoney/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Security: ${currentSecurity.toFixed(3)} / ${minSecurity} min`);
  ns.tprint(`  Hack Time: ${(hackTime/1000).toFixed(1)}s | Grow: ${(growTime/1000).toFixed(1)}s | Weaken: ${(weakenTime/1000).toFixed(1)}s`);

  ns.tprint(`\n⚡ Current Thread Allocation:`);
  ns.tprint(`  Hack:   ${hackThreads.toString().padStart(6)} threads | ${hackRamUsed.toFixed(0)}GB RAM | ${(hackThreads/totalThreads*100).toFixed(1)}%`);
  ns.tprint(`  Grow:   ${growThreads.toString().padStart(6)} threads | ${growRamUsed.toFixed(0)}GB RAM | ${(growThreads/totalThreads*100).toFixed(1)}%`);
  ns.tprint(`  Weaken: ${weakenThreads.toString().padStart(6)} threads | ${weakenRamUsed.toFixed(0)}GB RAM | ${(weakenThreads/totalThreads*100).toFixed(1)}%`);
  ns.tprint(`  Total:  ${totalThreads.toString().padStart(6)} threads | ${totalRamUsed.toFixed(0)}GB RAM`);

  ns.tprint(`\n💰 Hack Analysis:`);
  ns.tprint(`  Configured hackPercent: ${(hackPercent*100).toFixed(2)}%`);
  ns.tprint(`  Actual hack threads stealing: ${(actualHackPct*100).toFixed(2)}% per cycle`);
  ns.tprint(`  Money stolen per cycle: $${ns.formatNumber(actualMoneyStolen)}`);

  ns.tprint(`\n⚖️  Balance Check:`);
  ns.tprint(`  Grow threads running:  ${growThreads}`);
  ns.tprint(`  Grow threads needed:   ${growThreadsNeeded}`);
  ns.tprint(`  Grow deficit:          ${growDeficit > 0 ? `⚠ SHORT by ${growDeficit} threads` : `✓ SURPLUS of ${Math.abs(growDeficit)} threads`}`);
  ns.tprint(`  Weaken threads running: ${weakenThreads}`);
  ns.tprint(`  Weaken threads needed:  ${weakenThreadsNeeded}`);

  ns.tprint(`\n🎯 Recommendations:`);
  if (isGrowDeficient) {
    ns.tprint(`  ⚠ Grow is DEFICIENT — server will slowly drain`);
    ns.tprint(`  Option 1: Lower hackPercent to ${(recHackPct*100).toFixed(3)}%`);
    ns.tprint(`    run batch/batch-manager.js ${target} ${recHackPct.toFixed(4)} 1.25 home --max-ram=${batchRam} --maintain=${maintainRam}`);
    ns.tprint(`  Option 2: Increase --maintain RAM to cover the deficit`);
    const extraGrowRam = growDeficit * growRamPer;
    ns.tprint(`    Additional grow RAM needed: ~${extraGrowRam.toFixed(0)}GB`);
    ns.tprint(`    run batch/batch-manager.js ${target} ${hackPercent} 1.25 home --max-ram=${batchRam} --maintain=${Math.ceil(maintainRam + extraGrowRam)}`);
  } else {
    ns.tprint(`  ✓ Grow is sufficient — setup looks balanced`);
    ns.tprint(`  Current hackPercent ${(hackPercent*100).toFixed(3)}% is sustainable`);
    ns.tprint(`  You could potentially increase hackPercent to ${(recHackPct*100).toFixed(3)}%`);
    ns.tprint(`    run batch/batch-manager.js ${target} ${recHackPct.toFixed(4)} 1.25 home --max-ram=${batchRam} --maintain=${maintainRam}`);
  }

  ns.tprint(`\n📋 Current Settings:`);
  ns.tprint(`  batch-manager: --max-ram=${batchRam} hackPercent=${hackPercent}`);
  ns.tprint(`  prep-maintain: --max-ram=${maintainRam}`);
  ns.tprint(`  Total RAM dedicated: ${batchRam + maintainRam}GB`);
  ns.tprint("═".repeat(60));
}