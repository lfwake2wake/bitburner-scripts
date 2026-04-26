/** batch2/orchestrator.js - Precise batch hacking orchestrator
 *  Fires coordinated HWGW batches with exact timing offsets.
 *  Server must be prepped (max money, min security) before running.
 * 
 *  run batch2/orchestrator.js <target> [hackPercent] [--max-ram=N] [--spacing=N] [--dry]
 * 
 *  Arguments:
 *    target       - Server to hack
 *    hackPercent  - Fraction to steal per batch (default: 0.05)
 *    --max-ram=N  - Cap total RAM usage to N GB
 *    --spacing=N  - Ms between batches (default: 80)
 *    --dry        - Show plan without launching
 */
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep");
  ns.disableLog("exec");
  ns.disableLog("scp");
  ns.disableLog("scan");
  ns.disableLog("getServerMaxRam");
  ns.disableLog("getServerUsedRam");

  // ═══════════════════════════════════════════════════════════
  // ARG PARSING
  // ═══════════════════════════════════════════════════════════
  const args    = ns.args.slice();
  const target  = String(args.shift());
  if (!target) {
    ns.tprint("Usage: run batch2/orchestrator.js <target> [hackPercent] [--max-ram=N] [--spacing=N] [--dry]");
    return;
  }

  let hackPercent = 0.05;
  if (args.length && !String(args[0]).startsWith("--")) {
    const maybeNum = Number(args.shift());
    if (!isNaN(maybeNum) && maybeNum > 0 && maybeNum < 1) hackPercent = maybeNum;
  }

  const flags       = args.map(String);
  const dryRun      = flags.includes("--dry");
  const maxRamFlag  = flags.find(f => f.startsWith("--max-ram="));
  const spacingFlag = flags.find(f => f.startsWith("--spacing="));
  const maxRamBudget = maxRamFlag ? Number(maxRamFlag.split("=")[1]) : Infinity;
  const batchSpacingMs = spacingFlag ? Number(spacingFlag.split("=")[1]) : 80;

  // ═══════════════════════════════════════════════════════════
  // SCRIPTS
  // ═══════════════════════════════════════════════════════════
  const hackScript   = "batch2/b2-hack.js";
  const growScript   = "batch2/b2-grow.js";
  const weaken1Script = "batch2/b2-weaken.js";
  const weaken2Script = "batch2/b2-weaken.js";
  const scripts      = [hackScript, growScript, weaken1Script];

  // ═══════════════════════════════════════════════════════════
  // SERVER STATE
  // ═══════════════════════════════════════════════════════════
  const maxMoney     = ns.getServerMaxMoney(target);
  const minSecurity  = ns.getServerMinSecurityLevel(target);
  const currentMoney = ns.getServerMoneyAvailable(target);
  const currentSec   = ns.getServerSecurityLevel(target);

  if (currentMoney < maxMoney * 0.99) {
    ns.tprint(`⚠ WARNING: ${target} is not at max money (${(currentMoney/maxMoney*100).toFixed(1)}%)`);
    ns.tprint(`  Run prep.js first for best results.`);
  }
  if (currentSec > minSecurity + 0.1) {
    ns.tprint(`⚠ WARNING: ${target} security is above minimum (${currentSec.toFixed(3)} vs ${minSecurity})`);
    ns.tprint(`  Run prep.js first for best results.`);
  }

  // ═══════════════════════════════════════════════════════════
  // TIMING
  // ═══════════════════════════════════════════════════════════
  const hackTime   = ns.getHackTime(target);
  const growTime   = ns.getGrowTime(target);
  const weakenTime = ns.getWeakenTime(target);

  // All operations complete at weakenTime + offset
  // Completion order: hack → grow → weaken1 → weaken2
  // We stagger completions by batchSpacingMs / 4
  const T = weakenTime;          // base completion time
  const step = batchSpacingMs / 4; // gap between each operation completing

  // additionalMsec = how much extra time to add so operation completes at target time
  // hack completes at T - 3*step → additionalMsec = (T - 3*step) - hackTime
  // grow completes at T - 2*step → additionalMsec = (T - 2*step) - growTime
  // weaken1 completes at T - 1*step → additionalMsec = (T - 1*step) - weakenTime
  // weaken2 completes at T         → additionalMsec = 0
  const hackDelay    = Math.max(0, (T - 3 * step) - hackTime);
  const growDelay    = Math.max(0, (T - 2 * step) - growTime);
  const weaken1Delay = Math.max(0, (T - 1 * step) - weakenTime);
  const weaken2Delay = 0;

  // ═══════════════════════════════════════════════════════════
  // THREAD CALCULATION
  // ═══════════════════════════════════════════════════════════
  const WEAKEN_AMOUNT  = ns.weakenAnalyze(1);
  const HACK_SECURITY  = 0.002;
  const GROW_SECURITY  = 0.004;
  const hackAnalyze    = ns.hackAnalyze(target);
  const hasFormulas    = ns.fileExists("Formulas.exe", "home");

  // Hack threads to steal hackPercent
  const hackThreads = Math.max(1, Math.ceil(hackPercent / hackAnalyze));
  const moneyStolen = hackThreads * hackAnalyze * maxMoney;

  // Grow threads to restore stolen money
  let growThreads;
  if (hasFormulas) {
    const player = ns.getPlayer();
    const server = ns.getServer(target);
    server.moneyAvailable = Math.max(1, maxMoney - moneyStolen);
    server.hackDifficulty = server.minDifficulty; // force min security for calculation
    server.moneyMax = maxMoney;                   // ensure max money is set correctly
    growThreads = Math.ceil(ns.formulas.hacking.growThreads(server, player, maxMoney, 1));
  } else {
    const moneyAfterHack = Math.max(1, maxMoney - moneyStolen);
    const growthFactor   = maxMoney / moneyAfterHack;
    growThreads = Math.ceil(ns.growthAnalyze(target, growthFactor));
  }

  // Weaken threads — two separate weakens
  // weaken1 counters hack security
  // weaken2 counters grow security
  const weaken1Threads = Math.ceil((hackThreads * HACK_SECURITY) / WEAKEN_AMOUNT);
  const weaken2Threads = Math.ceil((growThreads * GROW_SECURITY) / WEAKEN_AMOUNT);

  // RAM per batch
  const hackRam    = ns.getScriptRam(hackScript,    "home");
  const growRam    = ns.getScriptRam(growScript,    "home");
  const weakenRam  = ns.getScriptRam(weaken1Script, "home");

  const ramPerBatch = (hackThreads    * hackRam)   +
                      (growThreads    * growRam)   +
                      (weaken1Threads * weakenRam) +
                      (weaken2Threads * weakenRam);

  // ═══════════════════════════════════════════════════════════
  // SERVER DISCOVERY
  // ═══════════════════════════════════════════════════════════
  const visited = new Set();
  const queue   = ["home"];
  const hosts   = [];
  while (queue.length) {
    const h = queue.shift();
    if (visited.has(h)) continue;
    visited.add(h);
    hosts.push(h);
    for (const n of ns.scan(h)) if (!visited.has(n)) queue.push(n);
  }

  // Calculate total available RAM
  let totalAvailableRam = 0;
  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    const free = ns.getServerMaxRam(h) - ns.getServerUsedRam(h);
    totalAvailableRam += free;
  }
  if (maxRamBudget !== Infinity) totalAvailableRam = Math.min(totalAvailableRam, maxRamBudget);

  // How many batches can we run simultaneously?
  const maxBatches = Math.floor(totalAvailableRam / ramPerBatch);

  // How many batches fit in one weaken cycle?
  const batchesPerCycle = Math.floor(weakenTime / batchSpacingMs);
  const activeBatches   = Math.min(maxBatches, batchesPerCycle);

  // ═══════════════════════════════════════════════════════════
  // DISPLAY PLAN
  // ═══════════════════════════════════════════════════════════
  ns.tprint("");
  ns.tprint("═".repeat(65));
  ns.tprint(`  BATCH2 ORCHESTRATOR: ${target}`);
  ns.tprint("═".repeat(65));
  ns.tprint(`\n📊 Server State:`);
  ns.tprint(`  Money:    $${ns.formatNumber(currentMoney)} / $${ns.formatNumber(maxMoney)} (${(currentMoney/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Security: ${currentSec.toFixed(3)} / ${minSecurity} min`);
  ns.tprint(`\n⏱  Timing:`);
  ns.tprint(`  Hack:   ${(hackTime/1000).toFixed(2)}s | additionalMsec: ${hackDelay.toFixed(0)}ms`);
  ns.tprint(`  Grow:   ${(growTime/1000).toFixed(2)}s | additionalMsec: ${growDelay.toFixed(0)}ms`);
  ns.tprint(`  Weaken: ${(weakenTime/1000).toFixed(2)}s`);
  ns.tprint(`  Batch spacing: ${batchSpacingMs}ms | Step: ${step}ms`);
  ns.tprint(`\n⚡ Per-Batch Threads:`);
  ns.tprint(`  Hack:    ${hackThreads} threads | ${(hackThreads * hackRam).toFixed(1)}GB`);
  ns.tprint(`  Grow:    ${growThreads} threads | ${(growThreads * growRam).toFixed(1)}GB`);
  ns.tprint(`  Weaken1: ${weaken1Threads} threads | ${(weaken1Threads * weakenRam).toFixed(1)}GB`);
  ns.tprint(`  Weaken2: ${weaken2Threads} threads | ${(weaken2Threads * weakenRam).toFixed(1)}GB`);
  ns.tprint(`  Total RAM per batch: ${ramPerBatch.toFixed(1)}GB`);
  ns.tprint(`\n📦 Batch Capacity:`);
  ns.tprint(`  Available RAM:     ${totalAvailableRam.toFixed(0)}GB${maxRamBudget !== Infinity ? ` (capped from total)` : ""}`);
  ns.tprint(`  Max batches (RAM): ${maxBatches}`);
  ns.tprint(`  Max batches (time window): ${batchesPerCycle}`);
  ns.tprint(`  Active batches:    ${activeBatches}`);
  ns.tprint(`\n💰 Expected Income:`);
  const incomePerBatch  = hackThreads * hackAnalyze * maxMoney;
  const batchesPerSec   = 1000 / batchSpacingMs;
  const incomePerSec    = incomePerBatch * batchesPerSec;
  ns.tprint(`  Per batch:  $${ns.formatNumber(incomePerBatch)}`);
  ns.tprint(`  Per second: $${ns.formatNumber(incomePerSec)}`);
  ns.tprint(`  Per minute: $${ns.formatNumber(incomePerSec * 60)}`);
  ns.tprint(`  Per hour:   $${ns.formatNumber(incomePerSec * 3600)}`);
  ns.tprint(`  Calc method: ${hasFormulas ? "✓ Formulas.exe" : "⚠ Estimation"}`);
  ns.tprint("═".repeat(65));

  if (dryRun) {
    ns.tprint("🔍 DRY RUN — no scripts launched.");
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // SCP SCRIPTS TO ALL HOSTS
  // ═══════════════════════════════════════════════════════════
  for (const h of hosts) {
    if (!ns.hasRootAccess(h) || h === "home") continue;
    try { ns.scp(scripts, h, "home"); } catch (e) { /* ignore */ }
  }

  // ═══════════════════════════════════════════════════════════
  // BUILD SERVER POOL
  // Sort by free RAM descending so large servers get used first
  // ═══════════════════════════════════════════════════════════
  function getServerPool() {
    const pool = [];
    let remainingBudget = maxRamBudget;
    for (const h of hosts) {
      if (!ns.hasRootAccess(h)) continue;
      const free = Math.min(
        Math.max(0, ns.getServerMaxRam(h) - ns.getServerUsedRam(h) - (h === "home" ? 200 : 0)),
        remainingBudget
      );
      if (free > 0) pool.push({ host: h, free });
      remainingBudget -= free;
      if (remainingBudget <= 0) break;
    }
    return pool.sort((a, b) => b.free - a.free);
  }

  // ═══════════════════════════════════════════════════════════
  // EXEC ONE BATCH ACROSS SERVER POOL
  // Returns true if batch was fully deployed, false if insufficient RAM
  // ═══════════════════════════════════════════════════════════
  function execBatch(batchId, pool) {
    // We need to distribute 4 script types across available servers
    // Pack threads onto servers greedily
    const needed = [
      { script: hackScript,    threads: hackThreads,    delay: hackDelay,    name: "hack"    },
      { script: growScript,    threads: growThreads,    delay: growDelay,    name: "grow"    },
      { script: weaken1Script, threads: weaken1Threads, delay: weaken1Delay, name: "weaken1" },
      { script: weaken2Script, threads: weaken2Threads, delay: weaken2Delay, name: "weaken2" },
    ];

    // Check if we have enough total RAM
    const totalNeeded = ramPerBatch;
    const totalFree   = pool.reduce((sum, s) => sum + s.free, 0);
    if (totalFree < totalNeeded) return false;

    // Deploy each script type
    for (const op of needed) {
      let remaining = op.threads;
      for (const server of pool) {
        if (remaining <= 0) break;
        const scriptRam  = ns.getScriptRam(op.script, server.host);
        const canFit     = Math.floor(server.free / scriptRam);
        const toExec     = Math.min(remaining, canFit);
        if (toExec <= 0) continue;

        const pid = ns.exec(op.script, server.host, toExec, target, op.delay);
        if (pid > 0) {
          server.free -= toExec * scriptRam;
          remaining   -= toExec;
        }
      }
      if (remaining > 0) return false; // Couldn't fit all threads
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN LOOP — fire batches continuously
  // ═══════════════════════════════════════════════════════════
  ns.tprint(`\n🚀 Launching ${activeBatches} batches spaced ${batchSpacingMs}ms apart...`);
  ns.tprint(`   Each batch: h${hackThreads}/g${growThreads}/w${weaken1Threads}/w${weaken2Threads} threads`);
  ns.tprint(`   Press Ctrl+C or kill the script to stop.\n`);

  let batchId        = 0;
  let failedBatches  = 0;
  let launchedBatches = 0;

  while (true) {
    const pool    = getServerPool();
    const success = execBatch(batchId, pool);

    if (success) {
      launchedBatches++;
      failedBatches = 0;
    } else {
      failedBatches++;
      if (failedBatches >= 10) {
        ns.tprint(`⚠ [Batch ${batchId}] Insufficient RAM for 10 consecutive batches — pausing 1s`);
        await ns.sleep(1000);
        failedBatches = 0;
      }
    }

    batchId++;

    // Periodic status every ~30 seconds
    if (batchId % Math.round(30000 / batchSpacingMs) === 0) {
      const money = ns.getServerMoneyAvailable(target);
      const sec   = ns.getServerSecurityLevel(target);
      const pct   = (money / maxMoney * 100).toFixed(1);
      ns.print(`[Batch ${batchId}] ${target}: ${pct}% $${ns.formatNumber(money)} | sec:${sec.toFixed(2)} | launched:${launchedBatches}`);
    }

    await ns.sleep(batchSpacingMs);
  }
}