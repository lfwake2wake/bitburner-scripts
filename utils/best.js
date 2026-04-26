/** @param {NS} ns **/
export async function main(ns) {
    ns.disableLog("run");
    ns.disableLog("sleep");
    ns.disableLog("getServerMoneyAvailable");
    ns.disableLog("getServerMaxMoney");
    ns.disableLog("getServerMinSecurityLevel");
    ns.disableLog("getServerBaseSecurityLevel");
    ns.disableLog("getServerSecurityLevel");

    const refreshRate = 5000;
    const hasFormulas = ns.fileExists("Formulas.exe", "home");
    const scanner = hasFormulas ? "analysis/f-profit-scan-flex.js" : "analysis/profit-scan-flex.js";
    const doc = eval("document");
    const popupId = "hacking-monitor-popup";

    const existing = doc.getElementById(popupId);
    if (existing) existing.remove();

    // Added 'transition' for smooth collapsing and a 'collapsed' state tracker
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
                font-weight: bold; color: #5fff5f; display: flex; justify-content: space-between;
                user-select: none;
            ">
                <span id="${popupId}-title" style="cursor: pointer;">[ HACKING MONITOR ] (–)</span>
                <span style="cursor:pointer; color: #ff5f5f;" onclick="document.getElementById('${popupId}').remove()">✕</span>
            </div>
            <div id="${popupId}-content" style="flex-grow: 1; overflow-y: auto; padding: 15px;">
                Initializing Grid...
            </div>
        </div>
    `;

    doc.body.insertAdjacentHTML('beforeend', popupHTML);
    const content = doc.getElementById(`${popupId}-content`);
    const popup = doc.getElementById(popupId);
    const header = doc.getElementById(`${popupId}-header`);
    const title = doc.getElementById(`${popupId}-title`);

    // --- COLLAPSE LOGIC ---
    let isCollapsed = false;
    let oldHeight = "500px";

    title.onclick = () => {
        isCollapsed = !isCollapsed;
        if (isCollapsed) {
            oldHeight = popup.style.height;
            popup.style.height = "40px"; // Header height only
            popup.style.resize = "none";
            content.style.display = "none";
            title.innerText = "[ HACKING MONITOR ] (+)";
        } else {
            popup.style.height = oldHeight;
            popup.style.resize = "both";
            content.style.display = "block";
            title.innerText = "[ HACKING MONITOR ] (–)";
        }
    };

    // --- DRAG LOGIC ---
    let isDragging = false, offsetTop, offsetLeft;
    header.onmousedown = (e) => {
        if (e.target === title) return; // Don't drag when trying to collapse
        isDragging = true;
        offsetLeft = e.clientX - popup.getBoundingClientRect().left;
        offsetTop = e.clientY - popup.getBoundingClientRect().top;
    };
    doc.onmousemove = (e) => {
        if (!isDragging) return;
        popup.style.left = (e.clientX - offsetLeft) + 'px';
        popup.style.top = (e.clientY - offsetTop) + 'px';
    };
    doc.onmouseup = () => { isDragging = false; };

    ns.atExit(() => { if (doc.getElementById(popupId)) doc.getElementById(popupId).remove(); });

    const gridStyle = "display: grid; grid-template-columns: 1.5fr 2fr 1fr 1.3fr 0.8fr 2.2fr 1fr; gap: 10px 15px; align-items: center;";

    while (true) {
        ns.run(scanner, 1, 15); 
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

            const mReady = fillPct > 98;
            const sReady = secToMin > 98;
            const isReady = mReady && sReady;

            const nC = isReady ? colors.green : (fillPct > 50 && secToMin > 50) ? colors.orange : colors.red;
            const mC = mReady ? colors.green : colors.red;
            const sC = sReady ? colors.green : colors.red;

            const growThreads = Math.ceil(ns.growthAnalyze(target, Math.max(1.0001, max / Math.max(1, money))));
            const weakenThreads = Math.ceil(((sec - min) / 0.05) + ((growThreads * 0.004) / 0.05));
            const fullPrepRam = (growThreads + weakenThreads) * 1.75;
            
            // Re-applying your 3-cycle fragmented prep logic
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
                        <a style="color:${mC}; cursor:pointer; text-decoration:${mReady ? 'none' : 'underline'}" onclick="${onClick}">${mReady ? '100%' : 'PREP'}</a>
                    </div>
                    <div style="color:${sC}; text-align: right;">${sec.toFixed(1)} / ${min.toFixed(1)}</div>
                    <div style="text-align: center;">
                        <a style="color:${sC}; cursor:pointer; text-decoration:${sReady ? 'none' : 'underline'}" onclick="${onClick}">${sReady ? '100%' : 'PREP'}</a>
                    </div>
                    <div style="text-align: center; color: ${colors.white}; opacity: 0.9;">
                        ${formatMins(hTime)} <span style="color:#444">|</span> ${formatMins(gTime)} <span style="color:#444">|</span> ${formatMins(wTime)}
                    </div>
                    <div style="text-align: right;">
                        <a style="color:${nC}; cursor:pointer; font-weight:bold; text-decoration:underline" onclick="${onClick}">${isReady ? 'READY' : formatMins(prepTime)}</a>
                    </div>
                </div>
            `;
        }

        content.innerHTML = innerHTML;
        await ns.sleep(refreshRate);
    }
}