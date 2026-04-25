/** maintain-optimizer.js - Analyze money-logger data to recommend optimal prep-maintain RAM
 *  Run money-logger first, then run this script.
 *  run analysis/maintain-optimizer.js <target> [floorPct]
 *  Example: run analysis/maintain-optimizer.js phantasy 70
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const floorPct = ns.args[1] ? Number(ns.args[1]) / 100 : 0.70;

  if (!target) {
    ns.tprint("Usage: run analysis/maintain-optimizer.js <target> [floorPct]");
    ns.tprint("Example: run analysis/maintain-optimizer.js phantasy 70");
    ns.tprint("Run analysis/money-logger.js first to generate data.");
    return;
  }

  const logFile = `logs/money-${target}.txt`;
  const raw = ns.read(logFile);
  if (!raw || raw.trim() === "") {
    ns.tprint(`✗ No data found at ${logFile}`);
    ns.tprint(`  Run: run analysis/money-logger.js ${target} 5 3`);
    return;
  }

  // Parse CSV
  const lines = raw.trim().split("\n").slice(1); // skip header
  const samples = lines.map(l => {
    const [time_s, money, pct, security] = l.split(",").map(Number);
    return { time_s, money, pct, security };
  }).filter(s => !isNaN(s.money));

  if (samples.length < 6) {
    ns.tprint(`✗ Not enough samples (${samples.length}) — run money-logger for at least 3 minutes`);
    return;
  }

  // ═══════════════════════════════════════════════════════════
  // OSCILLATION ANALYSIS
  // ═══════════════════════════════════════════════════════════

  const maxMoney = ns.getServerMaxMoney(target);
  const growTime = ns.getGrowTime(target);
  const hackTime = ns.getHackTime(target);
  const growRamPer = ns.getScriptRam("core/attack-grow.js", "home");
  const weakenRamPer = ns.getScriptRam("core/attack-weaken.js", "home");
  const WEAKEN_AMOUNT = ns.weakenAnalyze(1);
  const GROW_SECURITY = 0.004;

  const moneyValues = samples.map(s => s.money);
  const pctValues = samples.map(s => s.pct);
  const secValues = samples.map(s => s.security);

  const minMoney = Math.min(...moneyValues);
  const maxSeen = Math.max(...moneyValues);
  const avgMoney = moneyValues.reduce((a, b) => a + b, 0) / moneyValues.length;
  const minPct = Math.min(...pctValues);
  const maxPct = Math.max(...pctValues);
  const avgPct = pctValues.reduce((a, b) => a + b, 0) / pctValues.length;
  const avgSec = secValues.reduce((a, b) => a + b, 0) / secValues.length;
  const maxSec = Math.max(...secValues);

  // Find drops — consecutive samples where money decreases significantly
  const drops = [];
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].money - samples[i-1].money;
    if (delta < 0) drops.push(Math.abs(delta));
  }

  // Find recoveries — consecutive samples where money increases
  const recoveries = [];
  for (let i = 1; i < samples.length; i++) {
    const delta = samples[i].money - samples[i-1].money;
    if (delta > 0) recoveries.push(delta);
  }

  const avgDrop = drops.length > 0 ? drops.reduce((a, b) => a + b, 0) / drops.length : 0;
  const maxDrop = drops.length > 0 ? Math.max(...drops) : 0;
  const avgRecovery = recoveries.length > 0 ? recoveries.reduce((a, b) => a + b, 0) / recoveries.length : 0;

  // Calculate net drain rate per second
  // Use overall trend: first half avg vs second half avg
  const firstHalf = samples.slice(0, Math.floor(samples.length / 2));
  const secondHalf = samples.slice(Math.floor(samples.length / 2));
  const firstAvg = firstHalf.reduce((a, b) => a + b.money, 0) / firstHalf.length;
  const secondAvg = secondHalf.reduce((a, b) => a + b.money, 0) / secondHalf.length;
  const totalTime = samples[samples.length-1].time_s - samples[0].time_s;
  const netDrainPerSec = (firstAvg - secondAvg) / (totalTime / 2);
  const isNetDraining = netDrainPerSec > 0;

  // How far below floor does it currently go?
  const currentFloorPct = minPct;
  const floorDeficit = floorPct * 100 - currentFloorPct;
  const needsMoreGrow = floorDeficit > 0 && isNetDraining;

  // ═══════════════════════════════════════════════════════════
  // GROW THREAD RECOMMENDATION
  // ═══════════════════════════════════════════════════════════

  // Currently running grow/weaken threads on this target
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

  let growThreads = 0, weakenThreads = 0;
  let growRamUsed = 0, weakenRamUsed = 0;
  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    try {
      for (const p of ns.ps(h)) {
        if (p.args[0] !== target) continue;
        if (p.filename === "core/attack-grow.js") {
          growThreads += p.threads;
          growRamUsed += p.threads * ns.getScriptRam(p.filename, h);
        }
        if (p.filename === "core/attack-weaken.js") {
          weakenThreads += p.threads;
          weakenRamUsed += p.threads * ns.getScriptRam(p.filename, h);
        }
      }
    } catch (e) { /* skip */ }
  }

  // How much grow do we actually need?
  // Worst case drop per grow cycle = maxDrop * (growTime/5000) since samples are 5s apart
  const samplingInterval = samples.length > 1 ? 
    (samples[samples.length-1].time_s - samples[0].time_s) / (samples.length - 1) : 5;
  const dropsPerGrowCycle = growTime / 1000 / samplingInterval;
  const worstDropPerGrowCycle = maxDrop * dropsPerGrowCycle;
  const growthFactorNeeded = maxMoney / Math.max(1, maxMoney - worstDropPerGrowCycle);
  const growThreadsNeeded = Math.ceil(ns.growthAnalyze(target, growthFactorNeeded));

  // Extra grow threads needed if floor is breached
  const floorGrowthFactor = 1 / floorPct; // grow from floor back to 100%
  const floorGrowThreads = Math.ceil(ns.growthAnalyze(target, floorGrowthFactor));

  // Use whichever is larger
  const recGrowThreads = Math.max(growThreadsNeeded, floorGrowThreads);
  const recWeakenThreads = Math.ceil(recGrowThreads * GROW_SECURITY / WEAKEN_AMOUNT);

  // How much RAM is that?
  const recMaintainRam = (recGrowThreads * growRamPer) + (recWeakenThreads * weakenRamPer);
  const currentMaintainRam = growRamUsed + weakenRamUsed;
  const ramDiff = currentMaintainRam - recMaintainRam;
  const isOverkill = ramDiff > 100;

  ns.tprint("");
  ns.tprint("═".repeat(60));
  ns.tprint(`  MAINTAIN OPTIMIZER: ${target}`);
  ns.tprint(`  Floor target: ${(floorPct*100).toFixed(0)}% | Data: ${samples.length} samples over ${totalTime}s`);
  ns.tprint("═".repeat(60));

  ns.tprint(`\n📊 Oscillation Pattern:`);
  ns.tprint(`  Min:  ${minPct.toFixed(1)}% ($${ns.formatNumber(minMoney)})`);
  ns.tprint(`  Max:  ${maxPct.toFixed(1)}% ($${ns.formatNumber(maxSeen)})`);
  ns.tprint(`  Avg:  ${avgPct.toFixed(1)}% ($${ns.formatNumber(avgMoney)})`);
  ns.tprint(`  Avg drop per sample:     $${ns.formatNumber(avgDrop)}`);
  ns.tprint(`  Max drop per sample:     $${ns.formatNumber(maxDrop)}`);
  ns.tprint(`  Avg recovery per sample: $${ns.formatNumber(avgRecovery)}`);
  ns.tprint(`  Net drift: ${isNetDraining ? `⚠ DRAINING $${ns.formatNumber(netDrainPerSec)}/s` : `✓ STABLE or recovering`}`);

  ns.tprint(`\n🔒 Security:`);
  ns.tprint(`  Avg: ${avgSec.toFixed(3)} | Max seen: ${maxSec.toFixed(3)} | Min: ${ns.getServerMinSecurityLevel(target)}`);
  ns.tprint(`  ${maxSec > ns.getServerMinSecurityLevel(target) + 2 ? "⚠ Security rising — may need more weaken" : "✓ Security under control"}`);

  ns.tprint(`\n⚡ Current Grow/Weaken (targeting ${target}):`);
  ns.tprint(`  Grow:   ${growThreads} threads | ${growRamUsed.toFixed(0)}GB RAM`);
  ns.tprint(`  Weaken: ${weakenThreads} threads | ${weakenRamUsed.toFixed(0)}GB RAM`);
  ns.tprint(`  Total maintain RAM: ${currentMaintainRam.toFixed(0)}GB`);

  ns.tprint(`\n⚖️  Floor Analysis:`);
  ns.tprint(`  Target floor: ${(floorPct*100).toFixed(0)}%`);
  ns.tprint(`  Current floor: ${minPct.toFixed(1)}%`);
  ns.tprint(`  ${floorDeficit > 0 ? `⚠ Floor breached by ${floorDeficit.toFixed(1)}% — need more grow` : `✓ Floor holding`}`);
  ns.tprint(`  Worst drop per grow cycle: $${ns.formatNumber(worstDropPerGrowCycle)} (${(worstDropPerGrowCycle/maxMoney*100).toFixed(1)}%)`);

  ns.tprint(`\n🎯 Recommendations:`);
  ns.tprint(`  Grow threads needed:   ${recGrowThreads}`);
  ns.tprint(`  Weaken threads needed: ${recWeakenThreads}`);
  ns.tprint(`  Recommended maintain RAM: ${recMaintainRam.toFixed(0)}GB`);
  ns.tprint(`  Current maintain RAM:     ${currentMaintainRam.toFixed(0)}GB`);
  if (isOverkill) {
    ns.tprint(`  ✓ You can REDUCE maintain RAM by ~${ramDiff.toFixed(0)}GB`);
  } else if (recMaintainRam > currentMaintainRam + 100) {
    ns.tprint(`  ⚠ You should INCREASE maintain RAM by ~${(recMaintainRam - currentMaintainRam).toFixed(0)}GB`);
  } else {
    ns.tprint(`  ✓ Maintain RAM is approximately correct`);
  }

  ns.tprint(`\n  Suggested maintain command:`);
  ns.tprint(`  run batch/batch-manager.js ${target} [hackPercent] 1.25 home --max-ram=[batchRam] --maintain=${Math.ceil(recMaintainRam)}`);
  ns.tprint("═".repeat(60));
}