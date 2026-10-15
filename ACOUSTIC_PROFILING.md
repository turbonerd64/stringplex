# StringPlex: Acoustic Profiling & Guitar String Disambiguation
**Authoritative Documentation on the 96-Note Ground-Truth Fretboard Model**

---

## 1. Executive Summary
StringPlex eliminates the classic guitar MIDI limitation (string ambiguity) by extracting a multi-dimensional harmonic timbre fingerprint for every fret across all 6 strings of a calibrated instrument.

By profiling 16 frets across 6 strings, StringPlex builds a ground-truth dataset of **96 acoustic fingerprints**:

$$\text{Total Fingerprints} = 6 \text{ strings} \times 16 \text{ frets (0 to 15)} = 96 \text{ nodes}$$

---

## 2. The Acoustic Feature Vector

For every note played and recorded during calibration, StringPlex captures a high-resolution feature vector from the steady-state sustain window (40ms to 350ms post-onset):

### A. Normalized Harmonic Vector ($\vec{H} = [h_1, h_2, \dots, h_8]$)
* Extracted via FFT parabolic peak interpolation around integer multiples $k \cdot f_0$.
* Normalized via Euclidean $L_2$-norm:
  $$\|\vec{H}\|_2 = \sqrt{\sum_{k=1}^8 h_k^2} = 1.0$$
* **Volume Invariance:** Because $\vec{H}$ is normalized to unit length, differences in pick velocity (playing softly vs. aggressively) do not distort the harmonic ratios.

### B. Spectral Centroid ($f_{\text{centroid}}$)
* Represents the acoustic center of mass:
  $$f_{\text{centroid}} = \frac{\sum_{i} f_i \cdot |X(i)|}{\sum_{i} |X(i)|}$$
* Differentiates thick wound strings from thinner plain strings producing the same pitch. A thinner string fretted lower maintains higher energy in partials 3 through 8, yielding a significantly higher spectral centroid.

### C. Inharmonicity Bending Stiffness Factor ($B$)
* Steel and nickel guitar strings are physical cylinders with non-zero bending stiffness ($EI$). Overtones are pulled sharp relative to ideal mathematical harmonics:
  $$f_n \approx n f_0 \sqrt{1 + B n^2}, \quad \text{where } B \propto \frac{d^4}{L^2}$$
* **The Unison Disambiguator:** A thicker string fretted high up (e.g. String 6 Fret 12 vs String 4 Fret 2 for $E_3$) has a shorter vibrating length $L$ and much larger core diameter $d$, resulting in an order-of-magnitude higher $B$ coefficient.

### D. Harmonic Energy Ratios ($H_1 / H_2$, $H_1 / H_3$)
* Fundamental to second harmonic ratio. Shorter, thicker strings push initial energy into the second harmonic, while longer strings exhibit stronger fundamental prominence.

---

## 3. Disambiguation Scoring Equation

When a live note is played at fundamental frequency $f_0$, StringPlex looks up all physical $(s, f)$ candidate positions and computes a composite similarity score:

$$S_{\text{composite}} = 0.65 \cdot S_{\text{cosine}} + 0.25 \cdot S_{\text{centroid}} + 0.10 \cdot S_{\text{inharmonicity}}$$

Where:
* **$S_{\text{cosine}} = \vec{H}_{\text{live}} \cdot \vec{H}_{\text{calibrated}}$** (Dot product of normalized unit vectors)
* **$S_{\text{centroid}} = \exp\left(-\frac{|\text{Centroid}_{\text{live}} - \text{Centroid}_{\text{cal}}|}{600}\right)$**
* **$S_{\text{inharmonicity}} = \frac{\min(B_{\text{live}}, B_{\text{cal}})}{\max(B_{\text{live}}, B_{\text{cal}})}$**

---

## 4. Backing Up & Preserving Your Calibration Profile

### 1-Click Export:
Click the **`💾 Backup (96/96)`** button in the StringPlex header or calibration tab. This:
1. Downloads a timestamped JSON file (e.g., `stringplex-primary-guitar-96notes-2026-10-16.json`).
2. Copies the raw JSON string directly to your clipboard.

### Permanent Repository Archive:
To permanently bundle your profile into StringPlex source control:
1. Move the downloaded JSON file into `c:\Users\Arman\OneDrive\Documents\code\stringplex\profiles\`.
2. Commit it to git or keep it safely backed up on OneDrive.
3. You can restore your calibration at any time on any device via **Settings $\rightarrow$ Import Profile JSON**.
