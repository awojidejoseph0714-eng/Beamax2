/**
 * verify.js - Automated Test & Benchmark Suite
 * Tests FEM solver, BCB Parser, and Analytical Solvers against original Beamax calculations.
 */

import fs from 'fs';
import path from 'path';
import { BeamModel } from '../js/models/BeamModel.js';
import { FemSolver } from '../js/solver/fem.js';
import { DeterminacyEvaluator } from '../js/solver/determinacy.js';
import { BcbParser } from '../js/io/bcbParser.js';

console.log("==================================================================");
console.log("             BEAMAX VERIFICATION & ACCURACY TEST SUITE            ");
console.log("==================================================================\n");

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  [PASS] ${message}`);
        testsPassed++;
    } else {
        console.error(`  [FAIL] ${message}`);
        testsFailed++;
    }
}

// -------------------------------------------------------------
// Test 1: Determinacy & Stability Evaluator
// -------------------------------------------------------------
console.log("Test 1: Determinacy & Stability Evaluator");
const mUnstable = new BeamModel(8.0, 2.1e8, 8.36e-5);
mUnstable.addSupport('Hinged', 4.0); // single hinged support = unstable mechanism
const dUnstable = DeterminacyEvaluator.evaluate(mUnstable);
assert(!dUnstable.isSolvable, "Single hinged support correctly identified as unstable mechanism");

const mDeterminate = new BeamModel(8.0, 2.1e8, 8.36e-5);
mDeterminate.addSupport('Hinged', 0.0);
mDeterminate.addSupport('Roller', 8.0);
const dDeterminate = DeterminacyEvaluator.evaluate(mDeterminate);
assert(dDeterminate.isSolvable && dDeterminate.degreeOfIndeterminacy === 0, "Simply supported beam is solvable with Ds = 0");
assert(dDeterminate.methods.directEquilibrium === true, "Direct Statics method is ACTIVE for determinate beam");
assert(dDeterminate.methods.threeMoment === false, "Three Moments method is INACTIVE for single span");

// -------------------------------------------------------------
// Test 2: BEAM1.bcb Exact Analytical Verification
// -------------------------------------------------------------
console.log("\nTest 2: BEAM1.bcb Exact Finite Element Solution");
const beam1 = new BeamModel(8.0, 2.1e8, 8.36e-5);
beam1.addSupport('Fixed', 0.0);
beam1.addSupport('Roller', 4.0);
beam1.addSupport('Fixed', 8.0);
beam1.addDistributedLoad(0.0, 4.0, 24.0);

const res1 = FemSolver.solve(beam1);
const r1 = res1.supportReactions;

assert(Math.abs(r1[0].Ry - 54.0) < 1e-6, `Support 1 (Fixed @ 0m) Ry = 54.000 kN (Got ${r1[0].Ry.toFixed(3)})`);
assert(Math.abs(r1[0].M - 40.0) < 1e-6, `Support 1 (Fixed @ 0m) Mr = 40.000 kNm (Got ${r1[0].M.toFixed(3)})`);
assert(Math.abs(r1[1].Ry - 48.0) < 1e-6, `Support 2 (Roller @ 4m) Ry = 48.000 kN (Got ${r1[1].Ry.toFixed(3)})`);
assert(Math.abs(r1[2].Ry - (-6.0)) < 1e-6, `Support 3 (Fixed @ 8m) Ry = -6.000 kN (Got ${r1[2].Ry.toFixed(3)})`);
assert(Math.abs(r1[2].M - 8.0) < 1e-6, `Support 3 (Fixed @ 8m) Mr = 8.000 kNm (Got ${r1[2].M.toFixed(3)})`);
assert(res1.summary.isEquilibriumPass, "Static vertical force equilibrium ΣFy = 0 satisfied with 0.000 kN residual");

// -------------------------------------------------------------
// Test 3: Example.bcb Exact Analytical Verification
// -------------------------------------------------------------
console.log("\nTest 3: Example.bcb Exact Finite Element Solution");
const beamEx = new BeamModel(10.0, 2.1e8, 8.36e-5);
beamEx.addSupport('Fixed', 0.0);
beamEx.addSupport('Hinged', 8.0);
beamEx.addPointLoad(2.0, 1.0);
beamEx.addDistributedLoad(4.0, 4.0, 2.0);
beamEx.addPointLoad(10.0, 2.0);

const resEx = FemSolver.solve(beamEx);
const rEx = resEx.supportReactions;

assert(Math.abs(rEx[0].Ry - 3.039) < 1e-3, `Support 1 (Fixed @ 0m) Ry = 3.039 kN (Got ${rEx[0].Ry.toFixed(3)})`);
assert(Math.abs(rEx[0].M - 6.313) < 1e-3, `Support 1 (Fixed @ 0m) Mr = 6.313 kNm (Got ${rEx[0].M.toFixed(3)})`);
assert(Math.abs(rEx[1].Ry - 7.961) < 1e-3, `Support 2 (Hinged @ 8m) Ry = 7.961 kN (Got ${rEx[1].Ry.toFixed(3)})`);
assert(resEx.summary.isEquilibriumPass, "Static vertical force equilibrium ΣFy = 11.000 kN satisfied");

// -------------------------------------------------------------
// Test 4: Binary BCB Serialization & Deserialization
// -------------------------------------------------------------
console.log("\nTest 4: Binary .bcb Parser & Serializer Roundtrip");
const originalBuffer = fs.readFileSync('c:\\Users\\user\\Documents\\Beamax\\BEAM1.bcb');
const parsedFromDisk = BcbParser.parse(originalBuffer.buffer.slice(originalBuffer.byteOffset, originalBuffer.byteOffset + originalBuffer.byteLength));

assert(parsedFromDisk.length === 8.0, "Parsed beam length = 8.0m from disk .bcb");
assert(parsedFromDisk.supports.length === 3, "Parsed 3 supports from disk .bcb");
assert(parsedFromDisk.distributedLoads.length === 1, "Parsed 1 distributed load from disk .bcb");

// Serialize back and re-parse
const serializedBuffer = BcbParser.serialize(parsedFromDisk);
const reParsed = BcbParser.parse(serializedBuffer);
assert(reParsed.length === 8.0, "Re-parsed serialized buffer preserves length");
assert(reParsed.supports.length === 3, "Re-parsed serialized buffer preserves 3 supports");
assert(reParsed.distributedLoads.length === 1, "Re-parsed serialized buffer preserves distributed loads");

console.log("\n==================================================================");
console.log(`TOTAL TESTS: ${testsPassed + testsFailed} | PASSED: ${testsPassed} | FAILED: ${testsFailed}`);
console.log("==================================================================");

if (testsFailed > 0) process.exit(1);
