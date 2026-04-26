/** @param {NS} ns */
export async function main(ns) {
  const args = ns.args.map(String);
  const targetArg = (args[0] && !args[0].startsWith("--")) ? args[0] : null;
  
  const prepOnly = args.includes("--prep");
  const prepAll  = args.includes("--prep-all");

  const scriptsToWatch = [
    "attack-hack.js", "attack-grow.js", "attack-weaken.js",
    "b2-hack.js", "b2-grow.js", "b2-weaken.js",
    "orchestrator.js", "best.js"
  ];

  const visited = new Set();
  const queue = ["home"];
  const hosts = [];
  while (queue.length) {
    const h = queue.shift();
    if (visited.has(h)) continue;
    visited.add(h);
    hosts.push(h);
    try {
      for (const n of ns.scan(h)) if (!visited.has(n)) queue.push(n);
    } catch(e) {}
  }

  let totalKilled = 0;

  for (const h of hosts) {
    if (!ns.hasRootAccess(h)) continue;
    const procs = ns.ps(h);
    
    for (const p of procs) {
      const isTargetScript = scriptsToWatch.some(name => p.filename.endsWith(name));
      if (!isTargetScript) continue;
      
      const pTarget = p.args[0];
      const hasPrepFlag = p.args.includes("--prep");
      let shouldKill = false;

      // Logic 1: --prep-all (Kill anything with a --prep flag)
      if (prepAll && hasPrepFlag) {
        shouldKill = true;
      } 
      // Logic 2: --prep (Kill only if target is prepped)
      else if (prepOnly && hasPrepFlag) {
        if (!targetArg || pTarget === targetArg) {
          const s = ns.getServer(pTarget);
          if (s.moneyAvailable >= s.moneyMax * 0.99 && s.hackDifficulty <= s.minDifficulty + 0.1) {
            shouldKill = true;
          }
        }
      }
      // Logic 3: Standard Kill (Target match)
      // We use a separate IF here so that "run script [target]" 
      // works even if the process has a --prep flag.
      if (!shouldKill && !prepAll && !prepOnly && targetArg && pTarget === targetArg) {
        shouldKill = true;
      }
      // Logic 4: Global Wipe (No target, no flags)
      // Kill everything in scriptsToWatch if user ran the script bare.
      if (!shouldKill && !targetArg && !prepAll && !prepOnly) {
        shouldKill = true;
      }

      if (shouldKill) {
        ns.kill(p.pid);
        totalKilled++;
      }
    }
  }

  ns.tprint("═".repeat(45));
  ns.tprint(`  TERMINATED: ${totalKilled} process(es)`);
  ns.tprint(`  Mode: ${prepAll ? "PREP-ALL" : prepOnly ? "PREP-ONLY" : "FULL WIPE"}`);
  ns.tprint("═".repeat(45));
}