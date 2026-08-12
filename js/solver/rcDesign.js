/**
 * rcDesign.js
 * Implements Reinforced Concrete Beam Design to BS 8110.
 */

export class RcDesign {
    static generateReport(model, femResults, params) {
        if (params.material !== 'RC') {
            return `<p style="color:#d32f2f; margin:10px;">Design for ${params.material} is not yet implemented. Please select Reinforced Concrete.</p>`;
        }
        if (params.code !== 'BS8110') {
            return `<p style="color:#d32f2f; margin:10px;">Design code ${params.code} is not yet implemented. Please select BS 8110.</p>`;
        }

        const b = parseFloat(params.b);
        const h = parseFloat(params.h);
        const fcu = parseFloat(params.fcu);
        const fy = parseFloat(params.fy);
        const cover = parseFloat(params.cover);

        // Assumptions for effective depth
        const linkDia = parseInt(params.link) || 10;
        const mainBarDia = parseInt(params.mainBar) || 16;
        const d = h - cover - linkDia - (mainBarDia / 2);

        let html = '<div class="calc-section">';
        html += `<h3>Reinforced Concrete Beam Design (BS 8110)</h3>`;
        html += `<p class="calc-desc">Design of rectangular section ${b} mm $\\times$ ${h} mm based on Ultimate Limit State (ULS).</p>`;
        html += `<p class="calc-desc" style="font-weight: 600; color: #005a9e;">Note: The moments and shears used in this design module are exactly the values calculated in the structural analysis calculations.</p>`;
        
        html += `<h4>1. Section Properties & Materials</h4>`;
        html += `<div class="calc-box">`;
        html += `<ul>`;
        html += `<li>Width \\(b\\) = ${b} mm</li>`;
        html += `<li>Overall Depth \\(h\\) = ${h} mm</li>`;
        html += `<li>Concrete Strength \\(f_{cu}\\) = ${fcu} N/mm²</li>`;
        html += `<li>Steel Strength \\(f_y\\) = ${fy} N/mm²</li>`;
        html += `<li>Nominal Cover \\(c\\) = ${cover} mm</li>`;
        html += `<li>Effective Depth \\(d\\) = \\(h - c - \\phi_{link} - \\phi_{main}/2\\) = \\(${h} - ${cover} - ${linkDia} - ${mainBarDia}/2\\) = <strong>${d} mm</strong></li>`;
        html += `</ul></div>`;

        html += `<h4>2. Flexural Design (Longitudinal Reinforcement)</h4>`;
        
        // Helper to get exact analytical internal forces at any x
        const getExactForces = (x) => {
            let Vx = 0;
            let Mx = 0;
            for (const sr of femResults.supportReactions) {
                if (sr.x < x + 1e-6) {
                    Vx += sr.Ry;
                    Mx += sr.Ry * (x - sr.x);
                    if (sr.type === 'Fixed') Mx -= sr.M;
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
            return { V: Vx, M: Mx };
        };

        // Extract critical moments precisely (1mm resolution)
        const spans = [];
        const supports = model.supports.slice().sort((s1, s2) => s1.x - s2.x);
        
        // Find exact max positive moments in each span
        for (let i = 0; i < supports.length - 1; i++) {
            const s1 = supports[i];
            const s2 = supports[i+1];
            let maxM = 0;
            let maxX = s1.x;
            
            // Sweep at 1mm increments for exact analytical peak
            for (let x = s1.x; x <= s2.x + 1e-6; x += 0.001) {
                const forces = getExactForces(x);
                if (forces.M > maxM) {
                    maxM = forces.M;
                    maxX = x;
                }
            }
            if (maxM > 0.1) {
                spans.push({ type: 'Span', label: `Span ${i+1}`, x: maxX, M: maxM });
            }
        }

        // Find exact moments at supports
        for (let i = 0; i < supports.length; i++) {
            const s = supports[i];
            const forces = getExactForces(s.x);
            if (forces.M < -0.1) {
                spans.push({ type: 'Support', label: `Support ${i+1}`, x: s.x, M: Math.abs(forces.M) });
            }
        }

        if (spans.length === 0) {
            html += `<p>No significant bending moments detected.</p>`;
        } else {
            spans.forEach(section => {
                const M_kNm = section.M;
                const M_Nmm = M_kNm * 1e6;
                const K = M_Nmm / (b * d * d * fcu);
                
                html += `<div class="segment-card">`;
                html += `<h5>${section.type}: ${section.label} (x = ${section.x.toFixed(3)} m)</h5>`;
                html += `<p>Design Moment \\(M\\) = <strong>${M_kNm.toFixed(3)} kN·m</strong></p>`;
                
                html += `<div class="latex-eq">\\[ K = \\frac{M}{bd^2 f_{cu}} = \\frac{${M_Nmm.toFixed(0)}}{${b} \\times ${d}^2 \\times ${fcu}} = ${K.toFixed(4)} \\]</div>`;
                
                let As_req = 0;
                let compressionSteel = false;
                if (K > 0.156) {
                    html += `<p style="color:#d32f2f;">\\(K > 0.156\\). Section is over-reinforced. Compression reinforcement is required (or increase section depth). Design simplified to singly reinforced limit for demonstration.</p>`;
                    compressionSteel = true;
                    // Simplified to singly for UI completeness, though technically needs As'
                }
                
                const K_lim = Math.min(K, 0.156);
                let z = d * (0.5 + Math.sqrt(0.25 - K_lim / 0.9));
                const z_max = 0.95 * d;
                if (z > z_max) z = z_max;
                
                html += `<div class="latex-eq">\\[ z = d \\left( 0.5 + \\sqrt{0.25 - \\frac{K}{0.9}} \\right) \\le 0.95d \\]</div>`;
                html += `<div class="latex-eq">\\[ z = ${d} \\left( 0.5 + \\sqrt{0.25 - \\frac{${K_lim.toFixed(4)}}{0.9}} \\right) = ${z.toFixed(2)}\\text{ mm} \\]</div>`;
                
                As_req = M_Nmm / (0.95 * fy * z);
                
                // As,min
                const As_min = 0.0013 * b * h;
                
                html += `<div class="latex-eq">\\[ A_{s,\\text{calc}} = \\frac{M}{0.95 f_y z} = \\frac{${M_Nmm.toFixed(0)}}{0.95 \\times ${fy} \\times ${z.toFixed(2)}} = ${As_req.toFixed(2)}\\text{ mm}^2 \\]</div>`;
                html += `<div class="latex-eq">\\[ A_{s,\\text{min}} = 0.13\\% \\times b \\times h = 0.0013 \\times ${b} \\times ${h} = ${As_min.toFixed(2)}\\text{ mm}^2 \\]</div>`;
                
                const As_final = Math.max(As_req, As_min);
                
                if (As_req < As_min) {
                    html += `<p>Since \\(A_{s,\\text{calc}} < A_{s,\\text{min}}\\), provide minimum reinforcement.</p>`;
                }
                
                // Suggest bars using preferred diameter
                const bars = RcDesign.suggestBars(As_final, mainBarDia);
                
                html += `<p style="background:#e8f5e9; padding:10px; border-left:4px solid #4caf50;">`;
                html += `<strong>Provide: ${bars.label}</strong> (Area = ${bars.area.toFixed(2)} mm² &gt; ${As_final.toFixed(2)} mm²)`;
                html += `</p>`;
                
                html += `</div>`;
            });
        }

        // 3. Shear Design
        html += `<h4>3. Shear Design (Links)</h4>`;
        
        let maxV = 0;
        let maxVx = 0;
        // Sweep entire beam at 1mm resolution for exact peak shear
        for (let x = 0; x <= model.length + 1e-6; x += 0.001) {
            const forces = getExactForces(x);
            if (Math.abs(forces.V) > maxV) {
                maxV = Math.abs(forces.V);
                maxVx = x;
            }
            // Check immediately after load discontinuities
            const forcesRight = getExactForces(x + 1e-6);
            if (Math.abs(forcesRight.V) > maxV) {
                maxV = Math.abs(forcesRight.V);
                maxVx = x;
            }
        }
        
        if (maxV < 0.1) {
            html += `<p>No significant shear forces detected.</p>`;
        } else {
            const V_N = maxV * 1000;
            const v = V_N / (b * d);
            
            html += `<div class="calc-box">`;
            html += `<p>Maximum Shear Force \\(V\\) = <strong>${maxV.toFixed(3)} kN</strong> at \\(x = ${maxVx.toFixed(3)} m\\)</p>`;
            html += `<div class="latex-eq">\\[ v = \\frac{V}{bd} = \\frac{${V_N.toFixed(0)}}{${b} \\times ${d}} = ${v.toFixed(3)}\\text{ N/mm}^2 \\]</div>`;
            
            // Limit shear stress
            const v_max = Math.min(0.8 * Math.sqrt(fcu), 5.0);
            if (v > v_max) {
                html += `<p style="color:#d32f2f;">\\(v > v_{\\text{max}}\\) (${v_max.toFixed(2)} N/mm²). Section size is inadequate for shear. Redesign concrete section.</p>`;
            } else {
                // Simplified vc based on BS 8110 table 3.8 (assuming 1% steel)
                const vc = 0.79 * Math.pow(1.0, 1/3) * Math.pow(400/d, 1/4) * Math.pow(Math.min(fcu/25, 1.6), 1/3) / 1.25;
                const vc_val = Math.max(vc, 0.4); // typical min
                
                html += `<div class="latex-eq">\\[ v_c \\approx ${vc_val.toFixed(3)}\\text{ N/mm}^2 \\]</div>`;
                
                if (v < 0.5 * vc_val) {
                    html += `<p>\\(v < 0.5v_c\\). Theoretically no shear links required, but provide nominal links.</p>`;
                } else if (v < vc_val + 0.4) {
                    html += `<p>Provide minimum links.</p>`;
                    const Asv_s = (0.4 * b) / (0.95 * fy);
                    html += `<div class="latex-eq">\\[ \\frac{A_{sv}}{s_v} \\ge \\frac{0.4b}{0.95f_{yv}} = ${Asv_s.toFixed(3)} \\]</div>`;
                    html += `<p style="background:#e8f5e9; padding:10px; border-left:4px solid #4caf50;"><strong>Provide Y${linkDia} @ 250mm c/c</strong></p>`;
                } else {
                    html += `<p>Provide designed shear links.</p>`;
                    const Asv_s = (b * (v - vc_val)) / (0.95 * fy);
                    html += `<div class="latex-eq">\\[ \\frac{A_{sv}}{s_v} = \\frac{b(v - v_c)}{0.95f_{yv}} = \\frac{${b}(${v.toFixed(3)} - ${vc_val.toFixed(3)})}{0.95 \\times ${fy}} = ${Asv_s.toFixed(3)} \\]</div>`;
                    
                    const Asv = 2 * (Math.PI * linkDia * linkDia) / 4;
                    const spacing = Math.floor(Asv / Asv_s);
                    const s_final = Math.min(spacing, 300, 0.75 * d);
                    
                    html += `<p style="background:#e8f5e9; padding:10px; border-left:4px solid #4caf50;"><strong>Provide Y${linkDia} @ ${Math.floor(s_final/25)*25}mm c/c</strong> (Area provided: ${(Asv/(Math.floor(s_final/25)*25)*1000).toFixed(0)} mm²/m)</p>`;
                }
            }
            html += `</div>`;
        }

        html += '</div>';
        return html;
    }

    static suggestBars(As_req, preferredDia) {
        const areaOne = (Math.PI * preferredDia * preferredDia) / 4;
        let num = Math.max(2, Math.ceil(As_req / areaOne));
        return { label: `${num}Y${preferredDia}`, area: num * areaOne };
    }
}
