/** money-logger.js - Log server money over time with ASCII chart
 *  run analysis/money-logger.js <target> [intervalSeconds] [durationMinutes]
 *  Example: run analysis/money-logger.js phantasy 5 10
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const intervalSec = ns.args[1] ? Number(ns.args[1]) : 5;
  const durationMin = ns.args[2] ? Number(ns.args[2]) : 10;

  if (!target) {
    ns.tprint("Usage: run analysis/money-logger.js <target> [intervalSeconds] [durationMinutes]");
    return;
  }

  const maxMoney = ns.getServerMaxMoney(target);
  const totalSamples = Math.ceil((durationMin * 60) / intervalSec);
  const logFile = `logs/money-${target}.txt`;
  const CHART_HEIGHT = 10;  // rows
  const CHART_WIDTH = 50;   // columns (samples shown)

  ns.write(logFile, `time_s,money,pct,security\n`, "w");

  ns.tprint("═".repeat(60));
  ns.tprint(`  MONEY LOGGER: ${target}`);
  ns.tprint(`  Interval: ${intervalSec}s | Duration: ${durationMin}min | Samples: ${totalSamples}`);
  ns.tprint(`  Max Money: $${ns.formatNumber(maxMoney)}`);
  ns.tprint(`  Output: ${logFile}`);
  ns.tprint("═".repeat(60));

  const history = [];
  const startTime = Date.now();

  function drawChart() {
    if (history.length < 2) return;

    const visible = history.slice(-CHART_WIDTH);
    const minVal = 0;
    const maxVal = 1;

    const rows = [];
    for (let row = CHART_HEIGHT - 1; row >= 0; row--) {
      const threshold = (row / (CHART_HEIGHT - 1));
      const pctLabel = `${(threshold * 100).toFixed(0).padStart(3)}% |`;

    const cols = visible.map((v, i) => {
      const prev = i > 0 ? visible[i - 1] : v;
      const lo = Math.min(v, prev);
      const hi = Math.max(v, prev);

      // Place dot at the nearest row to actual value
      const targetRow = Math.round(v * (CHART_HEIGHT - 1));
      if (row === targetRow) return "●";

      // Draw connecting line between prev and current value
      const prevRow = Math.round(prev * (CHART_HEIGHT - 1));
      const lineHi = Math.max(targetRow, prevRow);
      const lineLo = Math.min(targetRow, prevRow);
      if (row > lineLo && row < lineHi) return "│";

      return " ";
    });

      rows.push(`${pctLabel}${cols.join("")}`);
    }

    // X axis
    const xAxis = "  0% |" + "─".repeat(visible.length);
    const timeLabel = `      └${"─".repeat(Math.floor(visible.length / 2))}time${"─".repeat(Math.floor(visible.length / 2))}►`;

    ns.tprint(""); // spacing
    for (const row of rows) ns.tprint(row);
    ns.tprint(xAxis);
    ns.tprint(timeLabel);
  }

  for (let i = 0; i < totalSamples; i++) {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const money = ns.getServerMoneyAvailable(target);
    const security = ns.getServerSecurityLevel(target);
    const minSecurity = ns.getServerMinSecurityLevel(target);
    const pct = money / maxMoney;

    ns.write(logFile, `${elapsed},${money.toFixed(0)},${(pct * 100).toFixed(2)},${security.toFixed(3)}\n`, "a");
    history.push(pct);

    const secFlag = security > minSecurity + 1 ? "⚠" : "✓";
    ns.tprint(`[${elapsed}s] $${ns.formatNumber(money)} (${(pct * 100).toFixed(1)}%) | sec:${security.toFixed(2)} ${secFlag}`);

    drawChart();

    await ns.sleep(intervalSec * 1000);
  }

  // Final summary
  const moneyValues = history.map(v => v * maxMoney);
  const minMoney = Math.min(...moneyValues);
  const maxSeen = Math.max(...moneyValues);
  const avgMoney = moneyValues.reduce((a, b) => a + b, 0) / moneyValues.length;

  ns.tprint("═".repeat(60));
  ns.tprint(`  SUMMARY (${totalSamples} samples over ${durationMin} min)`);
  ns.tprint("═".repeat(60));
  ns.tprint(`  Min:  $${ns.formatNumber(minMoney)} (${(minMoney/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Max:  $${ns.formatNumber(maxSeen)} (${(maxSeen/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Avg:  $${ns.formatNumber(avgMoney)} (${(avgMoney/maxMoney*100).toFixed(1)}%)`);
  ns.tprint(`  Saved to: ${logFile}`);
  ns.tprint("═".repeat(60));
  ns.tprint(`  To share with Claude: cat ${logFile}`);
}