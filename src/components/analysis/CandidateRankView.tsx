// src/components/analysis/CandidateRankView.tsx
import React from 'react';
import { useStringplexStore } from '../../store/useStringplexStore';
import { GUITAR_STRINGS } from '../../constants/guitarConstants';
import { Trophy, HelpCircle, Check, ArrowRight } from 'lucide-react';

export const CandidateRankView: React.FC = () => {
  const { liveFrame } = useStringplexStore();

  const candidates = liveFrame?.candidates || [];
  const winner = liveFrame?.winningCandidate;

  return (
    <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-emerald-400" />
            <span>Unison Candidate Disambiguation</span>
          </h3>
          <p className="text-xs text-slate-400">
            Acoustic competition between all string/fret combinations producing this exact pitch.
          </p>
        </div>

        {liveFrame?.noteName && (
          <div className="text-xs font-mono bg-slate-800 px-2.5 py-1 rounded-lg text-slate-300">
            Evaluating Pitch: <span className="font-bold text-sky-400">{liveFrame.noteName}</span> ({liveFrame.frequencyHz} Hz)
          </div>
        )}
      </div>

      {candidates.length === 0 ? (
        <div className="py-8 text-center text-xs font-mono text-slate-500 bg-slate-900/40 rounded-xl border border-dashed border-slate-800">
          Play a note on the guitar to view candidate string rankings...
        </div>
      ) : (
        <div className="space-y-3">
          {candidates.map((cand, idx) => {
            const strMeta = GUITAR_STRINGS[cand.stringNum];
            const isWinner = cand.isWinner;
            const simPct = (cand.similarityScore * 100).toFixed(0);

            return (
              <div
                key={`${cand.stringNum}_${cand.fretNum}`}
                className={`
                  p-4 rounded-xl border transition-all duration-150
                  ${
                    isWinner
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/5'
                      : 'bg-slate-900/50 border-slate-800/80 opacity-80 hover:opacity-100'
                  }
                `}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`
                        w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold font-mono
                        ${isWinner ? 'bg-emerald-400 text-slate-950' : 'bg-slate-800 text-slate-400'}
                      `}
                    >
                      {idx + 1}
                    </span>

                    <div>
                      <div className="text-sm font-bold text-slate-200 flex items-center gap-2">
                        <span>String #{cand.stringNum} ({strMeta.name})</span>
                        <span className="text-slate-500 font-normal">•</span>
                        <span className="text-sky-400 font-mono">
                          {cand.fretNum === 0 ? 'Open' : `Fret ${cand.fretNum}`}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {strMeta.gaugeApprox} {strMeta.isWound ? 'wound' : 'plain'} core
                      </div>
                    </div>
                  </div>

                  {/* Confidence Score */}
                  <div className="text-right">
                    <div
                      className={`text-lg font-black font-mono ${
                        isWinner ? 'text-emerald-400' : 'text-slate-400'
                      }`}
                    >
                      {simPct}%
                    </div>
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">
                      {isWinner ? 'Identified Winner' : 'Alternate'}
                    </div>
                  </div>
                </div>

                {/* Similarity Progress Bar */}
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden mb-2.5">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      isWinner ? 'bg-emerald-400' : 'bg-slate-500'
                    }`}
                    style={{ width: `${Math.max(4, cand.similarityScore * 100)}%` }}
                  />
                </div>

                {/* Feature Breakdown Metrics */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-[10px] font-mono bg-slate-950/40 p-2.5 rounded-lg border border-slate-800/60 text-slate-400">
                  <div>
                    <span className="text-slate-500">Deconv Harm:</span>{' '}
                    <span className="text-slate-200 font-bold">
                      {((cand.featureBreakdown.harmonicDistanceScore || 0) * 100).toFixed(0)}%
                    </span>
                    {cand.featureBreakdown.pluckBetaEstimated && (
                      <div className="text-[9px] text-sky-400">
                        Pluck {(cand.featureBreakdown.pluckBetaEstimated * 64.8).toFixed(1)}cm
                      </div>
                    )}
                  </div>
                  <div>
                    <span className="text-slate-500">Nail Scrape:</span>{' '}
                    <span className={`font-bold ${strMeta.isWound ? 'text-amber-300' : 'text-sky-300'}`}>
                      {cand.featureBreakdown.hfScrapeScore !== undefined
                        ? `${(cand.featureBreakdown.hfScrapeScore * 100).toFixed(0)}%`
                        : '—'}
                    </span>
                    <div className="text-[9px] text-slate-500">
                      {strMeta.isWound ? 'Wound scrape' : 'Smooth plain'}
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-500">Centroid:</span>{' '}
                    <span className="text-slate-200 font-bold">
                      {((cand.featureBreakdown.centroidProximity || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Inharm B:</span>{' '}
                    <span className="text-slate-200 font-bold">
                      {((cand.featureBreakdown.inharmonicityProximity || 0) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-500">Decay Rate:</span>{' '}
                    <span className="text-slate-200 font-bold">
                      {cand.featureBreakdown.decayProximity !== undefined
                        ? `${(cand.featureBreakdown.decayProximity * 100).toFixed(0)}%`
                        : 'Calibrating'}
                    </span>
                    {cand.featureBreakdown.openNutBonus && (
                      <div className="text-[9px] text-emerald-400">Nut Boundary</div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
