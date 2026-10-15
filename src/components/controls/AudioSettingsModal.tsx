// src/components/controls/AudioSettingsModal.tsx
import React, { useEffect, useState } from 'react';
import { useStringplexStore } from '../../store/useStringplexStore';
import {
  X,
  Mic,
  Sliders,
  SlidersHorizontal,
  Volume2,
  FolderDown,
  FolderUp,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';

interface AudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AudioSettingsModal: React.FC<AudioSettingsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    audioDevices,
    selectedDeviceId,
    refreshAudioDevices,
    setSelectedDeviceId,
    detectorConfig,
    updateDetectorConfig,
    liveFrame,
    profiles,
    activeProfileId,
    setActiveProfileId,
    createProfile,
    deleteProfile,
    exportActiveProfileJson,
    importProfileJson,
    clearAllFingerprints,
  } = useStringplexStore();

  const [newProfileName, setNewProfileName] = useState('');
  const [newGuitarModel, setNewGuitarModel] = useState('');
  const [showNewProfileForm, setShowNewProfileForm] = useState(false);
  const [importStatus, setImportStatus] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      refreshAudioDevices();
    }
  }, [isOpen, refreshAudioDevices]);

  if (!isOpen) return null;

  const currentRms = liveFrame?.rmsDb ?? -100;
  const gateDb = detectorConfig.gateThresholdDb;
  const isGateOpen = currentRms > gateDb;

  const handleExport = () => {
    const jsonStr = exportActiveProfileJson();
    if (!jsonStr) return;
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stringplex-profile-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const success = importProfileJson(content);
      setImportStatus(success ? 'Profile imported successfully!' : 'Failed to import JSON file');
      setTimeout(() => setImportStatus(null), 3000);
    };
    reader.readAsText(file);
  };

  const handleCreateProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProfileName.trim()) return;
    createProfile(newProfileName.trim(), newGuitarModel.trim() || 'Electric Guitar', 'Bridge');
    setNewProfileName('');
    setNewGuitarModel('');
    setShowNewProfileForm(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="bg-[#0f1420] border border-slate-700/80 rounded-2xl w-full max-w-xl shadow-2xl p-6 overflow-y-auto max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-sky-400" />
            <h3 className="text-lg font-bold text-slate-100">Audio & Profile Settings</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-6 pt-5">
          {/* Section 1: Audio Input Device */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block mb-2">
              Audio Input Device
            </label>
            <div className="relative">
              <select
                value={selectedDeviceId || ''}
                onChange={(e) => setSelectedDeviceId(e.target.value || null)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-sky-400 appearance-none"
              >
                <option value="">Default Audio Device</option>
                {audioDevices.map((d) => (
                  <option key={d.deviceId} value={d.deviceId}>
                    {d.label || `Device (${d.deviceId.slice(0, 8)}...)`}
                  </option>
                ))}
              </select>
              <Mic className="w-4 h-4 text-slate-500 absolute right-3 top-3 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1">
              Select your Spark 40 USB, audio interface, or clean microphone.
            </p>
          </div>

          {/* Section 2: Input Pre-Amp Gain (+0 to +30 dB) */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-300">Pre-Amp Software Gain</span>
              <span className="font-mono text-sky-400 font-bold">
                {detectorConfig.inputGainDb >= 0 ? `+${detectorConfig.inputGainDb}` : detectorConfig.inputGainDb} dB
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="30"
              step="1"
              value={detectorConfig.inputGainDb}
              onChange={(e) => updateDetectorConfig({ inputGainDb: parseFloat(e.target.value) })}
              className="w-full accent-sky-400 cursor-pointer"
            />
            <p className="text-[11px] text-slate-500">
              Boost low-level signals from guitar USB inputs for clean harmonic resolution.
            </p>
          </div>

          {/* Section 3: Noise Gate Threshold */}
          <div>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="font-bold text-slate-300">RMS Noise Gate Threshold</span>
              <span className="font-mono text-amber-400 font-bold">
                {detectorConfig.gateThresholdDb} dB
              </span>
            </div>
            <input
              type="range"
              min="-60"
              max="-20"
              step="1"
              value={detectorConfig.gateThresholdDb}
              onChange={(e) => updateDetectorConfig({ gateThresholdDb: parseFloat(e.target.value) })}
              className="w-full accent-amber-400 cursor-pointer"
            />
            <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1">
              <span>Hiss Cutoff</span>
              <span className={isGateOpen ? 'text-emerald-400 font-bold' : 'text-slate-500'}>
                {isGateOpen ? 'GATE OPEN (Signal Passed)' : 'GATE CLOSED (Hiss Blocked)'}
              </span>
            </div>

            {/* Live Meter */}
            <div className="mt-2 h-2.5 bg-slate-900 rounded-full overflow-hidden border border-slate-800 relative">
              <div
                className={`h-full transition-all duration-75 ${
                  isGateOpen ? 'bg-emerald-400' : 'bg-slate-600'
                }`}
                style={{
                  width: `${Math.max(0, Math.min(100, ((currentRms + 80) / 80) * 100))}%`,
                }}
              />
              {/* Gate threshold marker */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10"
                style={{
                  left: `${Math.max(0, Math.min(100, ((gateDb + 80) / 80) * 100))}%`,
                }}
              />
            </div>
          </div>

          {/* Section 4: Calibration Profiles */}
          <div className="pt-4 border-t border-slate-800">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Active Guitar Calibration Profile
              </label>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleExport}
                  title="Export active profile JSON"
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 transition-colors"
                >
                  <FolderDown className="w-3.5 h-3.5" />
                  <span>Export</span>
                </button>

                <label
                  title="Import profile JSON"
                  className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <FolderUp className="w-3.5 h-3.5" />
                  <span>Import</span>
                  <input type="file" accept=".json" onChange={handleImport} className="hidden" />
                </label>
              </div>
            </div>

            {importStatus && (
              <div className="mb-3 p-2 bg-emerald-500/20 text-emerald-300 text-xs rounded-lg font-mono">
                {importStatus}
              </div>
            )}

            <div className="space-y-2 mb-3">
              {profiles.map((p) => {
                const isActive = p.id === activeProfileId;
                const count = Object.keys(p.fingerprints || {}).length;

                return (
                  <div
                    key={p.id}
                    onClick={() => setActiveProfileId(p.id)}
                    className={`
                      p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-all
                      ${
                        isActive
                          ? 'bg-sky-500/15 border-sky-400 text-slate-100'
                          : 'bg-slate-900/50 border-slate-800 text-slate-400 hover:bg-slate-800/50'
                      }
                    `}
                  >
                    <div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        <span>{p.name}</span>
                        {isActive && <Check className="w-3.5 h-3.5 text-sky-400" />}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        {p.guitarModel} • {count} notes calibrated
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {count > 0 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Wipe all ${count} recorded notes for "${p.name}"?`)) {
                              clearAllFingerprints();
                            }
                          }}
                          className="px-2 py-0.5 rounded text-[11px] font-bold bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20 transition-colors"
                          title="Wipe notes and reset to 0"
                        >
                          Reset to 0
                        </button>
                      )}

                      {profiles.length > 1 && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProfile(p.id);
                          }}
                          className="text-slate-500 hover:text-rose-400 p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {!showNewProfileForm ? (
              <button
                onClick={() => setShowNewProfileForm(true)}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-dashed border-slate-700 text-slate-300 font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Create New Guitar Profile</span>
              </button>
            ) : (
              <form onSubmit={handleCreateProfile} className="bg-slate-900/80 p-3 rounded-xl border border-slate-700 space-y-2">
                <input
                  type="text"
                  placeholder="Profile Name (e.g. Fender Strat - Bridge)"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                />
                <input
                  type="text"
                  placeholder="Guitar Model (e.g. Stratocaster)"
                  value={newGuitarModel}
                  onChange={(e) => setNewGuitarModel(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-400"
                />
                <div className="flex gap-2 justify-end pt-1">
                  <button
                    type="button"
                    onClick={() => setShowNewProfileForm(false)}
                    className="px-3 py-1 bg-slate-800 text-slate-400 text-xs rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-sky-500 text-slate-950 font-bold text-xs rounded-lg"
                  >
                    Save Profile
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 pt-4 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold rounded-xl text-xs shadow-lg shadow-sky-500/20 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
