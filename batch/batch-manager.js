/** batch-manager.js
 * Enhanced batch manager with auto-calculated instance spawning.
 *
 * Usage:
 *   run batch-manager.js [target] [hackPercent] [multiplier] [pservHost] [flags...]
 *
 * Flags:
 *   --max-ram=N      Cap RAM used by smart-batcher to N GB
 *   --maintain=N     Launch prep-maintain with N GB (defaults to --max-ram value)
 *   --offset=N       Wait N seconds before initial deployment
 *   --secondary      Automatically marks this as a spawned instance (no auto-spawning)
 *   --quiet          Suppress terminal output
 *   --no-root        Disable auto-rooting
 *
 * Primary instance auto-calculates numInstances = round(weakenTime/hackTime)
 * and spawns secondary instances with evenly distributed offsets.
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep");
  ns.disableLog("getServerMaxRam");
  ns.disableLog("getServerUsedRam");
  ns.disableLog("scan");
  ns.disableLog("brutessh");
  ns.disableLog("ftpcrack");
  ns.disableLog("relaysmtp");
  ns.disableLog("httpworm");
  ns.disableLog("sqlinject");
  ns.disableLog("nuke");
  ns.disableLog("getServerNumPortsRequired");
  ns.disableLog("getServerRequiredHackingLevel");
  ns.disableLog("getHackingLevel");
  ns.disableLog("hasRootAccess");
  ns.disableLog("fileExists");
  ns.disableLog("scp");
  ns.disableLog("getScriptRam");
  ns.disableLog("exec");
  ns.disableLog("getHackTime");
  ns.disableLog("getGrowTime");
  ns.disableLog("getWeakenTime");
  ns.disableLog("ps");
  ns.disableLog("kill");

  const raw     = ns.args.slice().map(a => (typeof a === "string" ? a : String(a)));
  const flags   = raw.filter(a => typeof a === "string" && a.startsWith("--"));
  const pos     = raw.filter(a => !(typeof a === "string" && a.startsWith("--")));

  const target      = pos.length > 0 ? String(pos[0]) : "joesguns";
  const hackPercent = pos.length > 1 ? Number(pos[1]) : 0.05;
  const mult        = pos.length > 2 ? Number(pos[2]) : 1.25;
  const pservHost   = pos.length > 3 ? String(pos[3]) : "home";

  const enableRooting = !flags.includes("--no-root");
  const quiet         =  flags.includes("--quiet");
  const isSecondary   =  flags.includes("--secondary");

  // Parse --max-ram
  const maxRamFlagBM = flags.find(f => f.startsWith("--max-ram="));
  const maxRamBudget = maxRamFlagBM ? Number(maxRamFlagBM.split("=")[1]) : Infinity;

  // Parse --maintain
  const hasMaintain  = flags.some(f => f === "--maintain" || f.startsWith("--maintain="));
  const maintainFlag = flags.find(f => f.startsWith("--maintain="));
  const maintainRam  = maintainFlag ? Number(maintainFlag.split("=")[1]) : maxRamBudget;
  const enableMaintain = hasMaintain && maintainRam > 0;

  // Parse --offset
  const offsetFlag = flags.find(f => f.startsWith("--offset="));
  const offsetMs   = offsetFlag ? Number(offsetFlag.split("=")[1]) * 1000 : 0;

  // Forward flags to smart-batcher
  const forwardFlags = flags.filter(f =>
    f !== "--no-root" &&
    f !== "--secondary" &&
    !f.startsWith("--maintain") &&
    !f.startsWith("--offset")
  );

  const batcher    = "batch/smart-batcher.js";
  const maintainer = "batch/prep-maintain.js";

  const info = (...parts) => {
    const msg = parts.join(" ");
    ns.print(msg);
    if (!quiet) ns.tprint(msg);
  };
  const important = (...parts) => {
    const msg = parts.join(" ");
    ns.print(msg);
    ns.tprint(msg);
  };
  const error = (...parts) => {
    const msg = "[ERR] " + parts.join(" ");
    ns.print(msg);
    ns.tprint(msg);
  };

  function getAllServers() {
    const visited = new Set();
    const queue   = ["home"];
    const servers = [];
    while (queue.length > 0) {
      const host = queue.shift();
      if (visited.has(host)) continue;
      visited.add(host);
      servers.push(host);
      for (const n of ns.scan(host)) if (!visited.has(n)) queue.push(n);
    }
    return servers;
  }

  function getTotalNetworkRAM() {
    return getAllServers()
      .filter(h => ns.hasRootAccess(h))
      .reduce((sum, h) => sum + ns.getServerMaxRam(h), 0);
  }

  async function rootNewServers() {
    if (!enableRooting) return { newlyRooted: 0, totalRooted: 0 };
    try {
      const servers  = getAllServers();
      const programs = [
        { name: "BruteSSH.exe",  fn: ns.brutessh  },
        { name: "FTPCrack.exe",  fn: ns.ftpcrack  },
        { name: "relaySMTP.exe", fn: ns.relaysmtp },
        { name: "HTTPWorm.exe",  fn: ns.httpworm  },
        { name: "SQLInject.exe", fn: ns.sqlinject },
      ];
      const available = programs.filter(p => ns.fileExists(p.name, "home"));
      const portCount = available.length;
      let newlyRooted = 0, totalRooted = 0;

      for (const host of servers) {
        if (host === "home") continue;
        if (ns.hasRootAccess(host)) { totalRooted++; continue; }
        const reqPorts = ns.getServerNumPortsRequired(host);
        const reqHack  = ns.getServerRequiredHackingLevel(host);
        if (reqPorts > portCount || reqHack > ns.getHackingLevel()) continue;
        try {
          for (const prog of available) prog.fn(host);
          ns.nuke(host);
          if (ns.hasRootAccess(host)) {
            important(`✓ Rooted: ${host} (Level ${reqHack}, ${reqPorts} ports)`);
            newlyRooted++;
            totalRooted++;
          }
        } catch (e) { /* ignore */ }
      }
      if (newlyRooted > 0) important(`Rooting complete: ${newlyRooted} new server(s)`);
      return { newlyRooted, totalRooted };
    } catch (e) {
      error(`Rooting error: ${e}`);
      return { newlyRooted: 0, totalRooted: 0 };
    }
  }

  async function launchMaintain(delayMs) {
    if (!enableMaintain) return;
    if (!ns.fileExists(maintainer, pservHost)) ns.scp(maintainer, pservHost);
    const mScriptRam = ns.getScriptRam(maintainer, pservHost);

    if (delayMs > 0) await ns.sleep(delayMs);

    const freeRam = ns.getServerMaxRam(pservHost) - ns.getServerUsedRam(pservHost);
    if (freeRam >= mScriptRam) {
      const pid = ns.exec(maintainer, pservHost, 1, target, `--max-ram=${maintainRam}`);
      if (pid > 0) important(`✓ prep-maintain launched at offset ${(delayMs/1000).toFixed(1)}s (pid=${pid}, ram=${maintainRam}GB)`);
      else error(`Failed to start prep-maintain at offset ${(delayMs/1000).toFixed(1)}s`);
    } else {
      error(`Insufficient RAM for prep-maintain at offset ${(delayMs/1000).toFixed(1)}s`);
    }
  }

  // Get timings
  let hackMs = 10000, growMs = 10000, weakenMs = 10000;
  try { hackMs   = Math.max(1, ns.getHackTime(target));   } catch (_) {}
  try { growMs   = Math.max(1, ns.getGrowTime(target));   } catch (_) { growMs = hackMs; }
  try { weakenMs = Math.max(1, ns.getWeakenTime(target)); } catch (_) { weakenMs = hackMs; }
  const baseMs     = Math.max(hackMs, growMs, weakenMs);
  const intervalMs = Math.max(2000, Math.round(baseMs * (Number.isFinite(mult) ? mult : 1.25)));

  // Calculate instances and spacing
  const numInstances   = Math.round(weakenMs / hackMs);
  const spacingMs      = Math.round(weakenMs / numInstances);

  const banner = "=".repeat(60);
  ns.print(banner); ns.tprint(banner);
  ns.print(`BATCH MANAGER v2.0.0 - ${isSecondary ? "SECONDARY" : "PRIMARY"}`);
  ns.tprint(`BATCH MANAGER v2.0.0 - ${isSecondary ? "SECONDARY" : "PRIMARY"}`);
  ns.print(banner); ns.tprint(banner);
  info(`Target: ${target} | HackPercent: ${(hackPercent*100).toFixed(3)}%`);
  info(`Timings: H=${(hackMs/1000).toFixed(1)}s G=${(growMs/1000).toFixed(1)}s W=${(weakenMs/1000).toFixed(1)}s`);
  if (!isSecondary) {
    info(`Auto-instances: ${numInstances} | Spacing: ${(spacingMs/1000).toFixed(1)}s`);
  }
  info(`Offset: ${offsetMs/1000}s | Maintain: ${enableMaintain ? maintainRam + "GB" : "OFF"}`);
  ns.print(banner); ns.tprint(banner);

  // PRIMARY: spawn secondary instances with evenly spaced offsets
  if (!isSecondary) {
    important(`Spawning ${numInstances} instances spaced ${(spacingMs/1000).toFixed(1)}s apart...`);

    for (let i = 1; i < numInstances; i++) {
      const instanceOffset = Math.round((spacingMs * i) / 1000); // seconds
      const spawnArgs = [target, hackPercent, mult, pservHost,
        ...forwardFlags,
        `--offset=${instanceOffset}`,
        "--secondary",
        "--quiet",
      ];
      if (maxRamFlagBM) spawnArgs.push(maxRamFlagBM);
      if (hasMaintain)  spawnArgs.push(maintainFlag || "--maintain");

      const spawnPid = ns.exec("batch/batch-manager.js", pservHost, 1, ...spawnArgs);
      if (spawnPid > 0) {
        important(`✓ Spawned instance ${i + 1}/${numInstances} offset=${instanceOffset}s (pid=${spawnPid})`);
      } else {
        error(`Failed to spawn instance ${i + 1} offset=${instanceOffset}s`);
      }
      await ns.sleep(100);
    }
  }

  // Apply this instance's offset
  if (offsetMs > 0) {
    info(`Waiting ${offsetMs/1000}s offset before deployment...`);
    await ns.sleep(offsetMs);
  }

  // Initial rooting scan (primary only)
  if (!isSecondary) {
    const initialRoot = await rootNewServers();
    info(`Initial scan: ${initialRoot.totalRooted} server(s) rooted`);
  }

  let lastTotalRAM          = getTotalNetworkRAM();
  let initialDeploymentDone = false;
  let maintainDeployed      = false;
  let cycleCount            = 0;

  while (true) {
    try {
      cycleCount++;
      let newServersFound = false;

      const currentTotalRAM = getTotalNetworkRAM();
      const ramChanged      = currentTotalRAM !== lastTotalRAM;

      if (ramChanged && initialDeploymentDone) {
        important(`✓ RAM changed: ${lastTotalRAM.toFixed(0)}GB → ${currentTotalRAM.toFixed(0)}GB`);
        lastTotalRAM    = currentTotalRAM;
        newServersFound = true;
        maintainDeployed = false; // Redeploy maintain on RAM change
      }

      const heartbeatFreq = intervalMs > 60000 ? 1 : 5;
      if (initialDeploymentDone && !ramChanged &&
          cycleCount % heartbeatFreq === 0 && cycleCount % 10 !== 0) {
        info(`[Cycle ${cycleCount}] Monitoring... (next scan in ${10 - (cycleCount % 10)} cycles)`);
      }

      if (cycleCount % 10 === 0 && enableRooting && !isSecondary) {
        const rootResult = await rootNewServers();
        const postScanRAM = getTotalNetworkRAM();
        if (postScanRAM !== currentTotalRAM) {
          important(`✓ New servers: +${(postScanRAM - currentTotalRAM).toFixed(0)}GB RAM`);
          lastTotalRAM = postScanRAM;
          newServersFound = true;
          maintainDeployed = false;
        } else {
          lastTotalRAM = currentTotalRAM;
        }
        if (rootResult.newlyRooted > 0) newServersFound = true;
      } else if (!ramChanged) {
        lastTotalRAM = currentTotalRAM;
      }

      const shouldDeploy = !initialDeploymentDone || newServersFound;
      if (!shouldDeploy) {
        await ns.sleep(intervalMs);
        continue;
      }

      // Kill existing batcher if redeploying
      let procs = [];
      try { procs = ns.ps(pservHost); } catch (e) { procs = []; }
      const already = procs.find(p => p.filename === batcher);

      if (already && newServersFound) {
        try { ns.kill(already.pid); } catch (e) { /* ignore */ }
        await ns.sleep(100);
      } else if (already && !initialDeploymentDone) {
        info(`${batcher} already running (pid ${already.pid}).`);
        await ns.sleep(intervalMs);
        continue;
      }

      // SCP batcher if needed
      if (!ns.fileExists(batcher, pservHost)) {
        const ok = ns.scp(batcher, pservHost);
        if (!ok) { error(`scp failed for ${batcher}`); await ns.sleep(intervalMs); continue; }
        await ns.sleep(100);
      }

      // Check RAM
      const freeRam   = ns.getServerMaxRam(pservHost) - ns.getServerUsedRam(pservHost);
      const scriptRam = ns.getScriptRam(batcher, pservHost);
      if (freeRam < scriptRam) {
        error(`Insufficient RAM: free=${freeRam.toFixed(2)}GB need=${scriptRam.toFixed(2)}GB`);
        await ns.sleep(intervalMs);
        continue;
      }

      // Launch smart-batcher
      const batchArgs = [target];
      if (isFinite(hackPercent) && hackPercent > 0 && hackPercent <= 1) batchArgs.push(hackPercent);
      for (const f of forwardFlags) batchArgs.push(f);

      const pid = ns.exec(batcher, pservHost, 1, ...batchArgs);
      if (pid > 0) {
        important(`✓ smart-batcher deployed (pid=${pid})`);
        await ns.sleep(2000);

        if (!initialDeploymentDone) {
          initialDeploymentDone = true;
          info(`Deployment complete. Monitoring...`);
        }

        // Launch prep-maintain if enabled and not yet deployed
        if (enableMaintain && !maintainDeployed) {
          // Fire immediately
          await launchMaintain(0);
          // Fire again at half grow cycle
          await launchMaintain(Math.floor(growMs / 2));
          maintainDeployed = true;
        }
      } else {
        error(`Failed to start smart-batcher.`);
      }
    } catch (e) {
      error(`batch-manager exception: ${e}`);
    }

    await ns.sleep(intervalMs);
  }
}