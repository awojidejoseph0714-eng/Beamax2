/**
 * diagramRenderer.js
 * Plots high-precision Shear Force Diagrams (SFD), Bending Moment Diagrams (BMD),
 * and Deflection Curves with clean engineering graph styling, axes, shaded regions, and peak values.
 */

export class DiagramRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.margin = { left: 80, right: 80, top: 40, bottom: 40 };
    }

    render(model, femResults, type = 'SFD') {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        if (!femResults || !femResults.samples || femResults.samples.length === 0) {
            ctx.fillStyle = '#888888';
            ctx.font = '14px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No calculation results available.', width / 2, height / 2);
            return;
        }

        this.margin.top = 40;

        const samples = femResults.samples;
        const L = samples[samples.length - 1].x;
        const plotW = width - this.margin.left - this.margin.right;
        const plotH = height - this.margin.top - this.margin.bottom;

        let values = [];
        let label = "";
        let unit = "";
        let strokeColor = "";
        let posFill = "";
        let negFill = "";

        if (type === 'SFD') {
            values = samples.map(s => s.V);
            label = "Shear Force Diagram (SFD)";
            unit = "kN";
            strokeColor = "#1976d2";
            posFill = "rgba(25, 118, 210, 0.15)";
            negFill = "rgba(239, 83, 80, 0.15)";
        } else if (type === 'BMD') {
            values = samples.map(s => s.M);
            label = "Bending Moment Diagram (BMD)";
            unit = "kN·m";
            strokeColor = "#388e3c";
            posFill = "rgba(56, 142, 60, 0.15)";
            negFill = "rgba(255, 152, 0, 0.15)";
        } else if (type === 'DEFLECTION') {
            values = samples.map(s => s.v * 1000); // mm
            label = "Elastic Deflection Curve v(x)";
            unit = "mm";
            strokeColor = "#7b1fa2";
            posFill = "rgba(123, 31, 162, 0.12)";
            negFill = "rgba(123, 31, 162, 0.12)";
        }

        let maxVal = Math.max(...values);
        let minVal = Math.min(...values);

        // Keep symmetric headroom around 0
        const absMax = Math.max(Math.abs(maxVal), Math.abs(minVal), 0.1);
        const yLimit = absMax * 1.25;

        const toCanvasX = (x) => this.margin.left + (x / L) * plotW;
        const zeroY = this.margin.top + plotH / 2;
        const toCanvasY = (val) => {
            const plotVal = type === 'BMD' ? -val : val;
            return zeroY - (plotVal / yLimit) * (plotH / 2);
        };

        // 1. Draw Grid and Axes
        ctx.save();
        ctx.strokeStyle = '#e0e6ed';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const gx = this.margin.left + (i / 10) * plotW;
            ctx.beginPath();
            ctx.moveTo(gx, this.margin.top);
            ctx.lineTo(gx, this.margin.top + plotH);
            ctx.stroke();
        }

        // Horizontal Zero Baseline
        ctx.strokeStyle = '#1b2d42';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(this.margin.left - 10, zeroY);
        ctx.lineTo(this.margin.left + plotW + 10, zeroY);
        ctx.stroke();


        // 2. Draw Shaded Polygon & Curve
        ctx.beginPath();
        ctx.moveTo(toCanvasX(0), zeroY);
        for (let i = 0; i < samples.length; i++) {
            ctx.lineTo(toCanvasX(samples[i].x), toCanvasY(values[i]));
        }
        ctx.lineTo(toCanvasX(L), zeroY);
        ctx.closePath();
        ctx.fillStyle = posFill;
        ctx.fill();

        // Curve stroke
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        for (let i = 0; i < samples.length; i++) {
            const cx = toCanvasX(samples[i].x);
            const cy = toCanvasY(values[i]);
            if (i === 0) ctx.moveTo(cx, cy);
            else ctx.lineTo(cx, cy);
        }
        ctx.stroke();

        // 3. Mark Key Points (Professional Style)
        const annotated = [];
        const isAnnotated = (px, py) => {
            for (const pt of annotated) {
                if (Math.abs(pt.x - px) < 25 && Math.abs(pt.y - py) < 15) return true;
            }
            return false;
        };

        const annotatePoint = (idx) => {
            if (idx < 0 || idx >= samples.length) return;
            const val = values[idx];
            if (Math.abs(val) < 0.05) return; // Ignore near-zero values

            const px = toCanvasX(samples[idx].x);
            const py = toCanvasY(val);
            
            if (isAnnotated(px, py)) return;

            // Position text above if positive, below if negative
            // Assuming positive values are drawn UP (py < zeroY) or standard
            const isAboveZero = py < toCanvasY(0);
            let yOffset = isAboveZero ? -6 : 14; 
            
            ctx.save();
            ctx.fillStyle = '#000000';
            ctx.font = '10px "Segoe UI", Arial, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(val.toFixed(3), px, py + yOffset);
            ctx.restore();
            
            annotated.push({x: px, y: py});
        };

        if (type === 'SFD') {
            annotatePoint(0);
            annotatePoint(samples.length - 1);
            
            // Annotate jumps only at nodes
            if (femResults.nodes) {
                for (const nx of femResults.nodes) {
                    let closestIdx = 0, minDist = Infinity;
                    for (let i = 0; i < samples.length; i++) {
                        const d = Math.abs(samples[i].x - nx);
                        if (d < minDist) { minDist = d; closestIdx = i; }
                    }
                    
                    // Look for a jump in a tiny window around the node
                    let minIdx = closestIdx;
                    let maxIdx = closestIdx;
                    for (let j = Math.max(0, closestIdx - 2); j <= Math.min(samples.length - 1, closestIdx + 2); j++) {
                        if (values[j] < values[minIdx]) minIdx = j;
                        if (values[j] > values[maxIdx]) maxIdx = j;
                    }
                    
                    if (Math.abs(values[maxIdx] - values[minIdx]) > 0.5) {
                        annotatePoint(minIdx);
                        annotatePoint(maxIdx);
                    } else {
                        annotatePoint(closestIdx);
                    }
                }
            }
        } else if (type === 'BMD' || type === 'DEFLECTION') {
            // Annotate nodes
            if (femResults.nodes) {
                for (const nx of femResults.nodes) {
                    let closestIdx = 0, minDist = Infinity;
                    for (let i = 0; i < samples.length; i++) {
                        const d = Math.abs(samples[i].x - nx);
                        if (d < minDist) { minDist = d; closestIdx = i; }
                    }
                    annotatePoint(closestIdx);
                }
            }
            
            // Annotate local extrema (peaks in spans)
            for (let i = 1; i < samples.length - 1; i++) {
                const prev = values[i-1];
                const curr = values[i];
                const next = values[i+1];
                
                const isPeak = (curr > prev && curr > next) || (curr < prev && curr < next);
                if (isPeak) {
                    annotatePoint(i);
                }
            }
        }

        // 4. Diagram Title & Legend
        ctx.fillStyle = '#1b2d42';
        ctx.font = 'bold 14px "Segoe UI", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(label, this.margin.left, 24);

        ctx.font = '12px "Segoe UI", sans-serif';
        ctx.fillStyle = '#555555';
        ctx.textAlign = 'right';
        ctx.fillText(`Max: ${maxVal.toFixed(3)} ${unit} | Min: ${minVal.toFixed(3)} ${unit}`, width - this.margin.right, 24);

        ctx.restore();
    }

    drawMarker(ctx, x, y, text, color, overrideYOffset = 0) {
        ctx.save();
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#111111';
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        let yOffset = overrideYOffset !== 0 ? overrideYOffset : (y > 150 ? -10 : 16);
        ctx.fillText(text, x, y + yOffset);
        ctx.restore();
    }
}
