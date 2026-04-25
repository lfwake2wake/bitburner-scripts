/** find-contracts.js - Find all coding contracts on the network
 *  run utils/find-contracts.js
 */
/** @param {NS} ns */
export async function main(ns) {
  const visited = new Set();
  const queue = ["home"];
  const found = [];

  while (queue.length) {
    const h = queue.shift();
    if (visited.has(h)) continue;
    visited.add(h);
    for (const n of ns.scan(h)) if (!visited.has(n)) queue.push(n);

    const files = ns.ls(h, ".cct");
    for (const f of files) {
      found.push({ server: h, file: f, type: ns.codingcontract.getContractType(f, h) });
    }
  }

  if (found.length === 0) {
    ns.tprint("No coding contracts found.");
    return;
  }

  ns.tprint("═".repeat(55));
  ns.tprint(`  CODING CONTRACTS (${found.length} found)`);
  ns.tprint("═".repeat(55));
  for (const c of found) {
    ns.tprint(`  ${c.server} → ${c.file}`);
    ns.tprint(`    Type: ${c.type}`);
  }
  ns.tprint("═".repeat(55));
}