/**
 * Brain Made of Logic — script.js
 *
 * A speculative simulation of a whole "mind" built from McCulloch-Pitts
 * threshold neurons.  NOT a realistic model of the human brain.
 *
 * Model: each neuron sums excitatory inputs, subtracts inhibitory influence,
 * and fires if the weighted sum ≥ threshold θ.  Neurons are grouped into
 * six regions: Perception, Memory, Emotion, Inhibition, Language, Action.
 * Stimuli activate specific regions; parameters change global behaviour.
 *
 * McCulloch, W.S. & Pitts, W. (1943). A Logical Calculus of the Ideas
 * Immanent in Nervous Activity. Bulletin of Mathematical Biophysics, 5, 115–133.
 */

// ── Canvas setup ──────────────────────────────────────────────────────────
const canvas = document.getElementById('brain-canvas');
const ctx    = canvas.getContext('2d');

function resizeCanvas() {
  const wrap = document.getElementById('canvas-wrap');
  canvas.width  = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  layoutNeurons();
  draw();
}

// ── Valence: tracks whether current emotional state is positive or negative ──
// +1 = appetitive/positive, -1 = aversive/negative, 0 = neutral
// Decays toward 0 each tick; set by each stimulus.
let valence = 0;
let valenceDecay = 0;  // counts down ticks before valence fades

// ── Active preset name (used to reinterpret stimuli) ──────────────────────
let currentPreset = 'calm';

// ── Parameters (live-updated from sliders) ────────────────────────────────
const P = {
  threshold:   0.50,   // 0-1: lower = fires more easily
  inhibition:  0.50,   // 0-1: strength of inhibitory connections
  memory:      0.40,   // 0-1: persistence of memory activations
  noise:       0.10,   // 0-1: random misfires
  loop:        0.30,   // 0-1: feedback loop weight
  decay:       0.20,   // 0-1: how fast activity fades
  verbosity:   0.60,   // 0-1: how often thought lines appear
  reactivity:  0.50,   // 0-1: emotional amplification
};

// ── Region definitions ────────────────────────────────────────────────────
const REGIONS = {
  perception: { label: 'Perception', color: '#22d3ee',  count: 12 },
  memory:     { label: 'Memory',     color: '#a78bfa',  count: 10 },
  emotion:    { label: 'Emotion',    color: '#fb923c',  count: 8  },
  inhibition: { label: 'Inhibition', color: '#f43f5e',  count: 8  },
  language:   { label: 'Language',   color: '#34d399',  count: 10 },
  action:     { label: 'Action',     color: '#fbbf24',  count: 8  },
};
const REGION_ORDER = ['perception','memory','emotion','inhibition','language','action'];

// ── Neuron ────────────────────────────────────────────────────────────────
class Neuron {
  constructor(id, region) {
    this.id       = id;
    this.region   = region;
    this.x        = 0;       // set by layoutNeurons()
    this.y        = 0;
    this.active   = false;
    this.energy   = 0;       // 0-1 activation energy
    this.threshold = 0.5;    // individual threshold (varied slightly)
    this.inputs   = [];      // { neuron, weight, inhibitory }
  }
}

// ── Build neurons ─────────────────────────────────────────────────────────
let neurons = [];
let regionNeurons = {};

function buildNetwork() {
  neurons = [];
  regionNeurons = {};
  let id = 0;
  for (const reg of REGION_ORDER) {
    regionNeurons[reg] = [];
    for (let i = 0; i < REGIONS[reg].count; i++) {
      const n = new Neuron(id++, reg);
      // Scatter individual thresholds slightly
      n.threshold = 0.45 + Math.random() * 0.2;
      neurons.push(n);
      regionNeurons[reg].push(n);
    }
  }
  wireNetwork();
}

// ── Wire connections ──────────────────────────────────────────────────────
// Connections follow biological-ish roles:
//   Perception → Memory, Emotion, Language (excitatory)
//   Memory     → Emotion, Language, Action (excitatory) + self-loops
//   Emotion    → Action, Language (excitatory) + Inhibition pathway
//   Inhibition → Emotion, Action, Memory (inhibitory)
//   Language   → Action (excitatory)
//   Action     → (terminal; weak feedback to Perception for attention)
function wireNetwork() {
  // Clear
  for (const n of neurons) n.inputs = [];

  const rnd = (a, b) => Math.random() * (b - a) + a;

  function connectRegions(srcReg, dstReg, excit, density, wMin, wMax) {
    const srcs = regionNeurons[srcReg];
    const dsts = regionNeurons[dstReg];
    for (const d of dsts) {
      for (const s of srcs) {
        if (Math.random() < density) {
          d.inputs.push({ neuron: s, weight: rnd(wMin, wMax), inhibitory: !excit });
        }
      }
    }
  }

  // Within-region recurrence — sparse and weak so decay wins unless stimulated
  for (const reg of REGION_ORDER) {
    const ns = regionNeurons[reg];
    for (const d of ns) {
      for (const s of ns) {
        if (s !== d && Math.random() < 0.12) {
          d.inputs.push({ neuron: s, weight: rnd(0.05, 0.18), inhibitory: false });
        }
      }
    }
  }

  // Cross-region (excitatory)
  connectRegions('perception', 'memory',    true,  0.4, 0.3, 0.7);
  connectRegions('perception', 'emotion',   true,  0.35,0.2, 0.6);
  connectRegions('perception', 'language',  true,  0.3, 0.2, 0.5);
  connectRegions('memory',     'emotion',   true,  0.3, 0.2, 0.5);
  connectRegions('memory',     'language',  true,  0.35,0.2, 0.6);
  connectRegions('memory',     'action',    true,  0.25,0.1, 0.4);
  connectRegions('emotion',    'action',    true,  0.4, 0.2, 0.6);
  connectRegions('emotion',    'language',  true,  0.35,0.2, 0.5);
  connectRegions('language',   'action',    true,  0.35,0.2, 0.5);
  connectRegions('action',     'perception',true,  0.15,0.1, 0.3); // attention feedback

  // Inhibition (inhibitory to everywhere)
  connectRegions('inhibition', 'emotion',   false, 0.5, 0.3, 0.7);
  connectRegions('inhibition', 'action',    false, 0.5, 0.3, 0.7);
  connectRegions('inhibition', 'memory',    false, 0.3, 0.2, 0.5);
  // Only strong emotion (fear/anxiety) activates inhibition — not raw perception
  connectRegions('emotion',    'inhibition',true,  0.2, 0.15, 0.3);
}

// ── Layout neurons in canvas ──────────────────────────────────────────────
// Regions are placed in zones across the canvas.
const REGION_ZONES = {
  perception: { xFrac: 0.08, yFrac: 0.5,  spread: 0.18 },
  memory:     { xFrac: 0.28, yFrac: 0.32, spread: 0.15 },
  emotion:    { xFrac: 0.28, yFrac: 0.7,  spread: 0.15 },
  inhibition: { xFrac: 0.52, yFrac: 0.5,  spread: 0.14 },
  language:   { xFrac: 0.70, yFrac: 0.3,  spread: 0.15 },
  action:     { xFrac: 0.88, yFrac: 0.6,  spread: 0.14 },
};

// Stable random positions seeded per neuron
const seedPositions = {};
function layoutNeurons() {
  const W = canvas.width;
  const H = canvas.height;
  for (const reg of REGION_ORDER) {
    const zone = REGION_ZONES[reg];
    const ns = regionNeurons[reg];
    const cx = W * zone.xFrac;
    const cy = H * zone.yFrac;
    const spread = Math.min(W, H) * zone.spread;
    for (let i = 0; i < ns.length; i++) {
      const n = ns[i];
      if (!seedPositions[n.id]) {
        // Generate stable position once; scale to current canvas on re-layout
        const angle = (i / ns.length) * Math.PI * 2 + Math.random() * 0.4;
        const r = spread * (0.4 + Math.random() * 0.6);
        seedPositions[n.id] = { angle, r, cx: zone.xFrac, cy: zone.yFrac };
      }
      const sp = seedPositions[n.id];
      n.x = W * sp.cx + Math.cos(sp.angle) * Math.min(W, H) * zone.spread * 0.9;
      n.y = H * sp.cy + Math.sin(sp.angle) * Math.min(W, H) * zone.spread * 0.9;
    }
  }
}

// ── Simulation step ───────────────────────────────────────────────────────
let tickCount = 0;

function step() {
  const base_thresh  = 0.3 + P.threshold * 0.5;    // 0.3–0.8
  const inhibStr     = 0.3 + P.inhibition * 0.7;
  const loopW        = P.loop * 0.5;
  const decayRate    = 0.12 + P.decay * 0.35;
  const noiseAmp     = P.noise * 0.25;
  const reactAmp     = 0.6 + P.reactivity * 0.8;   // 0.6–1.4: scales emotion region gain

  const nextEnergy = new Float32Array(neurons.length);

  for (const n of neurons) {
    let excite = 0;
    let blocked = false;

    for (const inp of n.inputs) {
      const src = inp.neuron;
      const contribution = src.energy * inp.weight;
      if (inp.inhibitory) {
        // Hard block only when inhibition is strongly dominant
        if (src.energy >= 0.65) { blocked = true; break; }
        excite -= contribution * inhibStr;
      } else {
        const isSameRegion = src.region === n.region;
        // Reactivity amplifies excitatory drive into emotion neurons
        const reactiveMod = (n.region === 'emotion') ? reactAmp : 1.0;
        excite += contribution * (isSameRegion ? 0.4 + loopW : 1.0) * reactiveMod;
      }
    }

    // Noise
    excite += (Math.random() - 0.5) * noiseAmp;

    let newEnergy;
    if (blocked) {
      // Inhibited: fast collapse
      newEnergy = n.energy * (1 - decayRate * 1.8);
    } else if (excite >= base_thresh * n.threshold * 2) {
      // Fires: gain from input signal only, no free +0.2 bonus
      newEnergy = Math.min(1, n.energy * (1 - decayRate * 0.3) + excite * 0.55);
    } else {
      // Sub-threshold: decay dominates
      newEnergy = Math.max(0, n.energy * (1 - decayRate) + excite * 0.1);
    }

    // Memory persistence: at high memory slider values, energy barely decays.
    // P.memory=0.9 → retains ~90% per tick; 0.4 → retains ~40% (normal decay wins).
    if (n.region === 'memory') {
      const persist = n.energy * (0.5 + P.memory * 0.49);  // 0.5–0.99 range
      newEnergy = Math.max(newEnergy, persist);
    }

    // Preset-specific spontaneous activity
    if (currentPreset === 'obsessive' && (n.region === 'memory' || n.region === 'language')) {
      // Obsessive: rumination — memory/language re-fire from residual activation
      if (n.energy > 0.15 && Math.random() < 0.18) {
        newEnergy = Math.min(1, newEnergy + 0.12);
      }
    } else if (currentPreset === 'dreaming' && (n.region === 'memory' || n.region === 'perception')) {
      // Dreaming: gentle spontaneous drifts through memory and perception
      if (Math.random() < 0.04) {
        newEnergy = Math.min(1, newEnergy + 0.08);
      }
    } else if (currentPreset === 'hallucinatory') {
      // Hallucinatory: any neuron can randomly misfire at significant strength
      if (Math.random() < 0.025) {
        newEnergy = Math.min(1, newEnergy + 0.15 + Math.random() * 0.2);
      }
    }

    nextEnergy[n.id] = Math.max(0, Math.min(1, newEnergy));
  }

  for (const n of neurons) {
    n.energy = nextEnergy[n.id];
    n.active = n.energy > 0.3;
  }

  tickCount++;
  // Reshuffle visible edges periodically so different connections rotate into view
  if (tickCount % 30 === 0) edgeList.sort(() => Math.random() - 0.5);
  // Valence fades gradually — stored as a float 0→1 strength multiplied against sign
  // This avoids the hard cliff where all valence-gated rules simultaneously stop firing
  if (valenceDecay > 0) {
    valenceDecay--;
    // Smoothly reduce valence magnitude in the final 15 ticks
    if (valenceDecay < 15 && valence !== 0) {
      valence = valence * 0.88;
      if (Math.abs(valence) < 0.05) valence = 0;
    }
  }
  document.getElementById('tick-count').textContent = tickCount;
  updateDashboard();
  updateThoughtStream();
  draw();
}

// ── Stimuli ───────────────────────────────────────────────────────────────
// valence: +1 positive/appetitive, -1 negative/aversive, 0 neutral
const STIMULI = {
  food:          { valence: +1, perception:[1],   memory:[0.5], emotion:[0.5], inhibition:[],   language:[0.2], action:[0.4] },
  insult:        { valence: -1, perception:[0.7], memory:[0.4], emotion:[0.8], inhibition:[0.2],language:[0.7], action:[0.4] },
  predator:      { valence: -1, perception:[1],   memory:[0.3], emotion:[0.9], inhibition:[],   language:[0.1], action:[0.9] },
  contradiction: { valence:  0, perception:[0.4], memory:[0.7], emotion:[0.3], inhibition:[0.8],language:[0.9], action:[]   },
  memory:        { valence: +1, perception:[],    memory:[1],   emotion:[0.5], inhibition:[],   language:[0.7], action:[]   },
  praise:        { valence: +1, perception:[0.6], memory:[0.5], emotion:[0.7], inhibition:[0.2],language:[0.9], action:[0.3] },
  pain:          { valence: -1, perception:[1],   memory:[0.2], emotion:[0.9], inhibition:[],   language:[0.3], action:[0.9] },
  name:          { valence: +1, perception:[0.9], memory:[0.5], emotion:[0.4], inhibition:[0.1],language:[0.8], action:[0.2] },
  light:         { valence:  0, perception:[1],   memory:[],    emotion:[0.2], inhibition:[0.4],language:[0.1], action:[0.1] },
  puzzle:        { valence: +1, perception:[0.6], memory:[0.8], emotion:[0.2], inhibition:[0.5],language:[0.8], action:[]   },
};

function injectStimulus(name) {
  const stim = STIMULI[name];
  if (!stim) return;

  const preset = PRESETS[currentPreset] || PRESETS.calm;

  // Determine effective valence: preset can override the stimulus default
  let effectiveValence = stim.valence;
  if (currentPreset === 'hallucinatory') {
    // Hallucinatory: randomly flip or scramble valence
    effectiveValence = [-1, -1, 0, +1][Math.floor(Math.random() * 4)];
  } else if (preset.valenceOverrides && name in preset.valenceOverrides) {
    effectiveValence = preset.valenceOverrides[name];
  }
  valence = effectiveValence;
  valenceDecay = 40;

  // If the preset overrode the stimulus's natural valence, surface it in the thought stream
  const naturalValence = stim.valence;
  if (effectiveValence !== naturalValence) {
    const reinterpretations = {
      paranoid:      { '+1→-1': 'Suspicion overrides positive signal.', '+1→0': 'Positive signal discounted. Unknown motive.', '0→-1': 'Neutral input classified as threat.' },
      distracted:    { '-1→0': 'Threat signal lost in background noise.', '+1→0': 'Signal registered. Already fading.' },
      obsessive:     { '0→-1': 'Neutral pattern triggering prior trauma loop.' },
      rational:      { '-1→0': 'Emotional signal suppressed. Evaluating objectively.', '+1→0': 'Positive bias removed. Neutral analysis.' },
      dreaming:      { '-1→+1': 'Threat dissolved into familiar imagery.', '0→+1': 'Neutral input transformed. Memory warming it.' },
      hallucinatory: { '-1→+1': 'Aversive signal inverted. Strange.', '+1→-1': 'Something wrong with this pleasure signal.' },
      overstimulated:{ '+1→-1': 'Everything is too much. Positive overwhelms.', '0→-1': 'No safe inputs. All stimuli threatening.' },
    };
    const key = `${naturalValence > 0 ? '+1' : naturalValence < 0 ? '-1' : '0'}→${effectiveValence > 0 ? '+1' : effectiveValence < 0 ? '-1' : '0'}`;
    const table = reinterpretations[currentPreset] || {};
    const msg = table[key] || `[${currentPreset}] Stimulus reinterpreted.`;
    const line = `[${tickCount}] ${msg}`;
    thoughtLines.push(line);
    if (thoughtLines.length > 40) thoughtLines.shift();
    // Force immediate render
    const stream = document.getElementById('thought-stream');
    if (stream) {
      const div = document.createElement('div');
      div.className = 'thought-line fresh';
      div.textContent = line;
      stream.appendChild(div);
      stream.scrollTop = stream.scrollHeight;
    }
  }

  for (const reg of REGION_ORDER) {
    const vals = stim[reg];
    if (!vals || vals.length === 0) continue;
    const ns = regionNeurons[reg];

    // Apply region bias from preset (e.g. paranoid amplifies emotion)
    const bias = (preset.regionBias && preset.regionBias[reg]) ?? 1.0;
    const intensity = Math.min(1, vals[0] * bias);

    const count = Math.ceil(ns.length * intensity);
    const shuffled = [...ns].sort(() => Math.random() - 0.5);
    for (let i = 0; i < count; i++) {
      shuffled[i].energy = Math.min(1, shuffled[i].energy + intensity * 0.8 + 0.2);
      shuffled[i].active = true;
    }
  }
}

// ── Presets ───────────────────────────────────────────────────────────────
// Each preset has:
//   - slider values (threshold, inhibition, etc.)
//   - valenceOverrides: map of stimulus name → forced valence (-1/0/+1)
//     overrides the stimulus's default valence for this mental state
//   - regionBias: per-region multiplier applied when injecting stimuli
//     (e.g. paranoid amplifies emotion/action on every stimulus)
const PRESETS = {
  calm: {
    threshold:40, inhibition:70, memory:40, noise:5, loop:20, decay:30, verbosity:40, reactivity:25,
    valenceOverrides: {},
    regionBias: {},
  },
  paranoid: {
    threshold:20, inhibition:20, memory:60, noise:30, loop:70, decay:10, verbosity:80, reactivity:90,
    // Paranoid brain interprets ambiguous/social stimuli as threats
    valenceOverrides: { name:-1, praise:-1, food:0, light:-1, puzzle:-1 },
    // Amplifies fear/threat regions for every stimulus
    regionBias: { emotion:1.4, action:1.3, inhibition:0.5, memory:1.2 },
  },
  distracted: {
    threshold:35, inhibition:30, memory:20, noise:50, loop:40, decay:50, verbosity:50, reactivity:40,
    // Distracted brain doesn't commit to valence — everything is muted
    valenceOverrides: { predator:0, insult:0 },
    regionBias: { perception:0.6, memory:0.5, action:0.6 },
  },
  obsessive: {
    threshold:30, inhibition:15, memory:90, noise:10, loop:90, decay:5, verbosity:70, reactivity:60,
    // Obsessive fixates — negative valence gets stuck and amplified
    valenceOverrides: { insult:-1, contradiction:0 },
    regionBias: { memory:1.5, language:1.4, emotion:1.2 },
  },
  rational: {
    threshold:65, inhibition:80, memory:50, noise:5, loop:20, decay:40, verbosity:60, reactivity:20,
    // Rational brain dampens emotion — everything trends toward neutral
    valenceOverrides: { predator:0, insult:0, pain:-1 },
    regionBias: { emotion:0.4, inhibition:1.3, language:1.2 },
  },
  dreaming: {
    threshold:25, inhibition:10, memory:70, noise:40, loop:80, decay:15, verbosity:70, reactivity:50,
    // Dreaming — positive bias, memory-dominant
    valenceOverrides: { predator:0, pain:0, insult:+1 },
    regionBias: { memory:1.5, emotion:1.1, perception:0.5 },
  },
  hallucinatory: {
    threshold:15, inhibition:5, memory:30, noise:80, loop:90, decay:5, verbosity:90, reactivity:80,
    // Hallucinatory — random valence flip; overrides are randomized at inject time
    valenceOverrides: {},   // handled dynamically in injectStimulus
    regionBias: { perception:1.3, emotion:1.3, language:1.2 },
  },
  overstimulated: {
    threshold:20, inhibition:20, memory:30, noise:60, loop:60, decay:10, verbosity:90, reactivity:90,
    // Everything triggers strong negative reactions
    valenceOverrides: { food:-1, praise:0, name:-1, light:-1, puzzle:-1 },
    regionBias: { emotion:1.4, action:1.3, perception:1.2 },
  },
};

function applyPreset(name) {
  const p = PRESETS[name];
  if (!p) return;
  currentPreset = name;
  const keys = ['threshold','inhibition','memory','noise','loop','decay','verbosity','reactivity'];
  for (const k of keys) {
    const el = document.getElementById('sl-' + k);
    const val = document.getElementById('sv-' + k);
    if (el) { el.value = p[k]; val.textContent = p[k]; P[k] = p[k] / 100; }
  }
}

// ── Dashboard ─────────────────────────────────────────────────────────────
function regionActivity(reg) {
  const ns = regionNeurons[reg];
  if (!ns || ns.length === 0) return 0;
  const sum = ns.reduce((a, n) => a + n.energy, 0);
  return sum / ns.length;
}

const REGION_STATES = {
  perception: ['Quiet','Low stimulus','Attending','Vivid input','Sensory overload'],
  memory:     ['Dormant','Faint echo','Recalling','Active retrieval','Memory flood'],
  emotion:    ['Neutral','Slight arousal','Reactive','High arousal','Overwhelmed'],
  inhibition: ['Uninhibited','Mild control','Regulated','Suppressive','Locked down'],
  language:   ['Silent','Fragmentary','Forming','Verbose','Logorrheic'],
  action:     ['Inert','Preparing','Ready','Urgent','Impulsive'],
};

function regionLabel(reg, val) {
  const tiers = REGION_STATES[reg];
  const idx = Math.min(tiers.length - 1, Math.floor(val * tiers.length));
  return tiers[idx];
}

function updateDashboard() {
  let maxAct = 0; let dominant = 'perception';
  const acts = {};
  for (const reg of REGION_ORDER) {
    const a = regionActivity(reg);
    acts[reg] = a;
    if (a > maxAct) { maxAct = a; dominant = reg; }

    const pct = Math.round(a * 100);
    const fill  = document.getElementById('m-' + reg);
    const label = document.getElementById('mp-' + reg);
    if (fill)  fill.style.width = pct + '%';
    if (label) {
      label.textContent = pct + '%';
      // Show the state tier as a tooltip on the percentage
      const tier = regionLabel(reg, a);
      label.title = tier;
    }
  }

  // Dominant region
  const domEl = document.getElementById('st-dominant');
  if (domEl) {
    domEl.textContent = REGIONS[dominant].label;
    domEl.style.color = REGIONS[dominant].color;
  }

  // System state
  const emo  = acts['emotion'];
  const inhib = acts['inhibition'];
  const loop = acts['memory'] + acts['language'];
  let stateStr = 'Idle';
  if (maxAct < 0.08)           stateStr = 'Idle';
  else if (inhib > 0.65 && acts['action'] < 0.3) stateStr = 'Freezing';
  else if (emo > 0.7 && inhib < 0.3) stateStr = 'Spiraling';
  else if (loop > 0.9)         stateStr = 'Looping';
  else if (maxAct > 0.5)       stateStr = 'Acting';
  else if (maxAct > 0.25)      stateStr = 'Processing';
  else                         stateStr = 'Stabilizing';

  const stEl = document.getElementById('st-state');
  if (stEl) stEl.textContent = stateStr;

  // Dominant badge — also shows active preset
  const badge = document.getElementById('dominant-badge');
  if (badge) {
    const presetTag = currentPreset !== 'calm' ? ` · ${currentPreset}` : '';
    badge.textContent = maxAct > 0.08
      ? REGIONS[dominant].label + ' dominant' + presetTag
      : 'inactive' + presetTag;
    badge.style.color = maxAct > 0.08 ? REGIONS[dominant].color : '';
    badge.style.borderColor = maxAct > 0.08 ? REGIONS[dominant].color + '44' : '';
  }

  // Action output — pass current valence so rules can distinguish positive/negative emotion
  updateActionPanel(acts, stateStr, valence);
}

// ── Thought stream ─────────────────────────────────────────────────────────
const THOUGHT_BANK = {
  perception: [
    'Signal detected in sensory field.',
    'Input registered. Processing...',
    'Pattern at threshold. Attending.',
    'Stimulus confirmed across multiple channels.',
    'Attention drawn to peripheral input.',
    'Sensory overload. Filtering needed.',
  ],
  memory: [
    'Searching prior experience...',
    'Pattern resembles prior encounter.',
    'Memory echo amplifying.',
    'Recognition circuit active.',
    'Episodic trace retrieved.',
    'Memory conflict: two patterns competing.',
    'Looping on unresolved trace.',
  ],
  emotion: [
    'Arousal rising.',
    'Conflict between curiosity and fear.',
    'Valence signal: aversive.',
    'Affective state biasing output.',
    'Emotional reactivity elevated.',
    'Suppression pathway engaged.',
  ],
  inhibition: [
    'Response inhibited.',
    'Action withheld pending evaluation.',
    'Competing activation suppressed.',
    'Control circuit dampening signal.',
    'Freeze state initiated.',
  ],
  language: [
    'Speech formation beginning.',
    'Semantic mapping underway.',
    'Lexical access achieved.',
    'Utterance forming...',
    'Internal narration active.',
    'Labeling the experience.',
  ],
  action: [
    'Motor response favored.',
    'Action selection converging.',
    'Preparing to act.',
    'Behavioral output ready.',
    'Output: orient toward source.',
    'Competing action programs resolving.',
  ],
};

const CROSS_THOUGHTS = [
  'Possible threat detected.',
  'Recognition uncertain. Searching memory.',
  'Attention captured.',
  'Looping on contradiction.',
  'Multiple subsystems in conflict.',
  'State stabilizing. Signal fading.',
  'Cascade propagating through network.',
  'Threshold crossed. All-or-none response.',
  'Inhibition containing spread.',
  'Resonance detected across regions.',
  'Input without resolution. Holding.',
  'Prediction error. Updating model.',
];

// Calm preset thoughts — baseline reflective mind
const CALM_THOUGHTS = [
  'Processing incoming signal.',
  'State within normal parameters.',
  'Input registered. No action required.',
  'Memory scan: no strong matches.',
  'Attention settling.',
  'Signal fading. Returning to baseline.',
  'Evaluation complete.',
];

// Preset-flavored thought fragments injected when a stimulus is reinterpreted
const PRESET_THOUGHTS = {
  paranoid: [
    'Why did they say my name?',
    'Something is wrong. Pattern mismatch.',
    'This could be a trap.',
    'Prior experience suggests deception.',
    'Hyper-vigilance active. Scanning.',
    'Ambiguous signal. Assume threat.',
    'They know. Memory confirms it.',
  ],
  distracted: [
    'Was there a signal? Already forgot.',
    'Multiple inputs. None complete.',
    'Attention fragmented across channels.',
    'Partial activation. Insufficient for action.',
    'Processing interrupted.',
  ],
  obsessive: [
    'Returning to prior stimulus.',
    'Cannot resolve. Loop persisting.',
    'Memory trace will not clear.',
    'Same pattern. Again. Again.',
    'Fixation detected. Unable to shift.',
  ],
  rational: [
    'Evaluating input against prior model.',
    'Emotional signal noted. Discounted.',
    'Logical analysis underway.',
    'Inhibition maintaining output quality.',
    'Bias filtered. Proceeding with evaluation.',
  ],
  dreaming: [
    'Signal dissolving into memory.',
    'Boundary between input and recall: unclear.',
    'Images forming without source.',
    'Recombining prior patterns.',
    'No urgency. Drifting.',
  ],
  hallucinatory: [
    'Is this input or internal generation?',
    'Pattern source unverifiable.',
    'Signal and noise indistinguishable.',
    'Unexpected association firing.',
    'Logic circuit misfiring. Interesting.',
  ],
  overstimulated: [
    'Too much. All channels saturated.',
    'Cannot isolate signal from noise.',
    'Every input feels threatening.',
    'Overwhelmed. Action circuits competing.',
    'Inhibition failing to contain spread.',
  ],
};

let thoughtLines = [];
let thoughtTick = 0;

function updateThoughtStream() {
  thoughtTick++;
  const chance = 0.08 + P.verbosity * 0.25;
  if (Math.random() > chance) return;

  // Pick a thought based on the most active region
  let maxAct = 0; let topReg = 'perception';
  for (const reg of REGION_ORDER) {
    const a = regionActivity(reg);
    if (a > maxAct) { maxAct = a; topReg = reg; }
  }

  let thought;
  if (maxAct < 0.08) return;

  const presetBank = currentPreset === 'calm' ? CALM_THOUGHTS : PRESET_THOUGHTS[currentPreset];
  const roll = Math.random();
  if (presetBank && roll < 0.35) {
    thought = presetBank[Math.floor(Math.random() * presetBank.length)];
  } else if (roll < 0.55) {
    // Bias cross-thoughts toward valence sign
    const pool = valence > 0
      ? CROSS_THOUGHTS.filter(t => !t.includes('threat') && !t.includes('conflict'))
      : valence < 0
        ? CROSS_THOUGHTS.filter(t => t.includes('threat') || t.includes('conflict') || t.includes('error'))
        : CROSS_THOUGHTS;
    const src = pool.length ? pool : CROSS_THOUGHTS;
    thought = src[Math.floor(Math.random() * src.length)];
  } else {
    const bank = THOUGHT_BANK[topReg];
    thought = bank[Math.floor(Math.random() * bank.length)];
  }

  // Prefix with tick
  thought = `[${tickCount}] ${thought}`;
  thoughtLines.push(thought);
  if (thoughtLines.length > 40) thoughtLines.shift();

  // Render
  const stream = document.getElementById('thought-stream');
  stream.innerHTML = '';
  for (let i = 0; i < thoughtLines.length; i++) {
    const div = document.createElement('div');
    div.className = 'thought-line';
    const age = thoughtLines.length - 1 - i;
    if (age === 0) div.classList.add('fresh');
    else if (age <= 3) div.classList.add('mid');
    div.textContent = thoughtLines[i];
    stream.appendChild(div);
  }
  stream.scrollTop = stream.scrollHeight;
}

// ── Action panel ──────────────────────────────────────────────────────────
// Priority order: most specific / highest-signal conditions first.
// Rules receive (acts, v) where v = valence: +1 positive, -1 negative, 0 neutral.
// This is the key fix: same emotion level now yields different actions depending on valence.
const ACTIONS = [
  // ── Negative valence ──
  { label: 'Flee',               cond: (a,v) => v < 0 && a.emotion > 0.55 && a.action > 0.4 && a.inhibition < 0.55 },
  { label: 'Freeze',             cond: (a,v) => v < 0 && a.inhibition > 0.55 && a.action < 0.35 },
  // ── Positive valence ──
  { label: 'Approach',           cond: (a,v) => v > 0 && a.emotion > 0.35 && a.action > 0.25 && a.inhibition < 0.55 },
  { label: 'Speak',              cond: (a,v) => v > 0 && a.language > 0.45 && a.action > 0.2 && a.inhibition < 0.6 },
  // ── Neutral valence ──
  { label: 'Investigate',        cond: (a,v) => v === 0 && a.perception > 0.35 && a.memory > 0.2 && a.inhibition < 0.6 },
  // Continue Looping fires on any valence — memory+language loop is valence-independent
  { label: 'Continue Looping',   cond: (a,v) => a.memory > 0.45 && a.language > 0.38 && a.action < 0.45 },
  { label: 'Suppress Response',  cond: (a,v) => v === 0 && a.inhibition > 0.5 && a.emotion > 0.2 },
  // ── Valence-agnostic fallbacks ──
  { label: 'Recall Memory',      cond: (a,v) => a.memory > 0.5 && a.action < 0.35 },
  { label: 'Turn Toward Source', cond: (a,v) => a.perception > 0.5 && a.action > 0.3 && a.inhibition < 0.55 },
  { label: 'Ignore',             cond: (a,v) => a.inhibition > 0.45 && a.perception < 0.3 },
];

const ACTION_SUBS = {
  'Flee':               'Aversive arousal + action readiness. Escape vector selected.',
  'Freeze':             'Threat detected, inhibition dominant. No output.',
  'Approach':           'Positive valence + action signal. Moving toward stimulus.',
  'Speak':              'Positive state, language active. Verbal output forming.',
  'Investigate':        'Neutral curiosity pathway. Orienting response.',
  'Continue Looping':   'Memory–language loop sustaining. No resolution.',
  'Suppress Response':  'Inhibition overriding competing outputs.',
  'Turn Toward Source': 'Attention circuit → motor command.',
  'Recall Memory':      'Retrieval active. Action deferred.',
  'Ignore':             'Threshold not crossed. Input filtered.',
};

// Debounce: hold an output for at least COMMIT_TICKS before switching
const COMMIT_TICKS = 8;
let committedAction = null;
let commitSince = 0;

function updateActionPanel(acts, stateStr, v) {
  let candidate = null;
  for (const rule of ACTIONS) {
    if (rule.cond(acts, v)) { candidate = rule; break; }
  }

  const mainEl = document.getElementById('action-main');
  const subEl  = document.getElementById('action-sub');
  if (!mainEl) return;

  const allQuiet = Object.values(acts).every(v => v < 0.08);
  if (allQuiet) {
    committedAction = null;
    mainEl.textContent = '—';
    mainEl.style.color = '';
    subEl.textContent = 'No dominant output.';
    return;
  }

  // Only switch if candidate differs AND we've held the current one long enough
  const candidateLabel = candidate ? candidate.label : null;
  if (candidateLabel !== committedAction) {
    if (tickCount - commitSince >= COMMIT_TICKS) {
      committedAction = candidateLabel;
      commitSince = tickCount;
    }
    // else: keep displaying the committed action until hold period expires
  }

  if (!committedAction) {
    mainEl.textContent = '—';
    mainEl.style.color = '';
    subEl.textContent = 'No dominant output.';
    return;
  }

  mainEl.textContent = committedAction.toUpperCase();
  mainEl.style.color = acts.action > 0.5 ? '#fbbf24' :
                       acts.emotion > 0.6 ? '#fb923c' :
                       acts.inhibition > 0.45 ? '#f43f5e' : '#34d399';
  subEl.textContent = ACTION_SUBS[committedAction] || '';
}

// ── Drawing ───────────────────────────────────────────────────────────────
const EDGE_SAMPLE = 120;  // max edges to draw per frame
let edgeList = [];

function buildEdgeList() {
  edgeList = [];
  for (const n of neurons) {
    for (const inp of n.inputs) {
      // Only inter-region edges for clarity
      if (inp.neuron.region !== n.region) {
        edgeList.push({ src: inp.neuron, dst: n, inhib: inp.inhibitory, w: inp.weight });
      }
    }
  }
  // Shuffle so sampling is representative
  edgeList.sort(() => Math.random() - 0.5);
}

function draw() {
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Background subtle grid
  ctx.strokeStyle = 'rgba(30,34,53,0.5)';
  ctx.lineWidth = 0.5;
  const step = 40;
  for (let x = 0; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y = 0; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }

  // Region halos
  for (const reg of REGION_ORDER) {
    const ns = regionNeurons[reg];
    if (!ns) continue;
    const act = regionActivity(reg);
    if (act < 0.05) continue;
    // Rough centroid
    let cx = 0, cy = 0;
    for (const n of ns) { cx += n.x; cy += n.y; }
    cx /= ns.length; cy /= ns.length;
    const r = Math.min(W, H) * REGION_ZONES[reg].spread * 1.15;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const col = REGIONS[reg].color;
    grad.addColorStop(0, col + '15');
    grad.addColorStop(1, col + '00');
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();
  }

  // Edges (sampled subset)
  const sample = edgeList.slice(0, EDGE_SAMPLE);
  for (const e of sample) {
    const srcAct = e.src.energy;
    const dstAct = e.dst.energy;
    const signal = (srcAct + dstAct) / 2;
    if (signal < 0.05) continue;

    const alpha = signal * 0.5;
    const col = e.inhib ? `rgba(244,63,94,${alpha})` : `rgba(74,108,247,${alpha})`;
    ctx.beginPath();
    ctx.moveTo(e.src.x, e.src.y);
    ctx.lineTo(e.dst.x, e.dst.y);
    ctx.strokeStyle = col;
    ctx.lineWidth = 0.8 + signal * 1.5;
    ctx.stroke();
  }

  // Region labels
  ctx.save();
  for (const reg of REGION_ORDER) {
    const ns = regionNeurons[reg];
    if (!ns) continue;
    let cx = 0, cy = 0;
    for (const n of ns) { cx += n.x; cy += n.y; }
    cx /= ns.length; cy /= ns.length;
    const spread = Math.min(W, H) * REGION_ZONES[reg].spread;
    const act = regionActivity(reg);
    ctx.font = '10px Segoe UI, system-ui, sans-serif';
    ctx.fillStyle = act > 0.15 ? REGIONS[reg].color : 'rgba(74,82,112,0.6)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(REGIONS[reg].label.toUpperCase(), cx, cy - spread * 0.95);
  }
  ctx.restore();

  // Neurons
  const nodeR = Math.max(4, Math.min(7, W / 130));
  for (const n of neurons) {
    const e = n.energy;
    const col = REGIONS[n.region].color;

    if (e > 0.05) {
      // Glow
      const grd = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, nodeR * 3);
      grd.addColorStop(0, col + Math.round(e * 120).toString(16).padStart(2,'0'));
      grd.addColorStop(1, col + '00');
      ctx.beginPath();
      ctx.arc(n.x, n.y, nodeR * 3, 0, Math.PI * 2);
      ctx.fillStyle = grd;
      ctx.fill();
    }

    // Core
    ctx.beginPath();
    ctx.arc(n.x, n.y, nodeR, 0, Math.PI * 2);
    const alpha = Math.round((0.15 + e * 0.85) * 255).toString(16).padStart(2,'0');
    ctx.fillStyle = col + alpha;
    ctx.fill();

    if (e > 0.3) {
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
}

// ── Inspect tooltip on click ──────────────────────────────────────────────
canvas.addEventListener('click', (evt) => {
  const rect = canvas.getBoundingClientRect();
  const mx = (evt.clientX - rect.left) * (canvas.width  / rect.width);
  const my = (evt.clientY - rect.top)  * (canvas.height / rect.height);
  const nodeR = Math.max(4, Math.min(7, canvas.width / 130));
  const hit = neurons.find(n => Math.hypot(n.x - mx, n.y - my) < nodeR * 3);
  const tip = document.getElementById('inspect-tooltip');
  if (!hit) { tip.classList.add('hidden'); return; }

  const excCount = hit.inputs.filter(i => !i.inhibitory).length;
  const inhCount = hit.inputs.filter(i => i.inhibitory).length;
  tip.innerHTML =
    `<strong>${REGIONS[hit.region].label} #${hit.id}</strong><br>` +
    `Energy: ${(hit.energy * 100).toFixed(1)}%<br>` +
    `Firing: ${hit.active ? '<span style="color:#22d3ee">yes</span>' : 'no'}<br>` +
    `Threshold: ${(hit.threshold).toFixed(2)}<br>` +
    `Inputs: ${excCount} excit / ${inhCount} inhib`;
  tip.style.left = (evt.clientX - rect.left + 12) + 'px';
  tip.style.top  = (evt.clientY - rect.top  - 10) + 'px';
  tip.classList.remove('hidden');
});
document.addEventListener('click', (e) => {
  if (e.target !== canvas) document.getElementById('inspect-tooltip').classList.add('hidden');
});

// ── Simulation loop ───────────────────────────────────────────────────────
let running = false;
let animId  = null;
const TICK_INTERVAL = 80; // ms
let lastTick = 0;

function loop(ts) {
  if (!running) return;
  if (ts - lastTick >= TICK_INTERVAL) {
    lastTick = ts;
    step();
  }
  animId = requestAnimationFrame(loop);
}

function setRunning(val) {
  running = val;
  const btn = document.getElementById('btn-run');
  const status = document.getElementById('sim-status');
  if (val) {
    btn.textContent = '⏸ Pause';
    btn.classList.add('running');
    status.textContent = '◉ Running';
    status.className = 'sim-status running';
    animId = requestAnimationFrame(loop);
  } else {
    btn.textContent = '▶ Start';
    btn.classList.remove('running');
    status.textContent = '◌ Paused';
    status.className = 'sim-status paused';
    if (animId) cancelAnimationFrame(animId);
  }
}

// ── UI event wiring ───────────────────────────────────────────────────────
document.getElementById('btn-run').addEventListener('click', () => setRunning(!running));
document.getElementById('btn-step').addEventListener('click', () => { if (!running) step(); });
document.getElementById('btn-reset').addEventListener('click', () => {
  for (const n of neurons) { n.energy = 0; n.active = false; }
  tickCount = 0;
  thoughtLines = [];
  committedAction = null;
  commitSince = 0;
  valence = 0;
  valenceDecay = 0;
  document.getElementById('tick-count').textContent = 0;
  document.getElementById('thought-stream').innerHTML = '<div class="thought-placeholder">Awaiting activation…</div>';
  draw();
  updateDashboard();
});
document.getElementById('btn-random').addEventListener('click', () => {
  for (const n of neurons) {
    n.energy = Math.random() < 0.3 ? Math.random() * 0.8 : 0;
    n.active = n.energy > 0.3;
  }
  draw();
  updateDashboard();
});

document.getElementById('preset-select').addEventListener('change', (e) => {
  applyPreset(e.target.value);
});

// Stimulus buttons
document.querySelectorAll('.stim-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    injectStimulus(btn.dataset.stim);
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 600);
    if (!running) { step(); step(); } // Show immediate response
  });
});

// Sliders
const SLIDER_KEYS = ['threshold','inhibition','memory','noise','loop','decay','verbosity','reactivity'];
SLIDER_KEYS.forEach(k => {
  const sl = document.getElementById('sl-' + k);
  const sv = document.getElementById('sv-' + k);
  sl.addEventListener('input', () => {
    sv.textContent = sl.value;
    P[k] = parseInt(sl.value) / 100;
  });
});

// Info modal
document.getElementById('info-btn').addEventListener('click', () => {
  document.getElementById('info-modal').classList.remove('hidden');
});
document.getElementById('info-close').addEventListener('click', () => {
  document.getElementById('info-modal').classList.add('hidden');
});
document.getElementById('info-modal').addEventListener('click', (e) => {
  if (e.target === document.getElementById('info-modal'))
    document.getElementById('info-modal').classList.add('hidden');
});

// ── Init ──────────────────────────────────────────────────────────────────
buildNetwork();
resizeCanvas();
buildEdgeList();
draw();

window.addEventListener('resize', () => {
  resizeCanvas();
  buildEdgeList();
});
