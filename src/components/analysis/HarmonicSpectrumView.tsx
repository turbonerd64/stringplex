// src/components/analysis/HarmonicSpectrumView.tsx
import React from 'react';
import { useStringplexStore } from '../../store/useStringplexStore';
import { Activity, Zap, Compass, Waves } from 'lucide-react';

export const HarmonicSpectrumView: React.FC = () => {
  const { liveFrame } = useStringplexStore();

  const vector = liveFrame?.harmonicVector;
  const winner = liveFrame?.winningCandidate;
  const calVector = winner?.calibratedVector;

  const harmonics = vector?.harmonics || Array(12).fill(0);
  const calHarmonics = calVector?.harmonics || null;

  return (
    <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-400" />
            <span>Harmonic Timbre Spectrum (H1 – H12)</span>
          </h3>
          <p className="text-xs text-slate-400">
            Comparing live 12-harmonic peaks against the mean-centered calibrated profile.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-2 rounded bg-sky-400"></span>
            <span>Live Harmonic Energy</span>
          </div>
          {calHarmonics && (
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-2 rounded border border-amber-400 bg-amber-400/20"></span>
              <span>Calibrated Reference</span>
            </div>
          )}
        </div>
      </div>

      {/* Bar Chart Graphic */}
      <div className="h-44 bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex items-end justify-between gap-3 relative">
        {harmonics.map((amp, idx) => {
          const harmonicNum = idx + 1;
          const liveHeightPercent = Math.min(100, Math.max(4, amp * 120));
          const calAmp = calHarmonics ? calHarmonics[idx] : null;
          const calHeightPercent = calAmp !== null ? Math.min(100, Math.max(4, calAmp * 120)) : null;

          return (
            <div key={idx} className="flex-1 flex flex-col items-center h-full justify-end relative group">
              {/* Reference Ghost Bar (if available) */}
              {calHeightPercent !== null && (
                <div
                  className="absolute bottom-6 w-full rounded-t border-2 border-amber-400/80 bg-amber-400/10 pointer-events-none transition-all duration-150"
                  style={{ height: `${calHeightPercent}%` }}
                />
              )}

              {/* Live Bar */}
              <div
                className="w-full bg-gradient-to-t from-sky-600 to-sky-400 rounded-t shadow-lg shadow-sky-500/20 transition-all duration-75 relative z-10"
                style={{ height: `${liveHeightPercent}%` }}
              >
                <div className="opacity-0 group-hover:opacity-100 absolute -top-7 left-1/2 -translate-x-1/2 bg-slate-800 border border-slate-700 text-[10px] font-mono text-sky-300 px-1.5 py-0.5 rounded shadow pointer-events-none transition-opacity whitespace-nowrap">
                  {(amp * 100).toFixed(0)}%
                </div>
              </div>

              {/* Label below bar */}
              <div className="text-[10px] font-mono font-bold text-slate-400 mt-2">
                H{harmonicNum}
              </div>
            </div>
          );
        })}
      </div>

      {/* Acoustic Metric Readouts */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4">
        {/* Spectral Centroid */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono">
            <Compass className="w-3.5 h-3.5 text-sky-400" />
            <span>Centroid</span>
          </div>
          <div className="text-base font-bold font-mono text-slate-100">
            {vector?.spectralCentroidHz ? `${vector.spectralCentroidHz} Hz` : '—'}
          </div>
          <div className="text-[10px] text-slate-500">Center of mass</div>
        </div>

        {/* Fingernail Transient Scrape */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono">
            <Activity className="w-3.5 h-3.5 text-amber-400" />
            <span>Nail Scrape</span>
          </div>
          <div className="text-base font-bold font-mono text-amber-300">
            {vector?.hfScrapeDb !== undefined ? `${vector.hfScrapeDb} dB` : '—'}
          </div>
          <div className="text-[10px] text-slate-500">
            {vector?.hfScrapeDb !== undefined
              ? vector.hfScrapeDb >= -12 ? 'Wound scrape' : 'Plain smooth'
              : '4.5-12kHz burst'}
          </div>
        </div>

        {/* Inharmonicity Factor B */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono">
            <Waves className="w-3.5 h-3.5 text-purple-400" />
            <span>Inharmonicity B</span>
          </div>
          <div className="text-base font-bold font-mono text-purple-300">
            {vector?.inharmonicityB ? vector.inharmonicityB.toExponential(2) : '—'}
          </div>
          <div className="text-[10px] text-slate-500">Stiffness stretch</div>
        </div>

        {/* Modal Damping Decay Velocity */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono">
            <Zap className="w-3.5 h-3.5 text-rose-400" />
            <span>Decay Velocity</span>
          </div>
          <div className="text-base font-bold font-mono text-rose-300">
            {vector?.deltaSigmaHL !== undefined ? `${vector.deltaSigmaHL} dB/s` : '—'}
          </div>
          <div className="text-[10px] text-slate-500">Upper partial damping</div>
        </div>

        {/* Pluck Location */}
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-3">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1 font-mono">
            <Activity className="w-3.5 h-3.5 text-emerald-400" />
            <span>Pluck Point</span>
          </div>
          <div className="text-base font-bold font-mono text-emerald-300">
            {winner?.featureBreakdown?.pluckBetaEstimated
              ? `${(winner.featureBreakdown.pluckBetaEstimated * 64.8).toFixed(1)} cm`
              : '—'}
          </div>
          <div className="text-[10px] text-slate-500">From bridge saddle</div>
        </div>
      </div>
    </div>
  );
};
