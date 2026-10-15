// src/audio/StringDisambiguator.ts
import {
  HarmonicVector,
  GuitarCalibrationProfile,
  CandidateMatch,
  StringIndex,
  DisambiguatorWeights,
  BenchmarkResult,
  OptimizationResult,
  BenchmarkClash,
} from '../types/stringplex';
import {
  findCandidatesForMidi,
  GUITAR_STRINGS,
  getTheoreticalInharmonicityB,
} from '../constants/guitarConstants';

export const DEFAULT_DISAMBIGUATOR_WEIGHTS: DisambiguatorWeights = {
  harmonicWeight: 0.38,
  scrapeWeight: 0.22,
  centroidWeight: 0.16,
  inharmonicityWeight: 0.14,
  decayWeight: 0.10,
  nutBonusWeight: 0.04,
  combEpsilon: 0.12,
  softmaxTemperature: 0.10,
};

export class StringDisambiguator {
  // Weights for partials H1 through H12 (emphasizes partials with high SNR and gauge variance)
  private partialWeights = [1.0, 1.3, 1.5, 1.5, 1.4, 1.2, 1.1, 1.0, 0.9, 0.8, 0.7, 0.6];

  // 25-point physical pluck position grid beta in [0.06, 0.26]
  private betaGrid: number[] = [];

  // Configurable / auto-tunable feature weights
  private weights: DisambiguatorWeights = { ...DEFAULT_DISAMBIGUATOR_WEIGHTS };

  constructor(initialWeights?: Partial<DisambiguatorWeights>) {
    if (initialWeights) {
      this.weights = { ...this.weights, ...initialWeights };
    }
    for (let b = 0.06; b <= 0.26; b += 0.0083) {
      this.betaGrid.push(Math.round(b * 1000) / 1000);
    }
  }

  public getWeights(): DisambiguatorWeights {
    return { ...this.weights };
  }

  public setWeights(w: Partial<DisambiguatorWeights>): void {
    this.weights = { ...this.weights, ...w };
  }

  public resetWeights(): void {
    this.weights = { ...DEFAULT_DISAMBIGUATOR_WEIGHTS };
  }

  /**
   * Helper: Extracts weighted mean-centered decibel vector.
   * Eliminates the single-point H1 variance amplification trap.
   */
  private getMeanCenteredSpectrum(v: HarmonicVector): number[] {
    if (v.meanCenteredDb && v.meanCenteredDb.length > 0) {
      return v.meanCenteredDb.map((x) => (isFinite(x) && !isNaN(x) ? x : 0));
    }
    const raw = v.rawDb && v.rawDb.length > 0
      ? v.rawDb
      : (v.harmonics || []).map((h) => 20 * Math.log10(Math.max(1e-5, h)));

    const dbs = raw.map((x) => (isFinite(x) && !isNaN(x) ? Math.max(-100, Math.min(0, x)) : -100));

    let weightedSum = 0;
    let totalW = 0;
    for (let k = 0; k < dbs.length; k++) {
      const w = this.partialWeights[k] || 1.0;
      weightedSum += w * dbs[k];
      totalW += w;
    }
    const meanDb = totalW > 0 ? weightedSum / totalW : (dbs[0] || 0);
    return dbs.map((d) => Math.round((d - meanDb) * 100) / 100);
  }

  /**
   * Helper: Extracts slope-detrended residual spectrum in log2(k) space.
   * Eliminates macro pluck-distance and fingernail angle spectral tilt.
   */
  private getTiltDetrendedSpectrum(v: HarmonicVector): number[] {
    if (v.tiltDetrendedDb && v.tiltDetrendedDb.length > 0) {
      return v.tiltDetrendedDb.map((x) => (isFinite(x) && !isNaN(x) ? x : 0));
    }

    const centered = this.getMeanCenteredSpectrum(v);
    const K = centered.length;
    let sumLogK = 0;
    for (let k = 1; k <= K; k++) {
      sumLogK += Math.log2(k);
    }
    const meanLogK = sumLogK / K;

    let numSlope = 0;
    let denSlope = 0;
    for (let k = 1; k <= K; k++) {
      const u_k = Math.log2(k) - meanLogK;
      const w = this.partialWeights[k - 1] || 1.0;
      numSlope += w * u_k * centered[k - 1];
      denSlope += w * u_k * u_k;
    }
    const alpha = denSlope > 1e-6 ? numSlope / denSlope : 0;
    return centered.map((val, idx) => {
      const u_k = Math.log2(idx + 1) - meanLogK;
      return Math.round((val - alpha * u_k) * 100) / 100;
    });
  }

  /**
   * Evaluates all candidate (string, fret) positions that could physically produce
   * the detected MIDI note.
   *
   * StringPlex V1.2 Master Stack:
   * 1. Log-Harmonic Spectral Tilt Detrending (eliminates bridge vs soundhole tilt)
   * 2. 1D Profile-Likelihood Pluck-Comb Deconvolution with nodal-notch confidence gating
   * 3. Fingernail Transient Scrape Ratio (HF_scrape 4.5-12kHz) separating wound vs plain strings
   * 4. Multi-Epoch Retroactive Template Alignment (Early Attack vs Mid Sustain)
   * 5. Fletcher-bounded WLS Inharmonicity B with physical B_theoretical(s, f) prior blending
   * 6. Open-String Nut Boundary vs Flesh-Fretted Damping Prior
   * 7. Inter-Candidate Discriminative Variance Partial Weighting
   */
  public disambiguate(
    midiNote: number,
    liveVector: HarmonicVector,
    profile: GuitarCalibrationProfile | null,
    maxFret: number = 15
  ): { candidates: CandidateMatch[]; winner: CandidateMatch | null } {
    const rawCandidates = findCandidatesForMidi(midiNote, maxFret);

    if (rawCandidates.length === 0) {
      return { candidates: [], winner: null };
    }

    // If there's only 1 physical position on the neck, no ambiguity exists
    if (rawCandidates.length === 1) {
      const c = rawCandidates[0];
      const match: CandidateMatch = {
        stringNum: c.stringNum,
        fretNum: c.fretNum,
        midiNote,
        noteName: c.noteName,
        similarityScore: 1.0,
        isWinner: true,
        calibratedVector: profile?.fingerprints[`${c.stringNum}_${c.fretNum}`]?.vector,
        featureBreakdown: {
          harmonicDistanceScore: 1.0,
          centroidProximity: 1.0,
          inharmonicityProximity: 1.0,
          decayProximity: 1.0,
          hfScrapeScore: 1.0,
        },
      };
      return { candidates: [match], winner: match };
    }

    const matches: CandidateMatch[] = [];
    const liveCenteredDb = this.getMeanCenteredSpectrum(liveVector);
    const liveTiltDetrended = this.getTiltDetrendedSpectrum(liveVector);
    const hasLiveDecay =
      liveVector.deltaSigmaHL !== undefined &&
      !isNaN(liveVector.deltaSigmaHL) &&
      isFinite(liveVector.deltaSigmaHL);
    const hasLiveScrape =
      liveVector.hfScrapeDb !== undefined &&
      !isNaN(liveVector.hfScrapeDb) &&
      isFinite(liveVector.hfScrapeDb);

    const elapsedMs = liveVector.elapsedMsSinceOnset ?? 60;
    const isEarlyAttackEpoch = elapsedMs <= 100;

    // Collect calibrated vectors for candidate candidates to calculate inter-candidate discriminative variance
    const candidateCalVectors: Array<{ stringNum: StringIndex; fretNum: number; vector: HarmonicVector }> = [];
    for (const c of rawCandidates) {
      const key = `${c.stringNum}_${c.fretNum}`;
      const fp = profile?.fingerprints[key];
      if (fp && fp.vector) {
        // Select appropriate epoch template: Early template for early notes, Sustain for late notes
        const vec = (isEarlyAttackEpoch && fp.earlyVector)
          ? fp.earlyVector
          : (!isEarlyAttackEpoch && fp.sustainVector)
          ? fp.sustainVector
          : fp.vector;
        candidateCalVectors.push({ stringNum: c.stringNum, fretNum: c.fretNum, vector: vec });
      }
    }

    // Calculate Inter-Candidate Discriminative Variance (nu_k) across partials
    const numPartialsMax = 12;
    const discriminativeWeights: number[] = [];
    for (let k = 0; k < numPartialsMax; k++) {
      const baseW = this.partialWeights[k] || 1.0;
      if (candidateCalVectors.length >= 2) {
        const kVals = candidateCalVectors.map((cv) => {
          const tDetrend = this.getTiltDetrendedSpectrum(cv.vector);
          return tDetrend[k] || 0;
        });
        const meanK = kVals.reduce((a, b) => a + b, 0) / kVals.length;
        const varianceK = kVals.reduce((a, b) => a + Math.pow(b - meanK, 2), 0) / kVals.length;
        // Boost weight on partials where candidate strings physically diverge
        discriminativeWeights.push(baseW * (1.0 + Math.min(2.0, varianceK / 5.0)));
      } else {
        discriminativeWeights.push(baseW);
      }
    }

    const rawCompositeScores: number[] = [];

    for (const c of rawCandidates) {
      const key = `${c.stringNum}_${c.fretNum}`;
      const fingerprint = profile?.fingerprints[key];
      const stringMeta = GUITAR_STRINGS[c.stringNum];
      const isWound = stringMeta.isWound;

      if (fingerprint && fingerprint.vector) {
        const calVec = (isEarlyAttackEpoch && fingerprint.earlyVector)
          ? fingerprint.earlyVector
          : (!isEarlyAttackEpoch && fingerprint.sustainVector)
          ? fingerprint.sustainVector
          : fingerprint.vector;

        const calTiltDetrended = this.getTiltDetrendedSpectrum(calVec);
        const numPartials = Math.min(liveTiltDetrended.length, calTiltDetrended.length, 12);

        // ── 1. 1D Profile-Likelihood Pluck Comb Deconvolution ──
        // Neutralizes the excitation comb notch position beta in [0.06, 0.26]
        let minCombError = Infinity;
        let bestBeta = 0.12;

        for (const beta of this.betaGrid) {
          // Compute regularized excitation comb template C_k(beta) clamped at combEpsilon
          const combC: number[] = [];
          let combWeightedSum = 0;
          let combTotalW = 0;

          for (let k = 1; k <= numPartials; k++) {
            const notchVal = 20 * Math.log10(Math.max(this.weights.combEpsilon, Math.abs(Math.sin(k * Math.PI * beta))));
            combC.push(notchVal);
            const w = discriminativeWeights[k - 1];
            combWeightedSum += w * notchVal;
            combTotalW += w;
          }
          const meanComb = combTotalW > 0 ? combWeightedSum / combTotalW : 0;
          const tildeComb = combC.map((cVal) => cVal - meanComb);

          let weightedSqError = 0;
          let totalWeight = 0;

          for (let k = 0; k < numPartials; k++) {
            const harmonicOrder = k + 1;
            // Nodal-notch confidence gating: downweight partials that fall inside a physical pluck node
            const nodalGate = Math.pow(Math.sin(harmonicOrder * Math.PI * beta), 2) + 0.05;
            const diff = (liveTiltDetrended[k] - tildeComb[k]) - calTiltDetrended[k];
            const w = discriminativeWeights[k] * nodalGate;
            weightedSqError += w * diff * diff;
            totalWeight += w;
          }

          const dist = Math.sqrt(weightedSqError / (totalWeight || 1));
          if (dist < minCombError) {
            minCombError = dist;
            bestBeta = beta;
          }
        }

        const harmonicSim = Math.max(0, Math.min(1, Math.exp(-minCombError / 6.0)));

        // ── 2. Fingernail Transient Scrape Ratio (HF_scrape) ──
        // Uses empirical calibrated scrape if available, falling back to physical model (-8 dB vs -22 dB)
        let scrapeSim = 0.5;
        if (hasLiveScrape) {
          const targetScrape = (calVec.hfScrapeDb !== undefined && isFinite(calVec.hfScrapeDb))
            ? calVec.hfScrapeDb
            : (isWound ? -8.0 : -22.0);
          const scrapeDiff = Math.abs((liveVector.hfScrapeDb ?? -15) - targetScrape);
          scrapeSim = Math.max(0, Math.min(1, Math.exp(-scrapeDiff / 8.0)));
        }

        // ── 3. High-Resolution Spectral Centroid Proximity ──
        let centroidProx = 0.5;
        const liveCentroid = liveVector.spectralCentroidHz || 0;
        const calCentroid = calVec.spectralCentroidHz || 0;
        if (liveCentroid > 0 && calCentroid > 0) {
          const centroidDiff = Math.abs(liveCentroid - calCentroid);
          centroidProx = Math.max(0, Math.min(1, Math.exp(-centroidDiff / 250)));
        }

        // ── 4. Inharmonicity B with Theoretical Physics Prior Blending ──
        // Deterministic scaling: B_theoretical(s, f) = B0(s) * 2^(f / 6)
        const theoreticalB = getTheoreticalInharmonicityB(c.stringNum, c.fretNum);
        const empiricalCalB = (calVec.inharmonicityB && !isNaN(calVec.inharmonicityB) && calVec.inharmonicityB > 0)
          ? calVec.inharmonicityB
          : theoreticalB;
        // Blend 50% empirical with 50% theoretical to eliminate noisy calibration outliers on low frets
        const blendedTargetB = 0.5 * empiricalCalB + 0.5 * theoreticalB;

        const bLive = (liveVector.inharmonicityB && !isNaN(liveVector.inharmonicityB) && liveVector.inharmonicityB > 0)
          ? liveVector.inharmonicityB
          : theoreticalB;

        const bRatio = Math.min(bLive, blendedTargetB) / Math.max(bLive, blendedTargetB);
        const inharmonicityProx = Math.max(0, Math.min(1, Math.pow(bRatio, 0.75)));

        // ── 5. Modal Damping Decay Velocity & Nut Boundary Prior ──
        let decayProx = 0.5;
        const calDecayValid = calVec.deltaSigmaHL !== undefined && !isNaN(calVec.deltaSigmaHL) && isFinite(calVec.deltaSigmaHL);

        if (hasLiveDecay && calDecayValid) {
          const decayDiff = Math.abs((liveVector.deltaSigmaHL || 0) - (calVec.deltaSigmaHL || 0));
          decayProx = Math.max(0, Math.min(1, Math.exp(-decayDiff / 14.0)));
        } else if (hasLiveDecay) {
          // Physical acoustic prior: wound strings damp high harmonics faster (-5 dB/s * stringNum)
          // Open string nut boundary: Fret 0 terminates at bone nut (8 to 14 dB/s slower damping than fretted note)
          const nutBonusOffset = c.fretNum === 0 ? 8.0 : 0.0;
          const expectedDamping = -5.0 * c.stringNum + nutBonusOffset;
          decayProx = Math.max(0, Math.min(1, Math.exp(-Math.abs((liveVector.deltaSigmaHL || 0) - expectedDamping) / 18.0)));
        }

        // Open string nut physics bonus: if playing an open string and damping is slow, reward it
        const openNutBonus = c.fretNum === 0 && hasLiveDecay && (liveVector.deltaSigmaHL || -30) >= -16;

        // Composite raw score weighting using auto-tunable parameters:
        let compositeRaw =
          this.weights.harmonicWeight * harmonicSim +
          (hasLiveScrape ? this.weights.scrapeWeight * scrapeSim : 0.10 * 0.5) +
          this.weights.centroidWeight * centroidProx +
          this.weights.inharmonicityWeight * inharmonicityProx +
          this.weights.decayWeight * decayProx +
          (openNutBonus ? this.weights.nutBonusWeight : 0);

        compositeRaw = isFinite(compositeRaw) && !isNaN(compositeRaw)
          ? Math.max(0.01, Math.min(1.0, compositeRaw))
          : 0.5;

        rawCompositeScores.push(compositeRaw);

        matches.push({
          stringNum: c.stringNum,
          fretNum: c.fretNum,
          midiNote,
          noteName: c.noteName,
          similarityScore: compositeRaw,
          isWinner: false,
          calibratedVector: calVec,
          featureBreakdown: {
            harmonicDistanceScore: Math.round(harmonicSim * 100) / 100,
            centroidProximity: Math.round(centroidProx * 100) / 100,
            inharmonicityProximity: Math.round(inharmonicityProx * 100) / 100,
            decayProximity: hasLiveDecay ? Math.round(decayProx * 100) / 100 : undefined,
            hfScrapeScore: hasLiveScrape ? Math.round(scrapeSim * 100) / 100 : undefined,
            pluckBetaEstimated: Math.round(bestBeta * 1000) / 1000,
            openNutBonus,
          },
        });
      } else {
        // Fallback Prior Model: Informed Guitar Physics Heuristic (Uncalibrated)
        let scrapeSim = 0.5;
        if (hasLiveScrape) {
          const expectedScrape = isWound ? -8.0 : -22.0;
          const scrapeDiff = Math.abs((liveVector.hfScrapeDb || -15) - expectedScrape);
          scrapeSim = Math.max(0, Math.min(1, Math.exp(-scrapeDiff / 9.0)));
        }

        let decaySim = 0.5;
        if (hasLiveDecay && liveVector.deltaSigmaHL !== undefined) {
          const nutBonusOffset = c.fretNum === 0 ? 8.0 : 0.0;
          const expectedDamping = -5.0 * c.stringNum + nutBonusOffset;
          decaySim = Math.max(0, Math.min(1, Math.exp(-Math.abs(liveVector.deltaSigmaHL - expectedDamping) / 18.0)));
        }

        const theoreticalB = getTheoreticalInharmonicityB(c.stringNum, c.fretNum);
        const bLive = (liveVector.inharmonicityB !== undefined && !isNaN(liveVector.inharmonicityB) && liveVector.inharmonicityB > 0)
          ? liveVector.inharmonicityB
          : theoreticalB;
        const bRatio = Math.min(bLive, theoreticalB) / Math.max(bLive, theoreticalB);
        const inharmonicitySim = Math.max(0, Math.min(1, Math.pow(bRatio, 0.5)));

        const fretErgonomics = c.fretNum <= 9 ? 1.0 : Math.max(0.2, 1.0 - (c.fretNum - 9) * 0.12);

        let uncalibratedScore =
          (hasLiveScrape ? 0.35 * scrapeSim : 0.20) +
          (hasLiveDecay ? 0.25 * decaySim : 0.15) +
          0.25 * inharmonicitySim +
          0.15 * fretErgonomics;

        uncalibratedScore = isFinite(uncalibratedScore) && !isNaN(uncalibratedScore)
          ? Math.max(0.01, Math.min(1.0, uncalibratedScore))
          : 0.5;

        rawCompositeScores.push(uncalibratedScore);

        matches.push({
          stringNum: c.stringNum,
          fretNum: c.fretNum,
          midiNote,
          noteName: c.noteName,
          similarityScore: uncalibratedScore,
          isWinner: false,
          featureBreakdown: {
            harmonicDistanceScore: 0.5,
            centroidProximity: 0.5,
            inharmonicityProximity: Math.round(inharmonicitySim * 100) / 100,
            decayProximity: hasLiveDecay ? Math.round(decaySim * 100) / 100 : undefined,
            hfScrapeScore: hasLiveScrape ? Math.round(scrapeSim * 100) / 100 : undefined,
          },
        });
      }
    }

    // ── 6. Softmax Temperature Contrast Scaling ──
    // Maps raw composite scores to decisive probabilities
    const temperature = this.weights.softmaxTemperature;
    const validScores = rawCompositeScores.filter((s) => isFinite(s) && !isNaN(s));
    const maxRaw = validScores.length > 0 ? Math.max(...validScores) : 0.5;
    const expScores = rawCompositeScores.map((s) =>
      Math.exp(((isFinite(s) && !isNaN(s) ? s : 0.1) - maxRaw) / temperature)
    );
    const expSum = expScores.reduce((a, b) => a + b, 0) || 1;

    matches.forEach((m, i) => {
      const prob = expScores[i] / expSum;
      m.similarityScore = isFinite(prob) && !isNaN(prob) ? Math.round(prob * 100) / 100 : 0.5;
    });

    // Sort by final probability descending
    matches.sort((a, b) => b.similarityScore - a.similarityScore);

    if (matches.length > 0) {
      matches[0].isWinner = true;
    }

    return {
      candidates: matches,
      winner: matches[0] || null,
    };
  }

  /**
   * Evaluates the current or custom weights against all unison notes in the calibrated profile.
   * Tests every recorded note where at least one alternative string candidate exists.
   */
  public evaluateBenchmark(
    profile: GuitarCalibrationProfile,
    customWeights?: DisambiguatorWeights
  ): BenchmarkResult {
    const origWeights = { ...this.weights };
    if (customWeights) {
      this.weights = { ...customWeights };
    }

    const clashes: BenchmarkClash[] = [];
    let correctCount = 0;
    let totalMargin = 0;

    const fps = Object.values(profile.fingerprints || {});
    for (const fp of fps) {
      if (!fp.vector) continue;
      const trueStr = fp.stringNum;
      const trueFret = fp.fretNum;
      const midi = fp.midiNote;

      const candidates = findCandidatesForMidi(midi, 15);
      // Only evaluate if there is actual physical unison competition on the fretboard
      if (candidates.length <= 1) continue;

      // Evaluate the fingerprint against all candidate strings for this pitch
      const testVec = fp.earlyVector || fp.vector;
      const result = this.disambiguate(midi, testVec, profile, 15);
      if (!result.winner || result.candidates.length === 0) continue;

      const pred = result.winner;
      const isCorrect = pred.stringNum === trueStr && pred.fretNum === trueFret;
      if (isCorrect) correctCount++;

      const conf = pred.similarityScore;
      const margin = result.candidates.length > 1
        ? Math.max(0, pred.similarityScore - result.candidates[1].similarityScore)
        : 1.0;

      totalMargin += margin;

      clashes.push({
        midiNote: midi,
        noteName: fp.noteName,
        trueString: trueStr,
        trueFret: trueFret,
        predictedString: pred.stringNum,
        predictedFret: pred.fretNum,
        isCorrect,
        confidence: conf,
        margin: Math.round(margin * 100) / 100,
        competitors: result.candidates.map((c) => ({
          stringNum: c.stringNum,
          fretNum: c.fretNum,
          similarityScore: c.similarityScore,
        })),
      });
    }

    // Restore original weights
    this.weights = origWeights;

    const totalEvaluated = clashes.length;
    const accuracyPercent = totalEvaluated > 0 ? Math.round((correctCount / totalEvaluated) * 1000) / 10 : 0;
    const avgMarginPercent = totalEvaluated > 0 ? Math.round((totalMargin / totalEvaluated) * 1000) / 10 : 0;

    return {
      totalEvaluated,
      correctCount,
      accuracyPercent,
      avgMarginPercent,
      clashes,
      weightsUsed: customWeights ? { ...customWeights } : { ...this.weights },
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Programmatically sweeps candidate parameter combinations against the calibrated profile
   * to discover the mathematically optimal weights maximizing unison accuracy and margin.
   */
  public optimizeWeights(profile: GuitarCalibrationProfile): OptimizationResult {
    const initialBench = this.evaluateBenchmark(profile);
    if (initialBench.totalEvaluated === 0) {
      return {
        initialAccuracy: 0,
        initialMargin: 0,
        optimizedAccuracy: 0,
        optimizedMargin: 0,
        iterationsRun: 0,
        bestWeights: { ...this.weights },
        improvementPercent: 0,
        timestamp: new Date().toISOString(),
      };
    }

    let bestWeights = { ...this.weights };
    let bestScore = initialBench.accuracyPercent * 100 + initialBench.avgMarginPercent * 5;
    let iterations = 0;

    // Focused multi-dimensional parameter grid tailored to physical guitar acoustics
    const harmonicWeights = [0.25, 0.35, 0.45, 0.55];
    const scrapeWeights = [0.12, 0.20, 0.28, 0.36];
    const centroidWeights = [0.08, 0.14, 0.20];
    const inharmonicityWeights = [0.08, 0.14, 0.20];
    const combEpsilons = [0.08, 0.12, 0.18];
    const temperatures = [0.07, 0.10, 0.13];

    for (const hw of harmonicWeights) {
      for (const sw of scrapeWeights) {
        for (const cw of centroidWeights) {
          for (const iw of inharmonicityWeights) {
            for (const ce of combEpsilons) {
              for (const temp of temperatures) {
                iterations++;
                const candidateWeights: DisambiguatorWeights = {
                  harmonicWeight: hw,
                  scrapeWeight: sw,
                  centroidWeight: cw,
                  inharmonicityWeight: iw,
                  decayWeight: 0.10,
                  nutBonusWeight: 0.04,
                  combEpsilon: ce,
                  softmaxTemperature: temp,
                };

                const bench = this.evaluateBenchmark(profile, candidateWeights);
                const score = bench.accuracyPercent * 100 + bench.avgMarginPercent * 5;
                if (score > bestScore) {
                  bestScore = score;
                  bestWeights = { ...candidateWeights };
                }
              }
            }
          }
        }
      }
    }

    // Apply and lock in the winning optimal weights
    this.setWeights(bestWeights);
    const finalBench = this.evaluateBenchmark(profile, bestWeights);

    return {
      initialAccuracy: initialBench.accuracyPercent,
      initialMargin: initialBench.avgMarginPercent,
      optimizedAccuracy: finalBench.accuracyPercent,
      optimizedMargin: finalBench.avgMarginPercent,
      iterationsRun: iterations,
      bestWeights,
      improvementPercent: Math.max(0, Math.round((finalBench.accuracyPercent - initialBench.accuracyPercent) * 10) / 10),
      timestamp: new Date().toISOString(),
    };
  }
}
