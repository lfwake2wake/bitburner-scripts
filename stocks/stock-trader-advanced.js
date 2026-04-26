/** @param {NS} ns **/
function fmt(ns, v) {
  try { return ns.formatNumber(v, 2); } catch(e) {
    const u = ['','k','m','b','t','q','Q'];
    let i = 0, n = Math.abs(v);
    while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
    return (v < 0 ? '-$' : '$') + n.toFixed(2) + u[i];
  }
}

function registerTaskbar(doc, id, label, popup, ns) {
  let taskbar = doc.getElementById("bb-taskbar");
  if (!taskbar) {
    taskbar = doc.createElement("div");
    taskbar.id = "bb-taskbar";
    taskbar.style.cssText = `
      position: fixed; bottom: 0; right: 0;
      display: flex; flex-direction: row-reverse; align-items: flex-end;
      z-index: 99999; padding: 4px; gap: 4px;
      pointer-events: none;
    `;
    doc.body.appendChild(taskbar);
  }

  const tab = doc.createElement("div");
  tab.id = `${id}-tab`;
  tab.style.cssText = `
    display: none; pointer-events: all;
    background: rgba(12,18,28,0.98);
    border: 1px solid #00ccff; border-bottom: none;
    color: #00ccff; font-family: monospace; font-size: 11px;
    padding: 4px 10px; cursor: pointer; border-radius: 4px 4px 0 0;
    white-space: nowrap;
  `;
  tab.innerText = label;
  taskbar.appendChild(tab);

  const minBtn = doc.createElement("span");
  minBtn.style.cssText = "cursor:pointer; font-size:14px; color:#ffcc00; margin-right:8px;";
  minBtn.innerText = "▬";

  minBtn.onclick = () => {
    popup.style.display = "none";
    tab.style.display = "block";
  };

  tab.onclick = () => {
    popup.style.display = "flex";
    tab.style.display = "none";
  };

  return minBtn;
}

export async function main(ns) {
  ns.disableLog("ALL");
  const doc = eval("document");
  const popupId = "stock-trader-v3";

  const commission = 100000;
  const LONG_THRESHOLD = 0.55;
  const SHORT_THRESHOLD = 0.45;
  const EXIT_THRESHOLD = 0.02;
  const MAX_POSITION_SIZE = 0.10;

  let tradeHistory = [];
  const maxHistory = 8;

  const maxStocks = ns.args[0] || 10;
  const totalCapital = ns.args[1] || 50e9;
  const profitTarget = ns.args[2] || 0.15;
  const stopLoss = ns.args[3] || 0.10;
  const refreshRate = ns.args[4] || 6000;

  if (!ns.stock.hasWSEAccount() || !ns.stock.hasTIXAPIAccess()) {
    ns.tprint("ERROR: You need TIX API Access!"); return;
  }
  if (!ns.stock.has4SDataTIXAPI()) {
    ns.tprint("ERROR: You need 4S Market Data TIX API!"); return;
  }
  if (profitTarget <= 0 || profitTarget > 1) { ns.tprint("ERROR: Invalid profit target"); return; }
  if (stopLoss <= 0 || stopLoss > 1) { ns.tprint("ERROR: Invalid stop loss"); return; }

  let canShort = typeof ns.stock.buyShort === 'function' && typeof ns.stock.sellShort === 'function';

  const totalCommissionReserve = maxStocks * commission;
  const investableCapital = totalCapital - totalCommissionReserve;
  const investmentPerStock = Math.floor(investableCapital / maxStocks);
  if (investmentPerStock <= 0) { ns.tprint("ERROR: Total capital too low!"); return; }

  const existing = doc.getElementById(popupId);
  if (existing) existing.remove();

  const popupHTML = `
    <div id="${popupId}" style="position: fixed; top: 120px; left: 120px; width: 820px; 
        background: rgba(12, 18, 28, 0.98); border: 1px solid #00ccff; color: #e0e0e0;
        font-family: 'Consolas', 'Courier New', monospace; font-size: 12px; z-index: 1000; 
        display: flex; flex-direction: column; box-shadow: 0 0 30px #000; border-radius: 6px;
        transition: height 0.2s ease-in-out; overflow: hidden;">
        
        <div id="${popupId}-header" style="padding: 12px; background: #001a2a; cursor: move;
            display: flex; justify-content: space-between; align-items: center; 
            border-bottom: 2px solid #00ccff; flex-shrink: 0;">
            <span style="font-weight: bold; color: #00ccff; letter-spacing: 1px;">📊 TIX ADVANCED TRADER V3</span>
            <span style="color:#888; font-size:11px;">
              Long>${(LONG_THRESHOLD*100).toFixed(0)}% | Short<${(SHORT_THRESHOLD*100).toFixed(0)}% | 
              Target:+${(profitTarget*100).toFixed(0)}% | StopLoss:-${(stopLoss*100).toFixed(0)}% |
              ${canShort ? "Shorts:ON" : "Shorts:OFF"}
            </span>
            <div id="${popupId}-btns" style="display:flex; align-items:center; gap:8px;"></div>
        </div>

        <div id="${popupId}-content" style="padding: 15px; overflow-y: auto; max-height: 800px;">
            <div id="stat-grid" style="display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; margin-bottom: 15px;"></div>
            
            <div style="color: #00ccff; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 10px;">PORTFOLIO STATUS</div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                <thead style="color: #888; font-size: 11px;">
                    <tr>
                      <th align="left">SYM</th><th align="left">TYPE</th>
                      <th align="right">SHARES</th><th align="right">AVG COST</th>
                      <th align="right">NET P/L</th><th align="right">RETURN</th>
                      <th align="center">FORECAST</th>
                    </tr>
                </thead>
                <tbody id="p-body"></tbody>
            </table>

            <div style="color: #ffcc00; border-bottom: 1px solid #333; padding-bottom: 3px; margin-bottom: 10px;">REAL-TIME TRADE LOG</div>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead style="color: #888;">
                    <tr>
                      <th align="left">TIME</th><th align="left">SYM</th>
                      <th align="left">ACTION</th><th align="left">REASON</th>
                      <th align="right">PRICE</th><th align="right">PROFIT</th>
                      <th align="center">FORECAST</th>
                    </tr>
                </thead>
                <tbody id="h-body"></tbody>
            </table>
        </div>
    </div>
  `;

  doc.body.insertAdjacentHTML('beforeend', popupHTML);

  const popup = doc.getElementById(popupId);
  const header = doc.getElementById(`${popupId}-header`);
  const content = doc.getElementById(`${popupId}-content`);
  const btns = doc.getElementById(`${popupId}-btns`);

  // Drag logic
  header.onmousedown = (e) => {
    if (e.target.tagName === "SPAN" && e.target !== header) return;
    let shiftX = e.clientX - popup.getBoundingClientRect().left;
    let shiftY = e.clientY - popup.getBoundingClientRect().top;
    const onMouseMove = (e) => {
      popup.style.left = e.pageX - shiftX + 'px';
      popup.style.top = e.pageY - shiftY + 'px';
    };
    doc.addEventListener('mousemove', onMouseMove);
    const onMouseUp = () => {
      doc.removeEventListener('mousemove', onMouseMove);
      doc.removeEventListener('mouseup', onMouseUp);
    };
    doc.addEventListener('mouseup', onMouseUp);
  };

  // Collapse button
  let isCollapsed = false;
  const collapseBtn = doc.createElement("span");
  collapseBtn.style.cssText = "cursor:pointer; font-size:14px; color:#00ccff;";
  collapseBtn.innerText = "–";
  collapseBtn.onclick = () => {
    isCollapsed = !isCollapsed;
    content.style.display = isCollapsed ? "none" : "";
    collapseBtn.innerText = isCollapsed ? "+" : "–";
  };

  // Minimize button via taskbar
  const minBtn = registerTaskbar(doc, popupId, "📊 TIX TRADER", popup, ns);

  // Close button
  const closeBtn = doc.createElement("span");
  closeBtn.style.cssText = "cursor:pointer; font-size:18px; color:#ff5f5f;";
  closeBtn.innerText = "✕";
  closeBtn.onclick = () => { popup.remove(); ns.exit(); };

  btns.appendChild(collapseBtn);
  btns.appendChild(minBtn);
  btns.appendChild(closeBtn);

  // Cleanup on exit
  ns.atExit(() => {
    const tab = doc.getElementById(`${popupId}-tab`);
    if (tab) tab.remove();
    const taskbar = doc.getElementById("bb-taskbar");
    if (taskbar && taskbar.children.length === 0) taskbar.remove();
    if (doc.getElementById(popupId)) doc.getElementById(popupId).remove();
  });

  // ═══════════════════════════════════════════════════════════
  // TRACKING
  // ═══════════════════════════════════════════════════════════
  let totalProfit = 0;
  let tradesExecuted = 0;
  let biggestWin = 0;
  let biggestLoss = 0;
  let cycleCount = 0;

  // ═══════════════════════════════════════════════════════════
  // MAIN LOOP
  // ═══════════════════════════════════════════════════════════
  while (doc.getElementById(popupId)) {
    cycleCount++;
    const symbols = ns.stock.getSymbols();
    let portfolioValue = 0;
    let invested = 0;
    let pHTML = "";
    const cash = ns.getServerMoneyAvailable("home");

    // ── FIRST PASS: exits ──
    for (const sym of symbols) {
      const forecast = ns.stock.getForecast(sym);
      const [longShares, longAvg, shortShares, shortAvg] = ns.stock.getPosition(sym);
      const ask = ns.stock.getAskPrice(sym);
      const bid = ns.stock.getBidPrice(sym);

      if (longShares > 0) {
        const grossProfit = (bid - longAvg) * longShares;
        const netProfit = grossProfit - (2 * commission);
        const netReturnPct = netProfit / (longShares * longAvg);
        const hitProfitTarget = netReturnPct >= profitTarget;
        const hitStopLoss = netReturnPct <= -stopLoss;
        const badForecast = forecast < (0.5 + EXIT_THRESHOLD);
        const shouldExit = hitProfitTarget || hitStopLoss || badForecast;

        if (shouldExit) {
          const salePrice = ns.stock.sellStock(sym, longShares);
          if (salePrice > 0) {
            const profit = (salePrice - longAvg) * longShares - 2 * commission;
            totalProfit += profit;
            tradesExecuted++;
            if (profit > biggestWin) biggestWin = profit;
            if (profit < biggestLoss) biggestLoss = profit;
            const reason = hitProfitTarget ? "PROFIT TARGET" : (hitStopLoss ? "STOP LOSS" : "FORECAST");
            tradeHistory.unshift({ time: new Date().toLocaleTimeString(), sym, action: "SELL LONG", reason, price: salePrice, profit, forecast });
          }
        } else {
          portfolioValue += longShares * bid;
          invested += longShares * longAvg;
          pHTML += `<tr style="border-bottom: 1px solid #222;">
            <td style="color:#00ccff; font-weight:bold;">${sym}</td>
            <td style="color:#5fff5f">LONG</td>
            <td align="right">${ns.formatNumber(longShares, 0)}</td>
            <td align="right">${fmt(ns,longAvg)}</td>
            <td align="right" style="color:${netProfit >= 0 ? '#5fff5f' : '#ff5f5f'}">${fmt(ns,netProfit)}</td>
            <td align="right" style="color:${netReturnPct >= 0 ? '#5fff5f' : '#ff5f5f'}">${(netReturnPct*100).toFixed(1)}%</td>
            <td align="center" style="color:${forecast > 0.55 ? '#5fff5f' : '#ffcc00'}">${(forecast*100).toFixed(1)}%</td>
          </tr>`;
        }
      }

      if (shortShares > 0 && canShort) {
        const grossProfit = (shortAvg - ask) * shortShares;
        const netProfit = grossProfit - (2 * commission);
        const netReturnPct = netProfit / (shortShares * shortAvg);
        const hitProfitTarget = netReturnPct >= profitTarget;
        const hitStopLoss = netReturnPct <= -stopLoss;
        const badForecast = forecast > (0.5 - EXIT_THRESHOLD);
        const shouldExit = hitProfitTarget || hitStopLoss || badForecast;

        if (shouldExit) {
          try {
            const salePrice = ns.stock.sellShort(sym, shortShares);
            if (salePrice > 0) {
              const profit = (shortAvg - salePrice) * shortShares - 2 * commission;
              totalProfit += profit;
              tradesExecuted++;
              if (profit > biggestWin) biggestWin = profit;
              if (profit < biggestLoss) biggestLoss = profit;
              const reason = hitProfitTarget ? "PROFIT TARGET" : (hitStopLoss ? "STOP LOSS" : "FORECAST");
              tradeHistory.unshift({ time: new Date().toLocaleTimeString(), sym, action: "CLOSE SHORT", reason, price: salePrice, profit, forecast });
            }
          } catch (e) { canShort = false; }
        } else {
          portfolioValue += shortShares * ask;
          invested += shortShares * shortAvg;
          pHTML += `<tr style="border-bottom: 1px solid #222;">
            <td style="color:#ffcc00; font-weight:bold;">${sym}</td>
            <td style="color:#ff5f5f">SHORT</td>
            <td align="right">${ns.formatNumber(shortShares, 0)}</td>
            <td align="right">${fmt(ns,shortAvg)}</td>
            <td align="right" style="color:${netProfit >= 0 ? '#5fff5f' : '#ff5f5f'}">${fmt(ns,netProfit)}</td>
            <td align="right" style="color:${netReturnPct >= 0 ? '#5fff5f' : '#ff5f5f'}">${(netReturnPct*100).toFixed(1)}%</td>
            <td align="center" style="color:${forecast < 0.45 ? '#5fff5f' : '#ffcc00'}">${(forecast*100).toFixed(1)}%</td>
          </tr>`;
        }
      }
    }

    // ── SECOND PASS: entries ──
    const totalPortfolioValue = portfolioValue + cash;
    const maxPositionValue = totalPortfolioValue * MAX_POSITION_SIZE;
    const currentPositions = symbols.filter(s => {
      const [l,,sh] = ns.stock.getPosition(s);
      return l > 0 || sh > 0;
    }).length;

    for (const sym of symbols) {
      const forecast = ns.stock.getForecast(sym);
      const [longShares,,shortShares] = ns.stock.getPosition(sym);
      if (longShares > 0 || shortShares > 0) continue;
      if (currentPositions >= maxStocks) continue;
      const ask = ns.stock.getAskPrice(sym);
      const maxShares = ns.stock.getMaxShares(sym);

      if (forecast > LONG_THRESHOLD) {
        const confidence = forecast - 0.5;
        const positionSize = Math.min(maxPositionValue * (confidence * 4), maxPositionValue);
        const sharesToBuy = Math.min(
          Math.floor(positionSize / ask),
          Math.floor((cash - commission) / ask),
          maxShares
        );
        if (sharesToBuy > 0) {
          const price = ns.stock.buyStock(sym, sharesToBuy);
          if (price > 0) {
            tradesExecuted++;
            tradeHistory.unshift({ time: new Date().toLocaleTimeString(), sym, action: "BUY LONG", reason: `${(forecast*100).toFixed(1)}% forecast`, price, profit: null, forecast });
          }
        }
      } else if (forecast < SHORT_THRESHOLD && canShort) {
        const confidence = 0.5 - forecast;
        const positionSize = Math.min(maxPositionValue * (confidence * 4), maxPositionValue);
        const sharesToShort = Math.min(
          Math.floor(positionSize / ask),
          Math.floor((cash - commission) / ask),
          maxShares
        );
        if (sharesToShort > 0) {
          try {
            const price = ns.stock.buyShort(sym, sharesToShort);
            if (price > 0) {
              tradesExecuted++;
              tradeHistory.unshift({ time: new Date().toLocaleTimeString(), sym, action: "SHORT", reason: `${(forecast*100).toFixed(1)}% forecast`, price, profit: null, forecast });
            }
          } catch (e) { canShort = false; }
        }
      }
    }

    // ── UPDATE UI ──
    if (tradeHistory.length > maxHistory) tradeHistory.length = maxHistory;
    const unrealized = portfolioValue - invested;

    doc.getElementById("stat-grid").innerHTML = `
      <div style="background:#141b24; padding:8px; border-radius:4px; border-left:3px solid #00ccff;">
        <div style="color:#888; font-size:9px;">UNREALIZED P/L</div>
        <div style="font-size:13px; color:${unrealized >= 0 ? '#5fff5f' : '#ff5f5f'}">${fmt(ns,unrealized)}</div>
      </div>
      <div style="background:#141b24; padding:8px; border-radius:4px; border-left:3px solid #5fff5f;">
        <div style="color:#888; font-size:9px;">PORTFOLIO VAL</div>
        <div style="font-size:13px;">${fmt(ns,portfolioValue)}</div>
      </div>
      <div style="background:#141b24; padding:8px; border-radius:4px; border-left:3px solid #ffcc00;">
        <div style="color:#888; font-size:9px;">LIQUID CASH</div>
        <div style="font-size:13px;">${fmt(ns,cash)}</div>
      </div>
      <div style="background:#141b24; padding:8px; border-radius:4px; border-left:3px solid #5fff5f;">
        <div style="color:#888; font-size:9px;">REALIZED P/L</div>
        <div style="font-size:13px; color:${totalProfit >= 0 ? '#5fff5f' : '#ff5f5f'}">${fmt(ns,totalProfit)}</div>
      </div>
      <div style="background:#141b24; padding:8px; border-radius:4px; border-left:3px solid #888;">
        <div style="color:#888; font-size:9px;">TRADES | CYCLE</div>
        <div style="font-size:13px; color:#ffcc00;">${tradesExecuted} | ${cycleCount}</div>
      </div>`;

    doc.getElementById("p-body").innerHTML = pHTML ||
      "<tr><td colspan='7' align='center' style='padding:20px; color:#555;'>No active positions. Scanning market...</td></tr>";

    doc.getElementById("h-body").innerHTML = tradeHistory.map(t => `
      <tr style="color:${t.action.includes('BUY') || t.action === 'SHORT' ? '#aaa' : '#00ccff'}; border-bottom: 1px solid #222;">
        <td>${t.time}</td>
        <td style="font-weight:bold;">${t.sym}</td>
        <td style="color:${t.action.includes('SELL') || t.action === 'CLOSE SHORT' ? '#00ccff' : t.action === 'SHORT' ? '#ff5f5f' : '#5fff5f'}">${t.action}</td>
        <td style="color:#888">${t.reason}</td>
        <td align="right">${fmt(ns,t.price)}</td>
        <td align="right" style="color:${t.profit === null ? '#888' : t.profit >= 0 ? '#5fff5f' : '#ff5f5f'}">
          ${t.profit === null ? '—' : fmt(ns,t.profit)}
        </td>
        <td align="center">${(t.forecast*100).toFixed(1)}%</td>
      </tr>
    `).join("");

    await ns.sleep(refreshRate);
  }
}