// src/store/useStringplexStore.ts
import { create } from 'zustand';
import {
  GuitarCalibrationProfile,
  FretFingerprint,
  StringplexLiveFrame,
  StringIndex,
  DisambiguatorWeights,
  BenchmarkResult,
  OptimizationResult,
} from '../types/stringplex';
import { guitarPitchDetector, DetectorConfig } from '../audio/GuitarPitchDetector';
import { DEFAULT_DISAMBIGUATOR_WEIGHTS } from '../audio/StringDisambiguator';

interface StringplexStore {
  // Navigation
  activeTab: 'fretboard' | 'calibrate' | 'diagnostics';
  setActiveTab: (tab: 'fretboard' | 'calibrate' | 'diagnostics') => void;

  // Audio Engine
  isListening: boolean;
  selectedDeviceId: string | null;
  audioDevices: MediaDeviceInfo[];
  detectorConfig: DetectorConfig;
  liveFrame: StringplexLiveFrame | null;

  // Calibration Profiles
  profiles: GuitarCalibrationProfile[];
  activeProfileId: string | null;

  // Benchmark & Optimizer State
  disambiguatorWeights: DisambiguatorWeights;
  lastBenchmarkResult: BenchmarkResult | null;
  lastOptimizationResult: OptimizationResult | null;
  isOptimizing: boolean;

  // Actions
  refreshAudioDevices: () => Promise<void>;
  setSelectedDeviceId: (deviceId: string | null) => void;
  updateDetectorConfig: (config: Partial<DetectorConfig>) => void;
  startAudio: () => Promise<void>;
  stopAudio: () => void;
  setLiveFrame: (frame: StringplexLiveFrame | null) => void;

  // Profile Actions
  createProfile: (name: string, guitarModel: string, pickupSetting: string) => string;
  setActiveProfileId: (id: string | null) => void;
  saveFretFingerprint: (stringNum: StringIndex, fretNum: number, fingerprint: FretFingerprint) => void;
  clearAllFingerprints: () => void;
  clearStringFingerprints: (stringNum: StringIndex) => void;
  deleteProfile: (id: string) => void;
  exportActiveProfileJson: () => string | null;
  importProfileJson: (jsonStr: string) => boolean;

  // Benchmark & Optimizer Actions
  runBenchmark: () => BenchmarkResult | null;
  optimizeDisambiguator: () => Promise<OptimizationResult | null>;
  setDisambiguatorWeights: (weights: Partial<DisambiguatorWeights>) => void;
  resetDisambiguatorWeights: () => void;
}

const STORAGE_KEY_PROFILES = 'stringplex_profiles_v2';
const STORAGE_KEY_ACTIVE_PROFILE = 'stringplex_active_profile_v2';
const STORAGE_KEY_WEIGHTS = 'stringplex_weights_v2';

function loadInitialWeights(): DisambiguatorWeights {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_WEIGHTS);
    if (raw) {
      return { ...DEFAULT_DISAMBIGUATOR_WEIGHTS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_DISAMBIGUATOR_WEIGHTS };
}

function loadInitialProfiles(): { profiles: GuitarCalibrationProfile[]; activeId: string | null } {
  try {
    // Purge legacy v1 recordings to guarantee a 100% fresh start
    localStorage.removeItem('stringplex_profiles_v1');
    localStorage.removeItem('stringplex_active_profile_v1');

    const raw = localStorage.getItem(STORAGE_KEY_PROFILES);
    if (raw) {
      const parsed = JSON.parse(raw);
      const activeId = localStorage.getItem(STORAGE_KEY_ACTIVE_PROFILE) || (parsed[0]?.id ?? null);
      return { profiles: parsed, activeId };
    }
  } catch {
    // ignore
  }

  // Create default starter profile
  const defaultProfile: GuitarCalibrationProfile = {
    id: 'default-profile',
    name: 'Primary Guitar',
    guitarModel: 'Acoustic-Electric (.012-.053)',
    pickupSetting: 'Piezo Undersaddle',
    notesCalibratedCount: 0,
    fingerprints: {},
    createdAt: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };

  return { profiles: [defaultProfile], activeId: defaultProfile.id };
}

const initial = loadInitialProfiles();
const initialWeights = loadInitialWeights();
guitarPitchDetector.getDisambiguator().setWeights(initialWeights);

export const useStringplexStore = create<StringplexStore>((set, get) => ({
  activeTab: 'fretboard',
  setActiveTab: (tab) => set({ activeTab: tab }),

  disambiguatorWeights: initialWeights,
  lastBenchmarkResult: null,
  lastOptimizationResult: null,
  isOptimizing: false,

  isListening: false,
  selectedDeviceId: null,
  audioDevices: [],
  detectorConfig: guitarPitchDetector.getConfig(),
  liveFrame: null,

  profiles: initial.profiles,
  activeProfileId: initial.activeId,

  refreshAudioDevices: async () => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      set({ audioDevices: audioInputs });
    } catch {
      // ignore
    }
  },

  setSelectedDeviceId: (deviceId) => {
    set({ selectedDeviceId: deviceId });
    if (get().isListening) {
      get().stopAudio();
      get().startAudio();
    }
  },

  updateDetectorConfig: (config) => {
    guitarPitchDetector.updateConfig(config);
    set({ detectorConfig: guitarPitchDetector.getConfig() });
  },

  startAudio: async () => {
    const state = get();
    if (state.isListening) return;

    // Sync active profile to detector before starting
    const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) || null;
    guitarPitchDetector.setCalibrationProfile(activeProfile);

    try {
      await guitarPitchDetector.start(state.selectedDeviceId, (frame) => {
        set({ liveFrame: frame });
      });
      set({ isListening: true });
    } catch (err) {
      console.error('Failed to start audio detector:', err);
    }
  },

  stopAudio: () => {
    guitarPitchDetector.stop();
    set({ isListening: false, liveFrame: null });
  },

  setLiveFrame: (frame) => set({ liveFrame: frame }),

  createProfile: (name, guitarModel, pickupSetting) => {
    const newProfile: GuitarCalibrationProfile = {
      id: `profile-${Date.now()}`,
      name,
      guitarModel,
      pickupSetting,
      notesCalibratedCount: 0,
      fingerprints: {},
      createdAt: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    };

    set((state) => {
      const updated = [...state.profiles, newProfile];
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(updated));
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROFILE, newProfile.id);
      guitarPitchDetector.setCalibrationProfile(newProfile);
      return { profiles: updated, activeProfileId: newProfile.id };
    });

    return newProfile.id;
  },

  setActiveProfileId: (id) => {
    set((state) => {
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROFILE, id || '');
      const profile = state.profiles.find((p) => p.id === id) || null;
      guitarPitchDetector.setCalibrationProfile(profile);
      return { activeProfileId: id };
    });
  },

  saveFretFingerprint: (stringNum, fretNum, fingerprint) => {
    set((state) => {
      const activeId = state.activeProfileId;
      if (!activeId) return state;

      const updatedProfiles = state.profiles.map((p) => {
        if (p.id !== activeId) return p;
        const key = `${stringNum}_${fretNum}`;
        const newFingerprints = {
          ...p.fingerprints,
          [key]: fingerprint,
        };
        return {
          ...p,
          fingerprints: newFingerprints,
          notesCalibratedCount: Object.keys(newFingerprints).length,
          lastUpdated: new Date().toISOString(),
        };
      });

      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(updatedProfiles));
      const active = updatedProfiles.find((p) => p.id === activeId) || null;
      guitarPitchDetector.setCalibrationProfile(active);

      return { profiles: updatedProfiles };
    });
  },

  clearAllFingerprints: () => {
    set((state) => {
      const activeId = state.activeProfileId;
      if (!activeId) return state;

      const updatedProfiles = state.profiles.map((p) => {
        if (p.id !== activeId) return p;
        return {
          ...p,
          fingerprints: {},
          notesCalibratedCount: 0,
          lastUpdated: new Date().toISOString(),
        };
      });

      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(updatedProfiles));
      const active = updatedProfiles.find((p) => p.id === activeId) || null;
      guitarPitchDetector.setCalibrationProfile(active);

      return { profiles: updatedProfiles };
    });
  },

  clearStringFingerprints: (stringNum) => {
    set((state) => {
      const activeId = state.activeProfileId;
      if (!activeId) return state;

      const updatedProfiles = state.profiles.map((p) => {
        if (p.id !== activeId) return p;
        const remainingFingerprints: Record<string, FretFingerprint> = {};
        for (const [key, fp] of Object.entries(p.fingerprints)) {
          if (!key.startsWith(`${stringNum}_`)) {
            remainingFingerprints[key] = fp;
          }
        }
        return {
          ...p,
          fingerprints: remainingFingerprints,
          notesCalibratedCount: Object.keys(remainingFingerprints).length,
          lastUpdated: new Date().toISOString(),
        };
      });

      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(updatedProfiles));
      const active = updatedProfiles.find((p) => p.id === activeId) || null;
      guitarPitchDetector.setCalibrationProfile(active);

      return { profiles: updatedProfiles };
    });
  },

  deleteProfile: (id) => {
    set((state) => {
      const updated = state.profiles.filter((p) => p.id !== id);
      const newActiveId = updated[0]?.id || null;
      localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(updated));
      localStorage.setItem(STORAGE_KEY_ACTIVE_PROFILE, newActiveId || '');
      const active = updated.find((p) => p.id === newActiveId) || null;
      guitarPitchDetector.setCalibrationProfile(active);
      return { profiles: updated, activeProfileId: newActiveId };
    });
  },

  exportActiveProfileJson: () => {
    const state = get();
    const active = state.profiles.find((p) => p.id === state.activeProfileId);
    if (!active) return null;
    return JSON.stringify(active, null, 2);
  },

  importProfileJson: (jsonStr) => {
    try {
      const parsed: GuitarCalibrationProfile = JSON.parse(jsonStr);
      if (!parsed.id || !parsed.fingerprints) return false;

      parsed.id = `imported-${Date.now()}`;
      set((state) => {
        const updated = [...state.profiles, parsed];
        localStorage.setItem(STORAGE_KEY_PROFILES, JSON.stringify(updated));
        localStorage.setItem(STORAGE_KEY_ACTIVE_PROFILE, parsed.id);
        guitarPitchDetector.setCalibrationProfile(parsed);
        return { profiles: updated, activeProfileId: parsed.id };
      });
      return true;
    } catch {
      return false;
    }
  },

  runBenchmark: () => {
    const state = get();
    const active = state.profiles.find((p) => p.id === state.activeProfileId);
    if (!active) return null;
    const result = guitarPitchDetector.getDisambiguator().evaluateBenchmark(active);
    set({ lastBenchmarkResult: result });
    return result;
  },

  optimizeDisambiguator: async () => {
    const state = get();
    const active = state.profiles.find((p) => p.id === state.activeProfileId);
    if (!active) return null;

    set({ isOptimizing: true });
    // Let the UI breathe and show loading indicator
    await new Promise((resolve) => setTimeout(resolve, 80));

    try {
      const optResult = guitarPitchDetector.getDisambiguator().optimizeWeights(active);
      const newWeights = guitarPitchDetector.getDisambiguator().getWeights();
      const benchResult = guitarPitchDetector.getDisambiguator().evaluateBenchmark(active, newWeights);

      localStorage.setItem(STORAGE_KEY_WEIGHTS, JSON.stringify(newWeights));

      set({
        disambiguatorWeights: newWeights,
        lastOptimizationResult: optResult,
        lastBenchmarkResult: benchResult,
        isOptimizing: false,
      });

      return optResult;
    } catch (err) {
      set({ isOptimizing: false });
      return null;
    }
  },

  setDisambiguatorWeights: (w) => {
    guitarPitchDetector.getDisambiguator().setWeights(w);
    const updated = guitarPitchDetector.getDisambiguator().getWeights();
    localStorage.setItem(STORAGE_KEY_WEIGHTS, JSON.stringify(updated));
    set({ disambiguatorWeights: updated });

    const state = get();
    const active = state.profiles.find((p) => p.id === state.activeProfileId);
    if (active) {
      const bench = guitarPitchDetector.getDisambiguator().evaluateBenchmark(active, updated);
      set({ lastBenchmarkResult: bench });
    }
  },

  resetDisambiguatorWeights: () => {
    guitarPitchDetector.getDisambiguator().resetWeights();
    const reset = guitarPitchDetector.getDisambiguator().getWeights();
    localStorage.removeItem(STORAGE_KEY_WEIGHTS);
    set({
      disambiguatorWeights: reset,
      lastOptimizationResult: null,
    });

    const state = get();
    const active = state.profiles.find((p) => p.id === state.activeProfileId);
    if (active) {
      const bench = guitarPitchDetector.getDisambiguator().evaluateBenchmark(active, reset);
      set({ lastBenchmarkResult: bench });
    }
  },
}));
