# StringPlex V1.2: Acoustic Profiling & Disambiguation Engine
**Authoritative Architectural & Mathematical Specification for the 96-Note Ground-Truth Fretboard Model**

---

## 1. Executive Summary & Problem Topology

On a standard piano keyboard, every musical pitch maps bijectively to a single physical key. On a 6-string guitar with standard tuning ($E_2, A_2, D_3, G_3, B_3, E_4$), the mapping is non-injective: **multiple string-and-fret coordinates produce identical fundamental frequencies ($f_0$).**

For example, $D_4$ ($293.7\text{ Hz}$) can be produced at:
* String 1 (High E), Fret 10
* String 2 (B), Fret 15
* String 3 (G), Fret 7

Across the first 16 frets (Frets 0 to 15), there are **53 distinct unison pitch collisions**. Conventional audio-to-MIDI converters rely solely on pitch detection, leaving string selection to naive heuristics (such as lowest fret position), resulting in unplayable fingerings, poor musical voice leading, and broken expressive dynamics.

StringPlex solves this problem monophonically from a single audio channel by profiling a high-resolution, multi-dimensional **Harmonic Timbre Fingerprint** for every fret on the instrument:

$$\text{Total Calibrated Nodes} = 6 \text{ strings} \times 16 \text{ frets (0 to 15)} = 96 \text{ acoustic fingerprints}$$

---

## 2. The Multi-Dimensional Acoustic Feature Vector

For every note evaluated—both during calibration and live performance—StringPlex extracts a comprehensive 12-harmonic acoustic feature vector $\mathbf{v}$ containing six independent physical discriminators:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        HARMONIC TIMBRE VECTOR                          │
├─────────────────────────┬──────────────────────┬───────────────────────┤
│ Harmonic Spectrum       │ Macro Pluck Dynamics │ Core Wire Physics     │
│ • H1 .. H12 Amplitudes  │ • Spectral Tilt (α)  │ • Inharmonicity (B)   │
│ • Mean-Centered dB      │ • Pluck Pos (β grid) │ • Rolloff (f_85%)     │
│ • Tilt-Detrended dB     │ • Nail Scrape Burst  │ • H1 / H2 Ratio       │
│ • High-Res Centroid     │ • Nodal Comb Gating  │ • Nut Boundary Prior  │
└─────────────────────────┴──────────────────────┴───────────────────────┘
```

### A. 12-Harmonic Spectrum with Mean-Centering
Rather than tracking only 6 or 8 partials, StringPlex tracks the first 12 harmonics ($H_1 \dots H_{12}$):
1. **Peak Interpolation:** Partials are extracted using parabolic interpolation around candidate bins:
   $$k \cdot f_0 \cdot \sqrt{1 + B k^2}$$
   Bounded by a strict Fletcher search window capped at $\pm 0.35 f_0$ to prevent partial search overlap between adjacent upper harmonics (e.g. $H_{11}$ vs $H_{12}$).
2. **Weighted Mean-Centering:** Eliminates the classic single-point anchor trap of normalizing to $H_1$ (which amplifies variance whenever $H_1$ is suppressed):
   $$\bar{H}_{\text{weighted}} = \frac{\sum_{k=1}^{12} w_k H_{\text{raw}}[k]}{\sum_{k=1}^{12} w_k}, \quad \tilde{H}[k] = H_{\text{raw}}[k] - \bar{H}_{\text{weighted}}$$

### B. Macro Spectral Tilt Detrending (Pluck-Position Invariance)
Plucking closer to the bridge increases upper harmonic energy across the board, which can cause a thick string to impersonate a thinner one. To achieve pluck-position invariance:
1. StringPlex fits a weighted linear regression in $\log_2(k)$ space across partials $H_1 \dots H_{12}$:
   $$u_k = \log_2(k) - \bar{u}, \quad \alpha = \frac{\sum w_k u_k \tilde{H}[k]}{\sum w_k u_k^2}$$
2. The linear slope $\alpha$ is subtracted, producing the tilt-detrended residual vector $\hat{H}[k] = \tilde{H}[k] - \alpha u_k$, leaving only the intrinsic string body and boundary resonance signature.

### C. 1D Profile-Likelihood Comb Deconvolution
A pluck at relative position $\beta = x_{\text{pluck}} / L \in [0.06, 0.26]$ creates comb filter notches where $\sin(k \pi \beta) = 0$. StringPlex performs a fast 1D grid search across 25 candidate $\beta$ positions:
* **Log-Comb Template:** $C_k(\beta) = 20 \log_{10}(\max(0.12, |\sin(k \pi \beta)|))$
* **Nodal-Notch Confidence Gating:** $g_k(\beta) = \sin^2(k \pi \beta) + 0.05$
Harmonics sitting inside an excitation node are down-weighted rather than penalized, preventing false mismatches from plucking over a nodal point.

### D. High-Frequency Transient Scrape Burst ($HF_{\text{scrape}}$)
When a fingernail or plectrum excites a string:
* **Plain Steel Strings (Strings 1 & 2):** Smooth surface produces a single glassy impulse; high-frequency energy above 4.5 kHz is low ($HF_{\text{scrape}} \approx -20\text{ to }-24\text{ dB}$).
* **Phosphor Bronze Wound Strings (Strings 3–6):** The edge microscopically catches across the wire ridges, producing a 2–12 ms metallic scrape burst between 4.5 kHz and 12 kHz ($HF_{\text{scrape}} \approx -6\text{ to }-12\text{ dB}$).
* **Metric:**
  $$HF_{\text{scrape}} = 20 \log_{10}\left( \frac{\max(10^{-5}, \text{Energy}_{4.5\text{kHz}–12\text{kHz}})}{\max(10^{-5}, \text{Energy}_{80\text{Hz}–2.5\text{kHz}})} \right)$$

### E. Spectral Rolloff Frequency ($f_{\text{rolloff}}$)
The frequency below which **85% of total spectral power** is concentrated:
$$\sum_{f=0}^{f_{\text{rolloff}}} |X(f)|^2 = 0.85 \sum_{f=0}^{f_s/2} |X(f)|^2$$
* Plain steel strings maintain ringing power up to **6.0 – 8.5 kHz**.
* Wound strings attenuate steeply above **2.5 – 3.5 kHz** due to internal friction between the core and wrap wires.

### F. Fundamental-to-Second Harmonic Energy Ratio ($H_1 / H_2$)
Resolves deep **wound-vs-wound** collisions (e.g., Low E String 6 Fret 12 vs D String 4 Fret 2):
* Shorter, thicker strings fretted high on the neck experience strong boundary compliance suppression on the fundamental mode ($H_1$), causing the second harmonic ($H_2$) to dominate.
* Longer, thinner strings fretted lower produce a balanced fundamental.

### G. Inharmonicity Stiffness ($B$) via Joint Linearized WLS
Bending stiffness ($EI$) pulls overtones sharp relative to integer multiples:
$$f_n = n f_0 \sqrt{1 + B n^2}, \quad B = \frac{\pi^3 Q d^4}{64 T L^2}$$
StringPlex estimates $B$ and true zero-stiffness fundamental $f_0$ using a joint linearized Weighted Least Squares formulation:
$$\left(\frac{f_n}{n}\right)^2 = \theta_0 + \theta_1 n^2 \implies f_0 = \sqrt{\theta_0}, \quad B = \frac{\theta_1}{\theta_0}$$
* **SNR Weighting:** Weighted strictly by amplitude power $\gamma_n = A_n^2 / \sum A_j^2$ (eliminating the catastrophic $n^6$ noise explosion of unweighted regressions).
* **Physics Prior Blending:** Blends empirical $B$ with theoretical physical scaling:
  $$B_{\text{target}} = 0.5 B_{\text{empirical}} + 0.5 B_{\text{theoretical}}(s, f), \quad B_{\text{theoretical}}(s, f) = B_0(s) \cdot 2^{f/6}$$

---

## 3. Context-Aware Clustered Scoring Engine

Instead of applying a single static set of weights across all unisons—which compromises accuracy—StringPlex dynamically detects the **clash typology** of competing candidates and adjusts feature weight multipliers ($m$):

| Clash Typology | Physical Conflict | Dominant Acoustic Discriminators | Weight Multipliers Applied |
| :--- | :--- | :--- | :--- |
| **`plain-vs-wound`** | Plain Steel vs Phosphor Bronze (e.g. Str 2 vs Str 3) | Nail Scrape Burst ($HF_{\text{scrape}}$) & Spectral Rolloff ($f_{\text{rolloff}}$) | $m_{\text{scrape}} = 1.4$, $m_{\text{rolloff}} = 1.35$, $m_{\text{inharm}} = 0.75$, $m_{H1H2} = 0.7$ |
| **`wound-vs-wound`** | Thick fretted vs thin open/low wound (e.g. Str 6 F12 vs Str 4 F2) | Inharmonicity ($B$) & Fundamental Suppression ($H_1/H_2$) | $m_{\text{inharm}} = 1.45$, $m_{H1H2} = 1.4$, $m_{\text{scrape}} = 0.4$, $m_{\text{rolloff}} = 0.7$ |
| **`plain-vs-plain`** | Plain Steel vs Plain Steel (Strings 1 & 2) | 12-Harmonic pattern & macro spectral slope detrending | $m_{\text{harmonic}} = 1.25$, $m_{\text{centroid}} = 1.2$, $m_{\text{scrape}} = 0.5$, $m_{\text{rolloff}} = 0.8$ |

### Composite Similarity Formulation:
For candidate $c$:
$$\text{Score}_{\text{raw}} = \sum_{i} (w_i \cdot m_i) \cdot \text{Proximity}_i + (w_{\text{nut}} \cdot m_{\text{nut}}) \cdot \mathbb{I}_{\text{openNut}}$$

### Softmax Temperature Contrast:
To ensure crisp categorical string selection while maintaining calibrated confidence:
$$P(c_i) = \frac{\exp(\text{Score}_i / T)}{\sum_j \exp(\text{Score}_j / T)}, \quad T = 0.10$$

---

## 4. Retroactive Dual-Epoch Ring Buffer Architecture

Conventional calibrators require holding a note for 450 ms, saving a snapshot of decaying, mellow harmonics. Live detection, however, must recognize strings within the first 25–95 ms—when wound strings are bursting with bright upper harmonics.

To permanently eliminate this temporal mismatch:
1. `GuitarPitchDetector` maintains a rolling **200-frame circular ring buffer** in un-smeared Web Audio space (`smoothingTimeConstant = 0.0`).
2. When the user plucks a note during calibration, StringPlex retroactively extracts:
   * **Early Attack-Decay Vector ($t \in [25\text{ms}, 95\text{ms}]$):** Captures the initial transient attack, nail scrape burst, and bright upper harmonics.
   * **Mid Sustain Vector ($t \in [120\text{ms}, 260\text{ms}]$):** Captures steady-state modal damping and stable inharmonicity.
3. Live notes are matched against the corresponding early-attack vectors, comparing fresh plucks to fresh plucks.

---

## 5. Ground-Truth Acoustic Benchmark & Auto-Tuner

Tab 3 (**Acoustic Benchmark & Auto-Tuner**) provides a complete laboratory environment:
1. **Unison Evaluation Matrix:** Simulates and scores every calibrated note against its real-world fretboard rivals.
2. **6-Dimensional Hyperparameter Sweeper:** Evaluates thousands of weight permutations in <100ms:
   * Harmonic Match ($w_h$)
   * Nail Scrape Burst ($w_s$)
   * Spectral Rolloff ($w_{\text{roll}}$)
   * $H_1 / H_2$ Energy Ratio ($w_{12}$)
   * Inharmonicity $B$ ($w_B$)
   * Contrast Temperature ($T$)
   Maximizes:
   $$\text{Fitness} = \text{Accuracy}\% \times 100 + \text{AvgMargin}\% \times 5$$
3. **Interactive Unison Contrast Inspector:** Clicking any unison row opens a slide-over drawer displaying:
   * Ground Truth vs Competitor physical readouts ($\Delta \text{Scrape}$, $\Delta \text{Rolloff}$, $\Delta B$, $\Delta H_1/H_2$).
   * Full sub-feature breakdown.
   * Overlaid **12-Harmonic energy profile bar chart ($H_1 \dots H_{12}$)**.

---

## 6. Profile Persistence & Backup

Calibration profiles are stored locally via `stringplex_profiles_v2` and `stringplex_weights_v2`.

* **1-Click Backup:** Export timestamped JSON via the **`💾 Backup`** button.
* **Cold Storage:** Copy exported JSON profiles to `src/profiles/` or version-control in git.
* **1-Click Restore:** Import any valid profile via **Settings $\rightarrow$ Import Profile JSON**.
