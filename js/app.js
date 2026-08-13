/**
 * app.js
 * Main Application Controller for Beamax.
 * Connects BeamModel, FEM Solver, Analytical Solvers, Canvas Renderers, Menu Actions,
 * Dialog Handlers, and the Calculations Side-Dialog with method applicability checks.
 */

import { BeamModel } from './models/BeamModel.js';
import { FemSolver } from './solver/fem.js';
import { DeterminacyEvaluator } from './solver/determinacy.js';
import { DirectEquilibriumSolver } from './solver/directMethod.js';
import { ThreeMomentSolver } from './solver/threeMoment.js';
import { FixedEndMomentsSolver } from './solver/fixedEndMoments.js';
import { DeflectionIntegrationSolver } from './solver/deflectionMethod.js';
import { RcDesign } from './solver/rcDesign.js';
import { MathUtils } from './solver/math.js';
import { BcbParser } from './io/bcbParser.js';
import { MdiManager } from './view/mdiManager.js';

class BeamaxApp {
    constructor() {
        this.mdiManager = null; // initialized in initDOM
        this.currentCalcMethod = 'matrix';
        this._editingElementId = null; // for right-click edit dialogs
        this._newBeamMode = false; // true when 'New Beam' action, false when 'Properties'
        
        this.initDOM();
        this.bindEvents();
        this.autoLoadWorkspace();
        this.updateMenuState(); // disable menus since no beam exists yet
    }

    initDOM() {
        const mdiWorkspace = document.getElementById('mdiWorkspace') || document.body;
        this.mdiManager = new MdiManager(mdiWorkspace);

        this.mdiManager.onActiveChanged = (windowId) => {
            const win = this.mdiManager.getActiveWindow();
            if (win) this.updateWindowState(win);
            this.updateMenuState();
        };

        this.mdiManager.onWindowClosed = (windowId) => {
            const win = this.mdiManager.getActiveWindow();
            if (win) {
                this.updateWindowState(win);
            } else {
                // No active window left
                this.updatePropertiesSidebar();
                this.statusText.textContent = 'Beam Status: N/A';
                this.statusEquilibrium.textContent = 'Equilibrium: N/A';
                if (this.calcSidebar) this.calcSidebar.classList.remove('open');
            }
            this.updateMenuState();
            this.autoSaveWorkspace();
        };

        this.mdiManager.onStateChanged = () => {
            this.autoSaveWorkspace();
        };

        this.fileInput = document.getElementById('fileInput');

        this.calcSidebar = document.getElementById('calcSidebar');
        this.calcContent = document.getElementById('calcContent');
        
        // Design Sidebar
        this.designSidebar = document.getElementById('designSidebar');
        this.designContent = document.getElementById('designContent');
        this.toolDesign = document.getElementById('toolDesign');
        this.btnRunDesign = document.getElementById('btnRunDesign');

        // Status bar elements
        this.statusText = document.getElementById('statusText');
        this.statusEquilibrium = document.getElementById('statusEquilibrium');
        this.statusIndicator = document.getElementById('statusIndicator');
        this.statusCoord = document.getElementById('statusCoord');

        // Properties Sidebar elements
        this.propLength = document.getElementById('propLength');
        this.propElasticity = document.getElementById('propElasticity');
        this.propInertia = document.getElementById('propInertia');
        this.propEI = document.getElementById('propEI');
        this.supportsList = document.getElementById('supportsList');
        this.loadsList = document.getElementById('loadsList');

        // Calculations menu items & buttons
        this.menuCalculations = document.getElementById('menuCalculations');
        this.toolCalculations = document.getElementById('toolCalculations');

        // Method sub-toolbar buttons inside Calculations dialog
        this.btnMethodMatrix = document.getElementById('btnMethodMatrix');
        this.btnMethodDirect = document.getElementById('btnMethodDirect');
        this.btnMethodThreeMoment = document.getElementById('btnMethodThreeMoment');
        this.btnMethodFixedEnd = document.getElementById('btnMethodFixedEnd');
        this.btnMethodDeflection = document.getElementById('btnMethodDeflection');

        // Edit dialog elements
        this.dialogEditSupport = document.getElementById('dialogEditSupport');
        this.formEditSupport = document.getElementById('formEditSupport');
        this.editSupportType = document.getElementById('editSupportType');
        this.editSupportX = document.getElementById('editSupportX');

        this.dialogEditPointLoad = document.getElementById('dialogEditPointLoad');
        this.formEditPointLoad = document.getElementById('formEditPointLoad');
        this.editPointX = document.getElementById('editPointX');
        this.editPointP = document.getElementById('editPointP');

        this.dialogEditDistLoad = document.getElementById('dialogEditDistLoad');
        this.formEditDistLoad = document.getElementById('formEditDistLoad');
        this.editDistStart = document.getElementById('editDistStart');
        this.editDistLen = document.getElementById('editDistLen');
        this.editDistQ = document.getElementById('editDistQ');

        this.sidebarToggle = document.getElementById('sidebarToggle');
        this.taskPane = document.querySelector('.tasks-pane');
    }

    getActiveModel() {
        return this.mdiManager.getActiveWindow()?.model || null;
    }

    getActiveWindow() {
        return this.mdiManager.getActiveWindow();
    }

    createNewBeam(length, E, I) {
        const model = new BeamModel(length, E, I);
        const windowObj = this.mdiManager.createWindow(model);
        
        model.subscribe(() => this.onModelChanged(windowObj));
        
        this.bindCanvasEvents(windowObj);
        this.onModelChanged(windowObj);
        
        this.updateMenuState();
        this.updateWindowState(windowObj);
    }

    onModelChanged(windowObj) {
        windowObj.determinacy = DeterminacyEvaluator.evaluate(windowObj.model);
        console.log('[Beamax] determinacy:', windowObj.determinacy.isSolvable, windowObj.determinacy.reason);
        
        if (windowObj.determinacy.isSolvable) {
            try {
                windowObj.femResults = FemSolver.solve(windowObj.model);
                console.log('[Beamax] FEM solved OK. Samples:', windowObj.femResults.samples.length, 'Reactions:', windowObj.femResults.supportReactions.length);
            } catch (err) {
                console.error("[Beamax] FEM Solver error:", err);
                windowObj.femResults = null;
            }
        } else {
            windowObj.femResults = null;
        }
        
        this.mdiManager.renderWindow(windowObj);
        
        if (this.getActiveWindow() === windowObj) {
            this.updateWindowState(windowObj);
            
            if (this.calcSidebar && this.calcSidebar.classList.contains('open')) {
                this.renderCalculationsView();
            }
        }
        this.autoSaveWorkspace();
    }

    updateMenuState() {
        const hasWindows = this.mdiManager.windows.length > 0;
        
        const actionIds = [
            'actionNewBeam', 'toolNewBeam', 
            'toolFixedSupport', 'actionFixedSupport',
            'toolHingedSupport', 'actionHingedSupport',
            'toolRollerSupport', 'actionRollerSupport',
            'toolPointLoad', 'actionPointLoad',
            'toolDistLoad', 'actionDistLoad',
            'toolProperties', 'actionProperties',
            'toolCalculations', 'menuCalculations', 'toolDesign'
        ];
        
        actionIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                // New beam is always enabled, others depend on if active window exists
                if (!hasWindows && id !== 'actionNewBeam' && id !== 'toolNewBeam') {
                    el.classList.add('disabled');
                    if (el.tagName === 'BUTTON') el.disabled = true;
                } else {
                    el.classList.remove('disabled');
                    if (el.tagName === 'BUTTON') el.disabled = false;
                }
            }
        });

        if (!hasWindows) {
            this.updatePropertiesSidebar();
        } else {
            const win = this.getActiveWindow();
            if (win && win.determinacy) {
                if (!win.determinacy.isSolvable) {
                    this.menuCalculations?.classList.add('disabled');
                    this.toolCalculations?.classList.add('disabled');
                    this.toolDesign?.classList.add('disabled');
                } else {
                    this.menuCalculations?.classList.remove('disabled');
                    this.toolCalculations?.classList.remove('disabled');
                    this.toolDesign?.classList.remove('disabled');
                }
            }
        }
    }

    updateWindowState(windowObj) {
        this.updatePropertiesSidebar();
        
        if (windowObj && windowObj.determinacy) {
            if (windowObj.determinacy.isSolvable) {
                this.statusIndicator?.classList.remove('unstable');
                this.statusText.textContent = `Beam Status: ${windowObj.determinacy.reason}`;
                
                if (windowObj.femResults) {
                    this.statusEquilibrium.textContent = `Equilibrium: ${windowObj.femResults.summary.isEquilibriumPass ? 'PASS (0.00 kN Error)' : 'UNBALANCED'}`;
                } else {
                    this.statusEquilibrium.textContent = 'Equilibrium: ERROR';
                }
            } else {
                this.statusIndicator?.classList.add('unstable');
                this.statusText.textContent = `Beam Status: ${windowObj.determinacy.reason}`;
                this.statusEquilibrium.textContent = 'Equilibrium: N/A';
            }
            
            this.updateMethodButtonsAvailability();
            
            if (this.calcSidebar && this.calcSidebar.classList.contains('open')) {
                this.renderCalculationsView();
            }
        }
    }

    bindEvents() {
        // Menu bar dropdown toggle (exclude Calculations which has its own handler)
        document.querySelectorAll('.menu-item').forEach(item => {
            if (item.id === 'menuCalculations') return;
            item.addEventListener('click', (e) => {
                const wasActive = item.classList.contains('active');
                document.querySelectorAll('.menu-item:not(#menuCalculations)').forEach(m => m.classList.remove('active'));
                if (!wasActive && item.querySelector('.menu-dropdown')) {
                    item.classList.add('active');
                }
            });
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.menu-item')) {
                document.querySelectorAll('.menu-item').forEach(m => m.classList.remove('active'));
            }
        });

        this.bindActionButtons();
        this.bindDialogHandlers();
        this.bindFileIO();
        this.bindCalculationsDialog();
        this.bindDesignDialog();
        
        if (this.sidebarToggle && this.taskPane) {
            this.sidebarToggle.addEventListener('click', () => {
                this.taskPane.classList.toggle('collapsed');
                this.sidebarToggle.textContent = this.taskPane.classList.contains('collapsed') ? '▶ Properties' : '◀ Properties';
            });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') {
                const win = this.getActiveWindow();
                if (!win || !win.selectedElement) return;
                // Don't delete if a dialog is open or input is focused
                if (document.activeElement && (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT')) return;
                
                const sel = win.selectedElement;
                const model = win.model;
                if (sel.type === 'support') model.removeSupport(sel.id);
                else if (sel.type === 'pointLoad') model.removePointLoad(sel.id);
                else if (sel.type === 'distributedLoad') model.removeDistributedLoad(sel.id);
                
                win.selectedElement = null;
                win.beamRenderer.selectedElementId = null;
                this.mdiManager.renderWindow(win);
            }
        });
    }
    
    bindCanvasEvents(windowObj) {
        const canvas = windowObj.canvas;
        let clickTimeout = null;
        
        // Double-click to select element
        canvas.addEventListener('dblclick', (e) => {
            clearTimeout(clickTimeout);
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const hit = windowObj.beamRenderer.hitTest(mouseX, mouseY);
            if (hit) {
                windowObj.selectedElement = hit;
                windowObj.beamRenderer.selectedElementId = hit.id;
            } else {
                windowObj.selectedElement = null;
                windowObj.beamRenderer.selectedElementId = null;
            }
            this.mdiManager.renderWindow(windowObj);
        });
        
        // Single click clears selection
        canvas.addEventListener('click', (e) => {
            if (e.detail === 1) {
                clickTimeout = setTimeout(() => {
                    const rect = canvas.getBoundingClientRect();
                    const mouseX = e.clientX - rect.left;
                    const mouseY = e.clientY - rect.top;
                    const hit = windowObj.beamRenderer.hitTest(mouseX, mouseY);
                    if (!hit) {
                        windowObj.selectedElement = null;
                        windowObj.beamRenderer.selectedElementId = null;
                        this.mdiManager.renderWindow(windowObj);
                    }
                }, 200);
            }
        });
        
        // Right-click context edit
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            const hit = windowObj.beamRenderer.hitTest(mouseX, mouseY);
            if (hit) {
                windowObj.selectedElement = hit;
                windowObj.beamRenderer.selectedElementId = hit.id;
                this.mdiManager.renderWindow(windowObj);
                this._editingElementId = hit.id;
                this.openEditDialog(hit);
            }
        });
        
        // Mouse coordinates in status bar
        canvas.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const plotW = canvas.width - 160;
            const scaleX = plotW / windowObj.model.length;
            const beamX = Math.max(0, Math.min(windowObj.model.length, (mouseX - 80) / scaleX));
            if (this.statusCoord && this.getActiveWindow() === windowObj) {
                this.statusCoord.textContent = `x = ${beamX.toFixed(3)} m`;
            }
        });
    }

    bindActionButtons() {
        // New Beam (always creates a new window)
        document.getElementById('actionNewBeam')?.addEventListener('click', () => { this._newBeamMode = true; this.openDialog('dialogNewBeam'); });
        document.getElementById('toolNewBeam')?.addEventListener('click', () => { this._newBeamMode = true; this.openDialog('dialogNewBeam'); });

        // Supports
        document.getElementById('toolFixedSupport')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogFixedSupport'); });
        document.getElementById('actionFixedSupport')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogFixedSupport'); });

        document.getElementById('toolHingedSupport')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogHingedSupport'); });
        document.getElementById('actionHingedSupport')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogHingedSupport'); });

        document.getElementById('toolRollerSupport')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogRollerSupport'); });
        document.getElementById('actionRollerSupport')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogRollerSupport'); });

        // Loads
        document.getElementById('toolPointLoad')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogPointLoad'); });
        document.getElementById('actionPointLoad')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogPointLoad'); });

        document.getElementById('toolDistLoad')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogDistLoad'); });
        document.getElementById('actionDistLoad')?.addEventListener('click', () => { if (this.getActiveModel()) this.openDialog('dialogDistLoad'); });

        // Properties (edits existing beam) & About
        document.getElementById('toolProperties')?.addEventListener('click', () => { if (this.getActiveModel()) { this._newBeamMode = false; this.openDialog('dialogNewBeam'); } });
        document.getElementById('actionProperties')?.addEventListener('click', () => { if (this.getActiveModel()) { this._newBeamMode = false; this.openDialog('dialogNewBeam'); } });
        document.getElementById('actionAbout')?.addEventListener('click', () => this.openDialog('dialogAbout'));
    }

    bindDialogHandlers() {
        // Close buttons
        document.querySelectorAll('.dialog-close, .dialog-cancel').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const overlay = e.target.closest('.dialog-overlay');
                if (overlay) overlay.classList.remove('open');
            });
        });

        // Submit New Beam
        document.getElementById('formNewBeam')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const len = parseFloat(document.getElementById('inputBeamLength').value);
            const E = parseFloat(document.getElementById('inputBeamElasticity').value);
            const I = parseFloat(document.getElementById('inputBeamInertia').value);
            try {
                if (!this._newBeamMode && this.getActiveModel()) {
                    // Editing existing beam properties
                    this.getActiveModel().setProperties(len, E, I);
                } else {
                    // Creating a new beam window
                    this.createNewBeam(len, E, I);
                }
                this._newBeamMode = false;
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });

        // Submit Fixed Support
        document.getElementById('formFixedSupport')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const x = parseFloat(document.getElementById('inputFixedX').value);
            try {
                this.getActiveModel()?.addSupport('Fixed', x);
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });

        // Submit Hinged Support
        document.getElementById('formHingedSupport')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const x = parseFloat(document.getElementById('inputHingedX').value);
            try {
                this.getActiveModel()?.addSupport('Hinged', x);
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });

        // Submit Roller Support
        document.getElementById('formRollerSupport')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const x = parseFloat(document.getElementById('inputRollerX').value);
            try {
                this.getActiveModel()?.addSupport('Roller', x);
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });

        // Submit Point Load
        document.getElementById('formPointLoad')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const x = parseFloat(document.getElementById('inputPointX').value);
            const p = parseFloat(document.getElementById('inputPointP').value);
            try {
                this.getActiveModel()?.addPointLoad(x, p);
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });

        // Submit Distributed Load
        document.getElementById('formDistLoad')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const start = parseFloat(document.getElementById('inputDistStart').value);
            const len = parseFloat(document.getElementById('inputDistLen').value);
            const q = parseFloat(document.getElementById('inputDistQ').value);
            try {
                this.getActiveModel()?.addDistributedLoad(start, len, q);
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });
        
        // EDIT DIALOG HANDLERS
        this.formEditSupport?.addEventListener('submit', (e) => {
            e.preventDefault();
            const type = this.editSupportType.value;
            const x = parseFloat(this.editSupportX.value);
            try {
                const win = this.getActiveWindow();
                if (win && this._editingElementId) {
                    win.model.updateSupport(this._editingElementId, type, x);
                    win.selectedElement = null;
                    win.beamRenderer.selectedElementId = null;
                    this.mdiManager.renderWindow(win);
                }
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });

        this.formEditPointLoad?.addEventListener('submit', (e) => {
            e.preventDefault();
            const x = parseFloat(this.editPointX.value);
            const p = parseFloat(this.editPointP.value);
            try {
                const win = this.getActiveWindow();
                if (win && this._editingElementId) {
                    win.model.updatePointLoad(this._editingElementId, x, p);
                    win.selectedElement = null;
                    win.beamRenderer.selectedElementId = null;
                    this.mdiManager.renderWindow(win);
                }
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });

        this.formEditDistLoad?.addEventListener('submit', (e) => {
            e.preventDefault();
            const start = parseFloat(this.editDistStart.value);
            const len = parseFloat(this.editDistLen.value);
            const q = parseFloat(this.editDistQ.value);
            try {
                const win = this.getActiveWindow();
                if (win && this._editingElementId) {
                    win.model.updateDistributedLoad(this._editingElementId, start, len, q);
                    win.selectedElement = null;
                    win.beamRenderer.selectedElementId = null;
                    this.mdiManager.renderWindow(win);
                }
                this.closeAllDialogs();
            } catch (err) {
                alert(err.message);
            }
        });
    }

    bindFileIO() {
        // Open .bcb
        const handleOpen = () => this.fileInput.click();
        document.getElementById('actionOpen')?.addEventListener('click', handleOpen);
        document.getElementById('toolOpen')?.addEventListener('click', handleOpen);

        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                try {
                    const loadedModel = BcbParser.parse(ev.target.result);
                    let maxId = 0;
                    [...loadedModel.supports, ...loadedModel.pointLoads, ...loadedModel.distributedLoads].forEach(item => {
                        const num = parseInt(item.id.split('_')[1], 10);
                        if (!isNaN(num) && num > maxId) maxId = num;
                    });
                    loadedModel._idCounter = maxId + 1;
                    
                    const windowObj = this.mdiManager.createWindow(loadedModel, file.name);
                    loadedModel.subscribe(() => this.onModelChanged(windowObj));
                    this.bindCanvasEvents(windowObj);
                    this.onModelChanged(windowObj);
                    
                    this.updateMenuState();
                    this.updateWindowState(windowObj);
                } catch (err) {
                    alert("Error opening .bcb file: " + err.message);
                }
            };
            reader.readAsArrayBuffer(file);
            this.fileInput.value = '';
        });

        // Save .bcb
        const handleSave = () => {
            const model = this.getActiveModel();
            if (!model) return;
            try {
                const buffer = BcbParser.serialize(model);
                const blob = new Blob([buffer], { type: 'application/octet-stream' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'BeamCalculation.bcb';
                a.click();
                URL.revokeObjectURL(url);
            } catch (err) {
                alert("Error saving .bcb file: " + err.message);
            }
        };

        document.getElementById('actionSave')?.addEventListener('click', handleSave);
        document.getElementById('toolSave')?.addEventListener('click', handleSave);
    }

    bindCalculationsDialog() {
        // Toggle Calculations Side-Dialog
        const toggleCalculations = () => {
            const win = this.getActiveWindow();
            if (!win || !win.determinacy || !win.determinacy.isSolvable) return;
            this.calcSidebar.classList.toggle('open');
            // Close design sidebar if open
            if (this.designSidebar && this.designSidebar.classList.contains('open')) {
                this.designSidebar.classList.remove('open');
            }
            // Resize canvas since sidebar changes available width
            requestAnimationFrame(() => {
                this.mdiManager.resizeActiveCanvas();
                this.mdiManager.renderWindow(win);
            });
            this.renderCalculationsView();
        };

        this.menuCalculations?.addEventListener('click', toggleCalculations);
        this.toolCalculations?.addEventListener('click', toggleCalculations);
        document.getElementById('closeCalcSidebar')?.addEventListener('click', () => {
            this.calcSidebar.classList.remove('open');
            const win = this.getActiveWindow();
            if (win) {
                requestAnimationFrame(() => {
                    this.mdiManager.resizeActiveCanvas();
                    this.mdiManager.renderWindow(win);
                });
            }
        });

        // Sub-toolbar method selection
        const methodButtons = [
            { btn: this.btnMethodMatrix, method: 'matrix' },
            { btn: this.btnMethodDirect, method: 'direct' },
            { btn: this.btnMethodThreeMoment, method: 'threeMoment' },
            { btn: this.btnMethodFixedEnd, method: 'fixedEnd' },
            { btn: this.btnMethodDeflection, method: 'deflection' }
        ];

        methodButtons.forEach(({ btn, method }) => {
            btn?.addEventListener('click', () => {
                if (btn.classList.contains('disabled')) return;
                document.querySelectorAll('.calc-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.currentCalcMethod = method;
                this.renderCalculationsView();
            });
        });
    }

    bindDesignDialog() {
        // Toggle Design Side-Dialog
        const toggleDesign = () => {
            const win = this.getActiveWindow();
            if (!win || !win.determinacy || !win.determinacy.isSolvable) return;
            this.designSidebar.classList.toggle('open');
            // Close calc sidebar if open
            if (this.calcSidebar.classList.contains('open')) {
                this.calcSidebar.classList.remove('open');
            }
            requestAnimationFrame(() => {
                this.mdiManager.resizeActiveCanvas();
                this.mdiManager.renderWindow(win);
            });
        };

        this.toolDesign?.addEventListener('click', toggleDesign);
        document.getElementById('closeDesignSidebar')?.addEventListener('click', () => {
            this.designSidebar.classList.remove('open');
            const win = this.getActiveWindow();
            if (win) {
                requestAnimationFrame(() => {
                    this.mdiManager.resizeActiveCanvas();
                    this.mdiManager.renderWindow(win);
                });
            }
        });

        // Run Design
        this.btnRunDesign?.addEventListener('click', () => {
            const win = this.getActiveWindow();
            if (!win || !win.femResults) return;
            
            const params = {
                code: document.getElementById('designCode').value,
                material: document.getElementById('designMaterial').value,
                b: document.getElementById('designB').value,
                h: document.getElementById('designH').value,
                fcu: document.getElementById('designFcu').value,
                fy: document.getElementById('designFy').value,
                cover: document.getElementById('designCover').value,
                mainBar: document.getElementById('designMainBar').value,
                link: document.getElementById('designLink').value
            };
            
            const reportHtml = RcDesign.generateReport(win.model, win.femResults, params);
            this.designContent.innerHTML = reportHtml;
            
            // Collapse configuration after input
            const formContainer = document.querySelector('.design-form-container');
            if (formContainer && formContainer.tagName === 'DETAILS') {
                formContainer.removeAttribute('open');
            }
            
            // Trigger MathJax
            if (window.MathJax && window.MathJax.typesetPromise) {
                window.MathJax.typesetPromise([this.designContent]).catch(err => console.warn('MathJax typeset:', err));
            }
        });
    }

    openEditDialog(hit) {
        this.closeAllDialogs();
        if (hit.type === 'support') {
            if (this.editSupportType) this.editSupportType.value = hit.element.type;
            if (this.editSupportX) this.editSupportX.value = hit.element.x;
            if (this.dialogEditSupport) this.dialogEditSupport.classList.add('open');
        } else if (hit.type === 'pointLoad') {
            if (this.editPointX) this.editPointX.value = hit.element.x;
            if (this.editPointP) this.editPointP.value = hit.element.magnitude;
            if (this.dialogEditPointLoad) this.dialogEditPointLoad.classList.add('open');
        } else if (hit.type === 'distributedLoad') {
            if (this.editDistStart) this.editDistStart.value = hit.element.start;
            if (this.editDistLen) this.editDistLen.value = hit.element.length;
            if (this.editDistQ) this.editDistQ.value = hit.element.magnitude;
            if (this.dialogEditDistLoad) this.dialogEditDistLoad.classList.add('open');
        }
    }

    openDialog(id) {
        this.closeAllDialogs();
        const dialog = document.getElementById(id);
        if (dialog) {
            // Prepopulate properties if editing beam
            if (id === 'dialogNewBeam' && this.getActiveModel()) {
                document.getElementById('inputBeamLength').value = this.getActiveModel().length;
                document.getElementById('inputBeamElasticity').value = this.getActiveModel().elasticity;
                document.getElementById('inputBeamInertia').value = this.getActiveModel().inertia;
            }
            dialog.classList.add('open');
        }
    }

    closeAllDialogs() {
        document.querySelectorAll('.dialog-overlay').forEach(d => d.classList.remove('open'));
    }

    updateMethodButtonsAvailability() {
        const win = this.getActiveWindow();
        if (!win || !win.determinacy || !win.determinacy.methods) {
            this.setMethodBtnState(this.btnMethodMatrix, false, "");
            this.setMethodBtnState(this.btnMethodDirect, false, "");
            this.setMethodBtnState(this.btnMethodThreeMoment, false, "");
            this.setMethodBtnState(this.btnMethodFixedEnd, false, "");
            this.setMethodBtnState(this.btnMethodDeflection, false, "");
            return;
        }

        const methods = win.determinacy.methods;
        const tooltips = win.determinacy.methodTooltips || {};

        this.setMethodBtnState(this.btnMethodMatrix, methods.matrixStiffness, tooltips.matrixStiffness);
        this.setMethodBtnState(this.btnMethodDirect, methods.directEquilibrium, tooltips.directEquilibrium);
        this.setMethodBtnState(this.btnMethodThreeMoment, methods.threeMoment, tooltips.threeMoment);
        this.setMethodBtnState(this.btnMethodFixedEnd, methods.fixedEndMoments, tooltips.fixedEndMoments);
        this.setMethodBtnState(this.btnMethodDeflection, methods.deflectionIntegration, tooltips.deflectionIntegration);

        // If current method is disabled, fallback to matrix stiffness
        if (this.currentCalcMethod === 'direct' && !methods.directEquilibrium) this.currentCalcMethod = 'matrix';
        if (this.currentCalcMethod === 'threeMoment' && !methods.threeMoment) this.currentCalcMethod = 'matrix';
        if (this.currentCalcMethod === 'fixedEnd' && !methods.fixedEndMoments) this.currentCalcMethod = 'matrix';

        document.querySelectorAll('.calc-method-btn').forEach(b => b.classList.remove('active'));
        if (this.currentCalcMethod === 'matrix') this.btnMethodMatrix?.classList.add('active');
        else if (this.currentCalcMethod === 'direct') this.btnMethodDirect?.classList.add('active');
        else if (this.currentCalcMethod === 'threeMoment') this.btnMethodThreeMoment?.classList.add('active');
        else if (this.currentCalcMethod === 'fixedEnd') this.btnMethodFixedEnd?.classList.add('active');
        else if (this.currentCalcMethod === 'deflection') this.btnMethodDeflection?.classList.add('active');
    }

    setMethodBtnState(btn, isEnabled, tooltip) {
        if (!btn) return;
        if (isEnabled) {
            btn.classList.remove('disabled');
            btn.removeAttribute('disabled');
        } else {
            btn.classList.add('disabled');
            btn.setAttribute('disabled', 'true');
        }
        btn.title = tooltip || "";
    }

    updatePropertiesSidebar() {
        const model = this.getActiveModel();
        
        if (!model) {
            if (this.propLength) this.propLength.textContent = '-';
            if (this.propElasticity) this.propElasticity.textContent = '-';
            if (this.propInertia) this.propInertia.textContent = '-';
            if (this.propEI) this.propEI.textContent = '-';
            if (this.supportsList) this.supportsList.innerHTML = '';
            if (this.loadsList) this.loadsList.innerHTML = '';
            return;
        }

        if (this.propLength) this.propLength.textContent = `${model.length.toFixed(3)} m`;
        if (this.propElasticity) this.propElasticity.textContent = `${model.elasticity.toExponential(2)} kN/m²`;
        if (this.propInertia) this.propInertia.textContent = `${model.inertia.toExponential(2)} m⁴`;
        if (this.propEI) this.propEI.textContent = `${model.flexuralRigidity.toFixed(1)} kN·m²`;

        // Render Supports list
        if (this.supportsList) {
            this.supportsList.innerHTML = '';
            model.supports.forEach(s => {
                const li = document.createElement('li');
                li.className = 'item-entry';
                li.innerHTML = `<span><strong>${s.type}</strong> @ x = ${s.x.toFixed(3)}m</span>
                    <button class="btn-del" title="Delete support">&times;</button>`;
                li.querySelector('.btn-del').addEventListener('click', () => model.removeSupport(s.id));
                this.supportsList.appendChild(li);
            });
        }

        // Render Loads list
        if (this.loadsList) {
            this.loadsList.innerHTML = '';
            model.pointLoads.forEach(p => {
                const li = document.createElement('li');
                li.className = 'item-entry';
                li.innerHTML = `<span>Point ${p.magnitude}kN @ x=${p.x.toFixed(3)}m</span>
                    <button class="btn-del" title="Delete load">&times;</button>`;
                li.querySelector('.btn-del').addEventListener('click', () => model.removePointLoad(p.id));
                this.loadsList.appendChild(li);
            });

            model.distributedLoads.forEach(d => {
                const li = document.createElement('li');
                li.className = 'item-entry';
                li.innerHTML = `<span>UDL ${d.magnitude}kN/m (${d.start.toFixed(1)}m–${(d.start + d.length).toFixed(1)}m)</span>
                    <button class="btn-del" title="Delete load">&times;</button>`;
                li.querySelector('.btn-del').addEventListener('click', () => model.removeDistributedLoad(d.id));
                this.loadsList.appendChild(li);
            });
        }
    }

    renderCalculationsView() {
        const win = this.getActiveWindow();
        if (!win || !win.femResults) {
            this.calcContent.innerHTML = '<p style="color: #777;">No valid calculation results to display.</p>';
            return;
        }

        let reportHtml = '';

        if (this.currentCalcMethod === 'matrix') {
            reportHtml = this.generateMatrixStiffnessReport(win.model, win.femResults);
        } else if (this.currentCalcMethod === 'direct') {
            reportHtml = DirectEquilibriumSolver.generateReport(win.model, win.femResults);
        } else if (this.currentCalcMethod === 'threeMoment') {
            reportHtml = ThreeMomentSolver.generateReport(win.model, win.femResults);
        } else if (this.currentCalcMethod === 'fixedEnd') {
            reportHtml = FixedEndMomentsSolver.generateReport(win.model, win.femResults);
        } else if (this.currentCalcMethod === 'deflection') {
            reportHtml = DeflectionIntegrationSolver.generateReport(win.model, win.femResults);
        }

        this.calcContent.innerHTML = reportHtml || '<p>Report generation error.</p>';
        // Trigger MathJax to typeset LaTeX in the calculation report
        if (window.MathJax && window.MathJax.typesetPromise) {
            window.MathJax.typesetPromise([this.calcContent]).catch(err => console.warn('MathJax typeset:', err));
        }
    }

    generateMatrixStiffnessReport(model, fr) {
        let html = '<div class="calc-section">';
        html += '<h3>Matrix Stiffness Method (Step-by-Step)</h3>';
        html += '<p class="calc-desc">Universal 1D direct stiffness formulation using 2-node Euler-Bernoulli beam elements.</p>';

        html += '<h4>Step 1: Discretization (Nodes and Elements)</h4>';
        html += '<div class="calc-box">';
        html += `<p>Total Nodes: <strong>${fr.nodes.length}</strong> | Elements: <strong>${fr.elements.length}</strong> | DOFs: <strong>${fr.nodes.length * 2}</strong> (2 per node: \\(v, \\theta\\))</p>`;
        html += '<ul>';
        for (let i = 0; i < fr.nodes.length; i++) {
            html += `<li>Node ${i+1}: \\(x = ${fr.nodes[i].toFixed(3)}\\text{ m}\\)</li>`;
        }
        html += '</ul></div>';

        html += '<h4>Step 2: Element Stiffness Matrices \\([k_e]\\)</h4>';
        html += '<div class="calc-box">';
        const EI = model.flexuralRigidity || (model.elasticity * model.inertia);
        html += `<p>\\(EI = ${EI.toExponential(2)}\\text{ kN}\\cdot\\text{m}^2\\)</p>`;
        
        for (let i = 0; i < fr.elements.length; i++) {
            const e = fr.elements[i];
            html += `<p><strong>Element ${i+1}</strong> (Nodes ${e.dofs[0]/2 + 1} to ${e.dofs[2]/2 + 1}), \\(L_e = ${e.length.toFixed(3)}\\text{ m}\\):</p>`;
            html += `<p>\\([k_e] = \\frac{EI}{L_e^3} \\begin{bmatrix} 12 & 6L_e & -12 & 6L_e \\\\ 6L_e & 4L_e^2 & -6L_e & 2L_e^2 \\\\ -12 & -6L_e & 12 & -6L_e \\\\ 6L_e & 2L_e^2 & -6L_e & 4L_e^2 \\end{bmatrix}\\)</p>`;
        }
        html += '</div>';

        html += '<h4>Step 3: Global Assembly and Load Vector \\([K]\\{U\\} = \\{F\\}</h4>';
        const dofLabels = [];
        for (let i = 0; i < fr.nodes.length; i++) {
            dofLabels.push(`v_{${i+1}}`);
            dofLabels.push(`\\theta_{${i+1}}`);
        }
        html += '<p><strong>Global Stiffness Matrix \\([K]\\):</strong></p>';
        html += MathUtils.matrixToHtmlTable(fr.K_global, dofLabels, dofLabels);
        
        html += '<p><strong>Global Load Vector \\(\\{F\\}\\) (Applied + Fixed End Forces):</strong></p>';
        let fTable = '<table class="calc-results-table"><thead><tr><th>DOF</th><th>Force / Moment</th></tr></thead><tbody>';
        for(let i=0; i<fr.F_global.length; i++) {
            fTable += `<tr><td>\\(${dofLabels[i]}\\)</td><td>${fr.F_global[i].toFixed(3)}</td></tr>`;
        }
        fTable += '</tbody></table>';
        html += fTable;

        html += '<h4>Step 4: Apply Boundary Conditions & Reduce System</h4>';
        html += '<div class="calc-box">';
        html += `<p>Constrained DOFs (Set to 0): ` + fr.fixedDofs.map(d => `\\(${dofLabels[d]}\\)`).join(', ') + `</p>`;
        html += `<p>Free DOFs to solve: ` + fr.freeDofs.map(d => `\\(${dofLabels[d]}\\)`).join(', ') + `</p>`;
        html += '</div>';
        
        html += '<p><strong>Reduced Stiffness Matrix \\([K_{ff}]\\):</strong></p>';
        const freeLabels = fr.freeDofs.map(d => dofLabels[d]);
        html += MathUtils.matrixToHtmlTable(fr.Kff, freeLabels, freeLabels);

        html += '<h4>Step 5: Solve Nodal Displacements \\(\\{U_f\\} = [K_{ff}]^{-1}\\{F_f\\}\\)</h4>';
        html += '<table class="calc-results-table"><thead><tr><th>Node</th><th>Position \\(x\\)</th><th>Deflection \\(v\\)</th><th>Slope \\(\\theta\\)</th></tr></thead><tbody>';
        for (let i = 0; i < fr.nodes.length; i++) {
            const v = fr.U_global[2 * i] * 1000; // mm
            const theta = fr.U_global[2 * i + 1] * 1000; // mrad
            html += `<tr>
                <td><strong>Node ${i + 1}</strong></td>
                <td>${fr.nodes[i].toFixed(3)} m</td>
                <td>${v.toFixed(4)} mm</td>
                <td>${theta.toFixed(4)} mrad</td>
            </tr>`;
        }
        html += '</tbody></table>';

        html += '<h4>Step 6: Compute Reactions \\(\\{R\\} = [K]\\{U\\} - \\{F\\}\\)</h4>';
        html += '<table class="calc-results-table"><thead><tr><th>Support</th><th>Position</th><th>Reaction Force \\(R_y\\)</th><th>Reaction Moment \\(M_r\\)</th></tr></thead><tbody>';
        for (const sr of fr.supportReactions) {
            html += `<tr>
                <td>${sr.supportId}</td>
                <td>${sr.x.toFixed(2)} m</td>
                <td><strong>${sr.Ry.toFixed(3)} kN</strong></td>
                <td><strong>${sr.M !== 0 ? sr.M.toFixed(3) + ' kN·m' : '—'}</strong></td>
            </tr>`;
        }
        html += '</tbody></table>';

        html += '</div>';
        return html;
    }

    autoSaveWorkspace() {
        if (!this.mdiManager) return;
        const savedWindows = this.mdiManager.windows.map(win => {
            const buffer = BcbParser.serialize(win.model);
            const bytes = new Uint8Array(buffer);
            let binary = '';
            for (let i = 0; i < bytes.byteLength; i++) {
                binary += String.fromCharCode(bytes[i]);
            }
            const base64 = btoa(binary);
            return {
                title: win.title,
                data: base64,
                rect: {
                    left: win.element.style.left,
                    top: win.element.style.top,
                    width: win.element.style.width,
                    height: win.element.style.height
                },
                isMaximized: win.isMaximized,
                isMinimized: win.isMinimized,
                previousRect: win.previousRect,
                preMinRect: win.preMinRect
            };
        });
        localStorage.setItem('beamax_workspace', JSON.stringify(savedWindows));
    }

    autoLoadWorkspace() {
        const data = localStorage.getItem('beamax_workspace');
        if (!data) return;
        try {
            const savedWindows = JSON.parse(data);
            savedWindows.forEach(savedWin => {
                const binary = atob(savedWin.data);
                const bytes = new Uint8Array(binary.length);
                for (let i = 0; i < binary.length; i++) {
                    bytes[i] = binary.charCodeAt(i);
                }
                const loadedModel = BcbParser.parse(bytes.buffer);
                let maxId = 0;
                [...loadedModel.supports, ...loadedModel.pointLoads, ...loadedModel.distributedLoads].forEach(item => {
                    const num = parseInt(item.id.split('_')[1], 10);
                    if (!isNaN(num) && num > maxId) maxId = num;
                });
                loadedModel._idCounter = maxId + 1;

                const windowObj = this.mdiManager.createWindow(loadedModel, savedWin.title);
                windowObj.isMaximized = savedWin.isMaximized || false;
                windowObj.isMinimized = savedWin.isMinimized || false;
                windowObj.previousRect = savedWin.previousRect || null;
                windowObj.preMinRect = savedWin.preMinRect || null;

                windowObj.element.style.left = savedWin.rect.left;
                windowObj.element.style.top = savedWin.rect.top;
                windowObj.element.style.width = savedWin.rect.width;
                windowObj.element.style.height = savedWin.rect.height;

                if (windowObj.isMinimized) {
                    windowObj.element.querySelector('.mdi-client-area').style.display = 'none';
                }

                loadedModel.subscribe(() => this.onModelChanged(windowObj));
                this.bindCanvasEvents(windowObj);
                this.onModelChanged(windowObj);
            });
            this.updateMenuState();
        } catch (err) {
            console.error("Failed to restore workspace", err);
        }
    }
}

// Initialize on page load
window.addEventListener('DOMContentLoaded', () => {
    window.app = new BeamaxApp();
});
