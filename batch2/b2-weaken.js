/** batch2/b2-weaken.js - Single-fire weaken with timing offset
 *  run batch2/b2-weaken.js <target> <additionalMsec>
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const additionalMsec = ns.args[1] ? Number(ns.args[1]) : 0;
  if (!target) return;
  await ns.weaken(target, { additionalMsec });
}