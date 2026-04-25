/** batch2/b2-hack.js - Single-fire hack with timing offset
 *  run batch2/b2-hack.js <target> <additionalMsec>
 */
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const additionalMsec = ns.args[1] ? Number(ns.args[1]) : 0;
  if (!target) return;
  await ns.hack(target, { additionalMsec });
}