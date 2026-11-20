/* =========================================================
   charts.js — gráficas I-V y P-V (Chart.js)
   ---------------------------------------------------------
   · Curva actual + punto de trabajo (mismo color que su curva).
   · Curvas guardadas (botón verde) en tono apagado y discontinuo.
   · La leyenda solo aparece en la P-V y sirve para las dos.
   ========================================================= */

const PVCharts = (() => {
  'use strict';

  // Tema claro: trazas nítidas sobre fondo blanco y retícula suave
  const COLORS = {
    iv: '#2563eb',
    pv: '#dc2626',
    ivSaved: '#a9c1f5',
    pvSaved: '#f2b0b0',
    load: '#94a3b8',
    limit: '#94a3b8',   // mismo estilo que la recta de carga
    screen: '#ffffff',
  };
  const GRID = '#eef0f3';
  const TICK = '#9ca3af';
  const AXIS_TITLE = '#6b7280';
  Chart.defaults.font.family = '"Inter", "Segoe UI", system-ui, sans-serif';
  Chart.defaults.font.size = 12;           // el modo proyector lo sube a 16 (ui.js)

  const xy = (pts, key) => pts.map((p) => ({ x: p.v, y: p[key] }));

  function baseOptions(yTitle, unit, showLegend) {
    return {
      animation: false,
      responsive: true,
      maintainAspectRatio: false,
      parsing: false,
      plugins: {
        legend: {
          display: showLegend,
          position: 'bottom',
          labels: { boxWidth: 12, boxHeight: 12, filter: (item) => item.text !== '' },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.tipLabel || ctx.dataset.label || ''}  ${ctx.parsed.x.toFixed(2)} V, ${ctx.parsed.y.toFixed(2)} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          type: 'linear', min: 0,
          title: { display: true, text: 'Voltage (V)', color: AXIS_TITLE },
          grid: { color: GRID }, border: { color: GRID }, ticks: { color: TICK },
        },
        y: {
          type: 'linear', min: 0,
          title: { display: true, text: yTitle, color: AXIS_TITLE },
          grid: { color: GRID }, border: { color: GRID }, ticks: { color: TICK },
        },
      },
    };
  }

  // order: los valores altos se dibujan detrás
  const lineDs = (label, color, extra = {}) => ({
    label, data: [], showLine: true, borderColor: color, backgroundColor: color,
    borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 0, order: 1, ...extra,
  });
  const savedDs = (label, color) => lineDs(label, color, { borderDash: [7, 5], borderWidth: 2, order: 5 });
  const dashedDs = (label, color) => lineDs(label, color, { borderDash: [6, 4], borderWidth: 1.5, order: 2 });
  // punto de trabajo: sin etiqueta de leyenda
  const pointDs = (color) => ({
    label: '', tipLabel: 'Operating point', data: [], showLine: false,
    borderColor: COLORS.screen, backgroundColor: color, pointStyle: 'circle',
    pointRadius: 7, pointHoverRadius: 9, borderWidth: 2, order: 0,
  });

  // I-V (sin leyenda): [0] curva, [1] recta de carga, [2] punto, [3] guardada
  const iv = new Chart(document.getElementById('ivChart'), {
    type: 'scatter',
    data: {
      datasets: [
        lineDs('I-V curve', COLORS.iv),
        dashedDs('Load line', COLORS.load),
        pointDs(COLORS.iv),
        savedDs('Saved I-V', COLORS.ivSaved),
      ],
    },
    options: baseOptions('Current (A)', 'A', false),
  });

  // P-V (con leyenda común):
  // [0] curva P-V, [1] I-V (solo leyenda), [2] P-V guardada, [3] I-V guardada (solo leyenda),
  // [4] recta de carga (solo leyenda), [5] límite de potencia, [6] punto de trabajo
  const pv = new Chart(document.getElementById('pvChart'), {
    type: 'scatter',
    data: {
      datasets: [
        lineDs('P-V curve', COLORS.pv),
        lineDs('I-V curve', COLORS.iv),
        savedDs('', COLORS.pvSaved),
        savedDs('', COLORS.ivSaved),
        dashedDs('', COLORS.load),
        dashedDs('', COLORS.limit),
        pointDs(COLORS.pv),
      ],
    },
    options: baseOptions('Power (W)', 'W', false),
  });

  /* ---------- Leyenda HTML común (pie del panel P-V) ---------- */
  const legendEl = document.getElementById('chartLegend');
  const footers = [document.getElementById('ivFooter'), document.getElementById('pvFooter')];
  let legendKey = '';

  function renderLegend() {
    const items = pv.data.datasets.filter((ds) => ds.label);
    const key = items.map((ds) => ds.label).join('|');
    if (key === legendKey) return;
    legendKey = key;
    legendEl.innerHTML = '';
    for (const ds of items) {
      const li = document.createElement('li');
      const dash = ds.borderDash ? ds.borderDash.join(' ') : '';
      li.innerHTML =
        `<svg viewBox="0 0 26 10" aria-hidden="true"><line x1="1" y1="5" x2="25" y2="5" ` +
        `stroke="${ds.borderColor}" stroke-width="${Math.max(2, ds.borderWidth)}" ` +
        `stroke-dasharray="${dash}"/></svg>`;
      li.append(ds.label);
      if (ds.tipLabel) li.title = ds.tipLabel;
      legendEl.appendChild(li);
    }
    syncFooterHeights();
  }

  // Igualar la altura de los pies I-V y P-V para que ambas gráficas midan lo mismo
  function syncFooterHeights() {
    footers.forEach((f) => { f.style.minHeight = ''; });
    const h = Math.max(...footers.map((f) => f.offsetHeight));
    footers.forEach((f) => { f.style.minHeight = `${h}px`; });
  }
  window.addEventListener('resize', () => { legendKey = ''; renderLegend(); });

  let limits = { vMax: 50, iMax: 20, pMax: 700 };
  let saved = null;   // { points, label }

  function setLimits(l) {
    limits = l;
    // máximo múltiplo del paso → todas las divisiones iguales
    for (const [chart, yMax, yStep] of [[iv, l.iMax, l.iStep], [pv, l.pMax, l.pStep]]) {
      chart.options.scales.x.max = l.vMax;
      chart.options.scales.x.ticks.stepSize = l.vStep;
      chart.options.scales.y.max = yMax;
      chart.options.scales.y.ticks.stepSize = yStep;
    }
  }

  // Guarda la curva actual para compararla (sustituye a la anterior).
  // cond = { g, ta }: irradiancia y temperatura ambiente, que se muestran en la leyenda
  function save(curve, tag, cond) {
    saved = { points: curve.points.map((p) => ({ ...p })), tag, cond };
    drawSaved();
  }

  function clearSaved() {
    saved = null;
    drawSaved();
  }

  function drawSaved() {
    const d = iv.data.datasets, e = pv.data.datasets;
    d[3].data = saved ? xy(saved.points, 'i') : [];
    e[2].data = saved ? xy(saved.points, 'p') : [];
    applyLabels();
    iv.update();
    pv.update();
    renderLegend();
  }

  // Textos de leyenda, tooltips y ejes en el idioma actual
  function applyLabels() {
    const t = I18N.t;
    const d = iv.data.datasets, e = pv.data.datasets;
    d[0].label = e[1].label = t('lg.iv');
    e[0].label = t('lg.pv');
    d[2].tipLabel = e[6].tipLabel = t('lg.op');
    // curvas guardadas: irradiancia y temperatura ambiente en la leyenda; el resto en el tooltip
    const cond = saved && saved.cond ? ` (${saved.cond.g} W/m², Ta ${saved.cond.ta} °C)` : '';
    e[2].label = saved ? t('lg.savedPV') + cond : '';
    e[3].label = saved ? t('lg.savedIV') + cond : '';
    d[3].tipLabel = e[2].tipLabel = e[3].tipLabel = saved ? `${t('lg.saved')} (${saved.tag})` : '';
    iv.options.scales.x.title.text = pv.options.scales.x.title.text = t('ax.voltage');
    iv.options.scales.y.title.text = t('ax.current');
    pv.options.scales.y.title.text = t('ax.power');
  }

  /**
   * curve:  resultado de PVModel.computeCurve
   * op:     punto de trabajo {v,i,p} o null
   * R:      resistencia de carga (Ω) si está conectada, o null
   * pLimit: límite de potencia del MPPT (W) o null
   */
  function update(curve, op, R, pLimit) {
    const d = iv.data.datasets;
    d[0].data = xy(curve.points, 'i');
    if (R != null) {
      // recta de carga I = V/R recortada al área visible
      d[1].data = R < 1e-6
        ? [{ x: 0, y: 0 }, { x: 0, y: limits.iMax }]
        : [{ x: 0, y: 0 }, { x: Math.min(limits.vMax, limits.iMax * R), y: Math.min(limits.vMax / R, limits.iMax) }];
    } else {
      d[1].data = [];
    }
    d[2].data = op ? [{ x: op.v, y: op.i }] : [];
    applyLabels();
    iv.update();

    const e = pv.data.datasets;
    e[0].data = xy(curve.points, 'p');
    e[4].label = R != null ? I18N.t('lg.load') : '';
    if (pLimit != null) {
      e[5].data = [{ x: 0, y: pLimit }, { x: limits.vMax, y: pLimit }];
      e[5].label = I18N.t('lg.limit');
    } else {
      e[5].data = [];
      e[5].label = '';
    }
    e[6].data = op ? [{ x: op.v, y: op.p }] : [];
    pv.update();
    renderLegend();
  }

  return { setLimits, update, save, clearSaved };
})();
