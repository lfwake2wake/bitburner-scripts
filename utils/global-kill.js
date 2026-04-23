/** global-kill.js
 * Kill all running scripts across all servers.
 * Usage: run global-kill.js [--keep-stocks]
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog("sleep");
  ns.disableLog("scan");
  ns.disableLog("killall");

  const keepStocks = ns.args.includes("--keep-stocks");

  // Scripts to preserve when --keep-stocks is set
  const stockScripts = [
      "stocks/check-stock-api.js",
      "stocks/close-all-stock.js",
      "stocks/stock-info.js",
      "stocks/stock-momentum-analyzer.js",
      "stocks/stock-monitor.js",
      "stocks/stock-trader-advanced.js",
      "stocks/stock-trader-basic.js",
      "stocks/stock-trader-momentum.js",
  ];
  
  const visited = new Set();
  const q = ["home"];
  const servers = [];
  const currentHost = ns.getHostname();

  // BFS to get all reachable hosts
  while (q.length) {
    const s = q.shift();
    if (visited.has(s)) continue;
    visited.add(s);
    servers.push(s);
    for (const n of ns.scan(s)) if (!visited.has(n)) q.push(n);
  }

  let totalKilled = 0;
  let serversProcessed = 0;

  function isStockScript(filename) {
    return stockScripts.some(s => filename.includes(s));
  }

  // Kill processes on other servers
  for (const host of servers) {
    if (host === currentHost) continue;

    try {
      const procs = ns.ps(host);
      if (keepStocks) {
        // Kill individual processes, skipping stock scripts
        for (const proc of procs) {
          if (!isStockScript(proc.filename)) {
            ns.kill(proc.pid);
            totalKilled++;
          }
        }
        if (procs.length > 0) serversProcessed++;
      } else {
        const killed = ns.killall(host);
        if (killed) {
          totalKilled += procs.length;
          serversProcessed++;
        }
      }
      await ns.sleep(50);
    } catch (e) {
      // Ignore errors
    }
  }

  // Kill on current host, preserve this script and optionally stocks
  try {
    const procs = ns.ps(currentHost);
    for (const proc of procs) {
      if (proc.filename === "global-kill.js" || proc.pid === ns.pid) continue;
      if (keepStocks && isStockScript(proc.filename)) continue;
      ns.kill(proc.pid);
      totalKilled++;
      await ns.sleep(10);
    }
  } catch (e) {
    // Ignore errors
  }

  const stockMsg = keepStocks ? " (stock scripts preserved)" : "";
  ns.tprint(`✓ Killed ${totalKilled} processes across ${serversProcessed + 1} servers${stockMsg}.`);
}
