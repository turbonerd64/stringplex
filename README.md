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

Across 16 frets, there are **53 distinct unison pitch classes** where strings clash.

---

## 🔬 The StringPlex V1.2 DSP Master Stack

### 1. Retroactive Dual-Epoch Ring Buffer
* Eliminates the "apples-to-raisins" temporal mismatch.
* The user frets comfortably with a 450 ms hold, while a 200-frame circular ring buffer extracts:
  * **Early Attack-Decay Template ($t \in [25\text{ms}, 95\text{ms}]$):** Captures high-energy transient partials and scrape bursts.
  * **Mid Sustain Template ($t \in [120\text{ms}, 260\text{ms}]$):** Captures steady-state harmonic damping.

### 2. High-Frequency Transient Scrape Discriminator ($HF_{\text{scrape}}$)
* Plucking wound bronze strings (Strings 3–6) catches wrap-wire ridges, producing an instantaneous $4.5\text{kHz}–12\text{kHz}$ burst.
* Plain steel strings (Strings 1–2) exhibit smooth wire profiles with virtually zero high-frequency burst.
* Evaluates $HF_{\text{scrape}} = 20 \log_{10} \frac{E_{4.5-12\text{kHz}}}{E_{80-2500\text{Hz}}}$ to decisively separate wound from plain strings.

### 3. Log-Harmonic Macro Spectral Tilt Detrending
* Fits a linear regression in $\log_2(k)$ space across partials $H_1 \dots H_{12}$ and subtracts the slope $\alpha$.
* Strips macro treble/bass shifts caused by hand position (plucking near bridge vs soundhole) before scoring string gauge.

### 4. 1D Profile-Likelihood Pluck-Comb Deconvolution
* Evaluates candidate excitation comb notches across physical positions $\beta \in [0.06, 0.26]$.
* Employs nodal-notch confidence gating $g_k = \sin^2(k\pi\beta) + \epsilon^2$ to downweight partials that fall inside physical excitation nodes.

### 5. Linearized WLS Inharmonicity ($B$) with Theoretical Blending
* Calculates bending stiffness via linearized Weighted Least Squares:
  $$(f_n / n)^2 = \theta_0 + \theta_1 n^2, \quad B = \theta_1 / \theta_0$$
* Weighted by normalized amplitude SNR $\gamma_n = A_n^2 / \sum A_j^2$ (preventing $n^6$ noise explosions).
* Physics-bounded Fletcher windows capped at $+0.35 f_0$ prevent partial collisions.

### 6. Ground-Truth Unison Benchmark & Auto-Tuner
* Simulates and tests all recorded unisons against competing candidates on the neck.
* Measures **Unison Accuracy %** and **Confidence Separation Margin %**.
* Built-in automated grid search sweeps parameter space in <100ms to discover mathematically optimal weights tailored to the user's exact instrument.

---

## 🚀 Quick Launch
To launch StringPlex, double-click **`launch-stringplex.bat`** in the project folder.

---

## 🧭 Workflow Guide

### 1. Chromatic Calibration Wizard (0–15 Frets)
* Navigate to the **Chromatic Calibration Wizard** tab.
* Pick a string (Strings 6 to 1).
* Pluck Frets 0 through 15 sequentially.
* The system captures early attack and sustain fingerprints with chime confirmation.
* Features a 1-click **Reset All (0/96)** button and per-string reset controls.

### 2. Live Fretboard & Disambiguation
* Switch to the **Fretboard & Disambiguation** tab.
* Play notes naturally with fingerstyle or pick.
* Inspect the **Unison Candidate Disambiguation** leaderboard and **Harmonic Timbre Spectrum** (H1–H12).

### 3. Acoustic Benchmark & Auto-Tuner
* Navigate to the **Acoustic Benchmark & Auto-Tuner** tab.
* Click **`⚡ Run Benchmark`** to audit all recorded unisons.
* Click **`🚀 Auto-Tune to My Guitar`** to run automated parameter optimization and lock in the highest accuracy.
