import fs from "fs";
import path from "path";

const dir = "content";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));
const typeDifficulty: Record<string, number> = {
  fill_blank: 1,
  predict: 2,
  spot_mistake: 3,
  order_steps: 3,
  code_editor: 4,
  explain: 5,
};

let non5 = 0;
let withDiff = 0;
let decreases = 0;
const rows: string[] = [];

for (const f of files) {
  const json = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
  const test = json.test ?? json.test?.questions ?? json.questions;
  if (!Array.isArray(test)) continue;
  if (test.length !== 5) non5++;
  const types: string[] = test.map((q: any) => q.type);
  if (test.some((q: any) => typeof q.difficulty === "number")) withDiff++;
  const scores = types.map((t) => typeDifficulty[t] ?? 3);
  let drop = false;
  for (let i = 1; i < scores.length; i++) if (scores[i] < scores[i - 1]) drop = true;
  if (drop) decreases++;
  rows.push(`${f.padEnd(48)} ${types.join(" > ")}${drop ? "   <-- not monotonic" : ""}`);
}

console.log(rows.join("\n"));
console.log(`\nfiles with a test: ${rows.length}`);
console.log(`banks that are not 5: ${non5}`);
console.log(`questions carrying an explicit difficulty field: ${withDiff}`);
console.log(`banks whose type-difficulty is not non-decreasing: ${decreases}`);
