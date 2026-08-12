/**
 * determinacy.js
 * Evaluates the degree of static and kinematic indeterminacy of the beam,
 * verifies structural stability (kinematic mechanism checks),
 * and decides which structural analysis methods are available in the Calculations dialog.
 */

export class DeterminacyEvaluator {
    /**
     * Analyzes beam stability and static determinacy.
     * @param {BeamModel} model 
     * @returns {Object} Determinacy analysis result
     */
    static evaluate(model) {
        if (!model || model.length <= 0) {
            return {
                isSolvable: false,
                reason: "No beam geometry defined.",
                degreeOfIndeterminacy: 0,
                numReactions: 0,
                methods: {
                    matrixStiffness: false,
                    directEquilibrium: false,
                    threeMoment: false,
                    fixedEndMoments: false,
                    deflectionIntegration: false
                },
                methodTooltips: {}
            };
        }

        const supports = model.supports || [];
        if (supports.length === 0) {
            return {
                isSolvable: false,
                reason: "No supports defined. Beam is an unconstrained free body.",
                degreeOfIndeterminacy: 0,
                numReactions: 0,
                methods: {
                    matrixStiffness: false,
                    directEquilibrium: false,
                    threeMoment: false,
                    fixedEndMoments: false,
                    deflectionIntegration: false
                },
                methodTooltips: {}
            };
        }

        // Count reaction components in 2D vertical bending plane:
        // Fixed support = 2 reactions (Vertical Force Ry + Moment M)
        // Hinged support = 1 reaction (Vertical Force Ry, rotation free)
        // Roller support = 1 reaction (Vertical Force Ry, rotation free)
        let numReactions = 0;
        let hasFixed = false;
        let numVerticalRestraints = 0;

        for (const s of supports) {
            if (s.type === 'Fixed') {
                numReactions += 2;
                hasFixed = true;
                numVerticalRestraints++;
            } else if (s.type === 'Hinged' || s.type === 'Roller') {
                numReactions += 1;
                numVerticalRestraints++;
            }
        }

        // Equilibrium equations available in 2D beam bending: 2 (Sum Fy = 0, Sum M = 0)
        const eqEquations = 2;
        const Ds = numReactions - eqEquations; // Degree of static indeterminacy

        // Stability checks:
        // 1. A single fixed support provides 2 reactions (restrains translation and rotation) -> Statically Determinate (Cantilever, Ds = 0).
        // 2. Hinged/Roller supports provide only 1 reaction each. A single Hinged or Roller support allows rigid body rotation -> UNSTABLE MECHANISM.
        // 3. At least 2 vertical supports (or 1 fixed support) are required to prevent rigid body motion.
        let isStable = false;
        let stabilityReason = "";

        if (hasFixed) {
            isStable = true;
        } else if (numVerticalRestraints >= 2) {
            // Check if they are at distinct coordinates
            const uniqueCoords = new Set(supports.map(s => Math.round(s.x * 1000) / 1000));
            if (uniqueCoords.size >= 2) {
                isStable = true;
            } else {
                isStable = false;
                stabilityReason = "Multiple supports placed at the same position cannot prevent rigid body rotation.";
            }
        } else {
            isStable = false;
            stabilityReason = "Under-constrained structure: A single pinned or roller support allows unconstrained rigid body rotation (mechanism).";
        }

        if (!isStable) {
            return {
                isSolvable: false,
                reason: stabilityReason,
                degreeOfIndeterminacy: Ds,
                numReactions: numReactions,
                methods: {
                    matrixStiffness: false,
                    directEquilibrium: false,
                    threeMoment: false,
                    fixedEndMoments: false,
                    deflectionIntegration: false
                },
                methodTooltips: {}
            };
        }

        // If stable, evaluate which methods are applicable:
        // 1. Matrix Stiffness (FEM): Always applicable for any stable beam.
        const canMatrixStiffness = true;

        // 2. Direct Equilibrium (Statics): Applicable if statically determinate (Ds === 0).
        const canDirectEquilibrium = (Ds === 0);

        // 3. Three-Moment Equation (Clapeyron): Applicable for continuous beams with 2 or more spans between vertical supports.
        // Needs at least 3 distinct support positions or 2 spans.
        const supportPositions = Array.from(new Set(supports.map(s => s.x))).sort((a, b) => a - b);
        const canThreeMoment = (supportPositions.length >= 3) || (supportPositions.length >= 2 && hasFixed && Ds > 0);

        // 4. Fixed-End Moments / Moment Distribution: Applicable for indeterminate beams with fixed ends or multi-span continuous beams.
        const canFixedEnd = (Ds > 0 && (hasFixed || supportPositions.length >= 2));

        // 5. Deflection Integration (Macaulay / Direct Integration): Applicable for any stable beam.
        const canDeflectionIntegration = true;

        return {
            isSolvable: true,
            reason: Ds === 0 ? "Statically Determinate" : `Statically Indeterminate (Degree ${Ds})`,
            degreeOfIndeterminacy: Ds,
            numReactions: numReactions,
            methods: {
                matrixStiffness: canMatrixStiffness,
                directEquilibrium: canDirectEquilibrium,
                threeMoment: canThreeMoment,
                fixedEndMoments: canFixedEnd,
                deflectionIntegration: canDeflectionIntegration
            },
            methodTooltips: {
                matrixStiffness: "Direct Matrix Stiffness Formulation (FEM) - Universal for all stable beams",
                directEquilibrium: canDirectEquilibrium 
                    ? "Direct Equilibrium Method (Statics: ΣFy = 0, ΣM = 0)" 
                    : "Not applicable: Structure is statically indeterminate (Ds > 0)",
                threeMoment: canThreeMoment 
                    ? "Clapeyron's Three-Moment Equation for Continuous Beams" 
                    : "Not applicable: Requires a continuous beam with multiple spans",
                fixedEndMoments: canFixedEnd 
                    ? "Fixed-End Moments & Moment Distribution Method (Hardy Cross)" 
                    : "Not applicable: Structure is statically determinate or lacks continuous/fixed boundaries",
                deflectionIntegration: "Macaulay's Method / Differential Integration (EI v''(x) = M(x))"
            }
        };
    }
}
