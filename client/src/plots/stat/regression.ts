class Standardizer {
	private means: number[] = [];
	private stds: number[] = [];

	public fit(X: number[][]): void {
		const numSamples = X.length;
		if (numSamples === 0) return;
		const numFeatures = X[0].length;

		this.means = new Array(numFeatures).fill(0);
		this.stds = new Array(numFeatures).fill(0);

		for (let j = 0; j < numFeatures; j++) {
			let sum = 0;
			for (let i = 0; i < numSamples; i++) {
				sum += X[i][j];
			}
			this.means[j] = sum / numSamples;

			let varianceSum = 0;
			for (let i = 0; i < numSamples; i++) {
				varianceSum += Math.pow(X[i][j] - this.means[j], 2);
			}
			this.stds[j] = Math.sqrt(varianceSum / numSamples) || 1e-10;
		}
	}

	public transform(X: number[][]): number[][] {
		return X.map((row) => row.map((val, j) => (val - this.means[j]) / this.stds[j]));
	}
}

export class LinearRegression {
	public weights: number[] = []; // index 0 is intercept, rest are feature coefficients
	private standardizer: Standardizer;

	// Cached decomposition states to share methods smoothly
	private cachedL: number[][] | null = null;
	private cachedU: number[][] | null = null;

	constructor() {
		this.standardizer = new Standardizer();
	}

	public fit(X: number[][], y: number[]): void {
		if (X.length === 0 || X.length !== y.length) {
			throw new Error('Invalid input dimensions.');
		}

		this.standardizer.fit(X);
		const X_scaled = this.standardizer.transform(X);

		const numSamples = X_scaled.length;
		const numFeaturesWithIntercept = X_scaled[0].length + 1;

		// Allocate small memory blocks for the tiny 11x11 system
		const XTX: number[][] = Array(numFeaturesWithIntercept)
			.fill(0)
			.map(() => Array(numFeaturesWithIntercept).fill(0));
		const XTy: number[] = new Array(numFeaturesWithIntercept).fill(0);

		// Compute XTX and XTy together row-by-row
		for (let k = 0; k < numSamples; k++) {
			const xRow = [1, ...X_scaled[k]]; // Add virtual intercept column inline
			const yVal = y[k];

			for (let i = 0; i < numFeaturesWithIntercept; i++) {
				const xi = xRow[i];

				// Compute upper triangle of XTX (since XTX is perfectly symmetric)
				for (let j = i; j < numFeaturesWithIntercept; j++) {
					XTX[i][j] += xi * xRow[j];
				}
				// Compute XTy vector element
				XTy[i] += xi * yVal;
			}
		}

		// Mirror the upper triangle to fill the lower triangle of XTX
		for (let i = 0; i < numFeaturesWithIntercept; i++) {
			for (let j = 0; j < i; j++) {
				XTX[i][j] = XTX[j][i];
			}
		}

		// Run LU Decomposition on the tiny matrix
		const { L, U } = this._decomposeLU(XTX);
		this.cachedL = L;
		this.cachedU = U;

		// Solve for weights
		this.weights = this._solveLU(L, U, XTy);
	}

	public predict(X: number[][]): number[] {
		if (this.weights.length === 0) {
			throw new Error('Model must be fitted before making predictions.');
		}
		const X_scaled = this.standardizer.transform(X);
		return X_scaled.map((row) => {
			let prediction = this.weights[0];
			for (let i = 0; i < row.length; i++) {
				prediction += row[i] * this.weights[i + 1];
			}
			return prediction;
		});
	}
	/**
	 * Computes Standard Errors using the model's pre-calculated LU matrices.
	 * Avoids repeating the full matrix decomposition step.
	 */
	public computeStandardErrors(X: number[][], y: number[]): number[] {
		if (this.weights.length === 0 || !this.cachedL || !this.cachedU) {
			throw new Error('Model must be fitted before computing standard errors.');
		}

		const numSamples = X.length;
		const numFeaturesWithIntercept = this.weights.length;

		// 1. Calculate Residual Variance (Sigma squared)
		const predictions = this.predict(X);
		let sumSquaredResiduals = 0;
		for (let i = 0; i < numSamples; i++) {
			sumSquaredResiduals += Math.pow(y[i] - predictions[i], 2);
		}

		const degreesOfFreedom = numSamples - numFeaturesWithIntercept;
		if (degreesOfFreedom <= 0) {
			throw new Error('Not enough data samples to estimate standard errors safely.');
		}
		const sigmaSquared = sumSquaredResiduals / degreesOfFreedom;

		// 2. Extract diagonal steps of inverse matrix column by column
		const standardErrors: number[] = [];

		for (let i = 0; i < numFeaturesWithIntercept; i++) {
			// Build a standard canonical basis vector e_i (e.g. [0, 0, 1, 0...])
			const e = new Array(numFeaturesWithIntercept).fill(0);
			e[i] = 1;

			// Solve (X^T * X) * v = e_i utilizing the cached state components
			const v = this._solveLU(this.cachedL, this.cachedU, e);

			// Isolate variance component at position index i
			const varianceElement = v[i];
			standardErrors.push(Math.sqrt(Math.max(0, varianceElement * sigmaSquared)));
		}

		return standardErrors;
	}

	// --- Linear Algebra Shared Functions ---

	private _transpose(matrix: number[][]): number[][] {
		return matrix.map((_, colIndex) => matrix.map((row) => row[colIndex]));
	}

	private _multiply(A: number[][], B: number[][]): number[][] {
		const rowsA = A.length;
		const colsA = A.length;
		const colsB = B.length;
		const result: number[][] = Array(rowsA)
			.fill(0)
			.map(() => Array(colsB).fill(0));

		for (let i = 0; i < rowsA; i++) {
			for (let k = 0; k < colsA; k++) {
				const temp = A[i][k];
				for (let j = 0; j < colsB; j++) {
					result[i][j] += temp * B[k][j];
				}
			}
		}
		return result;
	}

	/**
	 * Generates Lower and Upper triangular matrices from input system blocks
	 */
	private _decomposeLU(A: number[][]): { L: number[][]; U: number[][] } {
		const n = A.length;
		const L: number[][] = Array(n)
			.fill(0)
			.map(() => Array(n).fill(0));
		const U: number[][] = Array(n)
			.fill(0)
			.map(() => Array(n).fill(0));

		for (let i = 0; i < n; i++) {
			// Upper Matrix
			for (let k = i; k < n; k++) {
				let sum = 0;
				for (let j = 0; j < i; j++) {
					sum += L[i][j] * U[j][k];
				}
				U[i][k] = A[i][k] - sum;
			}

			// Lower Matrix
			for (let k = i; k < n; k++) {
				if (i === k) {
					L[i][i] = 1;
				} else {
					let sum = 0;
					for (let j = 0; j < i; j++) {
						sum += L[k][j] * U[j][i];
					}
					if (Math.abs(U[i][i]) < 1e-10) {
						throw new Error('System matrix is singular or highly unstable.');
					}
					L[k][i] = (A[k][i] - sum) / U[i][i];
				}
			}
		}
		return { L, U };
	}

	/**
	 * Performs Forward and Backward substitutions on active L/U components
	 */
	private _solveLU(L: number[][], U: number[][], b: number[]): number[] {
		const n = L.length;

		// Forward Substitution: L * y = b
		const y: number[] = new Array(n).fill(0);
		for (let i = 0; i < n; i++) {
			let sum = 0;
			for (let j = 0; j < i; j++) {
				sum += L[i][j] * y[j];
			}
			y[i] = b[i] - sum;
		}

		// Backward Substitution: U * x = y
		const x: number[] = new Array(n).fill(0);
		for (let i = n - 1; i >= 0; i--) {
			let sum = 0;
			for (let j = i + 1; j < n; j++) {
				sum += U[i][j] * x[j];
			}
			x[i] = (y[i] - sum) / U[i][i];
		}

		return x;
	}
}

export function computeCorrelationMatrix(X: number[][]): number[][] {
	const numSamples = X.length;
	if (numSamples === 0) return [];
	const numFeatures = X[0].length;

	// 1. Calculate Means
	const means = new Array(numFeatures).fill(0);
	for (let j = 0; j < numFeatures; j++) {
		let sum = 0;
		for (let i = 0; i < numSamples; i++) {
			sum += X[i][j];
		}
		means[j] = sum / numSamples;
	}

	// 2. Initialize matrix
	const matrix: number[][] = Array(numFeatures)
		.fill(0)
		.map(() => Array(numFeatures).fill(0));

	// 3. Compute Pearson 'r' for every pair of columns
	for (let A = 0; A < numFeatures; A++) {
		for (let B = A; B < numFeatures; B++) {
			let num = 0; // Numerator
			let denA = 0; // Denominator part A
			let denB = 0; // Denominator part B

			for (let i = 0; i < numSamples; i++) {
				const diffA = X[i][A] - means[A];
				const diffB = X[i][B] - means[B];

				num += diffA * diffB;
				denA += diffA * diffA;
				denB += diffB * diffB;
			}

			const denominator = Math.sqrt(denA * denB);
			const r = denominator === 0 ? 0 : num / denominator;

			// The matrix is symmetric (correlation of A to B is the same as B to A)
			matrix[A][B] = r;
			// matrix[B][A] = r;
		}
	}

	return matrix;
}

export function computeR2Score(yTrue: number[], yPred: number[]): number {
	if (yTrue.length !== yPred.length || yTrue.length === 0) {
		throw new Error('Input arrays must be non-empty and have matching dimensions.');
	}

	const numSamples = yTrue.length;

	// 1. Calculate the mean of the true values
	let sumTrue = 0;
	for (let i = 0; i < numSamples; i++) {
		sumTrue += yTrue[i];
	}
	const meanTrue = sumTrue / numSamples;

	// 2. Compute Sum of Squared Residuals (RSS) and Total Sum of Squares (TSS)
	let rss = 0; // Residual sum of squares
	let tss = 0; // Total sum of squares

	for (let i = 0; i < numSamples; i++) {
		rss += Math.pow(yTrue[i] - yPred[i], 2);
		tss += Math.pow(yTrue[i] - meanTrue, 2);
	}

	// Handle edge case where all yTrue values are identical (variance is zero)
	if (tss === 0) return 0;

	return 1 - rss / tss;
}
