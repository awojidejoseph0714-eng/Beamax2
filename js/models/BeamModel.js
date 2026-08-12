/**
 * BeamModel.js
 * Holds the structural state of the beam (geometry, material, supports, loads)
 * and notifies listeners of any changes.
 */

export class BeamModel {
    constructor(length = 8.0, elasticity = 2.1e8, inertia = 8.36e-5) {
        this.length = length;          // Beam length (m)
        this.elasticity = elasticity;  // Modulus of Elasticity E (kN/m^2)
        this.inertia = inertia;        // Moment of Inertia I (m^4)
        
        this.supports = [];            // [{ id, type: 'Fixed'|'Hinged'|'Roller', x }]
        this.pointLoads = [];          // [{ id, x, magnitude }] (magnitude in kN, downward > 0)
        this.distributedLoads = [];    // [{ id, start, length, magnitude }] (magnitude in kN/m, downward > 0)
        
        this.listeners = [];
        this._idCounter = 1;
    }

    get flexuralRigidity() {
        return this.elasticity * this.inertia; // EI in kN*m^2
    }

    setProperties(length, elasticity, inertia) {
        if (length <= 0) throw new Error("Beam length must be greater than zero.");
        if (elasticity <= 0) throw new Error("Modulus of elasticity must be greater than zero.");
        if (inertia <= 0) throw new Error("Moment of inertia must be greater than zero.");

        this.length = parseFloat(length);
        this.elasticity = parseFloat(elasticity);
        this.inertia = parseFloat(inertia);

        // Remove or clamp any supports or loads that now exceed the new beam length
        this.supports = this.supports.filter(s => s.x <= this.length);
        this.pointLoads = this.pointLoads.filter(p => p.x <= this.length);
        this.distributedLoads = this.distributedLoads.filter(d => d.start <= this.length);
        this.distributedLoads.forEach(d => {
            if (d.start + d.length > this.length) {
                d.length = Math.max(0.1, this.length - d.start);
            }
        });

        this.notify();
    }

    addSupport(type, x) {
        x = parseFloat(x);
        if (isNaN(x) || x < 0 || x > this.length) {
            throw new Error(`Support position (${x}m) not in beam range [0, ${this.length}m].`);
        }
        if (!['Fixed', 'Hinged', 'Roller'].includes(type)) {
            throw new Error(`Invalid support type: ${type}`);
        }

        // Check if a support already exists at this coordinate (within 1e-4m tolerance)
        const existing = this.supports.find(s => Math.abs(s.x - x) < 1e-4);
        if (existing) {
            existing.type = type;
        } else {
            this.supports.push({
                id: 'sup_' + this._idCounter++,
                type: type,
                x: Math.round(x * 10000) / 10000
            });
        }
        this.supports.sort((a, b) => a.x - b.x);
        this.notify();
    }

    removeSupport(id) {
        this.supports = this.supports.filter(s => s.id !== id);
        this.notify();
    }

    updateSupport(id, newType, newX) {
        const support = this.supports.find(s => s.id === id);
        if (!support) throw new Error(`Support with id ${id} not found.`);
        
        const x = parseFloat(newX);
        if (isNaN(x) || x < 0 || x > this.length) {
            throw new Error(`Support position (${x}m) not in beam range [0, ${this.length}m].`);
        }
        if (!['Fixed', 'Hinged', 'Roller'].includes(newType)) {
            throw new Error(`Invalid support type: ${newType}`);
        }
        
        support.type = newType;
        support.x = Math.round(x * 10000) / 10000;
        
        this.supports.sort((a, b) => a.x - b.x);
        this.notify();
    }

    addPointLoad(x, magnitude) {
        x = parseFloat(x);
        magnitude = parseFloat(magnitude);
        if (isNaN(x) || x < 0 || x > this.length) {
            throw new Error(`Point load position (${x}m) not in beam range [0, ${this.length}m].`);
        }
        if (isNaN(magnitude)) {
            throw new Error("Point load magnitude is invalid.");
        }

        this.pointLoads.push({
            id: 'pload_' + this._idCounter++,
            x: Math.round(x * 10000) / 10000,
            magnitude: magnitude
        });
        this.pointLoads.sort((a, b) => a.x - b.x);
        this.notify();
    }

    removePointLoad(id) {
        this.pointLoads = this.pointLoads.filter(p => p.id !== id);
        this.notify();
    }

    updatePointLoad(id, newX, newMagnitude) {
        const pLoad = this.pointLoads.find(p => p.id === id);
        if (!pLoad) throw new Error(`Point load with id ${id} not found.`);
        
        const x = parseFloat(newX);
        const magnitude = parseFloat(newMagnitude);
        
        if (isNaN(x) || x < 0 || x > this.length) {
            throw new Error(`Point load position (${x}m) not in beam range [0, ${this.length}m].`);
        }
        if (isNaN(magnitude)) {
            throw new Error("Point load magnitude is invalid.");
        }
        
        pLoad.x = Math.round(x * 10000) / 10000;
        pLoad.magnitude = magnitude;
        
        this.pointLoads.sort((a, b) => a.x - b.x);
        this.notify();
    }

    addDistributedLoad(start, len, magnitude) {
        start = parseFloat(start);
        len = parseFloat(len);
        magnitude = parseFloat(magnitude);

        if (isNaN(start) || start < 0 || start > this.length) {
            throw new Error(`Distributed load start (${start}m) not in beam range [0, ${this.length}m].`);
        }
        if (isNaN(len) || len <= 0 || start + len > this.length + 1e-6) {
            throw new Error(`Distributed load extent (${start}m to ${(start + len).toFixed(2)}m) exceeds beam length (${this.length}m).`);
        }
        if (isNaN(magnitude)) {
            throw new Error("Distributed load magnitude is invalid.");
        }

        this.distributedLoads.push({
            id: 'dload_' + this._idCounter++,
            start: Math.round(start * 10000) / 10000,
            length: Math.round(len * 10000) / 10000,
            magnitude: magnitude
        });
        this.distributedLoads.sort((a, b) => a.start - b.start);
        this.notify();
    }

    removeDistributedLoad(id) {
        this.distributedLoads = this.distributedLoads.filter(d => d.id !== id);
        this.notify();
    }

    updateDistributedLoad(id, newStart, newLength, newMagnitude) {
        const dLoad = this.distributedLoads.find(d => d.id === id);
        if (!dLoad) throw new Error(`Distributed load with id ${id} not found.`);
        
        const start = parseFloat(newStart);
        const len = parseFloat(newLength);
        const magnitude = parseFloat(newMagnitude);
        
        if (isNaN(start) || start < 0 || start > this.length) {
            throw new Error(`Distributed load start (${start}m) not in beam range [0, ${this.length}m].`);
        }
        if (isNaN(len) || len <= 0 || start + len > this.length + 1e-6) {
            throw new Error(`Distributed load extent (${start}m to ${(start + len).toFixed(2)}m) exceeds beam length (${this.length}m).`);
        }
        if (isNaN(magnitude)) {
            throw new Error("Distributed load magnitude is invalid.");
        }
        
        dLoad.start = Math.round(start * 10000) / 10000;
        dLoad.length = Math.round(len * 10000) / 10000;
        dLoad.magnitude = magnitude;
        
        this.distributedLoads.sort((a, b) => a.start - b.start);
        this.notify();
    }

    clear() {
        this.supports = [];
        this.pointLoads = [];
        this.distributedLoads = [];
        this.notify();
    }

    subscribe(callback) {
        this.listeners.push(callback);
    }

    unsubscribe(callback) {
        this.listeners = this.listeners.filter(cb => cb !== callback);
    }

    notify() {
        for (const cb of this.listeners) {
            try {
                cb(this);
            } catch (e) {
                console.error("Error in model listener:", e);
            }
        }
    }

    clone() {
        const copy = new BeamModel(this.length, this.elasticity, this.inertia);
        copy.supports = JSON.parse(JSON.stringify(this.supports));
        copy.pointLoads = JSON.parse(JSON.stringify(this.pointLoads));
        copy.distributedLoads = JSON.parse(JSON.stringify(this.distributedLoads));
        return copy;
    }
}
