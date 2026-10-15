// src/constants/guitarConstants.ts
import { StringIndex, CalibrationStep } from '../types/stringplex';

export interface StringMeta {
  index: StringIndex;
  name: string;
  tuningNote: string;
  openMidi: number;
  openHz: number;
  gaugeApprox: string;
  isWound: boolean;
  color: string;
}

export const GUITAR_STRINGS: Record<StringIndex, StringMeta> = {
  1: {
    index: 1,
    name: '1st (High E)',
    tuningNote: 'E4',
    openMidi: 64,
    openHz: 329.63,
    gaugeApprox: '.012 Plain',
    isWound: false,
    color: '#38bdf8', // sky-400
  },
  2: {
    index: 2,
    name: '2nd (B)',
    tuningNote: 'B3',
    openMidi: 59,
    openHz: 246.94,
    gaugeApprox: '.016 Plain',
    isWound: false,
    color: '#818cf8', // indigo-400
  },
  3: {
    index: 3,
    name: '3rd (G)',
    tuningNote: 'G3',
    openMidi: 55,
    openHz: 196.00,
    gaugeApprox: '.024 Wound',
    isWound: true,
    color: '#c084fc', // purple-400
  },
  4: {
    index: 4,
    name: '4th (D)',
    tuningNote: 'D3',
    openMidi: 50,
    openHz: 146.83,
    gaugeApprox: '.032 Wound',
    isWound: true,
    color: '#f472b6', // pink-400
  },
  5: {
    index: 5,
    name: '5th (A)',
    tuningNote: 'A2',
    openMidi: 45,
    openHz: 110.00,
    gaugeApprox: '.042 Wound',
    isWound: true,
    color: '#fb923c', // orange-400
  },
  6: {
    index: 6,
    name: '6th (Low E)',
    tuningNote: 'E2',
    openMidi: 40,
    openHz: 82.41,
    gaugeApprox: '.053 Wound',
    isWound: true,
    color: '#f87171', // red-400
  },
};

/**
 * Baseline open-string inharmonicity coefficient B0 for 25.5" acoustic light (.012-.053) set
 */
export const OPEN_STRING_B0: Record<StringIndex, number> = {
  1: 0.000045, // .012 plain: 0.45 x 10^-4
  2: 0.000080, // .016 plain: 0.80 x 10^-4
  3: 0.000065, // .024 wound (~.014 core): 0.65 x 10^-4
  4: 0.000095, // .032 wound (~.016 core): 0.95 x 10^-4
  5: 0.000135, // .042 wound (~.018 core): 1.35 x 10^-4
  6: 0.000190, // .053 wound (~.020 core): 1.90 x 10^-4
};

export const SCALE_LENGTH_CM = 64.8; // 25.5" standard scale in cm

/**
 * Calculates theoretical inharmonicity B factor for string s at fret f:
 * B_theoretical(s, f) = B0(s) * 2^(f / 6)
 * Every 6 frets doubles B; every 12 frets quadruples B.
 */
export function getTheoreticalInharmonicityB(stringNum: StringIndex, fretNum: number): number {
  const b0 = OPEN_STRING_B0[stringNum] || 0.000080;
  return b0 * Math.pow(2, fretNum / 6);
}

/**
 * Calculates physical speaking length of string at fretNum in cm:
 * L(f) = L0 * 2^(-f / 12)
 */
export function getSpeakingLengthCm(fretNum: number): number {
  return SCALE_LENGTH_CM * Math.pow(2, -fretNum / 12);
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiToHz(midi: number): number {
  return Math.round(440 * Math.pow(2, (midi - 69) / 12) * 100) / 100;
}

export function midiToNoteName(midi: number): string {
  const pitchClass = ((midi % 12) + 12) % 12;
  const octave = Math.floor(midi / 12) - 1;
  return NOTE_NAMES[pitchClass] + octave;
}

export function getFretMidi(stringNum: StringIndex, fretNum: number): number {
  return GUITAR_STRINGS[stringNum].openMidi + fretNum;
}

export function getFretHz(stringNum: StringIndex, fretNum: number): number {
  return midiToHz(getFretMidi(stringNum, fretNum));
}

/**
 * Given a detected MIDI note, find all possible (string, fret) positions
 * on a standard guitar fretboard within [0, maxFret].
 */
export function findCandidatesForMidi(
  midiNote: number,
  maxFret: number = 15
): Array<{ stringNum: StringIndex; fretNum: number; noteName: string }> {
  const candidates: Array<{ stringNum: StringIndex; fretNum: number; noteName: string }> = [];

  // Check strings 1 to 6
  const stringIndices: StringIndex[] = [1, 2, 3, 4, 5, 6];
  for (const s of stringIndices) {
    const openMidi = GUITAR_STRINGS[s].openMidi;
    const fret = midiNote - openMidi;
    if (fret >= 0 && fret <= maxFret) {
      candidates.push({
        stringNum: s,
        fretNum: fret,
        noteName: midiToNoteName(midiNote),
      });
    }
  }

  return candidates;
}

/**
 * Generate the sequential 0-to-15 chromatic calibration steps for a string.
 */
export function getChromaticCalibrationSteps(
  stringNum: StringIndex,
  maxFret: number = 15
): CalibrationStep[] {
  const steps: CalibrationStep[] = [];
  for (let fret = 0; fret <= maxFret; fret++) {
    const midi = getFretMidi(stringNum, fret);
    steps.push({
      stringNum,
      fretNum: fret,
      midiNote: midi,
      noteName: midiToNoteName(midi),
      expectedHz: midiToHz(midi),
    });
  }
  return steps;
}
