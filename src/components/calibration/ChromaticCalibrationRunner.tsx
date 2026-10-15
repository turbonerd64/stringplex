// src/components/calibration/ChromaticCalibrationRunner.tsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  GUITAR_STRINGS,
  getChromaticCalibrationSteps,
  midiToNoteName,
} from '../../constants/guitarConstants';
import { StringIndex, CalibrationStep, FretFingerprint } from '../../types/stringplex';
import { useStringplexStore } from '../../store/useStringplexStore';
import { guitarPitchDetector } from '../../audio/GuitarPitchDetector';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Sparkles,
  Camera,
  Check,
  Volume2,
} from 'lucide-react';

const HOLD_REQUIRED_MS = 450; // 450ms of sustained hold to verify note

export const ChromaticCalibrationRunner: React.FC = () => {
  const {
    isListening,
    startAudio,
    stopAudio,
    liveFrame,
    profiles,
    activeProfileId,
    saveFretFingerprint,
    clearAllFingerprints,
    clearStringFingerprints,
  } = useStringplexStore();

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  // Selected string: default String 6 (Low E)
  const [selectedString, setSelectedString] = useState<StringIndex>(6);
  const [currentFretIndex, setCurrentFretIndex] = useState<number>(0);
  const [autoAdvance, setAutoAdvance] = useState<boolean>(true);

  // Hold progress state (0 to 100)
  const [holdProgress, setHoldProgress] = useState<number>(0);
  const [captureSuccess, setCaptureSuccess] = useState<boolean>(false);
  const [lastCapturedNote, setLastCapturedNote] = useState<string | null>(null);

  // Hold timing refs (immune to component re-renders)
  const holdStartRef = useRef<number | null>(null);
  const cooldownUntilRef = useRef<number>(0);

  const steps: CalibrationStep[] = getChromaticCalibrationSteps(selectedString, 15);
  const currentStep = steps[currentFretIndex];

  const chimeCtxRef = useRef<AudioContext | null>(null);

  // Synthesizer chime for capture feedback
  const playChime = useCallback((success: boolean) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!chimeCtxRef.current || chimeCtxRef.current.state === 'closed') {
        chimeCtxRef.current = new AudioCtx();
      }
      const ctx = chimeCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(success ? 880 : 330, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // AudioContext might require user gesture in some browsers
    }
  }, []);

  useEffect(() => {
    return () => {
      if (chimeCtxRef.current && chimeCtxRef.current.state !== 'closed') {
        chimeCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  // Capture execution helper: pulls retroactive Early Attack + Sustain templates from circular buffer
  const executeCapture = useCallback(
    (frequencyHz: number, vector: any) => {
      if (!currentStep) return;

      const snapshot = guitarPitchDetector.captureFingerprintSnapshot();
      const earlyVec = snapshot?.earlyVector || vector;
      const sustainVec = snapshot?.sustainVector || vector;

      const fingerprint: FretFingerprint = {
        stringNum: selectedString,
        fretNum: currentStep.fretNum,
        midiNote: currentStep.midiNote,
        noteName: currentStep.noteName,
        expectedHz: currentStep.expectedHz,
        measuredHz: snapshot?.frequencyHz || frequencyHz,
        vector: earlyVec, // Default vector is the Early Attack-Decay vector (30-85ms)
        earlyVector: earlyVec,
        sustainVector: sustainVec,
        hfScrapeDb: earlyVec.hfScrapeDb,
        timestamp: new Date().toISOString(),
      };

      saveFretFingerprint(selectedString, currentStep.fretNum, fingerprint);
      playChime(true);
      setCaptureSuccess(true);
      setLastCapturedNote(`${currentStep.noteName} (Fret ${currentStep.fretNum})`);
      setHoldProgress(100);

      const nextFret = currentFretIndex + 1;
      const willAdvance = autoAdvance && nextFret < steps.length;

      setTimeout(() => {
        setCaptureSuccess(false);
        setHoldProgress(0);
        holdStartRef.current = null;
        if (willAdvance) {
          setCurrentFretIndex(nextFret);
        }
      }, 700);
    },
    [currentStep, selectedString, saveFretFingerprint, playChime, autoAdvance, currentFretIndex, steps.length]
  );

  // Live pitch monitoring and hold calculation
  useEffect(() => {
    if (!isListening || !liveFrame || !currentStep) {
      if (holdStartRef.current !== null) {
        holdStartRef.current = null;
        setHoldProgress(0);
      }
      return;
    }

    const now = performance.now();

    // In cooldown period immediately following a capture
    if (now < cooldownUntilRef.current) {
      return;
    }

    const { midiNote, confidence, harmonicVector, frequencyHz } = liveFrame;

    // Generous tolerances suitable for real guitars:
    // 1. MIDI note matches target
    // 2. Confidence >= 0.65 (accommodates overtone-heavy low fretted notes)
    // 3. Harmonic vector available
    const isTargetMatch =
      midiNote === currentStep.midiNote &&
      (confidence ?? 0) >= 0.65 &&
      harmonicVector !== null &&
      frequencyHz !== null;

    if (isTargetMatch) {
      if (holdStartRef.current === null) {
        holdStartRef.current = now;
      }

      const elapsed = now - holdStartRef.current;
      const progress = Math.min(100, Math.round((elapsed / HOLD_REQUIRED_MS) * 100));
      setHoldProgress(progress);

      if (progress >= 100) {
        cooldownUntilRef.current = now + 900;
        executeCapture(frequencyHz, harmonicVector);
      }
    } else {
      // Note was released or shifted
      if (holdStartRef.current !== null) {
        holdStartRef.current = null;
        setHoldProgress(0);
      }
    }
  }, [isListening, liveFrame, currentStep, executeCapture]);

  // Manual fallback capture
  const handleManualCapture = () => {
    if (!liveFrame?.frequencyHz || !liveFrame?.harmonicVector) return;
    executeCapture(liveFrame.frequencyHz, liveFrame.harmonicVector);
  };

  const totalCalibratedCount = Object.keys(activeProfile?.fingerprints || {}).length;

  return (
    <div className="space-y-6">
      {/* 96/96 Milestone Celebration & Backup Card */}
      {totalCalibratedCount >= 90 && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-sky-950/80 border border-emerald-500/50 rounded-2xl p-5 shadow-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-6 h-6" />
            </div>
            <div>
              <h3 className="text-base font-bold text-emerald-300">
                Acoustic Profile Complete ({totalCalibratedCount}/96 Notes Calibrated)!
              </h3>
              <p className="text-xs text-slate-300">
                Your guitar's acoustic harmonic DNA across all 6 strings is fully captured and active.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              const jsonStr = useStringplexStore.getState().exportActiveProfileJson();
              if (!jsonStr) return;
              const blob = new Blob([jsonStr], { type: 'application/json' });
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              const safeName = (activeProfile?.name || 'guitar').toLowerCase().replace(/[^a-z0-9]/g, '-');
              a.download = `stringplex-${safeName}-${totalCalibratedCount}notes-${new Date().toISOString().slice(0, 10)}.json`;
              a.click();
              URL.revokeObjectURL(url);
              navigator.clipboard?.writeText(jsonStr);
              alert(`🎉 Backup Saved!\n\nDownloaded: ${a.download}\nCopied to Clipboard!`);
            }}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer whitespace-nowrap"
          >
            <span>💾 Download Permanent Backup JSON</span>
          </button>
        </div>
      )}

      {/* String Selector Header Bar */}
      <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-sky-400" />
              <span>Chromatic Calibration Wizard (0 – 15 Frets)</span>
            </h2>
            <p className="text-xs text-slate-400">
              Hold each fret for ~0.5s until the progress bar fills green. Auto-advances through all 16 frets!
            </p>
          </div>

          <div className="flex items-center gap-3">
            {!isListening ? (
              <button
                onClick={startAudio}
                className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 transition-all cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>Start Listening</span>
              </button>
            ) : (
              <button
                onClick={stopAudio}
                className="px-4 py-2 bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 font-bold border border-rose-500/40 rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer"
              >
                <Pause className="w-4 h-4 fill-current" />
                <span>Stop Listening</span>
              </button>
            )}

            <div className="text-right pl-3 border-l border-slate-800 flex items-center gap-3">
              <div>
                <div className="text-xs text-slate-400">Total Guitar Calibrated</div>
                <div className="text-sm font-bold font-mono text-sky-400">
                  {totalCalibratedCount} / 96 notes ({( (totalCalibratedCount / 96) * 100 ).toFixed(0)}%)
                </div>
              </div>

              {totalCalibratedCount > 0 ? (
                <button
                  onClick={() => {
                    if (window.confirm(`⚠️ Wipe all ${totalCalibratedCount} recorded notes and reset to 0/96?\n\nThis will clear all calibration data so you can record freshly from scratch.`)) {
                      clearAllFingerprints();
                      setHoldProgress(0);
                      holdStartRef.current = null;
                    }
                  }}
                  className="px-2.5 py-1.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
                  title="Wipe all recorded notes and start fresh from 0"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset All (0/96)</span>
                </button>
              ) : (
                <div className="text-[10px] font-mono text-emerald-400/80 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-lg">
                  Ready (0/96 Clean)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 6 String Tabs */}
        <div className="grid grid-cols-6 gap-2">
          {([6, 5, 4, 3, 2, 1] as StringIndex[]).map((s) => {
            const meta = GUITAR_STRINGS[s];
            const isSelected = selectedString === s;
            const countForString = Array.from({ length: 16 }).filter((_, f) =>
              Boolean(activeProfile?.fingerprints[`${s}_${f}`])
            ).length;

            return (
              <button
                key={s}
                onClick={() => {
                  setSelectedString(s);
                  setCurrentFretIndex(0);
                  setHoldProgress(0);
                  holdStartRef.current = null;
                }}
                className={`
                  p-3 rounded-xl border text-left transition-all cursor-pointer
                  ${
                    isSelected
                      ? 'bg-sky-500/15 border-sky-400 text-slate-100 shadow-lg shadow-sky-500/10'
                      : 'bg-slate-900/40 border-slate-800 text-slate-400 hover:bg-slate-800/60'
                  }
                `}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-slate-200">
                    String #{s} ({meta.tuningNote})
                  </span>
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                </div>
                <div className="text-[10px] text-slate-500 mb-1.5">{meta.gaugeApprox}</div>
                <div className="flex items-center justify-between text-[10px] font-mono">
                  <span className={countForString === 16 ? 'text-emerald-400 font-bold' : 'text-slate-400'}>
                    {countForString}/16 Frets
                  </span>
                  <div className="flex items-center gap-1.5">
                    {countForString > 0 && (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Wipe recorded notes for String #${s} (${meta.name}) and reset to 0?`)) {
                            clearStringFingerprints(s);
                            setHoldProgress(0);
                            holdStartRef.current = null;
                          }
                        }}
                        className="hover:text-rose-400 text-slate-500 p-0.5 rounded transition-colors cursor-pointer"
                        title={`Clear String #${s}`}
                      >
                        <RotateCcw className="w-2.5 h-2.5" />
                      </span>
                    )}
                    {countForString === 16 && (
                      <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Drill Card */}
      <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        {/* Success Splash Flash */}
        {captureSuccess && (
          <div className="absolute inset-0 bg-emerald-500/20 pointer-events-none transition-opacity duration-300 animate-pulse border-2 border-emerald-400 rounded-2xl z-20 flex items-center justify-center">
            <div className="bg-slate-950/90 border border-emerald-500 text-emerald-400 font-bold text-sm px-4 py-2 rounded-xl shadow-2xl flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>CAPTURED {lastCapturedNote}!</span>
            </div>
          </div>
        )}

        <div className="flex flex-col lg:flex-row items-center justify-between gap-6">
          {/* Left: Big Target Prompt */}
          <div className="text-center lg:text-left">
            <div className="text-xs font-bold uppercase tracking-wider text-sky-400 mb-1 flex items-center justify-center lg:justify-start gap-2">
              <span>TARGET CALIBRATION NOTE</span>
              <span className="w-1.5 h-1.5 rounded-full bg-sky-400"></span>
              <span>String #{selectedString} ({GUITAR_STRINGS[selectedString].name})</span>
            </div>

            <div className="flex items-baseline justify-center lg:justify-start gap-4 mb-2">
              <span className="text-5xl lg:text-6xl font-black text-white font-mono tracking-tight">
                {currentStep.fretNum === 0 ? 'OPEN' : `FRET ${currentStep.fretNum}`}
              </span>
              <span className="text-3xl lg:text-4xl font-bold text-sky-400 font-mono">
                {currentStep.noteName}
              </span>
            </div>

            <div className="text-sm font-mono text-slate-400 mb-3">
              Target Frequency: <span className="text-slate-200 font-bold">{currentStep.expectedHz} Hz</span> (MIDI #{currentStep.midiNote})
            </div>

            {/* Hold Sustain Progress Bar */}
            <div className="max-w-md">
              <div className="flex items-center justify-between text-xs font-mono mb-1.5">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${holdProgress > 0 ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                  {holdProgress > 0 ? 'Holding & Analyzing Harmonics...' : 'Play & Hold Note Steady'}
                </span>
                <span className={`font-bold ${holdProgress === 100 ? 'text-emerald-400' : 'text-sky-400'}`}>
                  {holdProgress}%
                </span>
              </div>

              <div className="h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/80 p-0.5">
                <div
                  className={`h-full rounded-full transition-all duration-75 ${
                    holdProgress >= 100
                      ? 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.9)]'
                      : holdProgress > 0
                      ? 'bg-gradient-to-r from-sky-500 to-emerald-400 shadow-[0_0_8px_rgba(56,189,248,0.6)]'
                      : 'bg-transparent'
                  }`}
                  style={{ width: `${holdProgress}%` }}
                />
              </div>
            </div>
          </div>

          {/* Center: Live Listener Feedback */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 min-w-[280px] text-center">
            <div className="text-[11px] font-mono text-slate-500 uppercase tracking-wider mb-2">
              Live Input Detector
            </div>

            {liveFrame && liveFrame.frequencyHz ? (
              <div>
                <div className="flex items-center justify-center gap-3 mb-1">
                  <span className="text-2xl font-bold font-mono text-slate-100">
                    {liveFrame.noteName}
                  </span>
                  <span className="text-xs font-mono text-slate-400">
                    {liveFrame.frequencyHz} Hz
                  </span>
                </div>

                {/* Pitch Cent Deviation Meter */}
                <div className="flex items-center justify-center gap-2 text-xs font-mono mb-2">
                  <span className="text-slate-500">-50¢</span>
                  <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden relative">
                    <div
                      className={`h-full rounded-full transition-all duration-75 ${
                        Math.abs(liveFrame.cents ?? 0) <= 20 ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                      style={{
                        width: '8px',
                        marginLeft: `${Math.max(0, Math.min(100, (((liveFrame.cents ?? 0) + 50) / 100) * 100))}%`,
                      }}
                    />
                  </div>
                  <span className="text-slate-500">+50¢</span>
                </div>

                <div className="text-[11px] font-mono mb-3">
                  {liveFrame.midiNote === currentStep.midiNote ? (
                    <span className="text-emerald-400 font-bold flex items-center justify-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Note Match! Keep holding...
                    </span>
                  ) : (
                    <span className="text-amber-400">
                      Detected {liveFrame.noteName} (Need {currentStep.noteName})
                    </span>
                  )}
                </div>

                {/* Manual Force Capture Button */}
                <button
                  onClick={handleManualCapture}
                  className="w-full py-1.5 px-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs font-mono flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-slate-700/60"
                  title="Force capture snapshot immediately"
                >
                  <Camera className="w-3.5 h-3.5 text-sky-400" />
                  <span>Force Snapshot Now</span>
                </button>
              </div>
            ) : (
              <div className="py-4 text-xs font-mono text-slate-500">
                {isListening ? 'Pluck the string and hold...' : 'Click "Start Listening" to begin'}
              </div>
            )}
          </div>

          {/* Right: Controls & Navigation */}
          <div className="flex flex-col gap-2 min-w-[200px]">
            <div className="flex items-center gap-2">
              <button
                disabled={currentFretIndex === 0}
                onClick={() => {
                  setCurrentFretIndex((prev) => Math.max(0, prev - 1));
                  setHoldProgress(0);
                  holdStartRef.current = null;
                }}
                className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Prev</span>
              </button>

              <button
                disabled={currentFretIndex === steps.length - 1}
                onClick={() => {
                  setCurrentFretIndex((prev) => Math.min(steps.length - 1, prev + 1));
                  setHoldProgress(0);
                  holdStartRef.current = null;
                }}
                className="flex-1 px-3 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:hover:bg-slate-800 text-slate-200 font-bold rounded-xl text-xs flex items-center justify-center gap-1 transition-all cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <label className="flex items-center gap-2 text-xs text-slate-400 bg-slate-900/60 p-2.5 rounded-xl cursor-pointer border border-slate-800/80">
              <input
                type="checkbox"
                checked={autoAdvance}
                onChange={(e) => setAutoAdvance(e.target.checked)}
                className="rounded border-slate-700 text-sky-500 focus:ring-0"
              />
              <span>Auto-advance on capture</span>
            </label>
          </div>
        </div>

        {/* 16 Fret Step Progress Bar */}
        <div className="mt-6 pt-4 border-t border-slate-800/80">
          <div className="grid grid-cols-16 gap-1 text-center font-mono">
            {steps.map((st, idx) => {
              const isCurrent = idx === currentFretIndex;
              const isRecorded = Boolean(activeProfile?.fingerprints[`${selectedString}_${st.fretNum}`]);

              return (
                <button
                  key={st.fretNum}
                  onClick={() => {
                    setCurrentFretIndex(idx);
                    setHoldProgress(0);
                    holdStartRef.current = null;
                  }}
                  className={`
                    py-1.5 px-1 rounded-md text-[10px] font-bold transition-all cursor-pointer
                    ${
                      isCurrent
                        ? 'bg-sky-500 text-slate-950 ring-2 ring-sky-300 scale-105 shadow-md shadow-sky-500/20'
                        : isRecorded
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                        : 'bg-slate-900 text-slate-500 border border-slate-800 hover:bg-slate-800'
                    }
                  `}
                >
                  <div>{st.fretNum}</div>
                  <div className="text-[8px] opacity-80">{st.noteName}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
