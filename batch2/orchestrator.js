/** batch2/orchestrator.js - Precise batch hacking orchestrator
 *  Fires coordinated HWGW batches with exact timing offsets.
 *  Server must be prepped (max money, min security) before running.
 *
 *  Usage:
 *    run batch2/orchestrator.js foodnstuff --hack=0.05 --spacing=120
 *    run batch2/orchestrator.js --prepped --hack=0.05 --spacing=120
 *    run batch2/orchestrator.js foodnstuff --hack=0.05 --dry
 *
 *  Flags:
 *    --hack=N      Fraction to steal per batch (default: 0.02)
 *    --max-ram=N   Cap total RAM usage to N GB
 *    --spacing=N   Ms between batches (default: 120)
 *    --prepped     Auto-select all prepped servers as targets
 *    --dry         Show plan without launching
 */
/** @param {NS} ns */

const FLAGS = [
  ["hack",    0.02],
  ["max-ram", 0],
  ["spacing", 120],
  ["prepped", false],
  ["dry",     false],
];

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
  const flags = ns.flags(FLAGS);

  const preppedFlag    = flags["prepped"];
  const isDryRun       = flags["dry"];
  const hackPercent    = flags["hack"];
  const maxRamBudget   = flags["max-ram"] > 0 ? flags["max-ram"] : Infinity;
  const batchSpacingMs = flags["spacing"];
  const target         = !preppedFlag ? (flags["_"][0] ?? null) : null;

  if (!preppedFlag && !target) {
    ns.tprint("Usage:");
    ns.tprint("  run batch2/orchestrator.js omni-net --hack=0.02 --spacing=120");
    ns.tprint("  run batch2/orchestrator.js --prepped --hack=0.02 --spacing=120");
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // SCRIPTS
  // ═══════════════════════════════════════════════════════════
  const hackScript    = "batch2/b2-hack.js";
  const growScript    = "batch2/b2-grow.js";
  const weakenScript  = "batch2/b2-weaken.js";
  const scripts       = [hackScript, growScript, weakenScript];

  const WEAKEN_AMOUNT = ns.weakenAnalyze(1);
  const HACK_SECURITY = 0.002;
  const GROW_SECURITY = 0.004;
  const hasFormulas   = ns.fileExists("Formulas.exe", "home");

  // ═══════════════════════════════════════════════════════════
  // PER-TARGET BATCH PARAMETERS
  // ═══════════════════════════════════════════════════════════
  function calcBatchParams(t) {
    const maxMoney    = ns.getServerMaxMoney(t);
    const hackAnalyze = ns.hackAnalyze(t);
    const hackTime    = ns.getHackTime(t);
    const growTime    = ns.getGrowTime(t);
    const weakenTime  = ns.getWeakenTime(t);

    // Hack threads
    const hackThreads = Math.max(1, Math.ceil(hackPercent / hackAnalyze));
    const moneyStolen = hackThreads * hackAnalyze * maxMoney;

    // Grow threads
    let growThreads;
    if (hasFormulas) {
      const player = ns.getPlayer();
      const server = ns.getServer(t);
      server.moneyAvailable = Math.max(1, maxMoney - moneyStolen);
      server.hackDifficulty = server.minDifficulty;
      server.moneyMax = maxMoney;
      growThreads = Math.ceil(ns.formulas.hacking.growThreads(server, player, maxMoney, 1));
    } else {
      const moneyAfterHack = Math.max(1, maxMoney - moneyStolen);
      const growthFactor   = maxMoney / moneyAfterHack;
      growThreads = Math.ceil(ns.growthAnalyze(t, growthFactor));
    }

    // Weaken threads
    const weaken1Threads = Math.ceil((hackThreads * HACK_SECURITY) / WEAKEN_AMOUNT);
    const weaken2Threads = Math.ceil((growThreads * GROW_SECURITY) / WEAKEN_AMOUNT);

    // Timing offsets — completion order: hack → grow → weaken1 → weaken2
    const T    = weakenTime;
    const step = batchSpacingMs / 4;
    const hackDelay    = Math.max(0, (T - 3 * step) - hackTime);
    const growDelay    = Math.max(0, (T - 2 * step) - growTime);
    const weaken1Delay = Math.max(0, (T - 1 * step) - weakenTime);
    const weaken2Delay = 0;

    // RAM per batch
    const hackRam   = ns.getScriptRam(hackScript,   "home");
    const growRam   = ns.getScriptRam(growScript,   "home");
    const weakenRam = ns.getScriptRam(weakenScript, "home");
    const ramPerBatch = (hackThreads    * hackRam)   +
                        (growThreads    * growRam)   +
                        (weaken1Threads * weakenRam) +
                        (weaken2Threads * weakenRam);

    // Expected income
    const incomePerBatch = hackThreads * hackAnalyze * maxMoney;

    return {
      maxMoney, hackAnalyze, hackTime, growTime, weakenTime,
      hackThreads, growThreads, weaken1Threads, weaken2Threads,
      hackDelay, growDelay, weaken1Delay, weaken2Delay,
      hackRam, growRam, weakenRam, ramPerBatch, incomePerBatch,
      step, T
    };
  }

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

  // ═══════════════════════════════════════════════════════════
  // TARGET SELECTION
  // ═══════════════════════════════════════════════════════════
  function getTargets() {
    if (!preppedFlag) return [target];
    const allServers = [];
    const v2 = new Set();
    const q2 = ["home"];
    while (q2.length) {
      const h = q2.shift();
      if (v2.has(h)) continue;
      v2.add(h);
      if (ns.getServerMaxMoney(h) > 0 && h !== "home" && !h.startsWith("pserv-")) {
        allServers.push(h);
      }
      for (const n of ns.scan(h)) if (!v2.has(n)) q2.push(n);
    }
    return allServers.filter(s => {
      const money   = ns.getServerMoneyAvailable(s);
      const maxMon  = ns.getServerMaxMoney(s);
      const sec     = ns.getServerSecurityLevel(s);
      const minSec  = ns.getServerMinSecurityLevel(s);
      return money >= maxMon * 0.99 && sec <= minSec + 0.1;
    });
  }

  const targets = getTargets();
  if (targets.length === 0) {
    ns.tprint("❌ No targets found. Make sure server is prepped or use --prepped with prepped servers.");
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // DISPLAY PLAN (single target) or SUMMARY (multi-target)
  // ═══════════════════════════════════════════════════════════
  for (const t of targets) {
    const p = calcBatchParams(t);
    const currentMoney = ns.getServerMoneyAvailable(t);
    const currentSec   = ns.getServerSecurityLevel(t);
    const minSec       = ns.getServerMinSecurityLevel(t);

    if (currentMoney < p.maxMoney * 0.99)
      ns.tprint(`⚠ ${t}: not at max money (${(currentMoney/p.maxMoney*100).toFixed(1)}%) — prep first`);
    if (currentSec > minSec + 0.1)
      ns.tprint(`⚠ ${t}: security above minimum (${currentSec.toFixed(2)} vs ${minSec}) — prep first`);

    // Calculate capacity for this target
    let totalAvailableRam = 0;
    for (const h of hosts) {
      if (!ns.hasRootAccess(h)) continue;
      totalAvailableRam += ns.getServerMaxRam(h) - ns.getServerUsedRam(h);
    }
    if (isFinite(maxRamBudget)) totalAvailableRam = Math.min(totalAvailableRam, maxRamBudget);
    const maxBatches      = Math.floor(totalAvailableRam / p.ramPerBatch);
    const batchesPerCycle = Math.floor(p.weakenTime / batchSpacingMs);
    const activeBatches   = Math.min(maxBatches, batchesPerCycle);
    const incomePerSec    = p.incomePerBatch * (1000 / batchSpacingMs);

    ns.tprint("");
    ns.tprint("═".repeat(65));
    ns.tprint(`  BATCH2 ORCHESTRATOR: ${t}`);
    ns.tprint("═".repeat(65));
    ns.tprint(`  Money:    $${ns.formatNumber(currentMoney)} / $${ns.formatNumber(p.maxMoney)} (${(currentMoney/p.maxMoney*100).toFixed(1)}%)`);
    ns.tprint(`  Security: ${currentSec.toFixed(3)} / ${minSec} min`);
    ns.tprint(`\n⏱  Timing:`);
    ns.tprint(`  Hack:   ${(p.hackTime/1000).toFixed(2)}s | additionalMsec: ${p.hackDelay.toFixed(0)}ms`);
    ns.tprint(`  Grow:   ${(p.growTime/1000).toFixed(2)}s | additionalMsec: ${p.growDelay.toFixed(0)}ms`);
    ns.tprint(`  Weaken: ${(p.weakenTime/1000).toFixed(2)}s | Spacing: ${batchSpacingMs}ms | Step: ${p.step}ms`);
    ns.tprint(`\n⚡ Per-Batch Threads:`);
    ns.tprint(`  Hack:    ${p.hackThreads} threads | ${(p.hackThreads * p.hackRam).toFixed(1)}GB`);
    ns.tprint(`  Grow:    ${p.growThreads} threads | ${(p.growThreads * p.growRam).toFixed(1)}GB`);
    ns.tprint(`  Weaken1: ${p.weaken1Threads} threads | ${(p.weaken1Threads * p.weakenRam).toFixed(1)}GB`);
    ns.tprint(`  Weaken2: ${p.weaken2Threads} threads | ${(p.weaken2Threads * p.weakenRam).toFixed(1)}GB`);
    ns.tprint(`  RAM/batch: ${p.ramPerBatch.toFixed(1)}GB`);
    ns.tprint(`\n📦 Batch Capacity:`);
    ns.tprint(`  Available RAM:     ${totalAvailableRam.toFixed(0)}GB`);
    ns.tprint(`  Max batches (RAM): ${maxBatches}`);
    ns.tprint(`  Max batches (time): ${batchesPerCycle}`);
    ns.tprint(`  Active batches:    ${activeBatches}`);
    ns.tprint(`\n💰 Expected Income:`);
    ns.tprint(`  Per batch:  $${ns.formatNumber(p.incomePerBatch)}`);
    ns.tprint(`  Per second: $${ns.formatNumber(incomePerSec)}`);
    ns.tprint(`  Per minute: $${ns.formatNumber(incomePerSec * 60)}`);
    ns.tprint(`  Per hour:   $${ns.formatNumber(incomePerSec * 3600)}`);
    ns.tprint(`  Calc: ${hasFormulas ? "✓ Formulas.exe" : "⚠ Estimation"}`);
    ns.tprint("═".repeat(65));
  }

  if (isDryRun) {
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
  // EXEC ONE BATCH
  // ═══════════════════════════════════════════════════════════
  function execBatch(t, batchId, pool, p) {
    const needed = [
      { script: hackScript,   threads: p.hackThreads,    delay: p.hackDelay    },
      { script: growScript,   threads: p.growThreads,    delay: p.growDelay    },
      { script: weakenScript, threads: p.weaken1Threads, delay: p.weaken1Delay },
      { script: weakenScript, threads: p.weaken2Threads, delay: p.weaken2Delay },
    ];

    const totalFree = pool.reduce((sum, s) => sum + s.free, 0);
    if (totalFree < p.ramPerBatch) {
      ns.print(`Skip Batch ${batchId} [${t}]: need ${p.ramPerBatch.toFixed(1)}GB have ${totalFree.toFixed(1)}GB`);
      return false;
    }

    for (const op of needed) {
      let remaining = op.threads;
      for (const server of pool) {
        if (remaining <= 0) break;
        const scriptRam = ns.getScriptRam(op.script, server.host);
        const toExec    = Math.min(remaining, Math.floor(server.free / scriptRam));
        if (toExec <= 0) continue;
        if (ns.exec(op.script, server.host, toExec, t, op.delay)) {
          server.free -= toExec * scriptRam;
          remaining   -= toExec;
        }
      }
    }
    return true;
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN LOOP
  // ═══════════════════════════════════════════════════════════
  let batchId       = 0;
  let launchedBatches = 0;
  const logFile = "logs/orchestrator_diag.txt";
  ns.write(logFile, `Timestamp,BatchID,Target,MoneyPct,Security,FreeRAM\n`, "w");

  ns.tprint(`\n🚀 Launching against: ${targets.join(", ")}`);

  while (true) {
    for (const t of targets) {
      const p    = calcBatchParams(t);
      const pool = getServerPool();

      const currentMoney = ns.getServerMoneyAvailable(t);
      const currentSec   = ns.getServerSecurityLevel(t);
      const moneyPct     = (currentMoney / p.maxMoney * 100).toFixed(2);
      const totalFreeRam = pool.reduce((s, h) => s + h.free, 0);

      const success = execBatch(t, batchId, pool, p);

      if (success) {
        launchedBatches++;
        if (batchId % 50 === 0) {
          ns.write(logFile,
            `${new Date().toLocaleTimeString()},${batchId},${t},${moneyPct}%,${currentSec.toFixed(2)},${totalFreeRam.toFixed(0)}GB\n`,
            "a"
          );
          ns.print(`[Batch ${batchId}] ${t}: ${moneyPct}% | sec:${currentSec.toFixed(2)} | freeRAM:${totalFreeRam.toFixed(0)}GB`);
        }
      }

      batchId++;
    }
    await ns.sleep(batchSpacingMs);
  }
}

export function autocomplete(data, args) {
  data.flags(FLAGS);
  return [...data.servers]; // also autocomplete server names for the target positional arg
}