/**
 * bcbParser.js
 * Binary reader and writer for Beamax .bcb files using DataView & ArrayBuffer.
 * Fully compatible with native Windows Beamax 2.4 CArchive serialization.
 */

import { BeamModel } from '../models/BeamModel.js';

export class BcbParser {
    /**
     * Parse a .bcb ArrayBuffer into a BeamModel.
     * @param {ArrayBuffer} buffer 
     * @returns {BeamModel}
     */
    static parse(buffer) {
        const view = new DataView(buffer);
        let offset = 0;

        // Header: Length (double), Elasticity (double), Inertia (double), ObjectCount (uint16)
        const length = view.getFloat64(offset, true); offset += 8;
        const elasticity = view.getFloat64(offset, true); offset += 8;
        const inertia = view.getFloat64(offset, true); offset += 8;
        const objectCount = view.getUint16(offset, true); offset += 2;

        const model = new BeamModel(length, elasticity, inertia);

        // Registry of class names encountered in CArchive stream
        const classMap = new Map();
        let nextClassIndex = 1;

        for (let i = 0; i < objectCount; i++) {
            if (offset >= buffer.byteLength) break;

            const tag = view.getUint16(offset, true); offset += 2;
            let className = "";

            if (tag === 0xFFFF) {
                // New class definition in CArchive
                const schema = view.getUint16(offset, true); offset += 2;
                const nameLen = view.getUint16(offset, true); offset += 2;
                const nameBytes = new Uint8Array(buffer, offset, nameLen); offset += nameLen;
                className = new TextDecoder('ascii').decode(nameBytes);
                classMap.set(nextClassIndex++, className);
            } else if ((tag & 0x8000) !== 0) {
                const idx = tag & 0x7FFF;
                className = classMap.get(idx) || "UnknownClass_" + idx;
            } else {
                const idx = tag;
                className = classMap.get(idx) || "ClassIdx_" + idx;
            }

            if (className === "FixedSupport") {
                const x = view.getFloat64(offset, true); offset += 8;
                model.addSupport('Fixed', x);
            } else if (className === "HingedSupport") {
                const x = view.getFloat64(offset, true); offset += 8;
                model.addSupport('Hinged', x);
            } else if (className === "RollerSupport") {
                const x = view.getFloat64(offset, true); offset += 8;
                model.addSupport('Roller', x);
            } else if (className === "PointLoad") {
                const x = view.getFloat64(offset, true); offset += 8;
                const p = view.getFloat64(offset, true); offset += 8;
                model.addPointLoad(x, p);
            } else if (className === "LinearDistributedLoad") {
                const start = view.getFloat64(offset, true); offset += 8;
                const len = view.getFloat64(offset, true); offset += 8;
                const q = view.getFloat64(offset, true); offset += 8;
                model.addDistributedLoad(start, len, q);
            }
        }

        return model;
    }

    /**
     * Serialize a BeamModel to a binary .bcb ArrayBuffer.
     * @param {BeamModel} model 
     * @returns {ArrayBuffer}
     */
    static serialize(model) {
        const objects = [];

        // Collect all objects
        for (const s of model.supports) {
            objects.push({ type: 'Support', subType: s.type, x: s.x });
        }
        for (const p of model.pointLoads) {
            objects.push({ type: 'PointLoad', x: p.x, magnitude: p.magnitude });
        }
        for (const d of model.distributedLoads) {
            objects.push({ type: 'DistributedLoad', start: d.start, length: d.length, magnitude: d.magnitude });
        }

        const totalObjects = objects.length;
        // Dynamic buffer sizing: header (26 bytes) + worst case per object (64 bytes each)
        const bufferSize = 26 + totalObjects * 64 + 256;
        const buffer = new ArrayBuffer(bufferSize);
        const view = new DataView(buffer);
        let offset = 0;

        // Header
        view.setFloat64(offset, model.length, true); offset += 8;
        view.setFloat64(offset, model.elasticity, true); offset += 8;
        view.setFloat64(offset, model.inertia, true); offset += 8;
        view.setUint16(offset, totalObjects, true); offset += 2;

        const registeredClasses = new Map();
        let classCounter = 1;

        function writeClassTag(className) {
            if (!registeredClasses.has(className)) {
                // Write new class definition: 0xFFFF, schema=3, nameLen, className
                view.setUint16(offset, 0xFFFF, true); offset += 2;
                view.setUint16(offset, 0x0003, true); offset += 2;
                view.setUint16(offset, className.length, true); offset += 2;
                for (let i = 0; i < className.length; i++) {
                    view.setUint8(offset++, className.charCodeAt(i));
                }
                registeredClasses.set(className, classCounter);
                classCounter++;
            } else {
                // Write class reference tag: 0x8000 | tagIndex
                const tagIdx = registeredClasses.get(className);
                view.setUint16(offset, 0x8000 | tagIdx, true); offset += 2;
            }
        }

        for (const obj of objects) {
            if (obj.type === 'Support') {
                const className = obj.subType + "Support";
                writeClassTag(className);
                view.setFloat64(offset, obj.x, true); offset += 8;
            } else if (obj.type === 'PointLoad') {
                writeClassTag("PointLoad");
                view.setFloat64(offset, obj.x, true); offset += 8;
                view.setFloat64(offset, obj.magnitude, true); offset += 8;
            } else if (obj.type === 'DistributedLoad') {
                writeClassTag("LinearDistributedLoad");
                view.setFloat64(offset, obj.start, true); offset += 8;
                view.setFloat64(offset, obj.length, true); offset += 8;
                view.setFloat64(offset, obj.magnitude, true); offset += 8;
            }
        }

        return buffer.slice(0, offset);
    }
}
