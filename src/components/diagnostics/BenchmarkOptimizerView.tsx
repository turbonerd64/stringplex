// src/components/diagnostics/BenchmarkOptimizerView.tsx
import React, { useState, useEffect } from 'react';
import { useStringplexStore } from '../../store/useStringplexStore';
import { GUITAR_STRINGS } from '../../constants/guitarConstants';
import {
  Zap,
  TrendingUp,
  Sliders,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Sparkles,
  Trophy,
  Loader2,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

export const BenchmarkOptimizerView: React.FC = () => {
  const {
    profiles,
    activeProfileId,
    disambiguatorWeights,
    lastBenchmarkResult,
    lastOptimizationResult,
    isOptimizing,
    runBenchmark,
    optimizeDisambiguator,
    setDisambiguatorWeights,
    resetDisambiguatorWeights,
  } = useStringplexStore();

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const totalNotes = Object.keys(activeProfile?.fingerprints || {}).length;

  const [filterMode, setFilterMode] = useState<'all' | 'clashes' | 'low-margin'>('all');

  // Automatically run benchmark on mount if calibrated notes exist and no benchmark run yet
  useEffect(() => {
    if (totalNotes > 5 && !lastBenchmarkResult) {
      runBenchmark();
    }
  }, [totalNotes, lastBenchmarkResult, runBenchmark]);

  const clashes = lastBenchmarkResult?.clashes || [];
  const filteredClashes = clashes.filter((c) => {
    if (filterMode === 'clashes') return !c.isCorrect;
    if (filterMode === 'low-margin') return c.isCorrect && c.margin < 0.20;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* ─── Hero Header & Action Card ─── */}
      <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 mb-1">
              <Sparkles className="w-4 h-4 text-sky-400" />
              <span>Ground-Truth Acoustic Benchmark & Optimizer</span>
            </div>
            <h2 className="text-2xl font-black text-white tracking-tight">
              Acoustic Hyperparameter Auto-Tuner
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Tests every recorded note against its rival unison candidates on your fretboard, then sweeps
              parameter space to discover the mathematically optimal weights maximizing accuracy and confidence margin.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => runBenchmark()}
              disabled={isOptimizing || totalNotes === 0}
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 font-bold rounded-xl text-xs flex items-center gap-2 transition-all cursor-pointer shadow-md"
            >
              <Zap className="w-4 h-4 text-amber-400" />
              <span>Run Benchmark</span>
            </button>

            <button
              onClick={() => optimizeDisambiguator()}
              disabled={isOptimizing || totalNotes === 0}
              className="px-5 py-2.5 bg-gradient-to-r from-sky-500 to-indigo-500 hover:from-sky-400 hover:to-indigo-400 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-sky-500/20 transition-all cursor-pointer"
            >
              {isOptimizing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                  <span>Sweeping Parameter Grid...</span>
                </>
              ) : (
                <>
                  <TrendingUp className="w-4 h-4 text-slate-950" />
                  <span>Auto-Tune to My Guitar</span>
                </>
              )}
            </button>

            <button
              onClick={() => resetDisambiguatorWeights()}
              disabled={isOptimizing}
              className="p-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 rounded-xl transition-colors cursor-pointer"
              title="Reset weights to physical acoustic defaults"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ─── Metric Scorecards ─── */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-slate-800/80 font-mono">
          {/* Accuracy Card */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
              <span>Unison Accuracy</span>
              <Trophy className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <div className="text-3xl font-black text-slate-100 flex items-baseline gap-2">
              <span
                className={
                  (lastBenchmarkResult?.accuracyPercent ?? 0) >= 90
                    ? 'text-emerald-400'
                    : (lastBenchmarkResult?.accuracyPercent ?? 0) >= 75
                    ? 'text-amber-400'
                    : 'text-rose-400'
                }
              >
                {lastBenchmarkResult ? `${lastBenchmarkResult.accuracyPercent}%` : '—'}
              </span>
              <span className="text-xs text-slate-500 font-normal">
                ({lastBenchmarkResult?.correctCount ?? 0}/{lastBenchmarkResult?.totalEvaluated ?? 0})
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Ground-truth unison separation</div>
          </div>

          {/* Average Winning Margin */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
              <span>Avg Confidence Margin</span>
              <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
            </div>
            <div className="text-3xl font-black text-sky-300">
              {lastBenchmarkResult ? `+${(lastBenchmarkResult.avgMarginPercent).toFixed(1)}%` : '—'}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Lead over #2 rival string</div>
          </div>

          {/* Evaluated Notes */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
              <span>Fretboard Unisons</span>
              <span className="text-[10px] text-slate-500">16 frets</span>
            </div>
            <div className="text-3xl font-black text-slate-200">
              {lastBenchmarkResult?.totalEvaluated ?? 0}
            </div>
            <div className="text-[10px] text-slate-500 mt-1">Competing physical positions</div>
          </div>

          {/* Optimizer Gain */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
            <div className="text-[11px] text-slate-400 mb-1 flex items-center justify-between">
              <span>Optimizer Status</span>
              <Sparkles className="w-3.5 h-3.5 text-purple-400" />
            </div>
            {lastOptimizationResult ? (
              <div>
                <div className="text-xl font-black text-purple-300">
                  +{lastOptimizationResult.improvementPercent}% Gain
                </div>
                <div className="text-[10px] text-slate-400 mt-1">
                  Tested {lastOptimizationResult.iterationsRun} permutations
                </div>
              </div>
            ) : (
              <div>
                <div className="text-lg font-bold text-slate-400">Baseline Weights</div>
                <div className="text-[10px] text-slate-500 mt-1">Ready to optimize</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Parameter Sliders / Auto-Tuned Weights ─── */}
      <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              <span>Acoustic Feature Weights & Scaling Parameters</span>
            </h3>
            <p className="text-xs text-slate-400">
              Adjust how strongly each acoustic dimension influences string selection on your instrument.
            </p>
          </div>
          <div className="text-xs font-mono text-slate-400">
            Total Weight:{' '}
            <span className="text-sky-400 font-bold">
              {(
                disambiguatorWeights.harmonicWeight +
                disambiguatorWeights.scrapeWeight +
                disambiguatorWeights.centroidWeight +
                disambiguatorWeights.inharmonicityWeight +
                disambiguatorWeights.decayWeight +
                disambiguatorWeights.nutBonusWeight
              ).toFixed(2)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 font-mono text-xs">
          {/* Harmonic Weight */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 text-[11px] mb-1">Harmonic Match</div>
            <div className="text-lg font-bold text-sky-400 mb-2">
              {(disambiguatorWeights.harmonicWeight * 100).toFixed(0)}%
            </div>
            <input
              type="range"
              min="0.10"
              max="0.70"
              step="0.02"
              value={disambiguatorWeights.harmonicWeight}
              onChange={(e) => setDisambiguatorWeights({ harmonicWeight: parseFloat(e.target.value) })}
              className="w-full accent-sky-400 cursor-pointer"
            />
            <div className="text-[9px] text-slate-500 mt-1">12-harmonic spectrum</div>
          </div>

          {/* Nail Scrape Weight */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 text-[11px] mb-1">Nail Scrape Burst</div>
            <div className="text-lg font-bold text-emerald-400 mb-2">
              {(disambiguatorWeights.scrapeWeight * 100).toFixed(0)}%
            </div>
            <input
              type="range"
              min="0.05"
              max="0.50"
              step="0.02"
              value={disambiguatorWeights.scrapeWeight}
              onChange={(e) => setDisambiguatorWeights({ scrapeWeight: parseFloat(e.target.value) })}
              className="w-full accent-emerald-400 cursor-pointer"
            />
            <div className="text-[9px] text-slate-500 mt-1">Wound vs plain burst</div>
          </div>

          {/* Centroid Weight */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 text-[11px] mb-1">Spectral Centroid</div>
            <div className="text-lg font-bold text-amber-400 mb-2">
              {(disambiguatorWeights.centroidWeight * 100).toFixed(0)}%
            </div>
            <input
              type="range"
              min="0.05"
              max="0.40"
              step="0.02"
              value={disambiguatorWeights.centroidWeight}
              onChange={(e) => setDisambiguatorWeights({ centroidWeight: parseFloat(e.target.value) })}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="text-[9px] text-slate-500 mt-1">Center of spectral mass</div>
          </div>

          {/* Inharmonicity Weight */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 text-[11px] mb-1">Inharmonicity B</div>
            <div className="text-lg font-bold text-purple-400 mb-2">
              {(disambiguatorWeights.inharmonicityWeight * 100).toFixed(0)}%
            </div>
            <input
              type="range"
              min="0.05"
              max="0.40"
              step="0.02"
              value={disambiguatorWeights.inharmonicityWeight}
              onChange={(e) => setDisambiguatorWeights({ inharmonicityWeight: parseFloat(e.target.value) })}
              className="w-full accent-purple-400 cursor-pointer"
            />
            <div className="text-[9px] text-slate-500 mt-1">String core stiffness</div>
          </div>

          {/* Comb Epsilon */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 text-[11px] mb-1">Comb Regularization</div>
            <div className="text-lg font-bold text-indigo-400 mb-2">
              ε = {disambiguatorWeights.combEpsilon.toFixed(2)}
            </div>
            <input
              type="range"
              min="0.05"
              max="0.30"
              step="0.01"
              value={disambiguatorWeights.combEpsilon}
              onChange={(e) => setDisambiguatorWeights({ combEpsilon: parseFloat(e.target.value) })}
              className="w-full accent-indigo-400 cursor-pointer"
            />
            <div className="text-[9px] text-slate-500 mt-1">Pluck comb notch floor</div>
          </div>

          {/* Softmax Temperature */}
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-slate-400 text-[11px] mb-1">Contrast Temp (T)</div>
            <div className="text-lg font-bold text-rose-400 mb-2">
              T = {disambiguatorWeights.softmaxTemperature.toFixed(2)}
            </div>
            <input
              type="range"
              min="0.04"
              max="0.25"
              step="0.01"
              value={disambiguatorWeights.softmaxTemperature}
              onChange={(e) => setDisambiguatorWeights({ softmaxTemperature: parseFloat(e.target.value) })}
              className="w-full accent-rose-400 cursor-pointer"
            />
            <div className="text-[9px] text-slate-500 mt-1">Probability contrast</div>
          </div>
        </div>
      </div>

      {/* ─── Ground-Truth Unison Detail Table ─── */}
      <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <span>Unison Evaluation Matrix</span>
              <span className="text-xs font-mono text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                {filteredClashes.length} / {clashes.length} notes
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              Exact simulated cross-examination of each recorded note against competing strings on your fretboard.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 bg-slate-900/80 p-1 rounded-xl border border-slate-800 text-xs font-mono">
            <button
              onClick={() => setFilterMode('all')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'all' ? 'bg-sky-500/20 text-sky-400 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Unisons ({clashes.length})
            </button>
            <button
              onClick={() => setFilterMode('clashes')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'clashes'
                  ? 'bg-rose-500/20 text-rose-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Errors ({clashes.filter((c) => !c.isCorrect).length})
            </button>
            <button
              onClick={() => setFilterMode('low-margin')}
              className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                filterMode === 'low-margin'
                  ? 'bg-amber-500/20 text-amber-300 font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Tight Margins ({clashes.filter((c) => c.isCorrect && c.margin < 0.20).length})
            </button>
          </div>
        </div>

        {clashes.length === 0 ? (
          <div className="py-12 text-center text-slate-500 font-mono text-xs">
            {totalNotes === 0 ? (
              <p>No notes calibrated yet. Complete calibration steps in the Chromatic Calibration Wizard first.</p>
            ) : (
              <p>Click &quot;Run Benchmark&quot; above to simulate and score all recorded unisons.</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                  <th className="py-3 px-3">Pitch</th>
                  <th className="py-3 px-3">Ground Truth</th>
                  <th className="py-3 px-3">Classifier Choice</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Confidence Margin</th>
                  <th className="py-3 px-3">Candidate Breakdown</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {filteredClashes.map((c, idx) => {
                  const trueMeta = GUITAR_STRINGS[c.trueString];
                  const predMeta = GUITAR_STRINGS[c.predictedString];
                  const isTight = c.isCorrect && c.margin < 0.20;

                  return (
                    <tr
                      key={`${c.trueString}_${c.trueFret}_${idx}`}
                      className={`hover:bg-slate-900/40 transition-colors ${
                        !c.isCorrect ? 'bg-rose-950/15' : isTight ? 'bg-amber-950/10' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3">
                        <span className="font-bold text-sky-400">{c.noteName}</span>{' '}
                        <span className="text-[10px] text-slate-500">({c.midiNote})</span>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: trueMeta?.color }}
                          />
                          <span className="font-bold text-slate-200">
                            Str {c.trueString} • Fret {c.trueFret}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          <span
                            className="w-2 h-2 rounded-full"
                            style={{ backgroundColor: predMeta?.color }}
                          />
                          <span
                            className={c.isCorrect ? 'text-slate-200 font-semibold' : 'text-rose-400 font-bold'}
                          >
                            Str {c.predictedString} • Fret {c.predictedFret}
                          </span>
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        {c.isCorrect ? (
                          <div className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Correct</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-rose-400 text-[11px] font-bold">
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Misclassified</span>
                          </div>
                        )}
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-bold ${
                              c.margin >= 0.35
                                ? 'text-emerald-400'
                                : c.margin >= 0.20
                                ? 'text-sky-300'
                                : 'text-amber-400'
                            }`}
                          >
                            +{(c.margin * 100).toFixed(0)}%
                          </span>
                          {isTight && (
                            <span className="text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.2 rounded border border-amber-500/20">
                              Tight
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-2.5 px-3">
                        <div className="flex items-center gap-1.5">
                          {c.competitors.map((comp) => {
                            const isWin = comp.stringNum === c.predictedString && comp.fretNum === c.predictedFret;
                            return (
                              <span
                                key={`${comp.stringNum}_${comp.fretNum}`}
                                className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                  isWin
                                    ? 'bg-sky-500/20 text-sky-300 border-sky-500/40 font-bold'
                                    : 'bg-slate-900 text-slate-500 border-slate-800'
                                }`}
                              >
                                S{comp.stringNum}:{(comp.similarityScore * 100).toFixed(0)}%
                              </span>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
