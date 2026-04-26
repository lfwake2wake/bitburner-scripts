/** @param {NS} ns **/
export async function main(ns) {
    const hasFormulas = ns.fileExists("Formulas.exe", "home");
    const scanner = hasFormulas ? "analysis/f-profit-scan-flex.js" : "analysis/profit-scan-flex.js";
    
    // 1. Run the scanner to get the Top 15 targets (using --optimal for best long-term picks)
    ns.tprint(`Refreshing targets using ${scanner}...`);
    ns.run(scanner, 1, 15, "--optimal", "--silent");
    
    // 2. Wait for the file to exist and be valid (brief sleep)
    await ns.sleep(200); 
    if (!ns.fileExists("temp_top_targets.json")) {
        ns.tprint("Error: Target file not generated.");
        return;
    }
    
    const targets = JSON.parse(ns.read("temp_top_targets.json"));

    const red = "#ff5f5f"; const orange = "#ffaf5f"; const green = "#5fff5f"; const white = "#ffffff";
    const getMoneyData = (p) => p > 80 ? { c: green, rank: 2 } : p >= 50 ? { c: orange, rank: 1 } : { c: red, rank: 0 };
    const getSecData = (p) => p > 80 ? { c: green, rank: 2 } : p >= 60 ? { c: orange, rank: 1 } : { c: red, rank: 0 };

    const w = { name: 18, money: 22, fill: 10, sec: 20, purity: 10 };
    let html = `<pre style="font-family: Lucida Console, monospace; color: ${white}; margin: 0; line-height: 1.2;">`;
    const line = "═".repeat(85);
    html += `${line}\n ${"TARGET".padEnd(w.name)} | ${"MONEY (Cur/Max)".padStart(w.money)} | ${"FILL %".padStart(w.fill)} | ${"SECURITY (C/M)".padStart(w.sec)} | ${"SEC %".padStart(w.purity)}\n${line}\n`;

    for (const target of targets) {
        if (!ns.serverExists(target)) continue;
        
        const money = ns.getServerMoneyAvailable(target);
        const maxMoney = ns.getServerMaxMoney(target);
        const sec = ns.getServerSecurityLevel(target);
        const minSec = ns.getServerMinSecurityLevel(target);
        const baseSec = ns.getServerBaseSecurityLevel(target);

        const fillPct = maxMoney > 0 ? (money / maxMoney) * 100 : 0;
        const secRange = (baseSec - minSec);
        const secToMin = secRange > 0 ? ((baseSec - sec) / secRange) * 100 : 100;

        const mData = getMoneyData(fillPct);
        const sData = getSecData(secToMin);
        const worstRank = Math.min(mData.rank, sData.rank);
        const nColor = (worstRank === 2) ? green : (worstRank === 1) ? orange : red;

        // Dynamic RAM Calculation
        const growThreads = Math.ceil(ns.growthAnalyze(target, Math.max(1.0001, maxMoney / Math.max(1, money))));
        const totalWeaken = Math.ceil(((sec - minSec) / 0.05) + ((growThreads * 0.004) / 0.05));
        const fullPrepRam = (growThreads + totalWeaken) * 1.75;
        const optimizedRam = fullPrepRam < 20000 ? Math.ceil(fullPrepRam) : Math.ceil(fullPrepRam / 3);

        const prepCmd = `run batch/prep.js ${target} --max-ram=${optimizedRam} --prep`;
        const onClick = `(function(){const d=eval('document');const i=d.getElementById('terminal-input');i.value='${prepCmd}';const h=Object.keys(i)[1];i[h].onChange({target:i});i[h].onKeyDown({keyCode:13,preventDefault:()=>null});})();`;

        const formatCell = (val, width, color, rank) => {
            let label = (rank === 0) ? "UNPREPPED" : val;
            if (rank < 2) { 
                return `<a style="color:${color}; cursor:pointer; text-decoration:underline" onclick="${onClick}">${label.padStart(width)}</a>`;
            }
            return `<span style="color:${color}">${label.padStart(width)}</span>`;
        };

        const moneyStr = `${ns.formatNumber(money)} / ${ns.formatNumber(maxMoney)}`.padStart(w.money);
        const secStr = `${sec.toFixed(2)} / ${minSec.toFixed(1)}`.padStart(w.sec);

        html += ` <span style="color:${nColor}">${target.padEnd(w.name)}</span> | ` +
                `<span style="color:${mData.c}">${moneyStr}</span> | ` +
                `${formatCell(fillPct.toFixed(1) + "%", w.fill, mData.c, mData.rank)} | ` +
                `<span style="color:${sData.c}">${secStr}</span> | ` +
                `${formatCell(secToMin.toFixed(1) + "%", w.purity, sData.c, sData.rank)}\n`;
    }

    html += `${line}</pre>`;
    eval("document").getElementById("terminal").insertAdjacentHTML('beforeend', html);
}