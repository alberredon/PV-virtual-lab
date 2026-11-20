/* =========================================================
   ui.js — comportamiento de la interfaz (sin física)
   ---------------------------------------------------------
   Lee los controles, muestra/oculta elementos y mantiene un
   objeto `state` con todo lo que necesita el modelo FV.
   Cada cambio emite el evento "sim:change" en document.
   ========================================================= */

const $ = (id) => document.getElementById(id);
const svg = $('circuit');
const paper = $('newspaper');

// Geometría de las células en el SVG (debe coincidir con #cellPattern / #halfCellPattern)
const CELL_LAYOUTS = {
  full: { rows: 6, cols: 10, w: 46, h: 54, x: (c) => 22 + c * 50 },
  half: { rows: 6, cols: 20, w: 22, h: 54, x: (c) => 22 + Math.floor(c / 2) * 50 + (c % 2) * 24 },
};
const cellY = (r) => 38 + r * 58;
// Tamaño del periódico a escala 1 (debe coincidir con el SVG)
const PAPER = { w: 120, h: 90 };

const state = {
  irradiance: 1000,          // W/m²
  temperature: 25,           // °C (temperatura AMBIENTE; la de célula se calcula con NOCT)
  // tamaño en %, centro en coords SVG, cells: fracción sombreada de cada célula (6×10, fila a fila)
  // rot: giro del periódico en grados (0 o 90)
  shadow: { enabled: false, size: 50, x: 270, y: 210, rot: 0, cells: new Array(60).fill(0) },
  outputType: 'load',        // 'load' | 'inverter'
  load: 5,                   // Ω
  inverterOn: false,
  inverter: {
    mode: 'voltage',         // 'voltage' | 'current'
    efficiency: 95,          // %
    gridV: 230,              // V AC
    freq: 10,                // Hz (ejecución del MPPT)
    stepV: 0.1,              // V
    stepI: 0.05,             // A
    mppt: false,
    vref: 50,                // V   (consigna en control por tensión; = OFF_VREF)
    iref: 0,                 // A   (consigna en control por corriente; = OFF_IREF)
    plimit: null,            // W   (límite de potencia con MPPT; null = máximo)
  },
  limits: { vMax: 50, iMax: 20, pMax: 700 }, // escalas (las fija main.js)
  module: {
    cellType: 'full',        // 'full' (60 células) | 'half' (120 medias células)
    voc: 40, isc: 13, vmpp: 35, impp: 12,
    alpha: 0.05, beta: -0.29, gamma: -0.37,
    noct: 45,                // °C (temperatura nominal de operación de la célula)
    length: 1650,            // mm (dimensiones estándar de un módulo de 60 células)
    width: 992,              // mm
  },
};
window.simState = state;

function notify() {
  document.dispatchEvent(new CustomEvent('sim:change', { detail: state }));
}

/* ---------- Sliders de configuración FV ---------- */
function bindSlider(inputId, outputId, setter, format = (v) => v) {
  const input = $(inputId);
  const out = $(outputId);
  const update = () => {
    const v = parseFloat(input.value);
    out.textContent = format(v);
    setter(v);
    notify();
  };
  input.addEventListener('input', update);
  update();
}

/* ---------- Iluminación del módulo según irradiancia ---------- */
// 0 W/m² → módulo oscuro; G_MAX → brillo solar intenso.
const G_MAX = 1200;                                  // W/m² (máximo del slider)
function drawIllumination() {
  const g = state.irradiance / G_MAX;                // 0 … 1
  $('moduleShade').setAttribute('opacity', (0.75 * (1 - g) ** 1.5).toFixed(3));
  $('moduleSheen').setAttribute('opacity', (0.55 * g ** 2).toFixed(3));
}

/* ---------- Sombra: periódico arrastrable ---------- */
const MODULE_BOUNDS = { xMin: 20, xMax: 520, yMin: 30, yMax: 390 };

function drawPaper() {
  const s = state.shadow.size / 50; // 50 % → escala 1
  paper.setAttribute('transform',
    `translate(${state.shadow.x} ${state.shadow.y}) rotate(${state.shadow.rot}) scale(${s})`);
  computeCellShading();
}

// Girar el periódico 90° (botón o doble clic)
function rotatePaper() {
  if (!state.shadow.enabled) return;
  state.shadow.rot = state.shadow.rot === 0 ? 90 : 0;
  drawPaper();
  notify();
}
$('btnRotate').addEventListener('click', rotatePaper);
paper.addEventListener('dblclick', rotatePaper);

// Fracción de cada célula tapada por el periódico (intersección exacta de rectángulos)
// (6×10 en full cell, 6×20 en half cell; fila a fila)
function computeCellShading() {
  const L = CELL_LAYOUTS[state.module.cellType] || CELL_LAYOUTS.full;
  const cells = new Array(L.cols * L.rows).fill(0);
  if (state.shadow.enabled) {
    const s = state.shadow.size / 50;
    // girado 90°: ancho y alto se intercambian
    const rotated = state.shadow.rot % 180 !== 0;
    const pw = (rotated ? PAPER.h : PAPER.w) * s, ph = (rotated ? PAPER.w : PAPER.h) * s;
    const px0 = state.shadow.x - pw / 2, px1 = state.shadow.x + pw / 2;
    const py0 = state.shadow.y - ph / 2, py1 = state.shadow.y + ph / 2;
    for (let r = 0; r < L.rows; r++) {
      for (let c = 0; c < L.cols; c++) {
        const x0 = L.x(c), x1 = x0 + L.w;
        const y0 = cellY(r), y1 = y0 + L.h;
        const ox = Math.max(0, Math.min(x1, px1) - Math.max(x0, px0));
        const oy = Math.max(0, Math.min(y1, py1) - Math.max(y0, py0));
        cells[r * L.cols + c] = (ox * oy) / (L.w * L.h);
      }
    }
  }
  state.shadow.cells = cells;
}

// Dibujo del módulo según la tecnología de célula
function drawCellType() {
  const half = state.module.cellType === 'half';
  $('moduleCells').setAttribute('fill', half ? 'url(#halfCellPattern)' : 'url(#cellPattern)');
  $('halfDivider').setAttribute('visibility', half ? 'visible' : 'hidden');
  computeCellShading();
}

$('shadowEnabled').addEventListener('change', (e) => {
  state.shadow.enabled = e.target.checked;
  paper.setAttribute('visibility', state.shadow.enabled ? 'visible' : 'hidden');
  $('shadowSize').disabled = !state.shadow.enabled;
  $('btnRotate').disabled = !state.shadow.enabled;
  computeCellShading();
  notify();
});

function svgPoint(evt) {
  const pt = svg.createSVGPoint();
  pt.x = evt.clientX;
  pt.y = evt.clientY;
  return pt.matrixTransform(svg.getScreenCTM().inverse());
}

let dragOffset = null;
let dragPointer = null;   // solo un dedo/puntero arrastra a la vez
let dragFrame = 0;        // los movimientos se agrupan en un fotograma (móvil más fluido)

// En móvil, que tocar el periódico no desplace ni haga zoom en la página
// (Safari no respeta touch-action en elementos SVG, por eso también touchstart)
paper.addEventListener('touchstart', (e) => { if (state.shadow.enabled) e.preventDefault(); }, { passive: false });

paper.addEventListener('pointerdown', (e) => {
  if (dragPointer !== null) return;
  const p = svgPoint(e);
  dragOffset = { dx: p.x - state.shadow.x, dy: p.y - state.shadow.y };
  dragPointer = e.pointerId;
  paper.classList.add('dragging');
  try { paper.setPointerCapture(e.pointerId); } catch (_) { /* puntero ya liberado */ }
  e.preventDefault();
});

paper.addEventListener('pointermove', (e) => {
  if (!dragOffset || e.pointerId !== dragPointer) return;
  const p = svgPoint(e);
  const b = MODULE_BOUNDS;
  state.shadow.x = Math.min(b.xMax, Math.max(b.xMin, p.x - dragOffset.dx));
  state.shadow.y = Math.min(b.yMax, Math.max(b.yMin, p.y - dragOffset.dy));
  e.preventDefault();
  if (dragFrame) return;
  dragFrame = requestAnimationFrame(() => {
    dragFrame = 0;
    drawPaper();
    notify();
  });
});

// Doble toque en pantalla táctil = girar (el dblclick no llega en móvil)
let lastTap = { t: 0, x: 0, y: 0 };
paper.addEventListener('pointerup', (e) => {
  if (e.pointerType !== 'touch' || e.pointerId !== dragPointer) return;
  const now = performance.now();
  const near = Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
  if (now - lastTap.t < 350 && near) { rotatePaper(); lastTap.t = 0; }
  else lastTap = { t: now, x: e.clientX, y: e.clientY };
});

const endDrag = (e) => {
  if (e && e.pointerId !== dragPointer) return;
  dragOffset = null;
  dragPointer = null;
  paper.classList.remove('dragging');
};
paper.addEventListener('pointerup', endDrag);
paper.addEventListener('pointercancel', endDrag);

// Teclado: flechas mueven el periódico (Mayús = pasos grandes); R o Intro lo giran
const PAPER_KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
paper.addEventListener('keydown', (e) => {
  if (!state.shadow.enabled) return;
  const dir = PAPER_KEYS[e.key];
  if (dir) {
    e.preventDefault();
    const step = e.shiftKey ? 25 : 5;                   // unidades SVG
    const b = MODULE_BOUNDS;
    state.shadow.x = Math.min(b.xMax, Math.max(b.xMin, state.shadow.x + dir[0] * step));
    state.shadow.y = Math.min(b.yMax, Math.max(b.yMin, state.shadow.y + dir[1] * step));
    drawPaper();
    notify();
  } else if (e.key === 'r' || e.key === 'R' || e.key === 'Enter') {
    e.preventDefault();
    rotatePaper();
  }
});

/* ---------- Slider de carga logarítmico ---------- */
// Posición 0 → 0 Ω (cortocircuito); 1 … 1000 → 0.01 … 100 Ω en escala log.
// Así 250-500-750-1000 corresponden a 0.1 · 1 · 10 · 100 Ω.
const R_LOG_MIN = -2, R_DECADES = 4;
const posToR = (pos) => (pos <= 0 ? 0 : Math.pow(10, R_LOG_MIN + R_DECADES * pos / 1000));
const fmtR = (R) => (R === 0 ? '0' : R < 1 ? R.toFixed(2) : R < 100 ? R.toFixed(1) : R.toFixed(0));

bindSlider('irradiance', 'irradianceValue', (v) => { state.irradiance = v; drawIllumination(); });
bindSlider('temperature', 'temperatureValue', (v) => { state.temperature = v; });
bindSlider('shadowSize', 'shadowSizeValue', (v) => { state.shadow.size = v; drawPaper(); });
bindSlider('loadValue', 'loadValueOut', (v) => { state.load = posToR(v); }, (v) => fmtR(posToR(v)));

/* ---------- Consigna del microinversor ---------- */
// El slider cambia de significado: tensión, corriente o (con MPPT) límite de potencia.
const SETPOINTS = {
  voltage: { name: 'sp.voltage', unit: 'V', key: 'vref', max: () => state.limits.vMax, step: 0.1, dec: 1 },
  current: { name: 'sp.current', unit: 'A', key: 'iref', max: () => state.limits.iMax, step: 0.01, dec: 2 },
  power:   { name: 'sp.power', unit: 'W', key: 'plimit', max: () => state.limits.pMax, step: 1, dec: 0 },
};
const setpointSlider = $('invSetpoint');
const currentSetpoint = () => SETPOINTS[state.inverter.mppt ? 'power' : state.inverter.mode];

function syncInverterUI() {
  const inv = state.inverter;
  const sp = currentSetpoint();
  const max = sp.max();
  if (inv[sp.key] == null) inv[sp.key] = max;
  inv[sp.key] = Math.min(Math.max(0, inv[sp.key]), max);
  setpointSlider.min = 0;
  setpointSlider.max = max;
  setpointSlider.step = sp.step;
  setpointSlider.value = inv[sp.key];
  $('invSetpointName').textContent = I18N.t(sp.name);
  $('invSetpointUnit').textContent = sp.unit;
  $('invSetpointValue').textContent = inv[sp.key].toFixed(sp.dec);

  const btn = $('btnMppt');
  btn.textContent = inv.mppt ? 'MPPT ON' : 'MPPT OFF';
  btn.classList.toggle('on', inv.mppt);
  btn.setAttribute('aria-pressed', inv.mppt);
  $('invModeTag').textContent = I18N.t(inv.mode === 'voltage' ? 'mode.voltage' : 'mode.current');
}

setpointSlider.addEventListener('input', () => {
  const sp = currentSetpoint();
  state.inverter[sp.key] = parseFloat(setpointSlider.value);
  $('invSetpointValue').textContent = state.inverter[sp.key].toFixed(sp.dec);
  notify();
});

$('btnMppt').addEventListener('click', () => {
  state.inverter.mppt = !state.inverter.mppt;
  syncInverterUI();
  notify();
});

// main.js avisa cuando cambian las escalas (nuevo ajuste del módulo)
document.addEventListener('sim:limits', (e) => {
  state.limits = e.detail;
  syncInverterUI();
});

// main.js avisa cuando el MPPT mueve la consigna (para mantener el slider coherente)
document.addEventListener('sim:setpoint', () => {
  if (!state.inverter.mppt) syncInverterUI();
});

/* ---------- Diálogos de configuración ---------- */

// Guarda los valores del formulario al abrir y los restaura si se cancela.
function setupDialog(buttonId, dialogId, formId, onApply) {
  const dialog = $(dialogId);
  const form = $(formId);
  let snapshot = [];

  $(buttonId).addEventListener('click', () => {
    snapshot = [...form.elements].map((el) => [el, el.type === 'radio' ? el.checked : el.value]);
    form.dispatchEvent(new Event('change'));
    dialog.showModal();
  });

  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'apply') {
      onApply(form);
      notify();
    } else {
      snapshot.forEach(([el, v]) => {
        if (el.type === 'radio') el.checked = v; else el.value = v;
      });
      form.dispatchEvent(new Event('change'));
    }
  });

  // Cerrar al pulsar fuera del diálogo
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close('cancel');
  });
}

// Corrientes de los esquemas full/half según el Impp introducido
const pvForm = $('pvConfigForm');
function updateSchematicCurrents() {
  const impp = parseFloat(pvForm.elements.impp.value);
  const fmtA = (x) => (isFinite(x) ? x.toFixed(2) : '--');
  pvForm.querySelectorAll('.sch-ifull').forEach((el) => { el.textContent = fmtA(impp); });
  pvForm.querySelectorAll('.sch-ihalf').forEach((el) => { el.textContent = fmtA(impp / 2); });
}
pvForm.addEventListener('input', updateSchematicCurrents);
pvForm.addEventListener('change', updateSchematicCurrents);

/* ---------- Validación de Voc/Isc/Vmpp/Impp ---------- */
// Se valida al salir de un campo editado y al pulsar Aplicar; el error
// desaparece en cuanto se vuelve a escribir en cualquiera de los cuatro campos.
const PV_PAIRS = [['vmpp', 'voc'], ['impp', 'isc']];
const PV_KEYS = ['voc', 'isc', 'vmpp', 'impp'];
const pvError = $('pvCfgError');
let pvEdited = false;

// Campo vacío → se conserva el valor actual (igual que al aplicar)
const pvValue = (key) => {
  const raw = pvForm.elements.namedItem(key).value;
  return raw === '' ? state.module[key] : parseFloat(raw);
};

function invalidPvFields() {
  const bad = [];
  PV_PAIRS.forEach(([mp, oc]) => {
    const a = pvValue(mp), b = pvValue(oc);
    if (!(a > 0 && b > 0 && a < b)) bad.push(mp, oc);   // NaN también es inválido
  });
  return bad;
}

function showPvErrors(bad) {
  PV_KEYS.forEach((k) => {
    const el = pvForm.elements.namedItem(k);
    if (bad.includes(k)) el.setAttribute('aria-invalid', 'true');
    else el.removeAttribute('aria-invalid');
  });
  pvError.hidden = bad.length === 0;
}

pvForm.addEventListener('input', (e) => {
  if (!PV_KEYS.includes(e.target.name)) return;
  pvEdited = true;
  showPvErrors([]);
});
pvForm.addEventListener('focusout', (e) => {
  if (pvEdited && PV_KEYS.includes(e.target.name)) showPvErrors(invalidPvFields());
});
pvForm.addEventListener('submit', (e) => {
  if (!e.submitter || e.submitter.value !== 'apply') return;
  const bad = invalidPvFields();
  if (bad.length === 0) return;
  e.preventDefault();                                   // el diálogo sigue abierto
  showPvErrors(bad);
  pvForm.elements.namedItem(bad[0]).focus();
});
$('pvConfigDialog').addEventListener('close', () => {
  pvEdited = false;
  showPvErrors([]);
});

/* ---------- Esquemas de conexión (full / half cell) ---------- */
// Cada cadena de 20 células se dibuja como una fila de células unidas en
// serie (2 células · · · 2 células). Nodos entre subcadenas: y = 20, 75, 130, 185.
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, parent) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  parent.appendChild(e);
  return e;
}

// Cadena en serie entre (x0, yTop) y (x1, yBot): baja en x0, recorre las
// células en horizontal a la altura cy y baja en x1 hasta el nodo inferior.
function drawSeriesString(g, x0, x1, yTop, yBot, cellW, label) {
  const cy = yTop + 22;
  svgEl('rect', { x: x0 - 6, y: yTop + 7, width: x1 - x0 + 12, height: 41, rx: 4, class: 'sch-bg' }, g);
  svgEl('line', { x1: x0, y1: yTop, x2: x0, y2: cy, class: 'sch-w' }, g);
  svgEl('line', { x1: x1, y1: cy, x2: x1, y2: yBot, class: 'sch-w' }, g);
  const pitch = cellW + 7;
  const xs = [x0 + 5, x0 + 5 + pitch, x1 - 5 - cellW - pitch, x1 - 5 - cellW];
  const gapA = xs[1] + cellW + 3, gapB = xs[2] - 3;
  svgEl('line', { x1: x0, y1: cy, x2: gapA, y2: cy, class: 'sch-w' }, g);
  svgEl('line', { x1: gapB, y1: cy, x2: x1, y2: cy, class: 'sch-w' }, g);
  for (let k = 1; k <= 3; k++) {
    svgEl('circle', { cx: gapA + (gapB - gapA) * k / 4, cy, r: 1.4, class: 'sch-dot' }, g);
  }
  xs.forEach((x) => svgEl('rect', { x, y: cy - 7, width: cellW, height: 14, rx: 1, class: 'sch-cell' }, g));
  const t = svgEl('text', { x: (x0 + x1) / 2, y: yTop + 44, class: 'sch-lbl' }, g);
  t.textContent = label;
}

function drawDiode(g, x, yc) {
  svgEl('polygon', { points: `${x - 9},${yc - 7} ${x + 9},${yc - 7} ${x},${yc + 6}`, class: 'sch-d' }, g);
  svgEl('line', { x1: x - 10, y1: yc + 6, x2: x + 10, y2: yc + 6, class: 'sch-w' }, g);
}

function buildSchematic(svg, half) {
  svg.innerHTML = '';
  const g = svgEl('g', {}, svg);
  const nodes = [20, 75, 130, 185];
  const xD = half ? 245 : 232;                      // columna de diodos de bypass
  const xStart = half ? 40 : 70;                    // inicio de la primera cadena
  // nodos (líneas horizontales) y columna de diodos
  nodes.forEach((y, k) => {
    const from = k === 0 || k === 3 ? 22 : xStart;  // los extremos llegan a los terminales
    svgEl('line', { x1: from, y1: y, x2: xD, y2: y, class: 'sch-w' }, g);
  });
  svgEl('line', { x1: xD, y1: 20, x2: xD, y2: 185, class: 'sch-w' }, g);
  for (let s = 0; s < 3; s++) {
    const t = nodes[s], b = nodes[s + 1];
    if (half) {
      drawSeriesString(g, 40, 118, t, b, 6, I18N.t('sch.str.L'));
      drawSeriesString(g, 140, 218, t, b, 6, I18N.t('sch.str.R'));
    } else {
      drawSeriesString(g, 70, 190, t, b, 11, I18N.t('sch.str.full'));
    }
    drawDiode(g, xD, (t + b) / 2);
    const d = svgEl('text', { x: xD + 8, y: (t + b) / 2 + 4, class: 'sch-dl' }, g);
    d.textContent = `D${s + 1}`;
  }
  const minus = svgEl('text', { x: 8, y: 26, class: 'sch-term' }, g);
  minus.textContent = '−';
  const plus = svgEl('text', { x: 8, y: 191, class: 'sch-term pos' }, g);
  plus.textContent = '+';
}
buildSchematic($('schFull'), false);
buildSchematic($('schHalf'), true);
updateSchematicCurrents();

// Cambio de idioma: textos generados desde JS
document.addEventListener('i18n:change', () => {
  buildSchematic($('schFull'), false);
  buildSchematic($('schHalf'), true);
  updateSchematicCurrents();
  syncInverterUI();
  notify();                      // redibuja gráficas y leyenda en el nuevo idioma
});
setupDialog('btnPvConfig', 'pvConfigDialog', 'pvConfigForm', (form) => {
  for (const key of Object.keys(state.module)) {
    // namedItem(): form.elements['length'] devolvería el nº de campos, no el input "length"
    const el = form.elements.namedItem(key);
    if (!el) continue;
    if (key === 'cellType') { state.module[key] = el.value; continue; }
    const v = parseFloat(el.value);
    if (isFinite(v)) state.module[key] = v;          // ignora campos vacíos o no numéricos
  }
  drawCellType();
});

const outputForm = $('outputConfigForm');
outputForm.addEventListener('change', () => {
  const isInv = outputForm.elements.outputType.value === 'inverter';
  $('inverterParams').disabled = !isInv;
  const mode = outputForm.elements.invMode.value;
  $('cfgStepV').disabled = mode !== 'voltage';
  $('cfgStepI').disabled = mode !== 'current';
});

const clampNum = (v, min, max, def) => {
  const x = parseFloat(v);
  return isFinite(x) ? Math.min(max, Math.max(min, x)) : def;
};

setupDialog('btnOutputConfig', 'outputConfigDialog', 'outputConfigForm', (form) => {
  const inv = state.inverter;
  const el = form.elements;
  inv.mode = el.invMode.value;
  inv.efficiency = clampNum(el.efficiency.value, 50, 100, 95);
  inv.gridV = clampNum(el.gridV.value, 1, 1000, 230);
  inv.freq = clampNum(el.freq.value, 0.5, 20, 5);
  inv.stepV = clampNum(el.stepV.value, 0.001, 10, 0.5);
  inv.stepI = clampNum(el.stepI.value, 0.0001, 5, 0.1);
  // reflejar en el formulario los valores recortados
  el.efficiency.value = inv.efficiency;
  el.gridV.value = inv.gridV;
  el.freq.value = inv.freq;
  el.stepV.value = inv.stepV;
  el.stepI.value = inv.stepI;
  setOutputType(el.outputType.value);
});

/* ---------- Tipo de salida: carga o microinversor ---------- */
function setOutputType(type) {
  state.outputType = type;
  const isLoad = type === 'load';
  $('loadResistor').setAttribute('visibility', isLoad ? 'visible' : 'hidden');
  $('microinverter').setAttribute('visibility', isLoad ? 'hidden' : 'visible');
  $('loadControl').hidden = !isLoad;
  $('inverterControl').hidden = isLoad;
  $('acOutput').hidden = isLoad;
  syncInverterUI();
}

/* ---------- Botón de encendido del microinversor ---------- */
const powerBtn = $('btnInverterPower');
// Consignas a las que vuelve el inversor al apagarse
const OFF_VREF = 50;   // V
const OFF_IREF = 0;    // A

function toggleInverter() {
  state.inverterOn = !state.inverterOn;
  if (!state.inverterOn) {
    if (state.inverter.mode === 'voltage') state.inverter.vref = OFF_VREF;
    else state.inverter.iref = OFF_IREF;
    syncInverterUI();
  }
  powerBtn.classList.toggle('on', state.inverterOn);
  powerBtn.setAttribute('aria-pressed', state.inverterOn);
  $('inverterLed').classList.toggle('on', state.inverterOn);   // piloto en el esquema
  notify();
}
powerBtn.addEventListener('click', toggleInverter);

/* ---------- Botones verde, rojo y descarga (funciones pendientes) ---------- */
$('btnGreen').addEventListener('click', () => {
  document.dispatchEvent(new CustomEvent('sim:green'));
});
$('btnRed').addEventListener('click', () => {
  document.dispatchEvent(new CustomEvent('sim:red'));
});
$('btnDownload').addEventListener('click', () => {
  document.dispatchEvent(new CustomEvent('sim:download'));
});

/* ---------- Modo proyector ---------- */
// Pantalla completa + texto más grande (clase .projector en <html>).
// Al salir de pantalla completa con Esc también se sale del modo proyector.
const projBtn = $('btnProjector');
const CHART_FONT = { normal: 12, projector: 16 };   // px en las gráficas (canvas)

function setProjector(on) {
  document.documentElement.classList.toggle('projector', on);
  projBtn.setAttribute('aria-pressed', on);
  Chart.defaults.font.size = on ? CHART_FONT.projector : CHART_FONT.normal;
  Object.values(Chart.instances).forEach((c) => c.update());
  window.dispatchEvent(new Event('resize'));          // reajusta leyenda y pies de las gráficas
}

projBtn.addEventListener('click', async () => {
  const on = !document.documentElement.classList.contains('projector');
  setProjector(on);
  try {
    if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen();
    } else if (!on && document.fullscreenElement) {
      await document.exitFullscreen();
    }
  } catch (e) { /* sin pantalla completa (p. ej. iPhone): solo texto grande */ }
});

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && document.documentElement.classList.contains('projector')) {
    setProjector(false);
  }
});

/* ---------- Inicialización ---------- */
setOutputType(state.outputType);
drawPaper();
