/**
 * fem.js
 * 1D Direct Stiffness Method (Finite Element Analysis) for Euler-Bernoulli Beams.
 * Computes exact 64-bit analytical solutions for displacements, slopes, support reactions,
 * shear force diagrams (SFD), bending moment diagrams (BMD), and deflection curves.
 */

import { MathUtils } from './math.js';

export class FemSolver {
    /**
     * Solves the beam model using the Direct Stiffness Method.
     * @param {BeamModel} model 
     * @returns {Object} Complete structural results package
     */
    static solve(model) {
        if (!model || model.length <= 0) {
            throw new Error("Beam length must be greater than zero.");
        }

        const L = model.length;
        const E = model.elasticity;
        const I = model.inertia;
        const EI = E * I;

        // 1. Gather all critical coordinates to define Nodes
        const coordSet = new Set([0.0, L]);
        for (const s of model.supports) coordSet.add(s.x);
        for (const p of model.pointLoads) coordSet.add(p.x);
        for (const d of model.distributedLoads) {
            coordSet.add(d.start);
            coordSet.add(Math.min(L, d.start + d.length));
        }

        const nodes = Array.from(coordSet).sort((a, b) => a - b);
        const numNodes = nodes.length;
        const numElements = numNodes - 1;
        const numDof = numNodes * 2;

        // 2. Build Elements
        const elements = [];
        for (let e = 0; e < numElements; e++) {
            const x1 = nodes[e];
            const x2 = nodes[e + 1];
            const Le = x2 - x1;
            elements.push({
                index: e,
                x1: x1,
                x2: x2,
                length: Le,
                dofs: [2 * e, 2 * e + 1, 2 * (e + 1), 2 * (e + 1) + 1]
            });
        }

        // 3. Initialize Global Matrices
        const K_global = Array.from({ length: numDof }, () => new Float64Array(numDof));
        const F_global = new Float64Array(numDof);
        const F_fixed_end_total = new Float64Array(numDof);

        // 4. Assemble Element Stiffness Matrices & Equivalent Load Vectors
        for (const elem of elements) {
            const Le = elem.length;
            const k11 = (12 * EI) / Math.pow(Le, 3);
            const k12 = (6 * EI) / Math.pow(Le, 2);
            const k22 = (4 * EI) / Le;
            const k24 = (2 * EI) / Le;

            const ke = [
                [ k11,  k12, -k11,  k12],
                [ k12,  k22, -k12,  k24],
                [-k11, -k12,  k11, -k12],
                [ k12,  k24, -k12,  k22]
            ];

            elem.ke = ke;

            // Assemble into Global K
            for (let i = 0; i < 4; i++) {
                for (let j = 0; j < 4; j++) {
                    K_global[elem.dofs[i]][elem.dofs[j]] += ke[i][j];
                }
            }

            // Equivalent load vector for distributed loads on this element
            // (Downward load q > 0 produces downward fixed-end forces)
            for (const dl of model.distributedLoads) {
                const dStart = dl.start;
                const dEnd = dl.start + dl.length;
                if (dStart <= elem.x1 + 1e-5 && dEnd >= elem.x2 - 1e-5) {
                    const q = dl.magnitude;
                    // Standard equivalent fixed-end forces:
                    // F1_y = -q*L/2, M1 = -q*L^2/12, F2_y = -q*L/2, M2 = +q*L^2/12
                    const fe1 = -q * Le / 2.0;
                    const me1 = -q * Math.pow(Le, 2) / 12.0;
                    const fe2 = -q * Le / 2.0;
                    const me2 =  q * Math.pow(Le, 2) / 12.0;

                    F_global[elem.dofs[0]] += fe1;
                    F_global[elem.dofs[1]] += me1;
                    F_global[elem.dofs[2]] += fe2;
                    F_global[elem.dofs[3]] += me2;

                    F_fixed_end_total[elem.dofs[0]] += fe1;
                    F_fixed_end_total[elem.dofs[1]] += me1;
                    F_fixed_end_total[elem.dofs[2]] += fe2;
                    F_fixed_end_total[elem.dofs[3]] += me2;
                }
            }
        }

        // Apply Concentrated Point Loads directly at nodes
        for (const pl of model.pointLoads) {
            const nodeIdx = nodes.findIndex(x => Math.abs(x - pl.x) < 1e-4);
            if (nodeIdx >= 0) {
                F_global[2 * nodeIdx] -= pl.magnitude; // downward concentrated load
            }
        }

        // 5. Kinematic Boundary Conditions
        const isConstrained = new Array(numDof).fill(false);
        for (const s of model.supports) {
            const nodeIdx = nodes.findIndex(x => Math.abs(x - s.x) < 1e-4);
            if (nodeIdx >= 0) {
                if (s.type === 'Fixed') {
                    isConstrained[2 * nodeIdx] = true;     // v = 0
                    isConstrained[2 * nodeIdx + 1] = true; // theta = 0
                } else if (s.type === 'Hinged' || s.type === 'Roller') {
                    isConstrained[2 * nodeIdx] = true;     // v = 0 (theta free)
                }
            }
        }

        // Partition active degrees of freedom
        const freeDofs = [];
        const fixedDofs = [];
        for (let i = 0; i < numDof; i++) {
            if (!isConstrained[i]) freeDofs.push(i);
            else fixedDofs.push(i);
        }

        if (freeDofs.length === numDof) {
            throw new Error("Structure is unsupported and unstable.");
        }

        const numFree = freeDofs.length;
        const Kff = Array.from({ length: numFree }, () => new Float64Array(numFree));
        const Ff = new Float64Array(numFree);

        for (let i = 0; i < numFree; i++) {
            Ff[i] = F_global[freeDofs[i]];
            for (let j = 0; j < numFree; j++) {
                Kff[i][j] = K_global[freeDofs[i]][freeDofs[j]];
            }
        }

        // 6. Solve reduced system Kff * Uf = Ff
        let Uf;
        try {
            Uf = MathUtils.solveLinearSystem(Kff, Ff);
        } catch (err) {
            throw new Error("Unable to solve beam: structure contains unstable kinematic degrees of freedom.");
        }

        const U_global = new Float64Array(numDof);
        for (let i = 0; i < numFree; i++) {
            U_global[freeDofs[i]] = Uf[i];
        }

        // 7. Calculate Reactions: R = K * U - F_applied_and_fixed_end
        const Reactions = new Float64Array(numDof);
        for (let i = 0; i < numDof; i++) {
            let ku = 0;
            for (let j = 0; j < numDof; j++) {
                ku += K_global[i][j] * U_global[j];
            }
            Reactions[i] = ku - F_global[i];
        }

        // Format Support Reactions
        const supportReactions = [];
        for (const s of model.supports) {
            const nodeIdx = nodes.findIndex(x => Math.abs(x - s.x) < 1e-4);
            const Ry = Reactions[2 * nodeIdx];
            const M = (s.type === 'Fixed') ? Reactions[2 * nodeIdx + 1] : 0.0;
            supportReactions.push({
                supportId: s.id,
                type: s.type,
                x: s.x,
                Ry: Ry,
                M: M
            });
        }

        // 8. Compute Element Displacements and Internal Force Functions
        for (const elem of elements) {
            const ue = [
                U_global[elem.dofs[0]],
                U_global[elem.dofs[1]],
                U_global[elem.dofs[2]],
                U_global[elem.dofs[3]]
            ];
            elem.ue = ue;
        }

        // 9. Continuous High-Resolution Sampling for Diagrams (600 points) + Exact Nodes
        const sampleXs = new Set();
        const numSamples = 600;
        const dx = L / numSamples;
        for (let i = 0; i <= numSamples; i++) {
            sampleXs.add(Math.min(L, i * dx));
        }
        for (const n of nodes) {
            sampleXs.add(n);
        }
        
        let sortedX = Array.from(sampleXs).sort((a, b) => a - b);
        let uniqueX = [sortedX[0]];
        for (let i = 1; i < sortedX.length; i++) {
            if (sortedX[i] - uniqueX[uniqueX.length - 1] > 1e-6) {
                uniqueX.push(sortedX[i]);
            }
        }

        const samples = [];
        let maxV = -Infinity, minV = Infinity;
        let maxM = -Infinity, minM = Infinity;
        let maxDeflection = 0;

        for (const x of uniqueX) {
            // Find which element contains x
            let elem = elements.find(e => x >= e.x1 - 1e-6 && x <= e.x2 + 1e-6);
            if (!elem) elem = elements[elements.length - 1];

            const Le = elem.length;
            const xi = Math.max(0, Math.min(1, (x - elem.x1) / Le));

            // Hermite shape functions for displacement v(xi)
            const N1 = 1 - 3 * xi * xi + 2 * Math.pow(xi, 3);
            const N2 = Le * (xi - 2 * xi * xi + Math.pow(xi, 3));
            const N3 = 3 * xi * xi - 2 * Math.pow(xi, 3);
            const N4 = Le * (-xi * xi + Math.pow(xi, 3));

            const v = N1 * elem.ue[0] + N2 * elem.ue[1] + N3 * elem.ue[2] + N4 * elem.ue[3];

            // 1st derivative for slope theta(xi) = dv/dx = (1/Le) * dN/dxi
            const dN1 = (-6 * xi + 6 * xi * xi) / Le;
            const dN2 = 1 - 4 * xi + 3 * xi * xi;
            const dN3 = (6 * xi - 6 * xi * xi) / Le;
            const dN4 = -2 * xi + 3 * xi * xi;

            const theta = dN1 * elem.ue[0] + dN2 * elem.ue[1] + dN3 * elem.ue[2] + dN4 * elem.ue[3];

            // Internal Bending Moment M(x) & Shear Force V(x) via Static Cut Method from x=0
            let Vx = 0;
            let Mx = 0;

            for (const sr of supportReactions) {
                if (sr.x < x + 1e-6) {
                    Vx += sr.Ry;
                    Mx += sr.Ry * (x - sr.x);
                    if (sr.type === 'Fixed') {
                        Mx -= sr.M; // Correct static cut sign for CCW reaction moment
                    }
                }
            }

            for (const pl of model.pointLoads) {
                if (pl.x < x + 1e-6) {
                    Vx -= pl.magnitude;
                    Mx -= pl.magnitude * (x - pl.x);
                }
            }

            for (const dl of model.distributedLoads) {
                const dStart = dl.start;
                const dEnd = dl.start + dl.length;
                if (x > dStart) {
                    const loadedSpan = Math.min(x, dEnd) - dStart;
                    if (loadedSpan > 0) {
                        const w = dl.magnitude * loadedSpan;
                        const arm = x - (dStart + loadedSpan / 2.0);
                        Vx -= w;
                        Mx -= w * arm;
                    }
                }
            }

            if (Vx > maxV) maxV = Vx;
            if (Vx < minV) minV = Vx;
            if (Mx > maxM) maxM = Mx;
            if (Mx < minM) minM = Mx;
            if (Math.abs(v) > Math.abs(maxDeflection)) maxDeflection = v;

            samples.push({
                x: x,
                v: v,
                theta: theta,
                V: Vx,
                M: Math.abs(Mx) < 1e-10 ? 0 : Mx // Clean up near-zero moments
            });
        }

        // Static Equilibrium Check
        let totalReactionFy = 0;
        for (const sr of supportReactions) totalReactionFy += sr.Ry;

        let totalAppliedFy = 0;
        for (const pl of model.pointLoads) totalAppliedFy += pl.magnitude;
        for (const dl of model.distributedLoads) totalAppliedFy += dl.magnitude * dl.length;

        const equilibriumError = Math.abs(totalAppliedFy - totalReactionFy);

        return {
            nodes: nodes,
            elements: elements,
            K_global: K_global,
            F_global: F_global,
            Kff: Kff,
            Ff: Ff,
            freeDofs: freeDofs,
            fixedDofs: fixedDofs,
            U_global: U_global,
            supportReactions: supportReactions,
            samples: samples,
            summary: {
                totalAppliedFy: totalAppliedFy,
                totalReactionFy: totalReactionFy,
                equilibriumError: equilibriumError,
                isEquilibriumPass: equilibriumError < 1e-3,
                maxV: maxV,
                minV: minV,
                maxM: maxM,
                minM: minM,
                maxDeflectionMm: maxDeflection * 1000, // in mm
                deflectionLimitL250: (L / 250) * 1000,
                deflectionLimitL350: (L / 350) * 1000
            }
        };
    }
}
