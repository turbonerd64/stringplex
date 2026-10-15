// src/audio/GuitarPitchDetector.ts
// StringPlex High-Precision Guitar Pitch & Timbre Detector
// Combines YIN fundamental frequency tracking with FFT harmonic vector extraction
// and multi-string disambiguation.

import {
  StringplexLiveFrame,
  DetectorState,
  HarmonicVector,
  GuitarCalibrationProfile,
  CandidateMatch,
} from '../types/stringplex';
import { TimbreFeatureExtractor } from './TimbreFeatureExtractor';
import { StringDisambiguator } from './StringDisambiguator';
import { NOTE_NAMES } from '../constants/guitarConstants';

export interface DetectorConfig {
  inputGainDb: number;        // default: +12 dB
  gateThresholdDb: number;    // default: -38 dB
  onsetSensitivity: number;   // default: 0.5
  minConfidence: number;      // default: 0.85
  stabilityFrames: number;    // default: 3 (~48ms consensus)
  lockoutMs: number;          // default: 120 ms
  yinThreshold: number;       // default: 0.15
  minFreqHz: number;          // default: 75 Hz (D2)
  maxFreqHz: number;          // default: 1200 Hz (D6)
}

const DEFAULT_CONFIG: DetectorConfig = {
  inputGainDb: 12,
  gateThresholdDb: -38,
  onsetSensitivity: 0.5,
  minConfidence: 0.70,
  stabilityFrames: 3,
  lockoutMs: 120,
  yinThreshold: 0.20,
  minFreqHz: 70,
  maxFreqHz: 1200,
};


export class GuitarPitchDetector {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;

  private timeDomainBuffer: Float32Array<ArrayBuffer> = new Float32Array(4096);
  private freqDomainBuffer: Float32Array<ArrayBuffer> = new Float32Array(2048);
  private rafId: number | null = null;
  private isRunning = false;

  private config: DetectorConfig;
  private extractor: TimbreFeatureExtractor;
  private disambiguator: StringDisambiguator;
  private activeProfile: GuitarCalibrationProfile | null = null;

  // State machine
  private state: DetectorState = 'idle';
  private committedMidi: number | null = null;
  private committedHz: number | null = null;
  private lastCommitTimeMs: number = 0;
  private onsetTimeMs: number = 0;

  // Stability ring buffers
  private stabilityMidiBuffer: number[] = [];
  private stabilityHzBuffer: number[] = [];
  private stabilityConfBuffer: number[] = [];
  private prevRmsDb: number = -100;

  // Cached latest frame
  private latestFrame: StringplexLiveFrame | null = null;
  private onFrameCallback: ((frame: StringplexLiveFrame) => void) | null = null;

  // Temporal smoothing & Hysteresis latch
  private candidateProbBuffer: Map<string, number> = new Map();
  private lockedWinnerKey: string | null = null;
  private winnerConsecutiveFrames: number = 0;

  // Modal Damping & Decay Velocity Tracking
  private decaySnapshots: Array<{ timeSec: number; rawDb: number[] }> = [];

  // Circular Ring Buffer for Retroactive Multi-Epoch Calibration Capture (0 to 600ms)
  private recentFramesRingBuffer: Array<{
    timestampMs: number;
    elapsedMsSinceOnset: number;
    frequencyHz: number;
    midiNote: number;
    vector: HarmonicVector;
  }> = [];

  constructor(config?: Partial<DetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.extractor = new TimbreFeatureExtractor(4096, 12);
    this.disambiguator = new StringDisambiguator();
  }

  public setCalibrationProfile(profile: GuitarCalibrationProfile | null): void {
    this.activeProfile = profile;
  }

  public updateConfig(config: Partial<DetectorConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.inputGainDb !== undefined && this.gainNode && this.audioContext) {
      const linearGain = Math.pow(10, config.inputGainDb / 20);
      this.gainNode.gain.setValueAtTime(linearGain, this.audioContext.currentTime);
    }
  }

  public getConfig(): Readonly<DetectorConfig> {
    return { ...this.config };
  }

  public getIsRunning(): boolean {
    return this.isRunning;
  }

  public async start(
    deviceId: string | null,
    onFrame: (frame: StringplexLiveFrame) => void
  ): Promise<void> {
    if (this.isRunning) return;

    this.onFrameCallback = onFrame;
    this.resetState();

    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
      },
    };

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch {
      // Fallback without exact device constraint
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    }

    this.audioContext = new AudioContext();
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
    this.gainNode = this.audioContext.createGain();
    const linearGain = Math.pow(10, this.config.inputGainDb / 20);
    this.gainNode.gain.setValueAtTime(linearGain, this.audioContext.currentTime);

    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 4096;
    // Set to 0.0: un-smear frames completely so rapid fingernail transients and damping rates are crisp
    this.analyser.smoothingTimeConstant = 0.0;
    this.timeDomainBuffer = new Float32Array(this.analyser.fftSize);
    this.freqDomainBuffer = new Float32Array(this.analyser.frequencyBinCount);

    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.analyser);

    this.isRunning = true;
    this.loop();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch { /* ignore */ }
      this.gainNode = null;
    }
    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch { /* ignore */ }
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
    if (this.audioContext && this.audioContext.state !== 'closed') {
      try { this.audioContext.close(); } catch { /* ignore */ }
      this.audioContext = null;
    }
    this.resetState();
  }

  private resetState(): void {
    this.state = 'idle';
    this.committedMidi = null;
    this.committedHz = null;
    this.stabilityMidiBuffer = [];
    this.stabilityHzBuffer = [];
    this.stabilityConfBuffer = [];
    this.prevRmsDb = -100;
    this.lastCommitTimeMs = 0;
    this.onsetTimeMs = 0;
    this.candidateProbBuffer.clear();
    this.lockedWinnerKey = null;
    this.winnerConsecutiveFrames = 0;
    this.decaySnapshots = [];
    this.recentFramesRingBuffer = [];
  }

  // ─── Main Audio Processing Loop ──────────────────────────────────────

  private loop = (): void => {
    if (!this.isRunning || !this.analyser || !this.audioContext) return;

    this.analyser.getFloatTimeDomainData(this.timeDomainBuffer);
    this.analyser.getFloatFrequencyData(this.freqDomainBuffer);
    const sampleRate = this.audioContext.sampleRate;
    const now = performance.now();

    // ── Stage 1: RMS & Noise Gate ──
    const rmsDb = this.computeRmsDb(this.timeDomainBuffer);
    const gateOpen = rmsDb > this.config.gateThresholdDb;

    // ── Stage 2: Onset Detection ──
    const energyDelta = rmsDb - this.prevRmsDb;
    const onsetThresholdDb = 6 * this.config.onsetSensitivity + 3;
    const onsetDetected = gateOpen && energyDelta > onsetThresholdDb;
    this.prevRmsDb = rmsDb;

    if (!gateOpen) {
      if (this.state !== 'idle') {
        this.resetState();
        this.emitFrame({
          state: 'idle',
          frequencyHz: null,
          midiNote: null,
          noteName: null,
          cents: null,
          confidence: null,
          rmsDb,
          harmonicVector: null,
          candidates: [],
          winningCandidate: null,
        });
      }
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    if (onsetDetected && this.state !== 'listening') {
      this.state = 'listening';
      this.onsetTimeMs = now;
      this.stabilityMidiBuffer = [];
      this.stabilityHzBuffer = [];
      this.stabilityConfBuffer = [];
      this.decaySnapshots = [];
    }

    // ── Stage 3: YIN Fundamental Estimation ──
    const analysisWindow = this.timeDomainBuffer.slice(1024, 3072);
    const yinResult = this.yinEstimate(analysisWindow, sampleRate);

    if (!yinResult || yinResult.confidence < this.config.minConfidence) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    const { frequencyHz, confidence } = yinResult;

    if (frequencyHz < this.config.minFreqHz || frequencyHz > this.config.maxFreqHz) {
      this.rafId = requestAnimationFrame(this.loop);
      return;
    }

    // MIDI calculation
    const midiFloat = 69 + 12 * Math.log2(frequencyHz / 440);
    const nearestMidi = Math.round(midiFloat);
    const cents = Math.round((midiFloat - nearestMidi) * 100);
    const pitchClass = ((nearestMidi % 12) + 12) % 12;
    const octave = Math.floor(nearestMidi / 12) - 1;
    const noteName = NOTE_NAMES[pitchClass] + octave;

    // Pitch transition check (e.g. legato / hammer-on note change without energy onset spike)
    if (this.committedMidi !== null && nearestMidi !== this.committedMidi) {
      this.decaySnapshots = [];
      this.onsetTimeMs = now;
    }

    // ── Stage 4: Octave Guard ──
    if (this.committedHz !== null) {
      const ratio = frequencyHz / this.committedHz;
      if ((Math.abs(ratio - 2.0) < 0.08 || Math.abs(ratio - 0.5) < 0.04) && confidence < 0.92) {
        this.rafId = requestAnimationFrame(this.loop);
        return;
      }
    }

    // ── Stage 5: Stability Consensus Window ──
    this.stabilityMidiBuffer.push(nearestMidi);
    this.stabilityHzBuffer.push(frequencyHz);
    this.stabilityConfBuffer.push(confidence);

    if (this.stabilityMidiBuffer.length > this.config.stabilityFrames) {
      this.stabilityMidiBuffer.shift();
      this.stabilityHzBuffer.shift();
      this.stabilityConfBuffer.shift();
    }

    const isStable =
      this.stabilityMidiBuffer.length >= this.config.stabilityFrames &&
      this.stabilityMidiBuffer.every((m) => m === nearestMidi);

    // ── Stage 6: Harmonic Timbre Feature Extraction & Disambiguation ──
    const avgHz = this.stabilityHzBuffer.reduce((a, b) => a + b, 0) / this.stabilityHzBuffer.length;
    const harmonicVector = this.extractor.extract(this.freqDomainBuffer, avgHz, sampleRate);

    // Modal Damping / Harmonic Decay Velocity Tracking (25ms to 150ms post-onset)
    if (harmonicVector) {
      const elapsedSinceOnset = Math.max(0, now - this.onsetTimeMs);
      harmonicVector.elapsedMsSinceOnset = Math.round(elapsedSinceOnset);

      // Record frame in circular ring buffer for retroactive calibration extraction
      this.recentFramesRingBuffer.push({
        timestampMs: now,
        elapsedMsSinceOnset: elapsedSinceOnset,
        frequencyHz: avgHz,
        midiNote: nearestMidi,
        vector: { ...harmonicVector },
      });
      if (this.recentFramesRingBuffer.length > 200) {
        this.recentFramesRingBuffer.shift();
      }

      if (elapsedSinceOnset >= 25 && elapsedSinceOnset <= 150) {
        this.decaySnapshots.push({
          timeSec: elapsedSinceOnset / 1000,
          rawDb: [...harmonicVector.rawDb],
        });
        if (this.decaySnapshots.length > 12) {
          this.decaySnapshots.shift();
        }
      }

      if (this.decaySnapshots.length >= 4) {
        const slopes: number[] = [];
        const numH = harmonicVector.rawDb.length;
        const tMean = this.decaySnapshots.reduce((acc, s) => acc + s.timeSec, 0) / this.decaySnapshots.length;
        let denomT = 0;
        for (const s of this.decaySnapshots) {
          denomT += (s.timeSec - tMean) * (s.timeSec - tMean);
        }

        if (denomT > 1e-6) {
          for (let k = 0; k < numH; k++) {
            const dbMean = this.decaySnapshots.reduce((acc, s) => acc + s.rawDb[k], 0) / this.decaySnapshots.length;
            let numer = 0;
            for (const s of this.decaySnapshots) {
              numer += (s.timeSec - tMean) * (s.rawDb[k] - dbMean);
            }
            slopes.push(Math.round((numer / denomT) * 10) / 10);
          }

          // Differential high-vs-low decay velocity: median(H4..H12) - mean(H1..H2)
          const upperSlopes = slopes.slice(3).sort((a, b) => a - b);
          const medianUpper = upperSlopes[Math.floor(upperSlopes.length / 2)] || 0;
          const meanLower = ((slopes[0] || 0) + (slopes[1] || 0)) / 2;
          const deltaSigmaHL = Math.round((medianUpper - meanLower) * 10) / 10;

          harmonicVector.decaySlopesDbPerSec = slopes;
          harmonicVector.deltaSigmaHL = deltaSigmaHL;
        }
      }
    }

    let candidates: CandidateMatch[] = [];
    let winningCandidate: CandidateMatch | null = null;

    if (harmonicVector) {
      const disambiguation = this.disambiguator.disambiguate(
        nearestMidi,
        harmonicVector,
        this.activeProfile
      );
      candidates = disambiguation.candidates;

      if (candidates.length > 0) {
        // Temporal Exponential Moving Average (EMA) smoothing for stability
        candidates.forEach((cand) => {
          const key = `${cand.stringNum}_${cand.fretNum}`;
          const currentScore = isFinite(cand.similarityScore) && !isNaN(cand.similarityScore) ? cand.similarityScore : 0.1;
          const prev = this.candidateProbBuffer.get(key) ?? currentScore;
          const prevScore = isFinite(prev) && !isNaN(prev) ? prev : currentScore;
          const smoothed = 0.35 * currentScore + 0.65 * prevScore;
          this.candidateProbBuffer.set(key, smoothed);
          cand.similarityScore = Math.round(smoothed * 100) / 100;
        });

        // Re-sort after smoothing
        candidates.sort((a, b) => b.similarityScore - a.similarityScore);
        const topCandidate = candidates[0];

        // Hysteresis decision latch: prevents 1-frame flip-flops
        if (this.lockedWinnerKey !== null && this.committedMidi === nearestMidi) {
          const currentLocked = candidates.find(
            (c) => `${c.stringNum}_${c.fretNum}` === this.lockedWinnerKey
          );
          const topKey = `${topCandidate.stringNum}_${topCandidate.fretNum}`;

          if (currentLocked && topKey !== this.lockedWinnerKey) {
            // Challenger must beat incumbent by at least 15% probability
            if (topCandidate.similarityScore > currentLocked.similarityScore + 0.15) {
              this.winnerConsecutiveFrames++;
              if (this.winnerConsecutiveFrames >= 4) {
                this.lockedWinnerKey = topKey;
                this.winnerConsecutiveFrames = 0;
              }
            } else {
              this.winnerConsecutiveFrames = 0;
            }
          }
        } else {
          // Fresh note or first commit
          this.lockedWinnerKey = `${topCandidate.stringNum}_${topCandidate.fretNum}`;
          this.winnerConsecutiveFrames = 0;
        }

        // Apply locked winner to candidates list
        candidates.forEach((c) => {
          c.isWinner = `${c.stringNum}_${c.fretNum}` === this.lockedWinnerKey;
        });
        winningCandidate = candidates.find((c) => c.isWinner) || topCandidate;

        // Ensure identified winner is always index 0 for consistent UI ranking
        candidates.sort((a, b) => {
          if (a.isWinner && !b.isWinner) return -1;
          if (!a.isWinner && b.isWinner) return 1;
          return b.similarityScore - a.similarityScore;
        });
      }
    }

    const lockoutExpired = (now - this.lastCommitTimeMs) > this.config.lockoutMs;

    if (isStable && lockoutExpired) {
      if (this.state === 'listening' || this.state === 'idle' || nearestMidi !== this.committedMidi) {
        this.state = 'committed';
        this.committedMidi = nearestMidi;
        this.committedHz = avgHz;
        this.lastCommitTimeMs = now;
        // On new pitch commit, clear previous candidate smoothing buffer and decay snapshots
        this.candidateProbBuffer.clear();
        this.lockedWinnerKey = null;
        this.winnerConsecutiveFrames = 0;
        this.decaySnapshots = [];
        // Preserve original acoustic onset unless it was unset or switching to a new pitch
        if (this.onsetTimeMs === 0 || nearestMidi !== this.committedMidi) {
          this.onsetTimeMs = now;
        }
      } else if (this.state === 'committed') {
        this.state = 'sustaining';
      }
    }

    const elapsedSinceOnset = Math.round(Math.max(0, now - this.onsetTimeMs));
    this.emitFrame({
      state: this.state,
      frequencyHz: Math.round(avgHz * 10) / 10,
      midiNote: nearestMidi,
      noteName,
      cents,
      confidence: Math.round(confidence * 100) / 100,
      rmsDb: Math.round(rmsDb * 10) / 10,
      harmonicVector,
      candidates,
      winningCandidate,
      hfScrapeDb: harmonicVector?.hfScrapeDb,
      elapsedMsSinceOnset: elapsedSinceOnset,
      estimatedPluckCm: winningCandidate?.featureBreakdown?.pluckBetaEstimated
        ? Math.round(winningCandidate.featureBreakdown.pluckBetaEstimated * 64.8 * 10) / 10
        : undefined,
    });

    this.rafId = requestAnimationFrame(this.loop);
  };

  // ─── YIN Algorithm Implementation ────────────────────────────────────

  private yinEstimate(
    buf: Float32Array<ArrayBufferLike>,
    sampleRate: number
  ): { frequencyHz: number; confidence: number } | null {
    const halfLen = Math.floor(buf.length / 2);
    const minLag = Math.max(2, Math.floor(sampleRate / this.config.maxFreqHz));
    const maxLag = Math.min(halfLen, Math.floor(sampleRate / this.config.minFreqHz));

    if (maxLag <= minLag) return null;

    // Difference function
    const d = new Float32Array(maxLag);
    for (let tau = minLag; tau < maxLag; tau++) {
      let sum = 0;
      for (let i = 0; i < halfLen; i++) {
        const delta = buf[i] - buf[i + tau];
        sum += delta * delta;
      }
      d[tau] = sum;
    }

    // Cumulative mean normalized difference
    const dPrime = new Float32Array(maxLag);
    dPrime[minLag] = 1.0;
    let runningSum = d[minLag];
    for (let tau = minLag + 1; tau < maxLag; tau++) {
      runningSum += d[tau];
      dPrime[tau] = d[tau] * (tau - minLag + 1) / runningSum;
    }

    // Absolute threshold dip
    let bestTau = -1;
    for (let tau = minLag + 1; tau < maxLag - 1; tau++) {
      if (dPrime[tau] < this.config.yinThreshold) {
        while (tau + 1 < maxLag - 1 && dPrime[tau + 1] < dPrime[tau]) {
          tau++;
        }
        bestTau = tau;
        break;
      }
    }

    if (bestTau < 0) {
      let minVal = Infinity;
      for (let tau = minLag + 1; tau < maxLag; tau++) {
        if (dPrime[tau] < minVal) {
          minVal = dPrime[tau];
          bestTau = tau;
        }
      }
      if (minVal > 0.5) return null;
    }

    if (bestTau <= 0) return null;

    // Parabolic interpolation
    let refinedTau = bestTau;
    if (bestTau > minLag && bestTau < maxLag - 1) {
      const alpha = dPrime[bestTau - 1];
      const beta = dPrime[bestTau];
      const gamma = dPrime[bestTau + 1];
      const denom = 2 * (alpha + gamma - 2 * beta);
      if (Math.abs(denom) > 1e-10) {
        const delta = (alpha - gamma) / denom;
        if (Math.abs(delta) < 1) {
          refinedTau = bestTau + delta;
        }
      }
    }

    const frequencyHz = sampleRate / refinedTau;
    const confidence = Math.max(0, Math.min(1, 1.0 - (dPrime[bestTau] || 0)));

    return { frequencyHz, confidence };
  }

  private computeRmsDb(buf: Float32Array<ArrayBufferLike>): number {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) {
      sum += buf[i] * buf[i];
    }
    const rms = Math.sqrt(sum / buf.length);
    if (rms < 1e-10) return -100;
    return 20 * Math.log10(rms);
  }

  private emitFrame(frame: StringplexLiveFrame): void {
    this.latestFrame = frame;
    if (this.onFrameCallback) {
      this.onFrameCallback(frame);
    }
  }

  /**
   * Retroactively extracts the 2-epoch templates (Early Attack-Decay vs Mid Sustain)
   * from the circular ring buffer for the sustained note.
   * This completely eliminates the 450ms vs 50ms temporal mismatch!
   */
  public getRetroactiveCaptureVectors(targetMidi: number): {
    earlyVector: HarmonicVector;
    sustainVector: HarmonicVector;
    measuredHz: number;
  } | null {
    const validFrames = this.recentFramesRingBuffer.filter(
      (f) => f.midiNote === targetMidi && f.vector
    );
    if (validFrames.length === 0) return null;

    // Epoch 1: Early Attack-Decay (25ms - 95ms post-onset)
    let earlyFrames = validFrames.filter(
      (f) => f.elapsedMsSinceOnset >= 25 && f.elapsedMsSinceOnset <= 95
    );
    if (earlyFrames.length === 0) {
      earlyFrames = validFrames.slice(0, Math.min(4, validFrames.length));
    }

    // Epoch 2: Mid Sustain (120ms - 260ms post-onset)
    let sustainFrames = validFrames.filter(
      (f) => f.elapsedMsSinceOnset >= 120 && f.elapsedMsSinceOnset <= 260
    );
    if (sustainFrames.length === 0) {
      sustainFrames = validFrames.slice(-Math.min(4, validFrames.length));
    }

    const earlyVector = this.synthesizeRepresentativeVector(earlyFrames.map((f) => f.vector));
    const sustainVector = this.synthesizeRepresentativeVector(sustainFrames.map((f) => f.vector));
    const avgHz = validFrames.reduce((a, f) => a + f.frequencyHz, 0) / validFrames.length;

    return {
      earlyVector,
      sustainVector,
      measuredHz: Math.round(avgHz * 10) / 10,
    };
  }

  private synthesizeRepresentativeVector(vectors: HarmonicVector[]): HarmonicVector {
    if (vectors.length === 0) {
      throw new Error('Cannot synthesize empty vector list');
    }
    if (vectors.length === 1) return { ...vectors[0] };
    const base = vectors[Math.floor(vectors.length / 2)];
    const K = base.rawDb.length;

    const avgRawDb: number[] = [];
    const avgCenteredDb: number[] = [];
    const avgTiltDetrendedDb: number[] = [];

    for (let k = 0; k < K; k++) {
      const dbVals = vectors.map((v) => (v.rawDb && v.rawDb[k] !== undefined ? v.rawDb[k] : -100)).sort((a, b) => a - b);
      const cVals = vectors.map((v) => (v.meanCenteredDb ? v.meanCenteredDb[k] : 0)).sort((a, b) => a - b);
      const tVals = vectors.map((v) => (v.tiltDetrendedDb ? v.tiltDetrendedDb[k] : 0)).sort((a, b) => a - b);

      avgRawDb.push(dbVals[Math.floor(dbVals.length / 2)]);
      avgCenteredDb.push(cVals[Math.floor(cVals.length / 2)]);
      avgTiltDetrendedDb.push(tVals[Math.floor(tVals.length / 2)]);
    }

    // Recompute L2-normalized unit vector from representative median rawDb
    const synthAmplitudes = avgRawDb.map((db) => Math.pow(10, db / 20));
    const l2Norm = Math.sqrt(synthAmplitudes.reduce((acc, a) => acc + a * a, 0)) || 1;
    const synthHarmonics = synthAmplitudes.map((a) => Math.round((a / l2Norm) * 1000) / 1000);

    const bVals = vectors.map((v) => v.inharmonicityB ?? 0.0001).sort((a, b) => a - b);
    const scVals = vectors.map((v) => v.spectralCentroidHz ?? 500).sort((a, b) => a - b);
    const hfVals = vectors.map((v) => (v.hfScrapeDb !== undefined ? v.hfScrapeDb : -20)).sort((a, b) => a - b);

    return {
      ...base,
      harmonics: synthHarmonics,
      rawDb: avgRawDb,
      meanCenteredDb: avgCenteredDb,
      tiltDetrendedDb: avgTiltDetrendedDb,
      inharmonicityB: bVals[Math.floor(bVals.length / 2)],
      spectralCentroidHz: Math.round(scVals[Math.floor(scVals.length / 2)]),
      hfScrapeDb: Math.round(hfVals[Math.floor(hfVals.length / 2)] * 10) / 10,
    };
  }

  /**
   * One-shot snapshot capture of the current harmonic vector.
   * Leverages retroactive circular buffer capture for 2-epoch templates.
   */
  public captureFingerprintSnapshot(): {
    frequencyHz: number;
    vector: HarmonicVector;
    earlyVector?: HarmonicVector;
    sustainVector?: HarmonicVector;
  } | null {
    if (!this.latestFrame || !this.latestFrame.harmonicVector || !this.latestFrame.frequencyHz) {
      return null;
    }

    const targetMidi = this.latestFrame.midiNote;
    if (targetMidi !== null) {
      const epochs = this.getRetroactiveCaptureVectors(targetMidi);
      if (epochs) {
        return {
          frequencyHz: epochs.measuredHz,
          vector: epochs.earlyVector, // Default vector is now the crucial Early Attack-Decay template!
          earlyVector: epochs.earlyVector,
          sustainVector: epochs.sustainVector,
        };
      }
    }

    return {
      frequencyHz: this.latestFrame.frequencyHz,
      vector: this.latestFrame.harmonicVector,
    };
  }

  public getDisambiguator(): StringDisambiguator {
    return this.disambiguator;
  }
}

export const guitarPitchDetector = new GuitarPitchDetector();
