/**
 * directMethod.js
 * Solves statically determinate beams using classical Equations of Equilibrium (Statics):
 * ΣFy = 0, ΣM = 0, and explicit piecewise shear & moment equations with step-by-step derivations.
 */

export class DirectEquilibriumSolver {
    static generateReport(model, femResults) {
        if (!model || model.supports.length === 0) return null;

        const supports = model.supports;
        const pLoads = model.pointLoads;
        const dLoads = model.distributedLoads;

        let html = '<div class="calc-section">';
        html += '<h3>1. Structural Statics & Equilibrium Analysis (Step-by-Step)</h3>';
        html += '<p class="calc-desc">Because the degree of static indeterminacy is <strong>\\(D_s = 0\\)</strong>, all reactions and internal force distributions are determined directly from static equilibrium equations without requiring material deformation compatibility.</p>';

        // 1. Identify Applied Loads
        html += '<h4>Step 1: Identify All Applied Loads</h4>';
        html += '<ul class="calc-eq-list">';
        let totalAppliedFy = 0;
        let appliedLoadTerms = [];
        let appliedMomentTermsA = []; // Moments around supports[0].x

        if (pLoads.length === 0 && dLoads.length === 0) {
            html += '<li>No applied loads.</li>';
        }

        for (const pl of pLoads) {
            html += `<li>Point Load: \\(P = ${pl.magnitude.toFixed(3)}\\text{ kN}\\) at \\(x = ${pl.x.toFixed(3)}\\text{ m}\\)</li>`;
            totalAppliedFy += pl.magnitude;
            appliedLoadTerms.push(`${pl.magnitude.toFixed(3)}`);
        }

        for (const dl of dLoads) {
            const F_eq = dl.magnitude * dl.length;
            const x_c = dl.start + dl.length / 2;
            html += `<li>Uniform Distributed Load (UDL): \\(q = ${dl.magnitude.toFixed(3)}\\text{ kN/m}\\) from \\(x = ${dl.start.toFixed(3)}\\text{ m}\\) to \\(${dl.start + dl.length.toFixed(3)}\\text{ m}\\)<br>`;
            html += `&nbsp;&nbsp;&nbsp;&nbsp;\\(\\rightarrow\\) Equivalent Point Load: \\(W = ${dl.magnitude.toFixed(3)} \\times ${dl.length.toFixed(3)} = ${F_eq.toFixed(3)}\\text{ kN}\\) acting at centroid \\(x = ${x_c.toFixed(3)}\\text{ m}\\)</li>`;
            totalAppliedFy += F_eq;
            appliedLoadTerms.push(`${dl.magnitude.toFixed(3)} \\times ${dl.length.toFixed(3)}`);
        }
        html += `<li><strong>Total downward applied force:</strong> \\(\\sum F_{\\text{applied}} = ${totalAppliedFy.toFixed(3)}\\text{ kN}\\)</li>`;
        html += '</ul>';

        // 2. Solve Equilibrium Equations
        html += '<h4>Step 2: Solve Global Equilibrium Equations</h4>';
        html += '<div class="calc-box">';
        
        if (supports.length === 1 && supports[0].type === 'Fixed') {
            const s = supports[0];
            const sr = femResults.supportReactions.find(r => r.supportId === s.id);
            html += `<p><strong>Support Condition:</strong> Cantilever beam with a Fixed support at \\(x = ${s.x.toFixed(3)}\\text{ m}\\).</p>`;
            
            // Fy
            html += `<p><strong>1. Vertical Force Equilibrium (\\(\\sum F_y = 0\\)):</strong></p>`;
            html += `<div class="latex-eq">\\[ R_{y} - \\sum F_{\\text{applied}} = 0 \\]</div>`;
            if (appliedLoadTerms.length > 0) {
                html += `<div class="latex-eq">\\[ R_{y} - (${appliedLoadTerms.join(' + ')}) = 0 \\]</div>`;
            }
            html += `<div class="latex-eq">\\[ R_{y} = ${totalAppliedFy.toFixed(3)}\\text{ kN} \\]</div>`;
            
            // Moment
            html += `<p><strong>2. Rotational Equilibrium about \\(x = ${s.x.toFixed(3)}\\text{ m}\\) (\\(\\sum M = 0\\)):</strong></p>`;
            let momentTerms = [];
            let totalMoment = 0;
            for (const pl of pLoads) {
                const arm = pl.x - s.x;
                momentTerms.push(`(${pl.magnitude.toFixed(3)} \\times ${arm.toFixed(3)})`);
                totalMoment += pl.magnitude * arm;
            }
            for (const dl of dLoads) {
                const F_eq = dl.magnitude * dl.length;
                const x_c = dl.start + dl.length / 2;
                const arm = x_c - s.x;
                momentTerms.push(`(${F_eq.toFixed(3)} \\times ${arm.toFixed(3)})`);
                totalMoment += F_eq * arm;
            }
            
            html += `<div class="latex-eq">\\[ M_{r} - \\sum (F_i \\cdot d_i) = 0 \\]</div>`;
            if (momentTerms.length > 0) {
                html += `<div class="latex-eq">\\[ M_{r} - [${momentTerms.join(' + ')}] = 0 \\]</div>`;
            }
            html += `<div class="latex-eq">\\[ M_{r} = ${totalMoment.toFixed(3)}\\text{ kN\\cdot m} \\]</div>`;
            
        } else if (supports.length === 2) {
            const sA = supports[0];
            const sB = supports[1];
            const srA = femResults.supportReactions.find(r => r.supportId === sA.id);
            const srB = femResults.supportReactions.find(r => r.supportId === sB.id);
            const L_AB = sB.x - sA.x;
            
            html += `<p><strong>Support Condition:</strong> Supported at A (\\(x_A = ${sA.x.toFixed(3)}\\text{ m}\\)) and B (\\(x_B = ${sB.x.toFixed(3)}\\text{ m}\\)).</p>`;
            
            // Moment about A
            html += `<p><strong>1. Rotational Equilibrium about Support A (\\(\\sum M_A = 0\\)):</strong></p>`;
            html += `<div class="latex-eq">\\[ R_{y,B} \\cdot (${L_AB.toFixed(3)}) - \\sum (F_i \\cdot d_{i,A}) = 0 \\]</div>`;
            
            let momentTermsA = [];
            let totalMomentA = 0;
            for (const pl of pLoads) {
                const arm = pl.x - sA.x;
                momentTermsA.push(`(${pl.magnitude.toFixed(3)} \\times ${arm.toFixed(3)})`);
                totalMomentA += pl.magnitude * arm;
            }
            for (const dl of dLoads) {
                const F_eq = dl.magnitude * dl.length;
                const x_c = dl.start + dl.length / 2;
                const arm = x_c - sA.x;
                momentTermsA.push(`(${F_eq.toFixed(3)} \\times ${arm.toFixed(3)})`);
                totalMomentA += F_eq * arm;
            }
            
            if (momentTermsA.length > 0) {
                html += `<div class="latex-eq">\\[ R_{y,B} \\cdot ${L_AB.toFixed(3)} - [${momentTermsA.join(' + ')}] = 0 \\]</div>`;
                html += `<div class="latex-eq">\\[ R_{y,B} = \\frac{${totalMomentA.toFixed(3)}}{${L_AB.toFixed(3)}} = ${(totalMomentA / L_AB).toFixed(3)}\\text{ kN} \\]</div>`;
            } else {
                html += `<div class="latex-eq">\\[ R_{y,B} = 0\\text{ kN} \\]</div>`;
            }

            // Fy
            html += `<p><strong>2. Vertical Force Equilibrium (\\(\\sum F_y = 0\\)):</strong></p>`;
            html += `<div class="latex-eq">\\[ R_{y,A} + R_{y,B} - \\sum F_{\\text{applied}} = 0 \\]</div>`;
            if (appliedLoadTerms.length > 0) {
                html += `<div class="latex-eq">\\[ R_{y,A} + ${(totalMomentA / L_AB).toFixed(3)} - (${totalAppliedFy.toFixed(3)}) = 0 \\]</div>`;
                html += `<div class="latex-eq">\\[ R_{y,A} = ${totalAppliedFy.toFixed(3)} - ${(totalMomentA / L_AB).toFixed(3)} = ${(totalAppliedFy - (totalMomentA / L_AB)).toFixed(3)}\\text{ kN} \\]</div>`;
            } else {
                html += `<div class="latex-eq">\\[ R_{y,A} = 0\\text{ kN} \\]</div>`;
            }
        }
        html += '</div>';

        // 3. Piecewise Shear & Moment Functions
        html += '<h4>Step 3: Piecewise Shear and Moment Equations</h4>';
        html += '<details style="margin-bottom: 15px;">';
        html += '<summary style="cursor: pointer; font-weight: 600; color: #005a9e; padding: 5px 0;">Show piecewise equation derivations</summary>';
        html += '<div class="calc-segments" style="margin-top: 10px;">';
        
        const nodes = femResults.nodes;
        for (let i = 0; i < nodes.length - 1; i++) {
            const x1 = nodes[i];
            const x2 = nodes[i + 1];
            
            // Calculate expressions for this segment
            let V_expr = "";
            let V_val = 0; // constant part of V
            let q_val = 0; // x-dependent part of V
            
            // Gather constant forces to the left of x1+eps
            let leftForces = [];
            let currentV = 0;
            
            for (const sr of femResults.supportReactions) {
                if (sr.x <= x1 + 1e-4) {
                    leftForces.push(`+ ${sr.Ry.toFixed(3)} (R_{${sr.supportId}})`);
                    currentV += sr.Ry;
                }
            }
            for (const pl of pLoads) {
                if (pl.x <= x1 + 1e-4) {
                    leftForces.push(`- ${pl.magnitude.toFixed(3)} (P)`);
                    currentV -= pl.magnitude;
                }
            }
            
            let dlExprV = "";
            let dlExprM = "";
            // Add distributed loads affecting this segment
            for (const dl of dLoads) {
                if (dl.start <= x1 + 1e-4 && (dl.start + dl.length) > x1 + 1e-4) {
                    dlExprV = `- ${dl.magnitude.toFixed(3)}(x - ${dl.start.toFixed(3)})`;
                    dlExprM = `- \\frac{${dl.magnitude.toFixed(3)}}{2}(x - ${dl.start.toFixed(3)})^2`;
                } else if ((dl.start + dl.length) <= x1 + 1e-4) {
                    // Fully to the left
                    const F_eq = dl.magnitude * dl.length;
                    leftForces.push(`- ${F_eq.toFixed(3)} (UDL)`);
                    currentV -= F_eq;
                }
            }

            if (leftForces.length === 0) leftForces.push("0");
            
            html += `<div class="segment-card">
                <h5>Segment ${i + 1} (\\(${x1.toFixed(3)}\\text{ m} < x < ${x2.toFixed(3)}\\text{ m}\\)):</h5>
                <p><strong>Shear Force \\(V(x)\\):</strong></p>
                <div class="latex-eq">\\[ V(x) = \\sum F_{y,\\text{left}} = ${currentV.toFixed(3)} ${dlExprV} \\]</div>
                <p><strong>Bending Moment \\(M(x)\\):</strong></p>
                <p>\\(M(x) = \\int V(x) dx\\)</p>
            </div>`;
        }
        html += '</div></details>';

        html += '</div>';
        return html;
    }
}
