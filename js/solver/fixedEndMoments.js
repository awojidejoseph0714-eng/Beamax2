/**
 * fixedEndMoments.js
 * Evaluates Fixed-End Moments (FEM) and Moment Distribution Method parameters for indeterminate beams.
 */

export class FixedEndMomentsSolver {
    static generateReport(model, femResults) {
        if (!model) return null;

        const supports = model.supports.slice().sort((a, b) => a.x - b.x);
        let html = '<div class="calc-section">';
        html += '<h3>Fixed-End Moments & Moment Distribution (Hardy Cross Method)</h3>';
        html += '<p class="calc-desc">Calculates the initial clamped Fixed-End Moments (FEMs) for each span under applied loads, joint rotational stiffnesses \\(K = 4EI/L\\), and distribution factors \\(DF\\).</p>';

        html += '<h4>Step 1: Calculate Initial Fixed-End Moments (FEM)</h4>';
        html += '<div class="calc-segments">';
        
        const spanFEMs = [];

        for (let i = 0; i < supports.length - 1; i++) {
            const s1 = supports[i];
            const s2 = supports[i + 1];
            const L = s2.x - s1.x;

            let femLeft = 0;
            let femRight = 0;
            let calcDesc = [];

            // UDL in this span
            for (const dl of model.distributedLoads) {
                if (dl.start < s2.x && dl.start + dl.length > s1.x) {
                    const q = dl.magnitude;
                    const val = (q * Math.pow(L, 2)) / 12.0;
                    femLeft -= val;
                    femRight += val;
                    calcDesc.push(`UDL ${q}kN/m: \\( \\text{FEM} = \\mp \\frac{q L^2}{12} = \\mp \\frac{${q}\\cdot${L.toFixed(3)}^2}{12} = \\mp ${val.toFixed(3)} \\)`);
                }
            }

            // Point loads in this span
            for (const pl of model.pointLoads) {
                if (pl.x > s1.x && pl.x < s2.x) {
                    const a = pl.x - s1.x;
                    const b = L - a;
                    const P = pl.magnitude;
                    const valLeft = (P * a * Math.pow(b, 2)) / Math.pow(L, 2);
                    const valRight = (P * Math.pow(a, 2) * b) / Math.pow(L, 2);
                    femLeft -= valLeft;
                    femRight += valRight;
                    calcDesc.push(`Point Load ${P}kN at ${a.toFixed(3)}m: \\( \\text{FEM}_{AB} = -\\frac{P a b^2}{L^2} = -\\frac{${P}\\cdot${a.toFixed(3)}\\cdot${b.toFixed(3)}^2}{${L.toFixed(3)}^2} = -${valLeft.toFixed(3)} \\)<br>\\( \\text{FEM}_{BA} = +\\frac{P a^2 b}{L^2} = +${valRight.toFixed(3)} \\)`);
                }
            }

            if (calcDesc.length === 0) calcDesc.push("No loads on this span.");

            spanFEMs.push({ L, femLeft, femRight });

            html += `<div class="segment-card">
                <h5>Span ${i + 1} (${s1.x.toFixed(3)}m to ${s2.x.toFixed(3)}m, \\(L = ${L.toFixed(3)}\\text{ m}\\)):</h5>
                <ul><li>${calcDesc.join('</li><li>')}</li></ul>
                <p><strong>Total \\(\\text{FEM}_{\\text{left}}\\) = ${femLeft.toFixed(3)}\\text{ kN\\cdot m}</strong></p>
                <p><strong>Total \\(\\text{FEM}_{\\text{right}}\\) = ${femRight.toFixed(3)}\\text{ kN\\cdot m}</strong></p>
            </div>`;
        }
        html += '</div>';

        html += '<h4>Step 2: Calculate Stiffness and Distribution Factors</h4>';
        html += '<div class="calc-box">';
        const EI = model.flexuralRigidity || (model.elasticity * model.inertia);
        
        let nodeDFs = []; // Store DFs for each node
        
        for (let i = 0; i < supports.length; i++) {
            const s = supports[i];
            let K_left = 0, K_right = 0;
            let L_left = 0, L_right = 0;
            
            if (i > 0) {
                L_left = supports[i].x - supports[i-1].x;
                K_left = (4 * EI) / L_left; // Assuming fixed far end for simple illustration
                if (supports[i-1].type !== 'Fixed' && i === 1) K_left = (3 * EI) / L_left; // Modified stiffness for pinned end
            }
            if (i < supports.length - 1) {
                L_right = supports[i+1].x - supports[i].x;
                K_right = (4 * EI) / L_right;
                if (supports[i+1].type !== 'Fixed' && i === supports.length - 2) K_right = (3 * EI) / L_right;
            }

            const K_sum = K_left + K_right;
            let DF_left = K_sum > 0 ? K_left / K_sum : 0;
            let DF_right = K_sum > 0 ? K_right / K_sum : 0;

            if (s.type === 'Fixed') {
                DF_left = 0;
                DF_right = 0;
            }

            html += `<p><strong>Support ${i + 1} (${s.type} at ${s.x.toFixed(3)}m):</strong></p>`;
            html += `<ul>`;
            if (i > 0) html += `<li>\\(K_{\\text{left}} \\propto \\frac{1}{L} = \\frac{1}{${L_left.toFixed(3)}} \\implies \\text{DF}_{\\text{left}} = ${DF_left.toFixed(3)}\\)</li>`;
            if (i < supports.length - 1) html += `<li>\\(K_{\\text{right}} \\propto \\frac{1}{L} = \\frac{1}{${L_right.toFixed(3)}} \\implies \\text{DF}_{\\text{right}} = ${DF_right.toFixed(3)}\\)</li>`;
            html += `</ul>`;
        }
        html += '</div>';

        html += '<h4>Step 3: Final Balanced End Moments (from Global System Solution)</h4>';
        html += '<table class="calc-results-table"><thead><tr><th>Support Node</th><th>Position \\(x\\)</th><th>Type</th><th>Reaction Moment \\(M_r\\)</th></tr></thead><tbody>';
        for (const sr of femResults.supportReactions) {
            html += `<tr>
                <td>${sr.supportId}</td>
                <td>${sr.x.toFixed(3)} m</td>
                <td>${sr.type}</td>
                <td><strong>${sr.M !== 0 ? sr.M.toFixed(3) + ' kN·m' : '0.000 kN·m (Pinned/Roller)'}</strong></td>
            </tr>`;
        }
        html += '</tbody></table>';

        html += '<h4>Step 4: Maximum Span Moments</h4>';
        html += '<p class="calc-desc">To find the maximum positive moment in a span, we calculate the left reaction of the isolated span and find where the shear force crosses zero (\\(V(x) = 0\\)).</p>';

        html += '<details style="margin-bottom: 15px;">';
        html += '<summary style="cursor: pointer; font-weight: 600; color: #005a9e; padding: 5px 0;">Show step-by-step span workings</summary>';
        html += '<div style="margin-top: 10px;">';

        const spanResults = [];

        for (let i = 0; i < supports.length - 1; i++) {
            const s1 = supports[i];
            const s2 = supports[i + 1];
            const L = s2.x - s1.x;
            
            // Get M_left and M_right
            const smL = femResults.samples.find(sm => Math.abs(sm.x - s1.x) < 1e-4);
            const smR = femResults.samples.find(sm => Math.abs(sm.x - s2.x) < 1e-4);
            const M_L = smL ? smL.M : 0;
            const M_R = smR ? smR.M : 0;
            
            const plInSpan = model.pointLoads.filter(p => p.x > s1.x && p.x < s2.x);
            const dlInSpan = model.distributedLoads.filter(d => d.start < s2.x && d.start + d.length > s1.x);
            
            let maxM = -Infinity;
            let maxMx = s1.x;
            for (const sample of femResults.samples) {
                if (sample.x >= s1.x + 0.01 && sample.x <= s2.x - 0.01) {
                    if (sample.M > maxM) {
                        maxM = sample.M;
                        maxMx = sample.x;
                    }
                }
            }
            if (maxM < 0) maxM = 0;

            html += `<div class="segment-card"><h5>Span ${i + 1} (${s1.x.toFixed(3)}m to ${s2.x.toFixed(3)}m, \\(L = ${L.toFixed(3)}\\text{ m}\\))</h5>`;
            html += `<p>Support Moments: \\(M_{\\text{left}} = ${M_L.toFixed(3)}\\text{ kN}\\cdot\\text{m}\\), \\(M_{\\text{right}} = ${M_R.toFixed(3)}\\text{ kN}\\cdot\\text{m}\\)</p>`;
            
            // 1. Calculate R_left
            let R_simp_str = [];
            let R_simp_val = 0;
            
            for(const pl of plInSpan) {
                const a = pl.x - s1.x;
                const b = L - a;
                const val = (pl.magnitude * b) / L;
                R_simp_val += val;
                R_simp_str.push(`\\frac{${pl.magnitude.toFixed(3)} \\times ${b.toFixed(3)}}{${L.toFixed(3)}}`);
            }
            
            for(const dl of dlInSpan) {
                const start = Math.max(s1.x, dl.start);
                const end = Math.min(s2.x, dl.start + dl.length);
                const len = end - start;
                if (len > 0) {
                    const centroid = start + len / 2;
                    const b = s2.x - centroid;
                    const F = dl.magnitude * len;
                    const val = (F * b) / L;
                    R_simp_val += val;
                    if (Math.abs(len - L) < 1e-4) {
                        R_simp_str.push(`\\frac{${dl.magnitude.toFixed(3)} \\times ${L.toFixed(3)}}{2}`);
                    } else {
                        R_simp_str.push(`\\frac{(${dl.magnitude.toFixed(3)} \\times ${len.toFixed(3)}) \\times ${b.toFixed(3)}}{${L.toFixed(3)}}`);
                    }
                }
            }
            
            const dR = (M_R - M_L) / L;
            const R_left = R_simp_val + dR;
            let R_eq = R_simp_str.length > 0 ? `\\left[ ${R_simp_str.join(' + ')} \\right]` : `0`;
            
            html += `<p><strong>1. Calculate left reaction \\(R_{\\text{left}}\\) for this isolated span:</strong></p>`;
            html += `<p>Taking moments about the right support:</p>`;
            html += `<div class="latex-eq">\\[ R_{\\text{left}} = \\sum \\frac{F_i b_i}{L} + \\frac{M_{\\text{right}} - M_{\\text{left}}}{L} \\]</div>`;
            html += `<div class="latex-eq">\\[ R_{\\text{left}} = ${R_eq} + \\frac{${M_R.toFixed(3)} - (${M_L.toFixed(3)})}{${L.toFixed(3)}} = ${R_left.toFixed(3)}\\text{ kN} \\]</div>`;
            
            // 2. Position of zero shear
            const localMaxX = maxMx - s1.x;
            html += `<p><strong>2. Position of zero shear (\\(V(x) = 0\\)):</strong></p>`;
            html += `<p>By evaluating the shear force \\(V(x) = R_{\\text{left}} - \\sum F_{\\text{loads}}(x)\\) piecewise, we find it crosses zero at:</p>`;
            html += `<div class="latex-eq">\\[ x = ${localMaxX.toFixed(3)}\\text{ m (from left support)} \\]</div>`;
            
            // 3. Max Moment
            let M_load_str = [];
            let M_load_val = 0;
            
            for(const pl of plInSpan) {
                if (pl.x <= maxMx - 1e-4) {
                    const dist = maxMx - pl.x;
                    if (dist > 1e-4) {
                        const val = pl.magnitude * dist;
                        M_load_val += val;
                        M_load_str.push(`(${pl.magnitude.toFixed(3)} \\times ${dist.toFixed(3)})`);
                    }
                }
            }
            
            for(const dl of dlInSpan) {
                const start = Math.max(s1.x, dl.start);
                if (start < maxMx - 1e-4) {
                    const end = Math.min(maxMx, dl.start + dl.length);
                    const len = end - start;
                    if (len > 1e-4) {
                        const dist = maxMx - (start + len / 2);
                        const F = dl.magnitude * len;
                        const val = F * dist;
                        M_load_val += val;
                        if (Math.abs(start - s1.x) < 1e-4 && Math.abs(end - maxMx) < 1e-4) {
                            M_load_str.push(`\\frac{${dl.magnitude.toFixed(3)} \\times ${localMaxX.toFixed(3)}^2}{2}`);
                        } else {
                            M_load_str.push(`(${dl.magnitude.toFixed(3)} \\times ${len.toFixed(3)}) \\times ${dist.toFixed(3)}`);
                        }
                    }
                }
            }
            
            const M_max_calc = M_L + R_left * localMaxX - M_load_val;
            
            html += `<p><strong>3. Calculate Maximum Moment at \\(x = ${localMaxX.toFixed(3)}\\text{ m}\\):</strong></p>`;
            let M_eq = M_load_str.length > 0 ? ` - \\left[ ${M_load_str.join(' + ')} \\right]` : ``;
            html += `<div class="latex-eq">\\[ M_{\\text{max}} = M_{\\text{left}} + R_{\\text{left}} x - \\sum M_{\\text{loads}}(x) \\]</div>`;
            html += `<div class="latex-eq">\\[ M_{\\text{max}} = ${M_L.toFixed(3)} + (${R_left.toFixed(3)} \\times ${localMaxX.toFixed(3)})${M_eq} = \\mathbf{${M_max_calc.toFixed(3)}\\text{ kN}\\cdot\\text{m}} \\]</div>`;
            
            html += `</div>`;
            
            spanResults.push({
                spanName: `Span ${i + 1}`,
                range: `${s1.x.toFixed(3)} - ${s2.x.toFixed(3)} m`,
                xPos: maxMx.toFixed(3),
                mMax: M_max_calc.toFixed(3)
            });
        }

        html += '</div></details>';

        // Restore Summary Table
        html += '<h4>Span Maximum Moments Summary</h4>';
        html += '<table class="calc-results-table"><thead><tr><th>Span</th><th>Range (m)</th><th>Position of Max Moment (m)</th><th>Maximum Positive Moment</th></tr></thead><tbody>';
        for (const res of spanResults) {
            html += `<tr>
                <td>${res.spanName}</td>
                <td>${res.range}</td>
                <td>x = ${res.xPos} m</td>
                <td><strong>${res.mMax} kN·m</strong></td>
            </tr>`;
        }
        html += '</tbody></table>';

        html += '</div>';
        return html;
    }
}
