// src/components/diagnostics/UnisonContrastDrawer.tsx
import React from 'react';
import { BenchmarkClash, StringIndex } from '../../types/stringplex';
import { GUITAR_STRINGS } from '../../constants/guitarConstants';
import {
  X,
  CheckCircle2,
  XCircle,
  Sparkles,
  Layers,
  Activity,
  ArrowRight,
  ShieldCheck,
  Zap,
} from 'lucide-react';

interface UnisonContrastDrawerProps {
  clash: BenchmarkClash | null;
  onClose: () => void;
}

export const UnisonContrastDrawer: React.FC<UnisonContrastDrawerProps> = ({ clash, onClose }) => {
  if (!clash) return null;

  const trueMeta = GUITAR_STRINGS[clash.trueString];
  const predMeta = GUITAR_STRINGS[clash.predictedString];

  // Helper for clash type description
  const getClashDescription = (type?: string) => {
    switch (type) {
      case 'plain-vs-wound':
        return {
          title: 'Plain Steel vs. Phosphor Bronze Wound Clash',
          badge: 'Plain vs Wound',
          color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
          explanation:
            'One candidate is plain steel (Strings 1–2) and the other is phosphor bronze wound (Strings 3–6). Adaptive Clustered Scoring prioritizes Nail Scrape Burst (HF_scrape) and 85% Spectral Rolloff, as plain steel sustains power beyond 6.5 kHz while wound strings attenuate steeply above 3 kHz.',
        };
      case 'wound-vs-wound':
        return {
          title: 'Wound vs. Wound Acoustic Clash',
          badge: 'Wound vs Wound',
          color: 'text-purple-400 bg-purple-500/10 border-purple-500/30',
          explanation:
            'Both candidates are wound strings. Nail scrape is present on both, so Adaptive Clustered Scoring prioritizes Inharmonicity B (d⁴/L² stiffness dispersion) and the Fundamental-to-Second Harmonic Ratio (H1/H2 compliance suppression on short thick fretted strings).',
        };
      case 'plain-vs-plain':
        return {
          title: 'Plain Steel vs. Plain Steel Clash',
          badge: 'Plain vs Plain',
          color: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
          explanation:
            'Both candidates are plain steel strings (High E & B strings). Discrimination relies on 12-Harmonic pattern alignment, macro spectral tilt deconvolution, and subtle inharmonicity core differences.',
        };
      default:
        return {
          title: 'Fretboard Unison Collision',
          badge: 'Unison Clash',
          color: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
          explanation:
            'Physical collision between different string and fret combinations producing the exact same musical pitch.',
        };
    }
  };

  const clashInfo = getClashDescription(clash.clashType);

  // Find true and runner-up/competitors
  const trueCandidate = clash.competitors.find(
    (c) => c.stringNum === clash.trueString && c.fretNum === clash.trueFret
  );
  const otherCandidates = clash.competitors.filter(
    (c) => !(c.stringNum === clash.trueString && c.fretNum === clash.trueFret)
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-[#0b0f19] border border-slate-800 rounded-3xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden font-mono"
        onClick={(e) => e.stopPropagation()}
      >
        {/* ─── Drawer Header ─── */}
        <div className="p-6 border-b border-slate-800 bg-[#0f1422] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center">
              <Activity className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-black text-white">{clash.noteName}</span>
                <span className="text-xs text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                  MIDI {clash.midiNote}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold ${clashInfo.color}`}>
                  {clashInfo.badge}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Unison Contrast Diagnostic & Acoustic Feature Dissection
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {clash.isCorrect ? (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Correctly Identified (+{(clash.margin * 100).toFixed(0)}% Margin)</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-bold">
                <XCircle className="w-4 h-4" />
                <span>Misclassified to String {clash.predictedString}</span>
              </div>
            )}

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              title="Close Inspector"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* ─── Scrollable Body ─── */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Clash Physics Rationale Banner */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-slate-200">{clashInfo.title}</h4>
                <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
                  {clashInfo.explanation}
                </p>
              </div>
            </div>
          </div>

          {/* ─── Candidate Contrast Cards ─── */}
          <div>
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 flex items-center justify-between">
              <span>Fretboard Candidates in Contention</span>
              <span className="text-[10px] text-slate-500">
                Ground Truth vs. Competing Unison Positions
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Ground Truth Candidate Card */}
              {trueCandidate && (
                <div
                  className={`bg-slate-900/70 border rounded-2xl p-4 relative ${
                    clash.isCorrect
                      ? 'border-emerald-500/40 bg-emerald-950/10'
                      : 'border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: trueMeta?.color }}
                      />
                      <div>
                        <div className="text-sm font-black text-slate-100">
                          String {clash.trueString} • Fret {clash.trueFret}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {trueMeta?.name} ({trueMeta?.isWound ? 'Phosphor Bronze' : 'Plain Steel'})
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                        Ground Truth
                      </span>
                      <div className="text-lg font-black text-slate-100 mt-1">
                        {(trueCandidate.similarityScore * 100).toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* Sub-Feature Proximities */}
                  <div className="space-y-1.5 text-[11px] border-t border-slate-800/80 pt-3">
                    <div className="flex justify-between items-center text-slate-400">
                      <span>12-Harmonic Match:</span>
                      <span className="text-slate-200 font-bold">
                        {trueCandidate.featureBreakdown
                          ? `${(trueCandidate.featureBreakdown.harmonicDistanceScore * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Nail Scrape Burst:</span>
                      <span className="text-emerald-400 font-bold">
                        {trueCandidate.featureBreakdown?.hfScrapeScore !== undefined
                          ? `${(trueCandidate.featureBreakdown.hfScrapeScore * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Spectral Rolloff (85%):</span>
                      <span className="text-sky-400 font-bold">
                        {trueCandidate.featureBreakdown?.rolloffProximity !== undefined
                          ? `${(trueCandidate.featureBreakdown.rolloffProximity * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>H1 / H2 Energy Ratio:</span>
                      <span className="text-indigo-400 font-bold">
                        {trueCandidate.featureBreakdown?.h1H2Proximity !== undefined
                          ? `${(trueCandidate.featureBreakdown.h1H2Proximity * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Inharmonicity Stiffness B:</span>
                      <span className="text-purple-400 font-bold">
                        {trueCandidate.featureBreakdown
                          ? `${(trueCandidate.featureBreakdown.inharmonicityProximity * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-400">
                      <span>Spectral Centroid:</span>
                      <span className="text-amber-400 font-bold">
                        {trueCandidate.featureBreakdown
                          ? `${(trueCandidate.featureBreakdown.centroidProximity * 100).toFixed(0)}%`
                          : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Physical Calibration Snapshot */}
                  {trueCandidate.calibratedVector && (
                    <div className="mt-3 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                      <div>
                        Rolloff:{' '}
                        <span className="text-slate-300 font-bold">
                          {Math.round(trueCandidate.calibratedVector.spectralRolloffHz)} Hz
                        </span>
                      </div>
                      <div>
                        Scrape:{' '}
                        <span className="text-slate-300 font-bold">
                          {(trueCandidate.calibratedVector.hfScrapeDb ?? 0).toFixed(1)} dB
                        </span>
                      </div>
                      <div>
                        Inharm B:{' '}
                        <span className="text-slate-300 font-bold">
                          {(trueCandidate.calibratedVector.inharmonicityB * 10000).toFixed(2)}e-4
                        </span>
                      </div>
                      <div>
                        H1/H2:{' '}
                        <span className="text-slate-300 font-bold">
                          {(trueCandidate.calibratedVector.h1H2Ratio ?? 1).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Competitor Candidate Cards */}
              {otherCandidates.map((comp) => {
                const compMeta = GUITAR_STRINGS[comp.stringNum];
                const isWinner =
                  comp.stringNum === clash.predictedString && comp.fretNum === clash.predictedFret;

                return (
                  <div
                    key={`${comp.stringNum}_${comp.fretNum}`}
                    className={`bg-slate-900/70 border rounded-2xl p-4 relative ${
                      isWinner
                        ? 'border-rose-500/40 bg-rose-950/10'
                        : 'border-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: compMeta?.color }}
                        />
                        <div>
                          <div className="text-sm font-black text-slate-100">
                            String {comp.stringNum} • Fret {comp.fretNum}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {compMeta?.name} ({compMeta?.isWound ? 'Phosphor Bronze' : 'Plain Steel'})
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {isWinner ? (
                          <span className="text-[10px] uppercase font-bold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded border border-rose-500/20">
                            Classifier Pick
                          </span>
                        ) : (
                          <span className="text-[10px] uppercase font-bold text-slate-500 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                            Competitor
                          </span>
                        )}
                        <div className="text-lg font-black text-slate-100 mt-1">
                          {(comp.similarityScore * 100).toFixed(0)}%
                        </div>
                      </div>
                    </div>

                    {/* Sub-Feature Proximities */}
                    <div className="space-y-1.5 text-[11px] border-t border-slate-800/80 pt-3">
                      <div className="flex justify-between items-center text-slate-400">
                        <span>12-Harmonic Match:</span>
                        <span className="text-slate-200 font-bold">
                          {comp.featureBreakdown
                            ? `${(comp.featureBreakdown.harmonicDistanceScore * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Nail Scrape Burst:</span>
                        <span className="text-emerald-400 font-bold">
                          {comp.featureBreakdown?.hfScrapeScore !== undefined
                            ? `${(comp.featureBreakdown.hfScrapeScore * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Spectral Rolloff (85%):</span>
                        <span className="text-sky-400 font-bold">
                          {comp.featureBreakdown?.rolloffProximity !== undefined
                            ? `${(comp.featureBreakdown.rolloffProximity * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>H1 / H2 Energy Ratio:</span>
                        <span className="text-indigo-400 font-bold">
                          {comp.featureBreakdown?.h1H2Proximity !== undefined
                            ? `${(comp.featureBreakdown.h1H2Proximity * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Inharmonicity Stiffness B:</span>
                        <span className="text-purple-400 font-bold">
                          {comp.featureBreakdown
                            ? `${(comp.featureBreakdown.inharmonicityProximity * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-slate-400">
                        <span>Spectral Centroid:</span>
                        <span className="text-amber-400 font-bold">
                          {comp.featureBreakdown
                            ? `${(comp.featureBreakdown.centroidProximity * 100).toFixed(0)}%`
                            : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Physical Calibration Snapshot */}
                    {comp.calibratedVector && (
                      <div className="mt-3 pt-2 border-t border-slate-800/80 grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                        <div>
                          Rolloff:{' '}
                          <span className="text-slate-300 font-bold">
                            {Math.round(comp.calibratedVector.spectralRolloffHz)} Hz
                          </span>
                        </div>
                        <div>
                          Scrape:{' '}
                          <span className="text-slate-300 font-bold">
                            {(comp.calibratedVector.hfScrapeDb ?? 0).toFixed(1)} dB
                          </span>
                        </div>
                        <div>
                          Inharm B:{' '}
                          <span className="text-slate-300 font-bold">
                            {(comp.calibratedVector.inharmonicityB * 10000).toFixed(2)}e-4
                          </span>
                        </div>
                        <div>
                          H1/H2:{' '}
                          <span className="text-slate-300 font-bold">
                            {(comp.calibratedVector.h1H2Ratio ?? 1).toFixed(2)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* ─── 12-Harmonic Differential Comparison Chart ─── */}
          {trueCandidate?.calibratedVector && otherCandidates[0]?.calibratedVector && (
            <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-sky-400" />
                  <h4 className="text-xs font-bold text-slate-200">
                    12-Harmonic Energy Profile Contrast (H1 – H12)
                  </h4>
                </div>
                <div className="flex items-center gap-3 text-[10px]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: trueMeta?.color }}
                    />
                    <span className="text-slate-300">
                      Ground Truth (Str {clash.trueString})
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2.5 h-2.5 rounded-sm"
                      style={{ backgroundColor: GUITAR_STRINGS[otherCandidates[0].stringNum]?.color }}
                    />
                    <span className="text-slate-300">
                      Rival (Str {otherCandidates[0].stringNum})
                    </span>
                  </div>
                </div>
              </div>

              {/* Harmonic Bar Grid */}
              <div className="grid grid-cols-12 gap-2 h-36 items-end pt-4 border-b border-slate-800/80">
                {Array.from({ length: 12 }, (_, hIdx) => {
                  const trueAmp = trueCandidate.calibratedVector?.harmonics[hIdx] ?? 0;
                  const compAmp = otherCandidates[0].calibratedVector?.harmonics[hIdx] ?? 0;
                  const truePct = Math.min(100, Math.round(trueAmp * 120));
                  const compPct = Math.min(100, Math.round(compAmp * 120));

                  return (
                    <div key={`h_${hIdx}`} className="h-full flex flex-col justify-end items-center gap-1">
                      <div className="w-full flex items-end justify-center gap-0.5 h-full">
                        {/* True Bar */}
                        <div
                          className="w-1/2 rounded-t transition-all"
                          style={{
                            height: `${Math.max(4, truePct)}%`,
                            backgroundColor: trueMeta?.color || '#38bdf8',
                          }}
                          title={`H${hIdx + 1} Ground Truth: ${(trueAmp * 100).toFixed(1)}%`}
                        />
                        {/* Rival Bar */}
                        <div
                          className="w-1/2 rounded-t transition-all opacity-70 hover:opacity-100"
                          style={{
                            height: `${Math.max(4, compPct)}%`,
                            backgroundColor:
                              GUITAR_STRINGS[otherCandidates[0].stringNum]?.color || '#f43f5e',
                          }}
                          title={`H${hIdx + 1} Rival: ${(compAmp * 100).toFixed(1)}%`}
                        />
                      </div>
                      <span className="text-[9px] text-slate-500 font-mono">H{hIdx + 1}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-between text-[10px] text-slate-500 mt-2">
                <span>Fundamental (H1) & Low Modes</span>
                <span>Mid Resonance</span>
                <span>Upper Inharmonic Modes (H10–H12)</span>
              </div>
            </div>
          )}
        </div>

        {/* ─── Drawer Footer ─── */}
        <div className="p-4 border-t border-slate-800 bg-[#0f1422] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
          >
            Done Inspecting
          </button>
        </div>
      </div>
    </div>
  );
};
