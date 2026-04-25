/** find-path.js - Find the connection path to any server
 *  run utils/find-path.js <target>
 *  Example: run utils/find-path.js CSEC
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  if (!target) { ns.tprint("Usage: run utils/find-path.js <target>"); return; }

  // BFS to find path
  const visited = new Set();
  const queue = [{ host: "home", path: ["home"] }];

  while (queue.length) {
    const { host, path } = queue.shift();
    if (visited.has(host)) continue;
    visited.add(host);

    if (host === target) {
      ns.tprint("═".repeat(55));
      ns.tprint(`  PATH TO: ${target}`);
      ns.tprint("═".repeat(55));
      ns.tprint(`  ${path.join(" → ")}`);
      ns.tprint("");
      ns.tprint("  Connect commands:");
      for (const h of path.slice(1)) {
        ns.tprint(`  connect ${h}`);
      }
      ns.tprint("");
      ns.tprint("  One-line (copy & paste):");
      const chain = path.slice(1).map(h => `connect ${h}`).join("; ");
      ns.tprint(`  ${chain}`);
      ns.tprint("═".repeat(55));
      return;
    }

    for (const n of ns.scan(host)) {
      if (!visited.has(n)) {
        queue.push({ host: n, path: [...path, n] });
      }
    }
  }

  ns.tprint(`✗ Server "${target}" not found on network.`);
}