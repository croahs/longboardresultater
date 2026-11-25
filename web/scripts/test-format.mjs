// Unit tests for src/format.ts (clock) and src/data.ts (median), transpiled directly with TypeScript.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const srcDir = fileURLToPath(new URL("../src/", import.meta.url));
let english = false;
const langMock = {
  isEn: () => english,
  t: (no, en) => (english ? en : no),
};

function loadTs(relPath, deps) {
  const source = readFileSync(srcDir + relPath, "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021 },
  });
  const mod = { exports: {} };
  const req = (spec) => {
    if (spec in deps) return deps[spec];
    throw new Error(`Unexpected require: ${spec}`);
  };
  new Function("exports", "module", "require", outputText)(mod.exports, mod, req);
  return mod.exports;
}

const format = loadTs("format.ts", { "./lang": langMock });
const data = loadTs("data.ts", { "./format": format, "./lang": langMock });

// clock() edge cases in Norwegian (comma decimal)
english = false;
assert.equal(format.clock(null), "–");
assert.equal(format.clock(undefined), "–");
assert.equal(format.clock(Number.NaN), "–");
assert.equal(format.clock(0), "0,00");
assert.equal(format.clock(-0.001), "0,00");
assert.equal(format.clock(17.3), "17,30");
assert.equal(format.clock(59.996), "1:00,00");
assert.equal(format.clock(69.5), "1:09,50");
assert.equal(format.clock(69.996), "1:10,00");
assert.equal(format.clock(119.996), "2:00,00");
assert.equal(format.clock(-69.996), "−1:10,00");

// clock() in English (dot decimal)
english = true;
assert.equal(format.clock(69.5), "1:09.50");
assert.equal(format.clock(69.996), "1:10.00");
assert.equal(format.clock(119.996), "2:00.00");

// median() edge cases
assert.ok(Number.isNaN(data.median([])));
assert.equal(data.median([5]), 5);
assert.equal(data.median([3, 1, 2]), 2);
assert.equal(data.median([1, 2, 3, 4]), 2.5);
assert.equal(data.median([-1, 1]), 0);
const orig = [10, 2, 8];
assert.equal(data.median(orig), 8);
assert.deepEqual(orig, [10, 2, 8], "median must not mutate input array");

console.log("web format & median tests passed");
