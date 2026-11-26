/* =========================================================
   scope.js — osciloscopio de 3 canales (V, I, P del módulo)
   ---------------------------------------------------------
   · Muestrea el punto de trabajo cada SAMPLE_MS.
   · Redibuja cada DRAW_MS con el instante actual en el borde
     derecho (t = 0) y la ventana configurable hacia atrás.
   ========================================================= */

const Scope = (() => {
  'use strict';

  const SAMPLE_MS = 50;          // 20 muestras/s
  const DRAW_MS = 100;           // 10 refrescos/s
  const MAX_WINDOW_S = 60;       // historial guardado

  const CHANNELS = [
    // mismos colores que los displays (--ch-v, --ch-i, --ch-p en styles.css)
    { canvas: 'scopeVChart', out: 'scopeV', key: 'v', color: '#d97706', unit: 'V', dec: 1, lim: 'vMax' },
    { canvas: 'scopeIChart', out: 'scopeI', key: 'i', color: '#0891b2', unit: 'A', dec: 2, lim: 'iMax' },
    { canvas: 'scopePChart', out: 'scopeP', key: 'p', color: '#c026d3', unit: 'W', dec: 1, lim: 'pMax' },
  ];

  const GRID = '#e8ebef';
  const TICK = '#9ca3af';

  let windowS = 10;
  let running = true;
  let value = null;              // último punto de trabajo {v, i, p}
  const buffer = [];             // {t, v, i, p}

  function makeChart(ch) {
    return new Chart(document.getElementById(ch.canvas), {
      type: 'scatter',
      data: {
        datasets: [{
          data: [], showLine: true, spanGaps: false,
          borderColor: ch.color, borderWidth: 1.8,
          pointRadius: 0, pointHoverRadius: 0,
        }],
      },
      options: {
        animation: false,
        responsive: true,
        maintainAspectRatio: false,
        parsing: false,
        normalized: true,
        events: [],
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: {
            type: 'linear', min: -windowS, max: 0,
            grid: { color: GRID }, border: { color: GRID },
            ticks: { color: TICK, stepSize: windowS / 10, callback: (v) => `${+v.toFixed(1)} s` },
          },
          y: {
            type: 'linear', min: 0, max: 10,
            grid: { color: GRID }, border: { color: GRID },
            ticks: { color: TICK, maxTicksLimit: 6, callback: (v) => `${+v.toFixed(2)} ${ch.unit}` },
          },
        },
      },
    });
  }

  const charts = CHANNELS.map(makeChart);

  // Escala vertical con divisiones iguales y como mucho 6 divisiones
  // (pantallas más bajas): se agranda el paso ×2, ×5… y el máximo se
  // redondea a un múltiplo del nuevo paso.
  function setLimits(l) {
    CHANNELS.forEach((ch, k) => {
      const max0 = l[ch.lim], step0 = l[ch.lim.replace('Max', 'Step')];
      let step = step0;
      for (const m of [1, 2, 5, 10, 20, 50]) {
        step = step0 * m;
        if (Math.ceil(max0 / step - 1e-9) <= 6) break;
      }
      const y = charts[k].options.scales.y;
      y.max = Math.ceil(max0 / step - 1e-9) * step;
      y.ticks.stepSize = step;
      delete y.ticks.maxTicksLimit;
    });
  }

  function setValue(op) {
    value = op ? { v: op.v, i: op.i, p: op.p } : null;
  }

  function setWindow(s) {
    windowS = s;
    charts.forEach((c) => {
      c.options.scales.x.min = -s;
      c.options.scales.x.ticks.stepSize = s / 10;
    });
    draw(true);
  }

  function sample() {
    if (!running || !value) return;
    const t = performance.now();
    buffer.push({ t, ...value });
    const tMin = t - MAX_WINDOW_S * 1000;
    while (buffer.length && buffer[0].t < tMin) buffer.shift();
  }

  function draw(force = false) {
    if (!running && !force) return;
    const now = buffer.length ? (running ? performance.now() : buffer[buffer.length - 1].t) : performance.now();
    const tMin = now - windowS * 1000;
    let start = 0;
    while (start < buffer.length && buffer[start].t < tMin) start++;
    const pts = buffer.slice(start);
    CHANNELS.forEach((ch, k) => {
      charts[k].data.datasets[0].data = pts.map((s) => ({ x: (s.t - now) / 1000, y: s[ch.key] }));
      charts[k].update();
      const last = pts.length ? pts[pts.length - 1][ch.key] : NaN;
      document.getElementById(ch.out).textContent = isFinite(last) ? `${last.toFixed(ch.dec)} ${ch.unit}` : `-- ${ch.unit}`;
    });
  }

  function setRunning(r) {
    if (r && !running && buffer.length) {
      // corte en la traza durante la pausa
      buffer.push({ t: performance.now(), v: NaN, i: NaN, p: NaN });
    }
    running = r;
  }

  setInterval(sample, SAMPLE_MS);
  setInterval(draw, DRAW_MS);

  /* ---------- Controles ---------- */
  document.getElementById('scopeWindow').addEventListener('change', (e) => {
    setWindow(parseFloat(e.target.value));
  });
  const runBtn = document.getElementById('btnScopeRun');
  const labelRunBtn = () => { runBtn.textContent = I18N.t(running ? 'scope.pause' : 'scope.run'); };
  runBtn.addEventListener('click', () => {
    setRunning(!running);
    labelRunBtn();
    runBtn.setAttribute('aria-pressed', running);
  });
  document.addEventListener('i18n:change', labelRunBtn);
  labelRunBtn();

  /* ---------- Descarga CSV de los tres canales ---------- */
  // Exporta lo que se ve en pantalla: las muestras de la ventana de tiempo actual
  // (si está en pausa, la ventana congelada). t = 0 en la muestra más antigua.
  function downloadCsv() {
    if (!buffer.length) return;
    const tEnd = running ? performance.now() : buffer[buffer.length - 1].t;
    const pts = buffer.filter((s) => s.t >= tEnd - windowS * 1000 && isFinite(s.v));
    if (!pts.length) return;
    const t0 = pts[0].t;
    const stamp = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const lines = [
      '# PV module simulator - oscilloscope (DC side of the module)',
      `# Exported,${stamp.toISOString()}`,
      `# Time window (s),${windowS}`,
      `# Sample period (ms),${SAMPLE_MS}`,
      't (s),V (V),I (A),P (W)',
      ...pts.map((s) => `${((s.t - t0) / 1000).toFixed(3)},${s.v.toFixed(4)},${s.i.toFixed(4)},${s.p.toFixed(4)}`),
    ];
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scope_VIP_${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}` +
                 `_${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  document.getElementById('btnScopeCsv').addEventListener('click', downloadCsv);

  return { setLimits, setValue };
})();
