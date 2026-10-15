# StringPlex 🎸
**Real-Time Acoustic Guitar Timbre & Unison String Disambiguation Engine**

StringPlex is an advanced physical acoustics & MIR (Music Information Retrieval) engine designed to solve the classic guitar computing problem: **determining which physical string and fret a note was played on from a single monophonic audio channel.**

---

## ⚡ The Core Problem: Fretboard Unison Ambiguity

On a keyboard, each pitch corresponds to exactly one physical key. On a guitar, multiple physical positions produce identical fundamental frequencies ($f_0$):
* $D_4$ (293.7 Hz) can be played on:
  * String 1 (High E), Fret 10
  * String 2 (B), Fret 15
  * String 3 (G), Fret 7

Across the first 16 frets, there are **53 distinct unison pitch collisions**. Conventional audio-to-MIDI converters pick strings using naive heuristics (like lowest fret), producing unplayable fingerings and ruining expressive performance.

StringPlex profiles a ground-truth dataset of **96 acoustic fingerprints** (6 strings $\times$ 16 frets) across six physical acoustic dimensions to disambiguate unisons with high confidence.

---

## 🔬 The StringPlex V1.2 DSP Master Stack

```
                               ┌────────────────────────────────┐
                               │  RAW MONOPHONIC AUDIO STREAM   │
                               └───────────────┬────────────────┘
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │  GuitarPitchDetector             │
                              │  • smoothingTimeConstant = 0.0   │
                              │  • 200-frame circular buffer     │
                              │  • Retroactive 2-Epoch extraction│
                              └───────────────┬──────────────────┘
                                               │
               ┌───────────────────────────────┴───────────────────────────────┐
               ▼                                                               ▼
┌───────────────────────────────┐                             ┌───────────────────────────────┐
│     ATTACK / TRANSIENT        │                             │    12-HARMONIC SPECTRUM       │
│ • Fingernail Scrape (4.5-12k) │                             │ • Weighted Mean-Centering     │
│ • Spectral Rolloff (f_85%)    │                             │ • Macro Log-Tilt Detrending   │
│ • Initial H1 / H2 Ratio       │                             │ • 1D Pluck Comb Deconvolution │
└──────────────┬────────────────┘                             └───────────────┬───────────────┘
               │                                                              │
               └───────────────────────────────┬──────────────────────────────┘
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │  Context-Aware Clustered Scoring │
                              │  • plain-vs-wound   • wound-wound│
                              │  • plain-vs-plain   • Softmax (T)│
                              └───────────────┬──────────────────┘
                                               │
                                               ▼
                              ┌──────────────────────────────────┐
                              │   GROUND-TRUTH STRING & FRET     │
                              └──────────────────────────────────┘
```

### 1. Retroactive Dual-Epoch Ring Buffer
* **Eliminates the "apples-to-raisins" temporal mismatch:** The user holds a note comfortably for 450 ms during calibration, while a 200-frame circular ring buffer retroactively extracts:
  * **Early Attack-Decay Template ($t \in [25\text{ms}, 95\text{ms}]$):** Captures high-energy transient partials and fingernail scrape bursts.
  * **Mid Sustain Template ($t \in [120\text{ms}, 260\text{ms}]$):** Captures steady-state harmonic damping and inharmonicity.
* Matches fresh plucks against fresh plucks in real time.

### 2. High-Frequency Transient Scrape Burst ($HF_{\text{scrape}}$)
* Plucking wound bronze strings (Strings 3–6) catches wrap-wire ridges, producing an instantaneous $4.5\text{kHz}–12\text{kHz}$ metallic scrape burst.
* Plain steel strings (Strings 1–2) exhibit smooth wire profiles with virtually zero scrape energy.
* Decisively separates plain from wound strings in the first 2–15 ms post-onset.

### 3. Spectral Rolloff Frequency ($f_{\text{rolloff}}$)
* Tracks the frequency threshold containing **85% of total spectral power**.
* Plain steel strings sustain harmonic energy up to **6.0 – 8.5 kHz**, while wound strings attenuate steeply above **2.5 – 3.5 kHz** due to internal wrap friction.

### 4. Fundamental-to-Second Harmonic Ratio ($H_1 / H_2$)
* Resolves **wound-vs-wound** collisions (e.g. Low E String 6 Fret 12 vs D String 4 Fret 2).
* Shorter, thicker strings fretted high on the neck experience fundamental boundary compliance suppression ($H_1$ is suppressed, making $H_2$ dominate).

### 5. Inharmonicity ($B$) via Joint Linearized WLS & Physics Blending
* Estimates string stiffness via joint Weighted Least Squares:
  $$\left(\frac{f_n}{n}\right)^2 = \theta_0 + \theta_1 n^2 \implies f_0 = \sqrt{\theta_0}, \quad B = \frac{\theta_1}{\theta_0}$$
* Weighted by normalized amplitude SNR $\gamma_n = A_n^2 / \sum A_j^2$ (preventing high-harmonic noise explosions).
* Blended with theoretical gauge scaling $B_{\text{theo}}(s, f) = B_0(s) \cdot 2^{f/6}$.

### 6. Pluck-Position Invariance via Comb Deconvolution
* Evaluates 25 candidate pluck positions $\beta \in [0.06, 0.26]$ with nodal confidence gating $g_k = \sin^2(k\pi\beta) + 0.05$.
* Log-harmonic detrending removes treble/bass slopes caused by hand position.

### 7. Context-Aware Clustered Scoring
* Automatically classifies clash typology (`plain-vs-wound`, `wound-vs-wound`, `plain-vs-plain`) and applies dynamic feature multipliers to emphasize the physics-relevant discriminators.

---

## 🛠️ Ground-Truth Benchmark & Auto-Tuner

Tab 3 (**Acoustic Benchmark & Auto-Tuner**) includes a complete laboratory suite:
* **Unison Evaluation Matrix:** Simulates and scores every recorded note against its rival unison candidates on your fretboard.
* **Auto-Tune to My Guitar:** Sweeps a multi-dimensional parameter grid across all 6 physical acoustic features to find the mathematically optimal weights for your specific instrument and playing style.
* **Interactive Unison Contrast Inspector:** Clicking any row in the Unison Matrix opens a side-by-side diagnostic drawer showing:
  * Differential metrics ($\Delta \text{Scrape}$, $\Delta \text{Rolloff}$, $\Delta B$, $\Delta H_1/H_2$).
  * Sub-feature proximity scores for all competing candidates.
  * Overlaid **12-Harmonic energy profile bar chart ($H_1 \dots H_{12}$)**.

---

## 🚀 Quick Launch (Zero Terminal Required)

To launch StringPlex, double-click **`launch-stringplex.bat`** in the project folder.

The launcher starts the dev server and automatically opens `http://localhost:5174` in your default browser.

---

## 🧭 Step-by-Step Workflow

### Step 1: Chromatic Calibration Wizard (0–15 Frets)
1. Go to the **Chromatic Calibration Wizard** tab.
2. Select a string (Strings 6 through 1).
3. Play Frets 0 through 15 sequentially.
4. The system automatically records the early-attack and sustain fingerprints with visual and audio chime feedback.
5. Use **`💾 Backup`** to export your completed profile to JSON.

### Step 2: Auto-Tune Hyperparameters
1. Go to the **Acoustic Benchmark & Auto-Tuner** tab.
2. Click **`⚡ Run Benchmark`** to audit all unisons on your neck.
3. Click **`🚀 Auto-Tune to My Guitar`** to sweep parameter space and lock in optimal weights.
4. Click any unison row to inspect acoustic feature deltas in the **Unison Contrast Inspector**.

### Step 3: Real-Time Performance & Disambiguation
1. Switch to the **Fretboard & Disambiguation** tab.
2. Play any note on your guitar.
3. The engine instantly resolves the exact string and fret, displaying the winning confidence margin, candidate leaderboard, and live 12-harmonic spectrum.

---

## 📚 Technical Documentation
* [`ACOUSTIC_PROFILING.md`](file:///C:/Users/Arman/OneDrive/Documents/code/stringplex/ACOUSTIC_PROFILING.md) — Authoritative mathematical and architectural specification of the acoustic vector and scoring equations.
