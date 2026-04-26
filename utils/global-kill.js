/** @param {NS} ns **/
export async function main(ns) {
  const onlyPrep = ns.args.includes("--prep");
  const keepStocks = ns.args.includes("--stocks");

  const stockScripts = [
    "stocks/check-stock-api.js", "stocks/close-all-stock.js", "stocks/stock-info.js",
    "stocks/stock-momentum-analyzer.js", "stocks/stock-monitor.js",
    "stocks/stock-trader-advanced.js", "stocks/stock-trader-basic.js", "stocks/stock-trader-momentum.js"
  ];

  const visited = new Set();
  const q = ["home"];
  const servers = [];
  while (q.length) {
    const s = q.shift();
    if (visited.has(s)) continue;
    visited.add(s); servers.push(s);
    for (const n of ns.scan(s)) if (!visited.has(n)) q.push(n);
  }

  let totalKilled = 0;
  const isStock = (file) => stockScripts.some(s => file.includes(s));

  for (const host of servers) {
    const procs = ns.ps(host);
    for (const proc of procs) {
      // Skip this script so it doesn't kill itself mid-run
      if (proc.pid === ns.pid || proc.filename.includes("global-kill.js")) continue;

      // The critical check:
      const hasPrepFlag = proc.args.includes("--prep");

      if (onlyPrep) {
        if (hasPrepFlag) {
          ns.kill(proc.pid);
          totalKilled++;
        }
      } else {
        // Standard global kill logic (with optional stock preservation)
        if (keepStocks && isStock(proc.filename)) continue;
        ns.kill(proc.pid);
        totalKilled++;
      }
    }
  }

  const msg = onlyPrep ? " (Prep scripts only)" : keepStocks ? " (Stocks preserved)" : " (Global)";
  ns.tprint(`✓ Killed ${totalKilled} processes${msg}.`);
}