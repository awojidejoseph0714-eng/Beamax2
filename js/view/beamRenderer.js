/**
 * beamRenderer.js
 * Technical engineering schematic renderer for the beam structure, supports, loads, and dimensions.
 * Clean, high-contrast, professional CAD/drafting aesthetic matching Beamax.
 */

function pointInRect(px, py, rect) {
    return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

export class BeamRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.margin = { left: 80, right: 80, top: 90, bottom: 80 };
        this.selectedElementId = null;
    }

    render(model, femResults = null) {
        const ctx = this.ctx;
        const width = this.canvas.width;
        const height = this.canvas.height;

        ctx.clearRect(0, 0, width, height);

        // White background with subtle technical grid
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);

        this.drawGrid(width, height);

        if (!model || model.length <= 0) {
            ctx.fillStyle = '#777777';
            ctx.font = '14px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('No beam defined. Use File -> New Beam or Create -> Beam...', width / 2, height / 2);
            return;
        }

        const L = model.length;
        const plotWidth = width - this.margin.left - this.margin.right;
        
        const beamY = height / 2 + 10;
        
        const scaleX = plotWidth / L;

        const toCanvasX = (x) => this.margin.left + x * scaleX;
        
        this.plotWidth = plotWidth;
        this.beamY = beamY;
        this.scaleX = scaleX;
        this.beamHeight = 14;
        this.toCanvasX = toCanvasX;
        this.currentModel = model;

        // 1. Draw Beam Axis & Bar
        ctx.save();
        ctx.fillStyle = '#4a607a';
        ctx.strokeStyle = '#1b2d42';
        ctx.lineWidth = 2;
        const beamHeight = 14;
        ctx.fillRect(this.margin.left, beamY - beamHeight / 2, plotWidth, beamHeight);
        ctx.strokeRect(this.margin.left, beamY - beamHeight / 2, plotWidth, beamHeight);

        // Center line
        ctx.strokeStyle = '#8fa3b8';
        ctx.lineWidth = 1;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.moveTo(this.margin.left - 20, beamY);
        ctx.lineTo(this.margin.left + plotWidth + 20, beamY);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // 2. Draw Distributed Loads
        for (const dl of model.distributedLoads) {
            this.drawDistributedLoad(dl, toCanvasX, beamY, beamHeight);
        }

        // 3. Draw Point Loads
        for (const pl of model.pointLoads) {
            this.drawPointLoad(pl, toCanvasX, beamY, beamHeight);
        }

        // 4. Draw Supports
        for (const s of model.supports) {
            this.drawSupport(s, toCanvasX(s.x), beamY, beamHeight);
        }

        // 5. Draw Dimension Lines & Scale
        this.drawDimensions(model, toCanvasX, beamY, height);

        // 6. Draw Reactions if solved
        if (femResults && femResults.supportReactions) {
            this.drawReactions(femResults.supportReactions, toCanvasX, beamY, beamHeight);
        }

        if (this.selectedElementId) {
            let bounds = null;
            // Find element and bounds
            for (const s of model.supports) {
                if (s.id === this.selectedElementId) {
                    const cx = toCanvasX(s.x);
                    const sy = beamY + this.beamHeight / 2;
                    if (s.type === 'Fixed') bounds = {x: cx - 15, y: beamY - 23, w: 30, h: 46};
                    else if (s.type === 'Hinged') bounds = {x: cx - 16, y: sy, w: 32, h: 32};
                    else if (s.type === 'Roller') bounds = {x: cx - 14, y: sy, w: 28, h: 30};
                    break;
                }
            }
            if (!bounds) {
                for (const pl of model.pointLoads) {
                    if (pl.id === this.selectedElementId) {
                        const cx = toCanvasX(pl.x);
                        const topY = beamY - this.beamHeight/2 - 75;
                        const botY = beamY - this.beamHeight/2;
                        bounds = {x: cx - 10, y: topY - 15, w: 20, h: botY - topY + 15};
                        break;
                    }
                }
            }
            if (!bounds) {
                for (const dl of model.distributedLoads) {
                    if (dl.id === this.selectedElementId) {
                        const x1 = toCanvasX(dl.start);
                        const x2 = toCanvasX(dl.start + dl.length);
                        const topY = beamY - this.beamHeight/2 - 34;
                        const botY = beamY - this.beamHeight/2;
                        bounds = {x: x1 - 5, y: topY - 10, w: x2 - x1 + 10, h: botY - topY + 10};
                        break;
                    }
                }
            }

            if (bounds) {
                ctx.save();
                ctx.setLineDash([4, 3]);
                ctx.strokeStyle = '#1976d2';
                ctx.lineWidth = 2;
                ctx.fillStyle = 'rgba(25, 118, 210, 0.08)';
                ctx.shadowColor = '#1976d2';
                ctx.shadowBlur = 4;
                ctx.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
                ctx.strokeRect(bounds.x, bounds.y, bounds.w, bounds.h);
                ctx.restore();
            }
        }
    }

    hitTest(mouseX, mouseY) {
        if (!this.currentModel) return null;
        // Check supports first (they're on top visually)
        for (const s of this.currentModel.supports) {
            const cx = this.toCanvasX(s.x);
            const sy = this.beamY + this.beamHeight / 2;
            let bounds = null;
            if (s.type === 'Fixed') bounds = {x: cx - 15, y: this.beamY - 23, w: 30, h: 46};
            else if (s.type === 'Hinged') bounds = {x: cx - 16, y: sy, w: 32, h: 32};
            else if (s.type === 'Roller') bounds = {x: cx - 14, y: sy, w: 28, h: 30};
            
            if (bounds && pointInRect(mouseX, mouseY, bounds)) {
                return { id: s.id, type: 'support', element: s };
            }
        }
        // Check point loads (arrow area)
        for (const pl of this.currentModel.pointLoads) {
            const cx = this.toCanvasX(pl.x);
            const topY = this.beamY - this.beamHeight/2 - 75;
            const botY = this.beamY - this.beamHeight/2;
            const bounds = {x: cx - 10, y: topY - 15, w: 20, h: botY - topY + 15};
            if (pointInRect(mouseX, mouseY, bounds)) {
                return { id: pl.id, type: 'pointLoad', element: pl };
            }
        }
        // Check distributed loads (rectangle area)
        for (const dl of this.currentModel.distributedLoads) {
            const x1 = this.toCanvasX(dl.start);
            const x2 = this.toCanvasX(dl.start + dl.length);
            const topY = this.beamY - this.beamHeight/2 - 34;
            const botY = this.beamY - this.beamHeight/2;
            const bounds = {x: x1 - 5, y: topY - 10, w: x2 - x1 + 10, h: botY - topY + 10};
            if (pointInRect(mouseX, mouseY, bounds)) {
                return { id: dl.id, type: 'distributedLoad', element: dl };
            }
        }
        return null;
    }

    drawGrid(w, h) {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = '#f0f3f6';
        ctx.lineWidth = 1;
        for (let x = 0; x < w; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
            ctx.stroke();
        }
        for (let y = 0; y < h; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
            ctx.stroke();
        }
        ctx.restore();
    }

    drawSupport(support, cx, beamY, beamH) {
        const ctx = this.ctx;
        const sy = beamY + beamH / 2;

        ctx.save();
        ctx.strokeStyle = '#111111';
        ctx.fillStyle = '#6c7a89';
        ctx.lineWidth = 1.5;

        if (support.type === 'Fixed') {
            // Fixed / Clamped Support: Vertical wall with hatch lines
            const wallH = 46;
            ctx.fillStyle = '#333333';
            ctx.fillRect(cx - 5, beamY - wallH / 2, 10, wallH);
            ctx.strokeRect(cx - 5, beamY - wallH / 2, 10, wallH);

            // Hatch lines
            ctx.beginPath();
            for (let y = beamY - wallH / 2 + 6; y < beamY + wallH / 2; y += 8) {
                ctx.moveTo(cx - 5, y);
                ctx.lineTo(cx - 15, y - 6);
                ctx.moveTo(cx + 5, y);
                ctx.lineTo(cx + 15, y - 6);
            }
            ctx.stroke();
        } else if (support.type === 'Hinged') {
            // Pinned / Hinged Triangle
            const triH = 24;
            const triW = 16;
            ctx.beginPath();
            ctx.moveTo(cx, sy);
            ctx.lineTo(cx - triW, sy + triH);
            ctx.lineTo(cx + triW, sy + triH);
            ctx.closePath();
            ctx.fillStyle = '#e8ecf1';
            ctx.fill();
            ctx.stroke();

            // Pinned pin dot
            ctx.beginPath();
            ctx.arc(cx, sy + 3, 3, 0, Math.PI * 2);
            ctx.fillStyle = '#111111';
            ctx.fill();

            // Base ground line & hatches
            ctx.beginPath();
            ctx.moveTo(cx - triW - 8, sy + triH);
            ctx.lineTo(cx + triW + 8, sy + triH);
            ctx.stroke();

            ctx.beginPath();
            for (let x = cx - triW - 6; x <= cx + triW + 6; x += 6) {
                ctx.moveTo(x, sy + triH);
                ctx.lineTo(x - 5, sy + triH + 6);
            }
            ctx.stroke();
        } else if (support.type === 'Roller') {
            // Roller Support: Triangle with roller circles underneath
            const triH = 20;
            const triW = 14;
            ctx.beginPath();
            ctx.moveTo(cx, sy);
            ctx.lineTo(cx - triW, sy + triH);
            ctx.lineTo(cx + triW, sy + triH);
            ctx.closePath();
            ctx.fillStyle = '#e8ecf1';
            ctx.fill();
            ctx.stroke();

            // Rollers
            const r = 4;
            const ry = sy + triH + r + 1;
            ctx.beginPath();
            ctx.arc(cx - 7, ry, r, 0, Math.PI * 2);
            ctx.arc(cx + 7, ry, r, 0, Math.PI * 2);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
            ctx.stroke();

            // Ground base line & hatches
            const gy = ry + r + 1;
            ctx.beginPath();
            ctx.moveTo(cx - triW - 8, gy);
            ctx.lineTo(cx + triW + 8, gy);
            ctx.stroke();

            for (let x = cx - triW - 6; x <= cx + triW + 6; x += 6) {
                ctx.moveTo(x, gy);
                ctx.lineTo(x - 5, gy + 6);
            }
            ctx.stroke();
        }

        // Support position label
        ctx.fillStyle = '#111111';
        ctx.font = 'bold 11px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`x = ${support.x.toFixed(2)}m`, cx, sy + 44);
        ctx.restore();
    }

    drawPointLoad(load, toCanvasX, beamY, beamH) {
        const ctx = this.ctx;
        const cx = toCanvasX(load.x);
        const arrowLen = 75; // Increased to clear UDLs
        const topY = beamY - beamH / 2 - arrowLen;
        const bottomY = beamY - beamH / 2;

        ctx.save();
        ctx.strokeStyle = '#e65100'; // Deep Orange for point loads
        ctx.fillStyle = '#e65100';
        ctx.lineWidth = 2.5;

        // Downward load arrow
        ctx.beginPath();
        ctx.moveTo(cx, topY);
        ctx.lineTo(cx, bottomY);
        ctx.stroke();

        // Arrow head
        ctx.beginPath();
        ctx.moveTo(cx, bottomY);
        ctx.lineTo(cx - 6, bottomY - 10);
        ctx.lineTo(cx + 6, bottomY - 10);
        ctx.closePath();
        ctx.fill();

        // Text label
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`P = ${load.magnitude} kN`, cx, topY - 8);
        ctx.fillText(`x = ${load.x.toFixed(2)}m`, cx, topY + 12);
        ctx.restore();
    }

    drawDistributedLoad(load, toCanvasX, beamY, beamH) {
        const ctx = this.ctx;
        const x1 = toCanvasX(load.start);
        const x2 = toCanvasX(load.start + load.length);
        const blockH = 34;
        const topY = beamY - beamH / 2 - blockH;
        const botY = beamY - beamH / 2;

        ctx.save();
        // Shaded rectangle
        ctx.fillStyle = 'rgba(211, 47, 47, 0.08)';
        ctx.fillRect(x1, topY, x2 - x1, blockH);

        // Top line
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x1, topY);
        ctx.lineTo(x2, topY);
        ctx.stroke();

        // Downward arrows across span
        const numArrows = Math.max(3, Math.round((x2 - x1) / 24));
        const step = (x2 - x1) / numArrows;

        for (let i = 0; i <= numArrows; i++) {
            const ax = x1 + i * step;
            ctx.beginPath();
            ctx.moveTo(ax, topY);
            ctx.lineTo(ax, botY);
            ctx.stroke();

            // Arrow head
            ctx.beginPath();
            ctx.moveTo(ax, botY);
            ctx.lineTo(ax - 4, botY - 7);
            ctx.lineTo(ax + 4, botY - 7);
            ctx.closePath();
            ctx.fillStyle = '#d32f2f';
            ctx.fill();
        }

        // Label
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`q = ${load.magnitude} kN/m`, (x1 + x2) / 2, topY - 8);
        ctx.restore();
    }

    drawDimensions(model, toCanvasX, beamY, h) {
        const ctx = this.ctx;
        const dimY = beamY + 110; // Pushed down to make room for reactions
        const x0 = toCanvasX(0);
        const xL = toCanvasX(model.length);

        ctx.save();
        ctx.strokeStyle = '#555555';
        ctx.lineWidth = 1;

        // Dimension line
        ctx.beginPath();
        ctx.moveTo(x0, dimY);
        ctx.lineTo(xL, dimY);
        // End tics
        ctx.moveTo(x0 - 4, dimY - 6);
        ctx.lineTo(x0 + 4, dimY + 6);
        ctx.moveTo(xL - 4, dimY - 6);
        ctx.lineTo(xL + 4, dimY + 6);
        ctx.stroke();

        // Text
        ctx.fillStyle = '#222222';
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`Total Span L = ${model.length.toFixed(2)} m (EI = ${model.flexuralRigidity.toFixed(1)} kN·m²)`, (x0 + xL) / 2, dimY + 18);
        ctx.restore();
    }

    drawReactions(reactions, toCanvasX, beamY, beamH) {
        const ctx = this.ctx;
        ctx.save();
        let ryOffset = 0;
        
        for (const sr of reactions) {
            const cx = toCanvasX(sr.x);
            const ry = sr.Ry; 
            
            if (Math.abs(ry) > 1e-3) {
                const arrowLen = 40;
                const isUp = ry > 0;
                
                // All reactions drawn below the beam to avoid overlapping loads
                const topY = beamY + beamH/2 + 2;
                const bottomY = beamY + beamH/2 + arrowLen + 10 + ryOffset;
                
                const startY = isUp ? bottomY : topY;
                const endY = isUp ? topY : bottomY;
                
                ctx.strokeStyle = '#2e7d32'; 
                ctx.fillStyle = '#2e7d32';
                ctx.lineWidth = 2.5;
                
                ctx.beginPath();
                ctx.moveTo(cx, startY);
                ctx.lineTo(cx, endY);
                ctx.stroke();
                
                ctx.beginPath();
                ctx.moveTo(cx, endY);
                if (isUp) {
                    ctx.lineTo(cx - 5, endY + 8);
                    ctx.lineTo(cx + 5, endY + 8);
                } else {
                    ctx.lineTo(cx - 5, endY - 8);
                    ctx.lineTo(cx + 5, endY - 8);
                }
                ctx.closePath();
                ctx.fill();
                
                ctx.font = 'bold 12px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`Ry=${Math.abs(ry).toFixed(2)} kN`, cx, bottomY + 16);
                
                ryOffset = ryOffset === 0 ? 25 : 0;
            }

            if (Math.abs(sr.M) > 1e-3) {
                ctx.fillStyle = '#8e24aa';
                ctx.font = 'bold 12px "Segoe UI", sans-serif';
                ctx.textAlign = 'center';
                // Offset moment text to the right to avoid overlapping Ry arrows
                ctx.fillText(`Mr=${Math.abs(sr.M).toFixed(2)} kNm`, cx + 45, beamY + beamH/2 + 25);
            }
        }
        ctx.restore();
    }
}
