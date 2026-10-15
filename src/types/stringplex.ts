// src/types/stringplex.ts

export type StringIndex = 1 | 2 | 3 | 4 | 5 | 6; // 1 = High E, 6 = Low E

export interface HarmonicVector {
  // Normalized amplitudes for the first 12 harmonics (L2 unit vector: sum of squares = 1)
  harmonics: number[]; 
  // Absolute dB amplitudes of the first 12 harmonics
  rawDb: number[];
  // Mean-centered decibel spectrum (weighted mean subtracted, eliminates H1 anchor trap)
  meanCenteredDb: number[];
  // Slope-detrended residual spectrum in log2(k) space (eliminates macro pluck tilt)
  tiltDetrendedDb?: number[];
  // Spectral slope alpha in log2(k) space
  spectralSlopeAlpha?: number;
  // Frequency center of gravity in Hz
  spectralCentroidHz: number;
  // Frequency below which 85% of total spectral power resides
  spectralRolloffHz: number;
  // Inharmonicity coefficient B from joint Weighted Least Squares (WLS) regression
  inharmonicityB: number;
  // True zero-stiffness fundamental frequency f0 from joint WLS regression
  f0True: number;
  // Damping decay velocity: slopes in dB/s per harmonic over 100ms window
  decaySlopesDbPerSec?: number[];
  // Differential high-vs-low decay: median(H4..H12) - mean(H1..H2) in dB/s
  deltaSigmaHL?: number;
  // High-Frequency Transient Scrape Ratio in dB (4.5-12kHz vs 80-2500Hz) at 0-15ms
  hfScrapeDb?: number;
  // Timestamp relative to note onset in ms
  elapsedMsSinceOnset?: number;
  // Harmonic Energy Ratios
  h1H2Ratio: number;
  h1H3Ratio: number;
}

export interface FretFingerprint {
  stringNum: StringIndex;
  fretNum: number;
  midiNote: number;
  noteName: string;
  expectedHz: number;
  measuredHz: number;
  vector: HarmonicVector; // Primary / early attack-decay vector (30-85ms)
  earlyVector?: HarmonicVector; // Explicit early attack-decay template
  sustainVector?: HarmonicVector; // Mid sustain template (120-250ms)
  hfScrapeDb?: number; // Captured fingernail scrape ratio
  timestamp: string;
}

export interface GuitarCalibrationProfile {
  id: string;
  name: string;
  guitarModel: string;
  pickupSetting: string;
  notesCalibratedCount: number;
  fingerprints: Record<string, FretFingerprint>; // Key format: `${stringNum}_${fretNum}`
  createdAt: string;
  lastUpdated: string;
}

export interface CandidateMatch {
  stringNum: StringIndex;
  fretNum: number;
  midiNote: number;
  noteName: string;
  similarityScore: number; // 0.00 to 1.00 (e.g. 0.94 = 94% match)
  isWinner: boolean;
  calibratedVector?: HarmonicVector;
  featureBreakdown: {
    harmonicDistanceScore: number;
    centroidProximity: number;
    inharmonicityProximity: number;
    rolloffProximity?: number;
    h1H2Proximity?: number;
    decayProximity?: number;
    hfScrapeScore?: number;
    pluckBetaEstimated?: number;
    openNutBonus?: boolean;
  };
}

export type DetectorState = 'idle' | 'listening' | 'committed' | 'sustaining';

export interface StringplexLiveFrame {
  state: DetectorState;
  frequencyHz: number | null;
  midiNote: number | null;
  noteName: string | null;
  cents: number | null;
  confidence: number | null;
  rmsDb: number;
  harmonicVector: HarmonicVector | null;
  candidates: CandidateMatch[];
  winningCandidate: CandidateMatch | null;
  hfScrapeDb?: number;
  elapsedMsSinceOnset?: number;
  estimatedPluckCm?: number;
}

export interface CalibrationStep {
  stringNum: StringIndex;
  fretNum: number;
  midiNote: number;
  noteName: string;
  expectedHz: number;
}

export interface DisambiguatorWeights {
  harmonicWeight: number;      // weight for 12-harmonic spectral distance (default: 0.32)
  scrapeWeight: number;        // weight for fingernail transient scrape ratio (default: 0.20)
  centroidWeight: number;      // weight for high-resolution spectral centroid (default: 0.12)
  inharmonicityWeight: number; // weight for stiffness B coefficient (default: 0.14)
  rolloffWeight: number;       // weight for 85% spectral rolloff frequency (default: 0.12)
  h1H2Weight: number;          // weight for fundamental-to-2nd harmonic ratio (default: 0.10)
  decayWeight: number;         // weight for modal damping decay velocity (default: 0.08)
  nutBonusWeight: number;      // weight for open nut termination boundary prior (default: 0.04)
  combEpsilon: number;         // excitation comb regularization floor (default: 0.12)
  softmaxTemperature: number;  // contrast temperature for probability scaling (default: 0.10)
}

export interface BenchmarkClash {
  midiNote: number;
  noteName: string;
  trueString: StringIndex;
  trueFret: number;
  predictedString: StringIndex;
  predictedFret: number;
  isCorrect: boolean;
  confidence: number;
  margin: number; // confidence difference between #1 and #2
  clashType?: 'plain-vs-wound' | 'wound-vs-wound' | 'plain-vs-plain';
  testVector?: HarmonicVector;
  competitors: Array<{
    stringNum: StringIndex;
    fretNum: number;
    similarityScore: number;
    calibratedVector?: HarmonicVector;
    featureBreakdown?: CandidateMatch['featureBreakdown'];
  }>;
}

export interface BenchmarkResult {
  totalEvaluated: number;
  correctCount: number;
  accuracyPercent: number;
  avgMarginPercent: number;
  clashes: BenchmarkClash[];
  weightsUsed: DisambiguatorWeights;
  timestamp: string;
}

export interface OptimizationResult {
  initialAccuracy: number;
  initialMargin: number;
  optimizedAccuracy: number;
  optimizedMargin: number;
  iterationsRun: number;
  bestWeights: DisambiguatorWeights;
  improvementPercent: number;
  timestamp: string;
}
