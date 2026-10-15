// src/audio/TimbreFeatureExtractor.ts
import { HarmonicVector } from '../types/stringplex';

export class TimbreFeatureExtractor {
  private fftSize: number;
  private numHarmonics: number;
  // Weighting profile for mean-centering (emphasizes partials with high SNR and gauge variance)
  private harmonicWeights = [1.0, 1.3, 1.5, 1.5, 1.4, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];

  constructor(fftSize: number = 4096, numHarmonics: number = 12) {
    this.fftSize = fftSize;
    this.numHarmonics = numHarmonics;
  }

  /**
   * Extracts an advanced 12-harmonic feature vector utilizing:
   * 1. Sub-bin parabolic peak interpolation up to H12 (n^3 dispersion leverage)
   * 2. Weighted Mean-Centering (eliminates single-point H1 variance trap)
   * 3. Joint Linearized Weighted Least Squares (WLS) regression for (f0, B)
   * 4. High-resolution Spectral Centroid and Rolloff
   */
  public extract(
    freqDomainData: Float32Array,
    fundamentalHz: number,
    sampleRate: number
  ): HarmonicVector | null {
    if (fundamentalHz < 60 || fundamentalHz > 1500) return null;

    const binWidthHz = sampleRate / this.fftSize;
    const nyquistBin = freqDomainData.length;

    const rawAmplitudes: number[] = [];
    const rawDb: number[] = [];
    const measuredHarmonicFreqs: number[] = [];

    // ── 1. Measure First 12 Harmonics with Physics-Bounded Fletcher Window ──
    // Search window cannot exceed 0.35 * f0 so partial k can never overlap partial k+1
    const bMaxStiffness = 0.0015;

    for (let k = 1; k <= this.numHarmonics; k++) {
      const targetHz = k * fundamentalHz;
      if (targetHz >= sampleRate / 2 - 150) {
        // Exceeds Nyquist limit
        rawAmplitudes.push(1e-6);
        rawDb.push(-120);
        measuredHarmonicFreqs.push(targetHz);
        continue;
      }

      // Physics-bounded search window: strictly caps upper dispersion at +0.35*f0
      const minSearchHz = targetHz * (1 - 0.012);
      const maxFletcherMultiplier = Math.min(1.0 + 0.35 / k, Math.sqrt(1 + bMaxStiffness * k * k) + 0.012);
      const maxSearchHz = targetHz * maxFletcherMultiplier;

      const minBin = Math.max(1, Math.floor(minSearchHz / binWidthHz));
      const maxBin = Math.min(nyquistBin - 2, Math.ceil(maxSearchHz / binWidthHz));

      let peakBin = minBin;
      let peakDb = -120;

      for (let b = minBin; b <= maxBin; b++) {
        const val = freqDomainData[b];
        if (isFinite(val) && !isNaN(val) && val > peakDb) {
          peakDb = val;
          peakBin = b;
        }
      }

      // Parabolic interpolation for sub-bin precision (standard parabolic formulation)
      let refinedBin = peakBin;
      let refinedDb = Math.max(-120, isFinite(peakDb) && !isNaN(peakDb) ? peakDb : -120);
      if (peakBin > minBin && peakBin < maxBin) {
        const y0 = Math.max(-120, freqDomainData[peakBin - 1]);
        const y1 = Math.max(-120, freqDomainData[peakBin]);
        const y2 = Math.max(-120, freqDomainData[peakBin + 1]);
        const denom = 2 * (2 * y1 - y0 - y2);
        if (Math.abs(denom) > 1e-6) {
          const delta = (y2 - y0) / denom;
          if (Math.abs(delta) < 1) {
            refinedBin = peakBin + delta;
            refinedDb = Math.max(-120, y1 + 0.25 * (y2 - y0) * delta);
          }
        }
      }

      const clampedDb = Math.max(-120, Math.min(10, isFinite(refinedDb) && !isNaN(refinedDb) ? refinedDb : -120));
      const peakLinear = Math.pow(10, clampedDb / 20);
      rawAmplitudes.push(Math.max(1e-6, peakLinear));
      rawDb.push(Math.round(clampedDb * 100) / 100);
      measuredHarmonicFreqs.push(refinedBin * binWidthHz);
    }

    // ── 2. Weighted Mean-Centering (Eliminates H1-Anchored Variance Trap) ──
    let weightedDbSum = 0;
    let totalWeight = 0;
    for (let k = 0; k < rawDb.length; k++) {
      const w = this.harmonicWeights[k] || 1.0;
      weightedDbSum += w * rawDb[k];
      totalWeight += w;
    }
    const weightedMeanDb = totalWeight > 0 ? weightedDbSum / totalWeight : (rawDb[0] ?? -50);
    const meanCenteredDb = rawDb.map((db) => {
      const diff = db - weightedMeanDb;
      return isFinite(diff) && !isNaN(diff) ? Math.round(diff * 100) / 100 : 0;
    });

    // ── 2B. Macro Spectral Tilt Detrending in log2(k) Space ──
    // Strips out linear spectral slope so pluck distance changes don't disguise string gauge
    const K = meanCenteredDb.length;
    let sumLogK = 0;
    for (let k = 1; k <= K; k++) {
      sumLogK += Math.log2(k);
    }
    const meanLogK = sumLogK / K;

    let numSlope = 0;
    let denSlope = 0;
    for (let k = 1; k <= K; k++) {
      const u_k = Math.log2(k) - meanLogK;
      const w = this.harmonicWeights[k - 1] || 1.0;
      numSlope += w * u_k * meanCenteredDb[k - 1];
      denSlope += w * u_k * u_k;
    }
    const spectralSlopeAlpha = denSlope > 1e-6 ? numSlope / denSlope : 0;
    const tiltDetrendedDb = meanCenteredDb.map((val, idx) => {
      const u_k = Math.log2(idx + 1) - meanLogK;
      return Math.round((val - spectralSlopeAlpha * u_k) * 100) / 100;
    });

    // ── 3. L2-Normalized Linear Harmonic Vector ──
    let sumSq = 0;
    for (const amp of rawAmplitudes) {
      sumSq += amp * amp;
    }
    const norm = Math.sqrt(sumSq) || 1e-6;
    const normalizedHarmonics = rawAmplitudes.map((a) => a / norm);

    // ── 4. Joint Linearized WLS Regression for (f0, B) ──
    // Stiff string model: (fn / n)^2 = f0^2 + (f0^2 * B) * n^2 = theta0 + theta1 * n^2
    // Weights: gamma_n = An^2 / sum(Aj^2) (pure amplitude SNR, eliminating n^6 explosion)
    let sumValidAmpSq = 0;
    for (let n = 1; n <= this.numHarmonics; n++) {
      const db = rawDb[n - 1];
      if (db >= -65) {
        sumValidAmpSq += rawAmplitudes[n - 1] * rawAmplitudes[n - 1];
      }
    }

    let s_gamma = 0;
    let s_gamma_n2 = 0;
    let s_gamma_n4 = 0;
    let s_gamma_y = 0;
    let s_gamma_n2_y = 0;
    let validCount = 0;

    for (let n = 1; n <= this.numHarmonics; n++) {
      const db = rawDb[n - 1];
      if (db < -65) continue; // Skip noise floor bins
      const fn = measuredHarmonicFreqs[n - 1];
      const y_n = (fn / n) * (fn / n);
      const amp = rawAmplitudes[n - 1];
      const n2 = n * n;
      const n4 = n2 * n2;
      // Fixed weight: amplitude SNR normalized, NO n^2 multiplier
      const gamma = (amp * amp) / (sumValidAmpSq + 1e-12);

      s_gamma += gamma;
      s_gamma_n2 += gamma * n2;
      s_gamma_n4 += gamma * n4;
      s_gamma_y += gamma * y_n;
      s_gamma_n2_y += gamma * n2 * y_n;
      validCount++;
    }

    let inharmonicityB = 0.0001;
    let f0True = fundamentalHz;

    if (validCount >= 5) {
      const det = s_gamma * s_gamma_n4 - s_gamma_n2 * s_gamma_n2;
      if (Math.abs(det) > 1e-12) {
        const theta0 = (s_gamma_y * s_gamma_n4 - s_gamma_n2_y * s_gamma_n2) / det;
        const theta1 = (s_gamma * s_gamma_n2_y - s_gamma_n2 * s_gamma_y) / det;
        if (theta0 > 0 && theta1 > 0) {
          inharmonicityB = Math.min(0.005, theta1 / theta0);
          f0True = Math.round(Math.sqrt(theta0) * 100) / 100;
        }
      }
    }

    // ── 5. High-Frequency Transient Scrape Ratio (HF_scrape) ──
    // Compares 4.5kHz - 12kHz energy against 80Hz - 2.5kHz energy
    let energyHF = 0;
    let energyLF = 0;
    const minBinLF = Math.max(1, Math.floor(80 / binWidthHz));
    const maxBinLF = Math.min(nyquistBin - 1, Math.floor(2500 / binWidthHz));
    const minBinHF = Math.max(1, Math.floor(4500 / binWidthHz));
    const maxBinHF = Math.min(nyquistBin - 1, Math.floor(12000 / binWidthHz));

    for (let b = minBinLF; b <= maxBinLF; b++) {
      const lin = Math.pow(10, freqDomainData[b] / 20);
      energyLF += lin * lin;
    }
    for (let b = minBinHF; b <= maxBinHF; b++) {
      const lin = Math.pow(10, freqDomainData[b] / 20);
      energyHF += lin * lin;
    }

    const hfScrapeDb = Math.round(
      Math.max(-60, Math.min(20, 10 * Math.log10(energyHF / (energyLF + 1e-12)))) * 10
    ) / 10;

    // ── 6. Spectral Centroid (Center of Mass up to 6000 Hz) ──
    let weightedFreqSum = 0;
    let totalMagnitude = 0;
    const maxCentroidBin = Math.min(nyquistBin, Math.floor(6000 / binWidthHz));
    for (let b = 1; b < maxCentroidBin; b++) {
      const mag = Math.pow(10, freqDomainData[b] / 20);
      const freq = b * binWidthHz;
      weightedFreqSum += freq * mag;
      totalMagnitude += mag;
    }
    const spectralCentroidHz = totalMagnitude > 1e-6 ? weightedFreqSum / totalMagnitude : 0;

    // ── 7. Spectral Rolloff (85% Power Threshold) ──
    let totalPower = 0;
    for (let b = 1; b < maxCentroidBin; b++) {
      const mag = Math.pow(10, freqDomainData[b] / 20);
      totalPower += mag * mag;
    }
    let cumulativePower = 0;
    let spectralRolloffHz = 0;
    for (let b = 1; b < maxCentroidBin; b++) {
      const mag = Math.pow(10, freqDomainData[b] / 20);
      cumulativePower += mag * mag;
      if (cumulativePower >= 0.85 * totalPower) {
        spectralRolloffHz = b * binWidthHz;
        break;
      }
    }

    // ── 8. Harmonic Energy Ratios ──
    const h1 = rawAmplitudes[0];
    const h2 = rawAmplitudes[1];
    const h3 = rawAmplitudes[2];
    const h1H2Ratio = h2 > 1e-6 ? h1 / h2 : 1;
    const h1H3Ratio = h3 > 1e-6 ? h1 / h3 : 1;

    return {
      harmonics: normalizedHarmonics,
      rawDb,
      meanCenteredDb,
      tiltDetrendedDb,
      spectralSlopeAlpha: Math.round(spectralSlopeAlpha * 100) / 100,
      spectralCentroidHz: Math.round(spectralCentroidHz),
      spectralRolloffHz: Math.round(spectralRolloffHz),
      inharmonicityB,
      f0True,
      hfScrapeDb,
      h1H2Ratio: Math.round(h1H2Ratio * 100) / 100,
      h1H3Ratio: Math.round(h1H3Ratio * 100) / 100,
    };
  }
}
