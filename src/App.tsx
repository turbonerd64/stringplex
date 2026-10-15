// src/App.tsx
import React, { useState } from 'react';
import { useStringplexStore } from './store/useStringplexStore';
import { FretboardView } from './components/fretboard/FretboardView';
import { ChromaticCalibrationRunner } from './components/calibration/ChromaticCalibrationRunner';
import { HarmonicSpectrumView } from './components/analysis/HarmonicSpectrumView';
import { CandidateRankView } from './components/analysis/CandidateRankView';
import { AudioSettingsModal } from './components/controls/AudioSettingsModal';
import { BenchmarkOptimizerView } from './components/diagnostics/BenchmarkOptimizerView';
import {
  Mic,
  MicOff,
  Settings,
  Sparkles,
  Guitar,
  BookOpen,
  Layers,
  Activity,
  CheckCircle2,
  Compass,
  Waves,
  Zap,
} from 'lucide-react';

export const App: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    isListening,
    startAudio,
    stopAudio,
    liveFrame,
    profiles,
    activeProfileId,
  } = useStringplexStore();

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const calibratedCount = Object.keys(activeProfile?.fingerprints || {}).length;

  return (
    <div className="min-h-screen bg-[#080b11] text-slate-100 flex flex-col font-sans">
      {/* ─── Top Header Bar ─── */}
      <header className="border-b border-slate-800/80 bg-[#0c101a]/80 backdrop-blur sticky top-0 z-40 px-6 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
            <Guitar className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-base font-black tracking-tight flex items-center gap-2">
              <span className="text-white">STRING</span>
              <span className="text-sky-400">PLEX</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20">
                PROTOTYPE V1
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              Acoustic Timbre & Unison String Disambiguation Engine
            </p>
          </div>
        </div>

        {/* Center: Live Pitch Pill */}
        <div className="hidden md:flex items-center gap-3 bg-slate-900/80 border border-slate-800 rounded-xl px-4 py-1.5 font-mono">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                isListening
                  ? liveFrame?.frequencyHz
                    ? 'bg-emerald-400 animate-pulse'
                    : 'bg-amber-400'
                  : 'bg-slate-600'
              }`}
            />
            <span className="text-xs text-slate-400">
              {isListening ? (liveFrame?.frequencyHz ? 'Detecting' : 'Listening...') : 'Engine Standby'}
            </span>
          </div>

          {liveFrame?.noteName && (
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <span className="text-sm font-bold text-sky-400">{liveFrame.noteName}</span>
              <span className="text-xs text-slate-400">{liveFrame.frequencyHz} Hz</span>
              {liveFrame.winningCandidate && (
                <span className="text-[11px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/30">
                  Str {liveFrame.winningCandidate.stringNum} • Fret {liveFrame.winningCandidate.fretNum}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Right Actions */}
        <div className="flex items-center gap-3">
          {/* Audio Toggle */}
          {!isListening ? (
            <button
              onClick={startAudio}
              className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
            >
              <Mic className="w-4 h-4 fill-current" />
              <span>Start Audio</span>
            </button>
          ) : (
            <button
              onClick={stopAudio}
              className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold border border-rose-500/40 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
            >
              <MicOff className="w-4 h-4 fill-current" />
              <span>Stop Audio</span>
            </button>
          )}

          {/* Backup & Download Profile Button */}
          <button
            onClick={() => {
              const jsonStr = useStringplexStore.getState().exportActiveProfileJson();
              if (!jsonStr) return;
              const blob = new Blob([jsonStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const safeName = (activeProfile?.name || 'guitar').toLowerCase().replace(/[^a-z0-9]/g, '-');
              a.download = `stringplex-${safeName}-${calibratedCount}notes-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              navigator.clipboard?.writeText(jsonStr);
              alert(`🎉 Profile successfully exported!\n\n1. Downloaded: ${a.download}\n2. Copied JSON to clipboard.\n\nYou can keep this JSON file safe or share it!`);
            }}
            className={`
              px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-lg
              ${
                calibratedCount >= 90
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-500/20 animate-pulse'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
              }
            `}
            title="Download full JSON backup of all calibrated notes"
          >
            <span>💾 Backup ({calibratedCount}/96)</span>
          </button>

          {/* Profile Pill */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="hidden sm:flex items-center gap-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 transition-colors cursor-pointer"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
            <span className="font-semibold">{activeProfile?.name || 'No Profile'}</span>
          </button>

          {/* Settings Modal Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-colors cursor-pointer"
            title="Audio & Profile Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ─── Tab Navigation Bar ─── */}
      <div className="bg-[#0b0f17] border-b border-slate-800/80 px-6 py-2 flex items-center gap-2">
        <button
          onClick={() => setActiveTab('fretboard')}
          className={`
            px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer
            ${
              activeTab === 'fretboard'
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }
          `}
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Fretboard & Disambiguation</span>
        </button>

        <button
          onClick={() => setActiveTab('calibrate')}
          className={`
            px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer
            ${
              activeTab === 'calibrate'
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }
          `}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Chromatic Calibration Wizard (0–15)</span>
          {calibratedCount > 0 && (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-sky-400/20 text-sky-300">
              {calibratedCount}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('diagnostics')}
          className={`
            px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-2 transition-all cursor-pointer
            ${
              activeTab === 'diagnostics'
                ? 'bg-sky-500/15 text-sky-400 border border-sky-500/30'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
            }
          `}
        >
          <Zap className="w-3.5 h-3.5 text-amber-400" />
          <span>Acoustic Benchmark & Auto-Tuner</span>
        </button>
      </div>

      {/* ─── Main Content Views ─── */}
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Tab 1: Fretboard View */}
        {activeTab === 'fretboard' && (
          <div className="space-y-6">
            <FretboardView maxFret={15} />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <CandidateRankView />
              <HarmonicSpectrumView />
            </div>
          </div>
        )}

        {/* Tab 2: Chromatic Calibration Wizard */}
        {activeTab === 'calibrate' && (
          <div className="space-y-6">
            <ChromaticCalibrationRunner />
            <FretboardView maxFret={15} />
          </div>
        )}

        {/* Tab 3: Acoustic Benchmark, Auto-Tuning & Physics Guide */}
        {activeTab === 'diagnostics' && (
          <div className="space-y-6">
            <BenchmarkOptimizerView />

            <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-xl">
              <h2 className="text-xl font-bold text-slate-100 mb-2 flex items-center gap-2">
                <Compass className="w-5 h-5 text-sky-400" />
                <span>The Physics of Guitar String Disambiguation</span>
              </h2>
              <p className="text-xs text-slate-400 mb-6">
                Why identical musical pitches produce fundamentally different harmonic fingerprints on different strings.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="text-sm font-bold text-sky-400 mb-2 flex items-center gap-2">
                    <Waves className="w-4 h-4" />
                    <span>1. Inharmonicity (B Factor)</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    Real guitar strings are stiff cylinders, not ideal flexible lines. Partials stretch sharp according to:
                  </p>
                  <div className="bg-slate-950 p-2.5 rounded font-mono text-[11px] text-sky-300 mb-3 border border-slate-800">
                    fn ≈ n • f0 • √(1 + B • n²)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Because B ∝ d⁴ / L², a thicker string fretted higher up (shorter length L, larger diameter d) has a drastically higher B coefficient than a thinner, longer string.
                  </p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="text-sm font-bold text-purple-400 mb-2 flex items-center gap-2">
                    <Activity className="w-4 h-4" />
                    <span>2. Pickup Comb Filtering</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    Your magnetic pickup is fixed at distance xp from the bridge saddle, introducing spectral nulls at:
                  </p>
                  <div className="bg-slate-950 p-2.5 rounded font-mono text-[11px] text-purple-300 mb-3 border border-slate-800">
                    sin(n • π • xp / L) = 0
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    When you fret at fret 8 vs fret 3, the vibrating length L changes while xp stays fixed. This physically shifts the comb notches across the harmonic series.
                  </p>
                </div>

                <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
                  <div className="text-sm font-bold text-amber-400 mb-2 flex items-center gap-2">
                    <Sparkles className="w-4 h-4" />
                    <span>3. High-Frequency Damping</span>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    Thicker strings have higher internal viscoelastic friction and greater termination damping at the fret crown:
                  </p>
                  <div className="bg-slate-950 p-2.5 rounded font-mono text-[11px] text-amber-300 mb-3 border border-slate-800">
                    Centroid = Σ(f • A) / Σ(A)
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Thinner strings maintain higher energy in partials 3–8 (2 kHz to 5 kHz), exhibiting higher spectral centroids and longer sustain in upper overtones.
                  </p>
                </div>
              </div>
            </div>

            <HarmonicSpectrumView />
          </div>
        )}
      </main>

      {/* ─── Footer ─── */}
      <footer className="border-t border-slate-800/80 bg-[#0c101a] px-6 py-3 text-center text-xs text-slate-500 font-mono">
        StringPlex Prototype • Precision Audio-to-String AI Fingerprinting • Standard E Tuning (E2 A2 D3 G3 B3 E4)
      </footer>

      {/* ─── Settings Modal ─── */}
      <AudioSettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
};

export default App;
