/**
 * deflectionMethod.js
 * Generates Macaulay's method / Direct Double Integration breakdown for beam deflection and slope.
 * Governing equation: EI * d^2v/dx^2 = M(x)
 */

export class DeflectionIntegrationSolver {
    static generateReport(model, femResults) {
        if (!model || !femResults) return null;

        const EI = model.flexuralRigidity || (model.elasticity * model.inertia);
        const L = model.length;

        let html = '<div class="calc-section">';
        html += '<h3>Macaulay\'s Direct Double Integration Method (Deflection & Slope)</h3>';
        html += '<p class="calc-desc">Derives the elastic deflection curve \\(v(x)\\) and slope curve \\(\\theta(x)\\) by integrating the Euler-Bernoulli bending moment differential equation with Macaulay singularity functions.</p>';

        html += '<h4>Step 1: Define Flexural Rigidity \\(EI\\)</h4>';
        html += '<div class="calc-box equation-box">';
        html += `<p>Beam Flexural Rigidity \\(EI = E \\times I = ${model.elasticity.toExponential(2)} \\text{ kN/m}^2 \\times ${model.inertia.toExponential(2)} \\text{ m}^4 = \\mathbf{${EI.toFixed(3)} \\text{ kN}\\cdot\\text{m}^2}\\)</p>`;
        html += '</div>';

        html += '<h4>Step 2: Construct Macaulay\'s Moment Equation \\(M(x)\\)</h4>';
        html += '<details style="margin-bottom: 15px;">';
        html += '<summary style="cursor: pointer; font-weight: 600; color: #005a9e; padding: 5px 0;">Show derivation</summary>';
        html += '<div class="calc-box" style="margin-top: 10px;">';
        
        let mTerms = [];
        // Support reactions
        for (const sr of femResults.supportReactions) {
            if (sr.Ry !== 0) {
                if (sr.x === 0) mTerms.push(`${sr.Ry.toFixed(3)} x`);
                else mTerms.push(`${sr.Ry > 0 ? '+' : ''}${sr.Ry.toFixed(3)} \\langle x - ${sr.x.toFixed(3)} \\rangle^1`);
            }
            if (sr.M !== 0) {
                if (sr.x === 0) mTerms.push(`${sr.M > 0 ? '+' : ''}${sr.M.toFixed(3)}`);
                else mTerms.push(`${sr.M > 0 ? '+' : ''}${sr.M.toFixed(3)} \\langle x - ${sr.x.toFixed(3)} \\rangle^0`);
            }
        }
        // Point Loads
        for (const pl of model.pointLoads) {
            if (pl.x === 0) mTerms.push(`-${pl.magnitude.toFixed(3)} x`);
            else mTerms.push(`-${pl.magnitude.toFixed(3)} \\langle x - ${pl.x.toFixed(3)} \\rangle^1`);
        }
        // UDLs
        for (const dl of model.distributedLoads) {
            const q_half = (dl.magnitude / 2).toFixed(3);
            if (dl.start === 0) mTerms.push(`-${q_half} x^2`);
            else mTerms.push(`-${q_half} \\langle x - ${dl.start.toFixed(3)} \\rangle^2`);
            
            // If it doesn't reach the end, we must negate it
            const end = dl.start + dl.length;
            if (end < L) {
                mTerms.push(`+${q_half} \\langle x - ${end.toFixed(3)} \\rangle^2`);
            }
        }

        if (mTerms.length === 0) mTerms.push("0");
        
        html += `<div class="latex-eq">\\[ M(x) = ${mTerms.join(' ')} \\]</div>`;
        html += `<p class="eq-legend">Note: \\(\\langle x - a \\rangle^n = 0\\) for \\(x < a\\), and \\((x - a)^n\\) for \\(x \\ge a\\).</p>`;
        html += '</div></details>';

        html += '<h4>Step 3: Double Integration for Slope and Deflection</h4>';
        html += '<details style="margin-bottom: 15px;">';
        html += '<summary style="cursor: pointer; font-weight: 600; color: #005a9e; padding: 5px 0;">Show integrations</summary>';
        html += '<div class="calc-box" style="margin-top: 10px;">';
        html += `<div class="latex-eq">\\[ EI \\frac{d^2v}{dx^2} = M(x) \\]</div>`;
        
        // Integrate for Slope
        let slopeTerms = mTerms.map(term => {
            if (term.includes('x^2')) return term.replace('x^2', '(x^3 / 3)');
            if (term.includes('\\langle x')) {
                // regex replace power
                return term.replace(/\\langle x - ([\d.]+)\s*\\rangle\^(\d)/, (match, a, n) => {
                    const newN = parseInt(n) + 1;
                    return `\\frac{1}{${newN}} \\langle x - ${a} \\rangle^${newN}`;
                });
            }
            if (term.includes('x')) return term.replace('x', '(x^2 / 2)');
            // Constant term
            return term + " x";
        });
        
        html += `<p><strong>1st Integration (Slope \\(\\theta\\)):</strong></p>`;
        html += `<div class="latex-eq">\\[ EI \\theta(x) = \\int M(x) dx = ${slopeTerms.join(' ')} + C_1 \\]</div>`;
        
        // Integrate for Deflection
        let deflTerms = slopeTerms.map(term => {
            // Very basic symbolic integration representation for display
            if (term.includes('x^3 / 3')) return term.replace('x^3 / 3', '(x^4 / 12)');
            if (term.includes('x^2 / 2')) return term.replace('x^2 / 2', '(x^3 / 6)');
            if (term.match(/x$/)) return term.replace(/x$/, '(x^2 / 2)');
            if (term.includes('\\langle x')) {
                return term.replace(/\\frac{1}{(\d+)}\s*\\langle x - ([\d.]+)\s*\\rangle\^(\d)/, (match, d, a, n) => {
                    const newN = parseInt(n) + 1;
                    const denom = parseInt(d) * newN;
                    return `\\frac{1}{${denom}} \\langle x - ${a} \\rangle^${newN}`;
                });
            }
            return term;
        });

        html += `<p><strong>2nd Integration (Deflection \\(v\\)):</strong></p>`;
        html += `<div class="latex-eq">\\[ EI v(x) = \\iint M(x) dx^2 = ${deflTerms.join(' ')} + C_1 x + C_2 \\]</div>`;
        html += '</div></details>';

        html += '<h4>Step 4: Apply Boundary Conditions</h4>';
        html += '<ul class="calc-eq-list">';
        for (const s of model.supports) {
            if (s.type === 'Fixed') {
                html += `<li>At fixed support \\(x = ${s.x.toFixed(3)}\\text{ m}\\): Deflection \\(v(${s.x.toFixed(3)}) = 0\\) and Slope \\(\\theta(${s.x.toFixed(3)}) = 0\\)</li>`;
            } else {
                html += `<li>At ${s.type.toLowerCase()} support \\(x = ${s.x.toFixed(3)}\\text{ m}\\): Deflection \\(v(${s.x.toFixed(3)}) = 0\\)</li>`;
            }
        }
        html += '<li>Substitute these into the equations to solve for \\(C_1\\) and \\(C_2\\).</li>';
        html += '</ul>';

        html += '<h4>Step 5: Deflection Values & Serviceability Check</h4>';
        html += '<table class="calc-results-table"><thead><tr><th>Check Parameter</th><th>Calculated Value</th><th>Allowable Limit</th><th>Compliance Status</th></tr></thead><tbody>';

        const maxDeflectionMm = Math.abs(femResults.summary.maxDeflectionMm);
        const limitL250 = femResults.summary.deflectionLimitL250;
        const limitL350 = femResults.summary.deflectionLimitL350;
        const passL250 = maxDeflectionMm <= limitL250;
        const passL350 = maxDeflectionMm <= limitL350;

        html += `<tr>
            <td><strong>Maximum Span Deflection \\(|v_{\\max}|\\)</strong></td>
            <td><strong>${maxDeflectionMm.toFixed(4)} mm</strong></td>
            <td>—</td>
            <td>—</td>
        </tr>
        <tr>
            <td>Standard Floor / Total Load Limit (\\(L/250\\))</td>
            <td>${maxDeflectionMm.toFixed(4)} mm</td>
            <td>${limitL250.toFixed(3)} mm</td>
            <td><span class="status-tag ${passL250 ? 'pass' : 'fail'}">${passL250 ? 'PASSED (OK)' : 'EXCEEDED'}</span></td>
        </tr>
        <tr>
            <td>Roof / Sensitive Finishes Limit (\\(L/350\\))</td>
            <td>${maxDeflectionMm.toFixed(4)} mm</td>
            <td>${limitL350.toFixed(3)} mm</td>
            <td><span class="status-tag ${passL350 ? 'pass' : 'fail'}">${passL350 ? 'PASSED (OK)' : 'EXCEEDED'}</span></td>
        </tr>`;

        html += '</tbody></table>';

        html += '</div>';
        return html;
    }
}
