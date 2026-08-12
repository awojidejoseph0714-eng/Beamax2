/**
 * math.js
 * Linear algebra routines with 64-bit IEEE 754 precision, Gaussian elimination with partial pivoting,
 * condition checking, and LaTeX / HTML formatting.
 */

export class MathUtils {
    /**
     * Solves linear system A * x = b using Gaussian elimination with partial pivoting.
     * @param {number[][]} A - Square coefficient matrix (N x N)
     * @param {number[]} b - Right-hand side vector (N)
     * @returns {number[]} Solution vector x
     */
    static solveLinearSystem(A, b) {
        const n = b.length;
        // Create augmented matrix [A | b]
        const M = new Array(n);
        for (let i = 0; i < n; i++) {
            M[i] = new Float64Array(n + 1);
            for (let j = 0; j < n; j++) {
                M[i][j] = A[i][j];
            }
            M[i][n] = b[i];
        }

        // Forward elimination with partial pivoting
        for (let i = 0; i < n; i++) {
            let maxRow = i;
            let maxVal = Math.abs(M[i][i]);
            for (let k = i + 1; k < n; k++) {
                const absVal = Math.abs(M[k][i]);
                if (absVal > maxVal) {
                    maxVal = absVal;
                    maxRow = k;
                }
            }

            if (maxVal < 1e-13) {
                throw new Error("Stiffness matrix is singular or ill-conditioned. Structure is unstable (mechanism).");
            }

            // Swap rows
            if (maxRow !== i) {
                const temp = M[i];
                M[i] = M[maxRow];
                M[maxRow] = temp;
            }

            // Eliminate lower column
            for (let k = i + 1; k < n; k++) {
                const factor = M[k][i] / M[i][i];
                for (let j = i; j <= n; j++) {
                    M[k][j] -= factor * M[i][j];
                }
            }
        }

        // Back substitution
        const x = new Float64Array(n);
        for (let i = n - 1; i >= 0; i--) {
            let sum = M[i][n];
            for (let j = i + 1; j < n; j++) {
                sum -= M[i][j] * x[j];
            }
            x[i] = sum / M[i][i];
        }

        return Array.from(x);
    }

    /**
     * Multiply matrix A (m x n) by vector x (n)
     */
    static matVecMult(A, x) {
        const m = A.length;
        const n = x.length;
        const res = new Array(m).fill(0);
        for (let i = 0; i < m; i++) {
            let sum = 0;
            for (let j = 0; j < n; j++) {
                sum += A[i][j] * x[j];
            }
            res[i] = sum;
        }
        return res;
    }

    /**
     * Formats number to specified decimal places with clean zero trimming.
     */
    static formatNum(val, decimals = 3) {
        if (Math.abs(val) < 1e-9) return "0.000";
        return val.toFixed(decimals);
    }

    /**
     * Formats matrix to HTML table for calculations side-dialog
     */
    static matrixToHtmlTable(matrix, rowLabels = null, colLabels = null) {
        const n = matrix.length;
        const m = matrix[0].length;
        let html = '<div class="matrix-table-wrapper"><table class="calc-matrix-table">';
        
        if (colLabels) {
            html += '<thead><tr><th></th>';
            for (let j = 0; j < m; j++) {
                html += `<th>${colLabels[j] || (j + 1)}</th>`;
            }
            html += '</tr></thead>';
        }

        html += '<tbody>';
        for (let i = 0; i < n; i++) {
            html += '<tr>';
            if (rowLabels) {
                html += `<th class="row-label">${rowLabels[i] || (i + 1)}</th>`;
            }
            for (let j = 0; j < m; j++) {
                const val = matrix[i][j];
                const formatted = Math.abs(val) < 1e-6 ? "0" : (Math.abs(val) >= 1e5 || Math.abs(val) < 1e-2 ? val.toExponential(2) : val.toFixed(2));
                const isDiag = (i === j) ? 'class="diag-cell"' : '';
                html += `<td ${isDiag}>${formatted}</td>`;
            }
            html += '</tr>';
        }
        html += '</tbody></table></div>';
        return html;
    }
}
