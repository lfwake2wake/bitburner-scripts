/** prep-maintain.js - Continuously grow/weaken a target to maintain max money
 *  Designed to run alongside batch-manager to counteract server depletion.
 *  run batch/prep-maintain.js <target> [--max-ram=N]
 */
/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep");
  ns.disableLog("getServerMaxRam");
  ns.disableLog("getServerUsedRam");
  ns.disableLog("scp");
  ns.disableLog("exec");
  ns.disableLog("kill");
  ns.disableLog("scan");

  const target = ns.args[0];
  if (!target) { ns.tprint("Usage: run batch/prep-maintain.js <target> [--max-ram=N]"); return; }

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

  const growScript = "core/attack-grow.js";
  const weakenScript = "core/attack-weaken.js";
  const GROW_RATIO = 0.80;
  const WEAKEN_RATIO = 0.20;

  // BFS all servers
  function getAllHosts() {
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
    return hosts;
  }

  // Kill existing grow/weaken threads on all servers for this target
  function killExisting(hosts) {
    for (const h of hosts) {
      try {
        const procs = ns.ps(h);
        for (const p of procs) {
          if ((p.filename === growScript || p.filename === weakenScript) &&
              p.args[0] === target) {
            ns.kill(p.pid);
          }
        }
      } catch (e) { /* ignore */ }
    }
  }

  // Deploy grow/weaken across all servers using RAM budget
  function deploy(hosts) {
    let remainingBudget = maxRamBudget;
    let totalGrow = 0;
    let totalWeaken = 0;

    for (const h of hosts) {
      if (remainingBudget <= 0) break;

      if (!ns.hasRootAccess(h)) continue;

      if (!ns.fileExists(growScript, h)) ns.scp(growScript, h);
      if (!ns.fileExists(weakenScript, h)) ns.scp(weakenScript, h);

      const growRam = ns.getScriptRam(growScript, h);
      const weakenRam = ns.getScriptRam(weakenScript, h);
      const homeReserve = h === "home" ? 200 : 0;
      const freeRam = Math.min(
        Math.max(0, ns.getServerMaxRam(h) - ns.getServerUsedRam(h) - homeReserve),
        remainingBudget
      );

      if (freeRam <= 0) continue;

      const growThreads = Math.floor((freeRam * GROW_RATIO) / growRam);
      const weakenThreads = Math.floor((freeRam * WEAKEN_RATIO) / weakenRam);

      if (growThreads < 1 && weakenThreads < 1) continue;

      if (growThreads > 0) ns.exec(growScript, h, growThreads, target);
      if (weakenThreads > 0) ns.exec(weakenScript, h, weakenThreads, target);

      remainingBudget -= (growThreads * growRam) + (weakenThreads * weakenRam);
      totalGrow += growThreads;
      totalWeaken += weakenThreads;
    }

    return { totalGrow, totalWeaken };
  }

  const growTime = ns.getGrowTime(target);
  const waitTime = Math.floor(growTime / 2);

  ns.tprint("═".repeat(55));
  ns.tprint(`  PREP-MAINTAIN: ${target}`);
  ns.tprint(`  RAM Budget: ${maxRamBudget === Infinity ? "unlimited" : maxRamBudget + "GB"}`);
  ns.tprint(`  Ratio: ${GROW_RATIO * 100}% grow / ${WEAKEN_RATIO * 100}% weaken`);
  ns.tprint(`  Cycle wait: ${(waitTime/1000).toFixed(1)}s (half grow time)`);
  ns.tprint("═".repeat(55));

  // Initial half-cycle delay to offset from batch-manager
  ns.tprint(`Waiting ${(waitTime/1000).toFixed(1)}s before first deploy (mid-cycle offset)...`);
  await ns.sleep(waitTime);

  let cycle = 0;
// Initial half-cycle delay to offset from batch-manager
  ns.tprint(`Deploying immediately...`);

  const hosts = getAllHosts();
  const { totalGrow, totalWeaken } = deploy(hosts);
  const money = ns.getServerMoneyAvailable(target);
  const maxMoney = ns.getServerMaxMoney(target);
  const pct = (money / maxMoney * 100).toFixed(1);

  ns.tprint(`Deployed — ${target}: ${pct}% | grow x${totalGrow} / weaken x${totalWeaken}`);
  ns.tprint(`Threads will loop continuously. prep-maintain exiting.`);
}