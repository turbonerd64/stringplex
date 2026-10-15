// src/components/fretboard/FretboardView.tsx
import React, { useState } from 'react';
import { GUITAR_STRINGS, midiToNoteName } from '../../constants/guitarConstants';
import { StringIndex, StringplexLiveFrame } from '../../types/stringplex';
import { useStringplexStore } from '../../store/useStringplexStore';

interface FretboardViewProps {
  maxFret?: number;
  onFretClick?: (stringNum: StringIndex, fretNum: number) => void;
}

const INLAY_FRETS = [3, 5, 7, 9, 12, 15];

export const FretboardView: React.FC<FretboardViewProps> = ({
  maxFret = 15,
  onFretClick,
}) => {
  const { liveFrame, profiles, activeProfileId } = useStringplexStore();
  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const [inspectedFret, setInspectedFret] = useState<{ stringNum: StringIndex; fretNum: number } | null>(null);

  const stringIndices: StringIndex[] = [1, 2, 3, 4, 5, 6]; // 1 = High E (top), 6 = Low E (bottom)

  // Candidate lookups from liveFrame
  const candidates = liveFrame?.candidates || [];
  const candidateMap = new Map<string, { similarity: number; isWinner: boolean }>();
  candidates.forEach((c) => {
    candidateMap.set(`${c.stringNum}_${c.fretNum}`, {
      similarity: c.similarityScore,
      isWinner: c.isWinner,
    });
  });

  return (
    <div className="bg-[#0f1420] border border-slate-800 rounded-2xl p-6 shadow-2xl overflow-x-auto select-none">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <span>Fretboard Topology & String Disambiguation</span>
            {liveFrame?.winningCandidate && (
              <span className="text-xs bg-emerald-500/20 text-emerald-400 font-mono px-2 py-0.5 rounded-full border border-emerald-500/30">
                LOCKED: String {liveFrame.winningCandidate.stringNum} • Fret {liveFrame.winningCandidate.fretNum} ({(liveFrame.winningCandidate.similarityScore * 100).toFixed(0)}%)
              </span>
            )}
          </h3>
          <p className="text-xs text-slate-400">
            Gold rings indicate calibrated fingerprints. Glowing badges display live candidate probabilities.
          </p>
        </div>

        <div className="flex items-center gap-4 text-xs font-mono text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"></span>
            <span>Target Winner</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-400/60"></span>
            <span>Unison Candidate</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-sky-400"></span>
            <span>Calibrated</span>
          </div>
        </div>
      </div>

      {/* Fretboard Graphic */}
      <div className="min-w-[920px] relative bg-gradient-to-b from-[#181d29] to-[#121622] rounded-xl border border-slate-700/60 p-4">
        {/* Fret Number Markers (Top) */}
        <div className="grid grid-cols-[80px_repeat(16,1fr)] gap-0 text-center text-xs font-mono text-slate-400 mb-2">
          <div className="text-left pl-2 text-slate-500 font-bold">STRING</div>
          {Array.from({ length: maxFret + 1 }).map((_, f) => (
            <div key={f} className={`relative font-semibold ${INLAY_FRETS.includes(f) ? 'text-sky-400 font-bold' : ''}`}>
              {f === 0 ? 'OPEN' : f}
              {f === 12 && <span className="block text-[9px] -mt-0.5 text-sky-400">••</span>}
              {INLAY_FRETS.includes(f) && f !== 12 && (
                <span className="block text-[8px] -mt-0.5 text-sky-400/80">•</span>
              )}
            </div>
          ))}
        </div>

        {/* Strings Matrix */}
        <div className="space-y-3 relative">
          {stringIndices.map((sIdx) => {
            const strMeta = GUITAR_STRINGS[sIdx];
            const stringThickness = 1 + (6 - sIdx) * 0.7; // Thicker low strings

            return (
              <div
                key={sIdx}
                className="grid grid-cols-[80px_repeat(16,1fr)] gap-0 items-center relative group"
              >
                {/* String Label */}
                <div className="flex items-center gap-2 pl-1 pr-2">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: strMeta.color }}
                  ></span>
                  <div className="text-left">
                    <div className="text-xs font-bold text-slate-200 leading-tight">
                      {strMeta.tuningNote}
                    </div>
                    <div className="text-[10px] text-slate-500 leading-none">
                      #{sIdx} {strMeta.isWound ? 'w' : 'p'}
                    </div>
                  </div>
                </div>

                {/* Physical String Wire (Underneath the fret nodes) */}
                <div
                  className="absolute left-[80px] right-0 z-0 pointer-events-none rounded-full"
                  style={{
                    height: `${stringThickness}px`,
                    background: strMeta.isWound
                      ? 'linear-gradient(90deg, #94a3b8 0%, #cbd5e1 50%, #64748b 100%)'
                      : 'linear-gradient(90deg, #cbd5e1 0%, #f8fafc 50%, #94a3b8 100%)',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.6)',
                  }}
                />

                {/* Frets 0 through 15 */}
                {Array.from({ length: maxFret + 1 }).map((_, fret) => {
                  const key = `${sIdx}_${fret}`;
                  const isCalibrated = Boolean(activeProfile?.fingerprints[key]);
                  const match = candidateMap.get(key);
                  const isWinner = match?.isWinner;
                  const isInspected = inspectedFret?.stringNum === sIdx && inspectedFret?.fretNum === fret;

                  const midi = strMeta.openMidi + fret;
                  const noteName = midiToNoteName(midi);

                  return (
                    <div
                      key={fret}
                      onClick={() => {
                        setInspectedFret({ stringNum: sIdx, fretNum: fret });
                        if (onFretClick) onFretClick(sIdx, fret);
                      }}
                      className={`
                        h-10 relative z-10 flex items-center justify-center cursor-pointer transition-all duration-150
                        ${fret === 0 ? 'border-r-4 border-amber-600/80 bg-slate-900/40' : 'border-r border-slate-600/60'}
                        hover:bg-slate-700/30 rounded-sm
                      `}
                    >
                      {/* Calibrated Indicator Dot */}
                      {isCalibrated && (
                        <div
                          className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-sky-400 ring-1 ring-sky-300/40"
                          title="Calibrated Fingerprint Stored"
                        />
                      )}

                      {/* Default Fret Note Name (Subtle) */}
                      {!match && !isInspected && (
                        <span className="text-[10px] font-mono text-slate-500 group-hover:text-slate-300 transition-colors">
                          {noteName}
                        </span>
                      )}

                      {/* Inspected Highlight */}
                      {isInspected && !match && (
                        <div className="w-7 h-7 rounded-full border-2 border-dashed border-sky-400 bg-sky-500/20 flex items-center justify-center text-[10px] font-mono font-bold text-sky-200">
                          {noteName}
                        </div>
                      )}

                      {/* Live Candidate or Winner Highlight */}
                      {match && (
                        <div
                          className={`
                            px-1.5 py-0.5 rounded-full flex flex-col items-center justify-center transition-all duration-150
                            ${
                              isWinner
                                ? 'bg-emerald-500 text-slate-950 font-bold scale-110 shadow-[0_0_15px_rgba(16,185,129,0.8)] ring-2 ring-emerald-300'
                                : 'bg-amber-500/30 border border-amber-400/80 text-amber-200 font-semibold scale-95 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                            }
                          `}
                        >
                          <span className="text-[11px] leading-tight">{noteName}</span>
                          <span className="text-[8px] leading-none opacity-90 font-mono">
                            {(match.similarity * 100).toFixed(0)}%
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {/* Inspected Fret Details Panel */}
      {inspectedFret && (
        <div className="mt-4 p-3 bg-slate-900/80 border border-slate-700/60 rounded-xl flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-3">
            <span className="text-sky-400 font-bold">
              String {inspectedFret.stringNum} ({GUITAR_STRINGS[inspectedFret.stringNum].tuningNote}) • Fret {inspectedFret.fretNum}
            </span>
            <span className="text-slate-400">
              Note: {midiToNoteName(GUITAR_STRINGS[inspectedFret.stringNum].openMidi + inspectedFret.fretNum)}
            </span>
            <span className="text-slate-400">
              Status:{' '}
              {activeProfile?.fingerprints[`${inspectedFret.stringNum}_${inspectedFret.fretNum}`] ? (
                <span className="text-emerald-400 font-semibold">Calibrated Fingerprint Available</span>
              ) : (
                <span className="text-slate-500">Uncalibrated (Using Physical Prior)</span>
              )}
            </span>
          </div>
          <button
            onClick={() => setInspectedFret(null)}
            className="text-slate-500 hover:text-slate-300 px-2 py-1 rounded bg-slate-800"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
};
