/** @param {NS} ns **/
function registerTaskbar(doc, id, label, popup) {
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
    background: rgba(0,0,0,0.95);
    border: 1px solid #5fff5f; border-bottom: none;
    color: #5fff5f; font-family: monospace; font-size: 11px;
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
  ns.disableLog("run");
  ns.disableLog("sleep");
  ns.disableLog("getServerMoneyAvailable");
  ns.disableLog("getServerMaxMoney");
  ns.disableLog("getServerMinSecurityLevel");
  ns.disableLog("getServerBaseSecurityLevel");
  ns.disableLog("getServerSecurityLevel");

  const refreshRate = 3000;
  const hasFormulas = ns.fileExists("Formulas.exe", "home");
  const scanner = hasFormulas ? "analysis/f-profit-scan-flex.js" : "analysis/profit-scan-flex.js";
  const doc = eval("document");
  const popupId = "hacking-monitor-popup";

  const existing = doc.getElementById(popupId);
  if (existing) existing.remove();

  const popupHTML = `
    <div id="${popupId}" style="
        position: fixed; top: 100px; left: 100px;
        width: 900px; height: 500px;
        min-width: 300px;
        padding: 0; background: rgba(0, 0, 0, 0.95); 
        border: 1px solid #5fff5f; color: white; 
        font-family: 'Lucida Console', monospace; font-size: 13px; 
        z-index: 10000; box-shadow: 0 0 20px rgba(0, 255, 0, 0.3);
        display: flex; flex-direction: column;
        resize: both; overflow: hidden;
        transition: height 0.2s ease-in-out;
    ">
        <div id="${popupId}-header" style="
            cursor: move; background: #1a1a1a; 
            border-bottom: 1px solid #5fff5f; padding: 10px; 
            font-weight: bold; color: #5fff5f; 
            display: flex; justify-content: space-between; align-items: center;
            user-select: none; flex-shrink: 0;
        ">
            <span id="${popupId}-title">[ HACKING MONITOR ]</span>
            <div id="${popupId}-btns" style="display:flex; align-items:center; gap:8px;"></div>
        </div>
        <div id="${popupId}-content" style="flex-grow: 1; overflow-y: auto; padding: 15px;">
            Initializing Grid...
        </div>
    </div>
  `;

  doc.body.insertAdjacentHTML('beforeend', popupHTML);

  const popup  = doc.getElementById(popupId);
  const header = doc.getElementById(`${popupId}-header`);
  const content = doc.getElementById(`${popupId}-content`);
  const btns   = doc.getElementById(`${popupId}-btns`);

  // Drag logic
  header.onmousedown = (e) => {
    if (e.target.tagName === "SPAN" || e.target.tagName === "DIV" && e.target !== header) return;
    let shiftX = e.clientX - popup.getBoundingClientRect().left;
    let shiftY = e.clientY - popup.getBoundingClientRect().top;
    const onMouseMove = (e) => {
      popup.style.left = e.pageX - shiftX + 'px';
      popup.style.top  = e.pageY - shiftY + 'px';
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
  let savedHeight = "500px";
  const collapseBtn = doc.createElement("span");
  collapseBtn.style.cssText = "cursor:pointer; font-size:14px; color:#5fff5f;";
  collapseBtn.innerText = "–";
  collapseBtn.onclick = () => {
    isCollapsed = !isCollapsed;
    if (isCollapsed) {
      savedHeight = popup.style.height || "500px";
      popup.style.height = "42px";
      popup.style.resize = "none";
      content.style.display = "none";
      collapseBtn.innerText = "+";
    } else {
      popup.style.height = savedHeight;
      popup.style.resize = "both";
      content.style.display = "";
      collapseBtn.innerText = "–";
    }
  };

  // Minimize button
  const minBtn = registerTaskbar(doc, popupId, "💻 HACKING MON", popup);

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

  const gridStyle = "display: grid; grid-template-columns: 1.5fr 2fr 1fr 1.3fr 0.8fr 2.2fr 1fr; gap: 10px 15px; align-items: center;";

  while (true) {
    ns.run(scanner, 1, 15, "--quiet");
    await ns.sleep(400);

    if (!ns.fileExists("temp_top_targets.json")) {
      content.innerHTML = "Waiting for scanner...";
      await ns.sleep(refreshRate);
      continue;
    }

    const targets = JSON.parse(ns.read("temp_top_targets.json"));
    const player = ns.getPlayer();
    const colors = { red: "#ff5f5f", orange: "#ffaf5f", green: "#5fff5f", white: "#ffffff" };

    const formatMins = (ms) => `${(ms / 60000).toFixed(1)}m`;
    const formatMoney = (val) => ns.formatNumber(val, 0);

    let innerHTML = `
      <div style="${gridStyle} border-bottom: 2px solid #5fff5f; padding-bottom: 8px; margin-bottom: 10px; font-weight: bold; color: #5fff5f;">
        <div>TARGET</div>
        <div style="text-align: right;">MONEY (CUR/MAX)</div>
        <div style="text-align: center;">FILL</div>
        <div style="text-align: right;">SEC (C/M)</div>
        <div style="text-align: center;">SEC%</div>
        <div style="text-align: center;">H / G / W (MIN)</div>
        <div style="text-align: right;">TOT PREP</div>
      </div>
    `;

    for (const target of targets) {
      if (!ns.serverExists(target)) continue;
      const sObj = ns.getServer(target);
      const { moneyAvailable: money, moneyMax: max, hackDifficulty: sec, minDifficulty: min, baseDifficulty: base } = sObj;

      let hTime = hasFormulas ? ns.formulas.hacking.hackTime(sObj, player) : ns.getHackTime(target);
      let gTime = hasFormulas ? ns.formulas.hacking.growTime(sObj, player) : ns.getGrowTime(target);
      let wTime = hasFormulas ? ns.formulas.hacking.weakenTime(sObj, player) : ns.getWeakenTime(target);

      const fillPct = max > 0 ? (money / max) * 100 : 0;
      const secToMin = (base - min) > 0 ? ((base - sec) / (base - min)) * 100 : 100;

      // Money: >90% green, >70% orange, else red
      const mScore = fillPct > 90 ? 1 : fillPct > 70 ? 2 : 3;
      const mC = mScore === 1 ? colors.green : mScore === 2 ? colors.orange : colors.red;

      // Security: >98% green, >90% orange, else red
      const sScore = secToMin > 98 ? 1 : secToMin > 90 ? 2 : 3;
      const sC = sScore === 1 ? colors.green : sScore === 2 ? colors.orange : colors.red;

      // Target and Tot Prep: worst of the two scores
      const worstScore = Math.max(mScore, sScore);
      const nC = worstScore === 1 ? colors.green : worstScore === 2 ? colors.orange : colors.red;

      const growThreads = Math.ceil(ns.growthAnalyze(target, Math.max(1.0001, max / Math.max(1, money))));
      const weakenThreads = Math.ceil(((sec - min) / 0.05) + ((growThreads * 0.004) / 0.05));
      const fullPrepRam = (growThreads + weakenThreads) * 1.75;
      const batches = (fullPrepRam < 20000) ? 1 : 3;
      const optimizedRam = Math.ceil(fullPrepRam / batches);
      const prepTime = Math.max(hTime, gTime, wTime) * batches;

      const prepCmd = `run batch/prep.js ${target} --max-ram=${optimizedRam} --prep`;
      const onClick = `(function(){const d=eval('document');const i=d.getElementById('terminal-input');i.value='${prepCmd}';const h=Object.keys(i)[1];i[h].onChange({target:i});i[h].onKeyDown({keyCode:13,preventDefault:()=>null});})();`;

      innerHTML += `
        <div style="${gridStyle} font-size: 12px; border-bottom: 1px solid #222; padding: 4px 0;">
          <div style="color:${nC}; font-weight: bold;">${target}</div>
          <div style="color:${mC}; text-align: right;">${formatMoney(money)} / ${formatMoney(max)}</div>
          <div style="text-align: center;">
            <a style="color:${mC}; cursor:pointer; text-decoration:${mScore === 1 ? 'none' : 'underline'}" onclick="${onClick}">${mScore === 1 ? fillPct.toFixed(0)+'%' : 'PREP'}</a>
          </div>
          <div style="color:${sC}; text-align: right;">${sec.toFixed(1)} / ${min.toFixed(1)}</div>
          <div style="text-align: center;">
            <a style="color:${sC}; cursor:pointer; text-decoration:${sScore === 1 ? 'none' : 'underline'}" onclick="${onClick}">${sScore === 1 ? '100%' : 'PREP'}</a>          </div>
          <div style="text-align: center; color: ${colors.white}; opacity: 0.9;">
            ${formatMins(hTime)} <span style="color:#444">|</span> ${formatMins(gTime)} <span style="color:#444">|</span> ${formatMins(wTime)}
          </div>
          <div style="text-align: right;">
            <a style="color:${nC}; cursor:pointer; font-weight:bold; text-decoration:underline" onclick="${onClick}">${worstScore === 1 ? 'READY' : formatMins(prepTime)}</a>
          </div>
        </div>
      `;
    }

    content.innerHTML = innerHTML;
    await ns.sleep(refreshRate);
  }
}