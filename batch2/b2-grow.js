/** batch2/b2-grow.js - Single-fire grow with timing offset
 *  run batch2/b2-grow.js <target> <additionalMsec>
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const additionalMsec = ns.args[1] ? Number(ns.args[1]) : 0;
  if (!target) return;
  await ns.grow(target, { additionalMsec });
}