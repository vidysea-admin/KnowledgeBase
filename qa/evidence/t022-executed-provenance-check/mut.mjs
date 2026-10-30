import { readFileSync, writeFileSync } from "node:fs";
const [file, from, to] = process.argv.slice(2);
const s = readFileSync(file, "utf8"); const n = s.split(from).length - 1;
if (n !== 1) { console.error(`expected exactly 1 occurrence, found ${n}`); process.exit(3); }
writeFileSync(file, s.replace(from, () => to)); console.log("mutated", file);
