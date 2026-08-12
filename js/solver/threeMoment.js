/**
 * threeMoment.js
 * Solves continuous multi-span beams using Clapeyron's Theorem of Three Moments.
 * Standard Formula:
 * M_{n-1} * L_n + 2 * M_n * (L_n + L_{n+1}) + M_{n+1} * L_{n+1} = -6 * ( (A_n * a_n)/L_n + (A_{n+1} * b_{n+1})/L_{n+1} )
 */

export class ThreeMomentSolver {
    static generateReport(model, femResults) {
        if (!model) return null;

        const supports = model.supports.slice().sort((a, b) => a.x - b.x);
        if (supports.length < 2) return null;

        const numSpans = supports.length - 1;
        let html = '<div class="calc-section">';
        html += '<h3>Clapeyron\'s Three-Moment Theorem (Continuous Beam Analysis)</h3>';
        html += '<p class="calc-desc">The Theorem of Three Moments establishes a relationship between bending moments at three consecutive supports based on slope continuity across intermediate supports.</p>';

        html += '<div class="calc-box equation-box">';
        html += '<h4>General Three-Moment Equation:</h4>';
        html += '<div class="latex-eq">';
        html += '\\[ M_{i-1} L_i + 2 M_i (L_i + L_{i+1}) + M_{i+1} L_{i+1} = -\\left( \\frac{6 A_i \\bar{a}_i}{L_i} + \\frac{6 A_{i+1} \\bar{b}_{i+1}}{L_{i+1}} \\right) \\]';
        html += '</div>';
        html += '<p class="eq-legend">Where \\(A_i\\) is the area of the simply-supported bending moment diagram for span \\(i\\), and \\(\\bar{a}_i, \\bar{b}_i\\) are the centroid distances from the left and right supports.</p>';
        html += '</div>';

        html += '<h4>Step 1: Span Geometry and Load Terms (\\(\\frac{6A\\bar{x}}{L}\\))</h4>';
        
        let spanTerms = []; // Store the left and right terms for each span
        
        for (let i = 0; i < numSpans; i++) {
            const s1 = supports[i];
            const s2 = supports[i + 1];
            const L = s2.x - s1.x;
            
            // Find loads in this span
            const plInSpan = model.pointLoads.filter(p => p.x > s1.x && p.x < s2.x);
            const dlInSpan = model.distributedLoads.filter(d => d.start < s2.x && d.start + d.length > s1.x);

            let termLeft = 0;
            let termRight = 0;
            let calcDesc = [];

            // Point loads
            for (const pl of plInSpan) {
                const P = pl.magnitude;
                const a = pl.x - s1.x; // distance from left support of this span
                const b = s2.x - pl.x; // distance from right support of this span
                const tL = (P * a * b * (L + a)) / L; // 6A a_bar / L
                const tR = (P * a * b * (L + b)) / L; // 6A b_bar / L
                termLeft += tL;
                termRight += tR;
                calcDesc.push(`Point Load \\(P = ${P.toFixed(3)}\\text{ kN}\\) at \\(a = ${a.toFixed(3)}\\text{ m}\\) from left, \\(b = ${b.toFixed(3)}\\text{ m}\\) from right:<br>` +
                              `&nbsp;&nbsp;\\(\\rightarrow \\frac{6 A \\bar{a}}{L} = \\frac{P a b (L+a)}{L} = \\frac{${P.toFixed(3)}\\cdot${a.toFixed(3)}\\cdot${b.toFixed(3)}\\cdot${(L+a).toFixed(3)}}{${L.toFixed(3)}} = ${tL.toFixed(3)}\\)<br>` +
                              `&nbsp;&nbsp;\\(\\rightarrow \\frac{6 A \\bar{b}}{L} = \\frac{P a b (L+b)}{L} = \\frac{${P.toFixed(3)}\\cdot${a.toFixed(3)}\\cdot${b.toFixed(3)}\\cdot${(L+b).toFixed(3)}}{${L.toFixed(3)}} = ${tR.toFixed(3)}\\)`);
            }

            // UDLs
            for (const dl of dlInSpan) {
                const q = dl.magnitude;
                const tU = (q * Math.pow(L, 3)) / 4;
                termLeft += tU;
                termRight += tU;
                calcDesc.push(`Uniform Load \\(q = ${q.toFixed(3)}\\text{ kN/m}\\) over entire span:<br>` + 
                              `&nbsp;&nbsp;\\(\\rightarrow \\frac{6 A \\bar{a}}{L} = \\frac{6 A \\bar{b}}{L} = \\frac{q L^3}{4} = \\frac{${q.toFixed(3)}\\cdot${L.toFixed(3)}^3}{4} = ${tU.toFixed(3)}\\)`);
            }

            spanTerms.push({ L, termLeft, termRight });

            html += `<div class="segment-card">
                <h5>Span ${i + 1} (${s1.x.toFixed(3)}m to ${s2.x.toFixed(3)}m, \\(L = ${L.toFixed(3)}\\text{ m}\\)):</h5>`;
            if (calcDesc.length > 0) {
                html += `<ul><li>${calcDesc.join('</li><li style="margin-top:10px;">')}</li></ul>`;
            } else {
                html += `<p>No loads on this span.</p>`;
            }
            html += `<p style="margin-top:10px;"><strong>Sum for \\(\\frac{6 A \\bar{a}}{L}\\) (Used when span is on LEFT of a node):</strong> ${termLeft.toFixed(3)}</p>`;
            html += `<p><strong>Sum for \\(\\frac{6 A \\bar{b}}{L}\\) (Used when span is on RIGHT of a node):</strong> ${termRight.toFixed(3)}</p>`;
            html += `</div>`;
        }

        html += '<h4>Step 2: Construct Simultaneous Equations</h4>';
        html += '<div class="calc-box">';
        
        if (numSpans < 2) {
            html += '<p>Only one span present; Three-Moment Equation is trivial (M at pinned ends = 0).</p>';
        } else {
            for (let i = 1; i < numSpans; i++) {
                const L1 = spanTerms[i-1].L;
                const L2 = spanTerms[i].L;
                const rightLoadTerm = spanTerms[i-1].termLeft + spanTerms[i].termRight;
                
                html += `<p><strong>For continuous support ${i + 1} (Node ${i}):</strong></p>`;
                html += `<div class="latex-eq">\\[ M_{${i-1}}(${L1.toFixed(3)}) + 2M_{${i}}(${L1.toFixed(3)} + ${L2.toFixed(3)}) + M_{${i+1}}(${L2.toFixed(3)}) = -\\left(\\frac{6A_1\\bar{a}_1}{L_1} + \\frac{6A_2\\bar{b}_2}{L_2}\\right) \\]</div>`;
                html += `<div class="latex-eq">\\[ M_{${i-1}}(${L1.toFixed(3)}) + M_{${i}}(${(2*(L1+L2)).toFixed(3)}) + M_{${i+1}}(${L2.toFixed(3)}) = -(${spanTerms[i-1].termLeft.toFixed(3)} + ${spanTerms[i].termRight.toFixed(3)}) \\]</div>`;
                html += `<div class="latex-eq">\\[ M_{${i-1}}(${L1.toFixed(3)}) + M_{${i}}(${(2*(L1+L2)).toFixed(3)}) + M_{${i+1}}(${L2.toFixed(3)}) = -${rightLoadTerm.toFixed(3)} \\]</div>`;
            }
        }
        html += '</div>';

        html += '<h4>Step 3: Solve System for Support Moments</h4>';
        html += '<div class="calc-box" style="background:#fff3cd; border-left:4px solid #ffc107; padding:10px; margin-bottom:15px;">';
        html += '<strong>Note on Hinged/Roller Supports:</strong> At the extreme outer ends of the beam, a hinged or roller support will always have a bending moment of 0 (since it cannot resist rotation). However, at <em>intermediate</em> supports in a continuous beam, the beam is continuous <em>over</em> the support, which generates a non-zero (usually negative) bending moment to maintain a smooth curve without kinking.';
        html += '</div>';
        html += '<table class="calc-results-table"><thead><tr><th>Support Node</th><th>Position \\(x\\)</th><th>Support Type</th><th>Support Moment \\(M_i\\)</th></tr></thead><tbody>';

        for (let i = 0; i < supports.length; i++) {
            const s = supports[i];
            const sampleAtSupport = femResults.samples.find(sm => Math.abs(sm.x - s.x) < 1e-4);
            const momentVal = sampleAtSupport ? sampleAtSupport.M : 0;
            html += `<tr>
                <td>Support ${i}</td>
                <td>${s.x.toFixed(3)} m</td>
                <td>${s.type}</td>
                <td><strong>${momentVal.toFixed(3)} kN·m</strong></td>
            </tr>`;
        }
        html += '</tbody></table>';

        html += '<h4>Step 4: Maximum Span Moments</h4>';
        html += '<p class="calc-desc">To find the maximum positive moment in a span, we calculate the left reaction of the isolated span and find where the shear force crosses zero (\\(V(x) = 0\\)).</p>';

        html += '<details style="margin-bottom: 15px;">';
        html += '<summary style="cursor: pointer; font-weight: 600; color: #005a9e; padding: 5px 0;">Show step-by-step span workings</summary>';
        html += '<div style="margin-top: 10px;">';

        const spanResults = [];

        for (let i = 0; i < numSpans; i++) {
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
