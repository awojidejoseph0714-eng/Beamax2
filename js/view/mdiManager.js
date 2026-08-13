import { BeamRenderer } from './beamRenderer.js';
import { DiagramRenderer } from './diagramRenderer.js';

export class MdiManager {
    constructor(workspaceEl) {
        this.workspace = workspaceEl;
        this.windows = [];
        this.activeWindowId = null;
        this._windowCounter = 0;
        this._zCounter = 10;
        this.onActiveChanged = null;  // callback(windowId)
        this.onWindowClosed = null;   // callback(windowId)
    }

    createWindow(model, title = null) {
        this._windowCounter++;
        const id = `beam_${this._windowCounter}`;
        const winTitle = title || `Beam${this._windowCounter} — ${model.length.toFixed(2)}m`;

        const winEl = document.createElement('div');
        winEl.className = 'mdi-window';
        winEl.id = `mdiWin_${this._windowCounter}`;
        
        // Cascading start position
        const offset = (this._windowCounter % 10) * 30;
        winEl.style.left = `${offset + 20}px`;
        winEl.style.top = `${offset + 20}px`;
        winEl.style.width = '700px';
        winEl.style.height = '450px';
        winEl.style.zIndex = this._zCounter;

        winEl.innerHTML = `
            <div class="mdi-titlebar">
                <span class="mdi-title">${winTitle}</span>
                <div class="mdi-titlebar-btns">
                    <button class="mdi-btn-min" title="Minimize">_</button>
                    <button class="mdi-btn-max" title="Maximize">□</button>
                    <button class="mdi-btn-close" title="Close">×</button>
                </div>
            </div>
            <div class="mdi-client-area">
                <div class="mdi-view-tabs">
                    <button class="tab-btn active" data-view="BEAM">Beam</button>
                    <button class="tab-btn" data-view="SFD">SFD</button>
                    <button class="tab-btn" data-view="BMD">BMD</button>
                    <button class="tab-btn" data-view="DEFLECTION">Deflection</button>
                </div>
                <div class="mdi-canvas-container">
                    <canvas></canvas>
                </div>
            </div>
        `;

        this.workspace.appendChild(winEl);

        const canvas = winEl.querySelector('canvas');
        const container = winEl.querySelector('.mdi-canvas-container');
        
        const beamRenderer = new BeamRenderer(canvas);
        const diagramRenderer = new DiagramRenderer(canvas);

        const winObj = {
            id,
            element: winEl,
            model,
            femResults: null,
            beamRenderer,
            diagramRenderer,
            canvas,
            currentViewTab: 'BEAM',
            selectedElement: null,
            title: winTitle,
            isMaximized: false,
            isMinimized: false,
            previousRect: null
        };

        this.windows.push(winObj);

        this._setupWindowEvents(winObj);
        
        // Resize observer
        const ro = new ResizeObserver(() => {
            if (this.activeWindowId === id) {
                this.resizeActiveCanvas();
                this.renderWindow(winObj);
            }
        });
        ro.observe(container);

        this.setActiveWindow(id);
        
        return winObj;
    }

    _setupWindowEvents(winObj) {
        const { id, element } = winObj;
        const titlebar = element.querySelector('.mdi-titlebar');
        const btnClose = element.querySelector('.mdi-btn-close');
        const btnMax = element.querySelector('.mdi-btn-max');
        const btnMin = element.querySelector('.mdi-btn-min');
        const tabs = element.querySelectorAll('.tab-btn');

        // Activation
        element.addEventListener('mousedown', () => {
            this.setActiveWindow(id);
        });

        // Tabs
        tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                winObj.currentViewTab = tab.dataset.view;
                this.renderWindow(winObj);
            });
        });

        // Window controls
        btnClose.addEventListener('click', (e) => {
            e.stopPropagation();
            this.closeWindow(id);
        });

        btnMax.addEventListener('click', (e) => {
            e.stopPropagation();
            if (winObj.isMaximized) {
                element.style.left = winObj.previousRect.left;
                element.style.top = winObj.previousRect.top;
                element.style.width = winObj.previousRect.width;
                element.style.height = winObj.previousRect.height;
                winObj.isMaximized = false;
            } else {
                if (!winObj.isMinimized) {
                    winObj.previousRect = {
                        left: element.style.left,
                        top: element.style.top,
                        width: element.style.width,
                        height: element.style.height
                    };
                }
                element.style.left = '0px';
                element.style.top = '0px';
                element.style.width = '100%';
                element.style.height = '100%';
                winObj.isMaximized = true;
                if (winObj.isMinimized) {
                    winObj.isMinimized = false;
                    element.querySelector('.mdi-client-area').style.display = 'flex';
                }
            }
            this.resizeActiveCanvas();
            this.renderWindow(winObj);
            if (this.onStateChanged) this.onStateChanged();
        });

        btnMin.addEventListener('click', (e) => {
            e.stopPropagation();
            winObj.isMinimized = !winObj.isMinimized;
            if (winObj.isMinimized) {
                winObj.preMinRect = {
                    left: element.style.left,
                    top: element.style.top,
                    width: element.style.width,
                    height: element.style.height
                };
                element.querySelector('.mdi-client-area').style.display = 'none';
                element.style.height = 'auto';
                element.style.width = '250px';
                
                // Position at the bottom left roughly
                element.style.top = 'calc(100% - 35px)';
            } else {
                element.querySelector('.mdi-client-area').style.display = 'flex';
                if (winObj.preMinRect) {
                    element.style.left = winObj.preMinRect.left;
                    element.style.top = winObj.preMinRect.top;
                    element.style.width = winObj.preMinRect.width;
                    element.style.height = winObj.preMinRect.height;
                } else if (!winObj.isMaximized) {
                    element.style.height = winObj.previousRect ? winObj.previousRect.height : '450px';
                    element.style.width = winObj.previousRect ? winObj.previousRect.width : '700px';
                } else {
                    element.style.height = '100%';
                    element.style.width = '100%';
                }
            }
            if (this.onStateChanged) this.onStateChanged();
        });

        // Draggable
        let isDragging = false;
        let startX, startY, initialLeft, initialTop;

        titlebar.addEventListener('mousedown', (e) => {
            if (e.target.tagName.toLowerCase() === 'button') return;
            if (winObj.isMaximized) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            initialLeft = parseInt(element.style.left || 0, 10);
            initialTop = parseInt(element.style.top || 0, 10);
            
            e.preventDefault(); // Prevent text selection
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            
            element.style.left = `${initialLeft + dx}px`;
            element.style.top = `${initialTop + dy}px`;
        });

        document.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                if (this.onStateChanged) this.onStateChanged();
            }
        });
    }

    setActiveWindow(windowId) {
        this.windows.forEach(w => {
            w.element.classList.remove('active');
        });

        const win = this.windows.find(w => w.id === windowId);
        if (win) {
            this._zCounter++;
            win.element.style.zIndex = this._zCounter;
            win.element.classList.add('active');
            this.activeWindowId = windowId;
            this.resizeActiveCanvas();
            this.renderWindow(win);
        }
        if (this.onActiveChanged) this.onActiveChanged(windowId);
    }

    getActiveWindow() {
        return this.windows.find(w => w.id === this.activeWindowId) || null;
    }

    closeWindow(windowId) {
        const winIndex = this.windows.findIndex(w => w.id === windowId);
        if (winIndex !== -1) {
            const win = this.windows[winIndex];
            win.element.remove();
            this.windows.splice(winIndex, 1);

            if (this.activeWindowId === windowId) {
                if (this.windows.length > 0) {
                    this.setActiveWindow(this.windows[this.windows.length - 1].id);
                } else {
                    this.activeWindowId = null;
                }
            }
            if (this.onWindowClosed) this.onWindowClosed(windowId);
        }
    }

    resizeActiveCanvas() {
        const win = this.getActiveWindow();
        if (win) {
            const container = win.element.querySelector('.mdi-canvas-container');
            const rect = container.getBoundingClientRect();
            win.canvas.width = rect.width;
            win.canvas.height = rect.height;
        }
    }

    renderWindow(winObj) {
        if (!winObj) return;
        
        const ctx = winObj.canvas.getContext('2d');
        ctx.clearRect(0, 0, winObj.canvas.width, winObj.canvas.height);

        switch (winObj.currentViewTab) {
            case 'BEAM':
                winObj.beamRenderer.render(winObj.model, winObj.femResults);
                break;
            case 'SFD':
                winObj.diagramRenderer.render(winObj.model, winObj.femResults, 'SFD');
                break;
            case 'BMD':
                winObj.diagramRenderer.render(winObj.model, winObj.femResults, 'BMD');
                break;
            case 'DEFLECTION':
                winObj.diagramRenderer.render(winObj.model, winObj.femResults, 'DEFLECTION');
                break;
        }
    }
}
