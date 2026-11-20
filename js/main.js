/* =========================================================
   main.js — une interfaz, modelo, MPPT y gráficas
   ---------------------------------------------------------
   · Cada "sim:change" (sliders, sombra, menús) recalcula las
     curvas I-V / P-V y el punto de trabajo.
   · Con el microinversor encendido y el MPPT activo, un
     temporizador ejecuta P&O a la frecuencia configurada.
   ========================================================= */

(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const fmt = (x, d) => (isFinite(x) ? x.toFixed(d) : '--');

  let fit = null;
  let fitKey = '';
  let curve = null;

  // Reajusta n, Rs y Rsh solo cuando cambian los parámetros del módulo
  function getFit() {
    // la tecnología de célula no cambia el ajuste (con sol uniforme la curva es la misma)
    // (NOCT y dimensiones tampoco: solo afectan a la temperatura de célula y a la eficiencia)
    const { cellType, noct, length, width, ...datasheet } = simState.module;
    const key = JSON.stringify(datasheet);
    if (key !== fitKey) {
      const f = PVModel.fitModule(simState.module);
      if (f.error) {
        alert(I18N.t('err.params'));
        return fit;                      // se mantiene el último ajuste válido
      }
      fit = f;
      fitKey = key;
      const limits = PVModel.axisLimits(fit);
      PVCharts.setLimits(limits);
      Scope.setLimits(limits);
      document.dispatchEvent(new CustomEvent('sim:limits', { detail: limits }));
      console.info(`[PV] Fit: n = ${fit.n.toFixed(3)}, Rs = ${(fit.rs * 1000).toFixed(1)} mΩ, ` +
                   `Rsh = ${fit.rsh.toFixed(1)} Ω, kRs = ${(fit.kR * 100).toFixed(2)} %/°C, ` +
                   `model γ = ${fit.gammaModel.toFixed(3)} %/°C`);
    }
    return fit;
  }

  /* ---------- Temperatura de célula (NOCT) y termómetro ---------- */
  function cellTemp() {
    const s = simState;
    return PVModel.cellTemperature(s.temperature, s.irradiance, s.module.noct);
  }

  // Escala del termómetro: −20 °C → y = 360, 100 °C → y = 70 (base del tubo en y = 370)
  const THERMO = { tMin: -20, tMax: 100, yMin: 360, yMax: 70, yBase: 370 };
  function drawThermometer(t) {
    const k = Math.min(1, Math.max(0, (t - THERMO.tMin) / (THERMO.tMax - THERMO.tMin)));
    const y = THERMO.yMin + k * (THERMO.yMax - THERMO.yMin);
    const fill = $('thermoFill');
    fill.setAttribute('y', y.toFixed(1));
    fill.setAttribute('height', (THERMO.yBase - y).toFixed(1));
    $('cellTempValue').textContent = `${t.toFixed(1)} °C`;
  }

  /* ---------- Eficiencia del módulo ---------- */
  const moduleArea = () => (simState.module.length / 1000) * (simState.module.width / 1000); // m²
  function efficiency(p) {
    const pin = simState.irradiance * moduleArea();       // potencia solar incidente (W)
    return pin > 0 ? (p / pin) * 100 : NaN;
  }

  /* ---------- Punto de trabajo según la salida ---------- */
  function operatingPoint(c) {
    const s = simState;
    if (s.outputType === 'load') return PVModel.operatingPoint(c, s.load);
    if (!s.inverterOn) return { v: c.voc, i: 0, p: 0 };          // inversor apagado: circuito abierto
    const inv = s.inverter;
    if (inv.mode === 'voltage') {
      const v = Math.min(Math.max(0, inv.vref), c.voc);
      const i = PVModel.currentAtVoltage(c, v);
      return { v, i, p: v * i };
    }
    const i = Math.min(Math.max(0, inv.iref), c.isc);
    const v = PVModel.voltageAtCurrent(c, i);
    return { v, i, p: v * i };
  }

  /* ---------- Dibujo de resultados ---------- */
  function render(shading) {
    const s = simState;
    const inv = s.inverter;
    const op = operatingPoint(curve);
    const isLoad = s.outputType === 'load';
    const mpptActive = !isLoad && s.inverterOn && inv.mppt;

    PVCharts.update(curve, op, isLoad ? s.load : null, mpptActive ? inv.plimit : null);
    Scope.setValue(op);

    // Parámetros característicos
    $('paramVoc').textContent = `${fmt(curve.voc, 2)} V`;
    $('paramVmpp').textContent = `${fmt(curve.vmpp, 2)} V`;
    $('paramIsc').textContent = `${fmt(curve.isc, 2)} A`;
    $('paramImpp').textContent = `${fmt(curve.impp, 2)} A`;
    $('paramPmax').textContent = `${fmt(curve.pmax, 1)} W`;
    $('paramFF').textContent = fmt(curve.ff, 3);

    // Displays DC (lo que entrega el módulo)
    $('outVoltage').textContent = `${fmt(op.v, 1)} V`;
    $('outCurrent').textContent = `${fmt(op.i, 2)} A`;
    $('outPower').textContent = `${fmt(op.p, 1)} W`;
    // Eficiencia del módulo: η = P / (G · A)
    const eff = efficiency(op.p);
    $('outEff').textContent = `${fmt(eff, 1)} %`;

    // Salida AC del microinversor: Pac = η·Pdc, Iac = Pac / Vred
    if (!isLoad) {
      const on = s.inverterOn;
      const pac = on ? op.p * inv.efficiency / 100 : 0;
      const vac = on ? inv.gridV : 0;
      $('acVoltage').textContent = `${fmt(vac, 0)} V`;
      $('acCurrent').textContent = `${fmt(vac > 0 ? pac / vac : 0, 2)} A`;
      $('acPower').textContent = `${fmt(pac, 1)} W`;
    }

    // % de sombra de cada subcadena
    if (shading) {
      // full: "97 %"; half: dos líneas, mitad izquierda (L) y derecha (R)
      shading.shade.forEach((br, k) => {
        const el = $(`subShade${k + 1}`);
        const pct = (x) => Math.round(x * 100);
        if (!s.shadow.enabled || Math.max(...br) <= 0.005) { el.textContent = ''; return; }
        if (br.length === 1) { el.textContent = `${pct(br[0])} %`; return; }
        const x = el.getAttribute('x');
        el.innerHTML = `<tspan x="${x}" dy="-7">L ${pct(br[0])} %</tspan><tspan x="${x}" dy="14">R ${pct(br[1])} %</tspan>`;
      });
    }

    // Diodos de bypass que conducen en el punto de trabajo
    const subs = op.i > 0 ? PVModel.substringState(curve, op.i) : null;
    for (let k = 0; k < PVModel.NSUB; k++) {
      $(`diode${k + 1}`).classList.toggle('active', !!(subs && subs[k].bypassOn));
    }
  }

  function update() {
    const s = simState;
    const f = getFit();
    if (!f) return;
    const shading = PVModel.substringShading(s.shadow.enabled ? s.shadow.cells : null, s.module.cellType);
    const tCell = cellTemp();
    drawThermometer(tCell);
    curve = PVModel.computeCurve(f, s.irradiance, tCell, shading.factors);
    render(shading);
    manageMppt();
  }

  /* ---------- MPPT (Perturba y Observa) ---------- */
  let timer = null;
  let timerKey = '';
  let mpptState = MPPT.create();

  function manageMppt() {
    const s = simState;
    const inv = s.inverter;
    const active = s.outputType === 'inverter' && s.inverterOn && inv.mppt;
    const key = active ? `${inv.freq}|${inv.mode}` : '';
    if (key === timerKey) return;
    clearInterval(timer);
    timer = null;
    timerKey = key;
    if (active) {
      mpptState = MPPT.create();
      timer = setInterval(mpptTick, 1000 / inv.freq);
    }
  }

  function mpptTick() {
    if (!curve) return;
    const s = simState;
    const inv = s.inverter;
    const op = operatingPoint(curve);
    const isV = inv.mode === 'voltage';
    const pLimit = inv.plimit == null ? Infinity : inv.plimit;
    if (isV) {
      const ref = MPPT.step(mpptState, inv.vref, op, inv.stepV, pLimit, +1);
      inv.vref = Math.min(Math.max(0, ref), curve.voc + inv.stepV);
    } else {
      const ref = MPPT.step(mpptState, inv.iref, op, inv.stepI, pLimit, -1);
      inv.iref = Math.min(Math.max(0, ref), curve.isc + inv.stepI);
    }
    document.dispatchEvent(new CustomEvent('sim:setpoint'));
    render(null);
  }

  /* ---------- Guardar / borrar curvas (botones verde y rojo) ---------- */
  function conditionsTag() {
    const s = simState;
    let tag = `${I18N.t(s.module.cellType === 'half' ? 'tag.half' : 'tag.full')}, ${s.irradiance} W/m², ` +
              `Ta ${s.temperature} °C, Tc ${cellTemp().toFixed(1)} °C`;
    if (s.shadow.enabled) tag += ', shadow';
    return tag;
  }

  document.addEventListener('sim:green', () => {
    if (curve) PVCharts.save(curve, conditionsTag());
  });
  document.addEventListener('sim:red', () => PVCharts.clearSaved());

  /* ---------- Descarga CSV de la curva actual (botón azul) ---------- */
  document.addEventListener('sim:download', () => {
    if (!curve) return;
    const s = simState;
    const shading = PVModel.substringShading(s.shadow.enabled ? s.shadow.cells : null, s.module.cellType);
    const half = s.module.cellType === 'half';
    const lines = [
      '# PV module simulator - I-V / P-V curve',
      `# Cell technology,${half ? 'Half cell (120)' : 'Full cell (60)'}`,
      `# Irradiance (W/m2),${s.irradiance}`,
      `# Ambient temperature (C),${s.temperature}`,
      `# NOCT (C),${s.module.noct}`,
      `# Cell temperature (C),${cellTemp().toFixed(2)}`,
      `# Shadow per substring (%)${half ? ' [left/right]' : ''},` +
        shading.shade.map((br) => br.map((x) => (s.shadow.enabled ? (x * 100).toFixed(1) : '0')).join('/')).join(','),
      `# Voc (V),${curve.voc.toFixed(4)}`,
      `# Isc (A),${curve.isc.toFixed(4)}`,
      `# Vmpp (V),${curve.vmpp.toFixed(4)}`,
      `# Impp (A),${curve.impp.toFixed(4)}`,
      `# Pmax (W),${curve.pmax.toFixed(4)}`,
      `# FF,${curve.ff.toFixed(4)}`,
      `# Module area (m2),${moduleArea().toFixed(4)}`,
      `# Efficiency at MPP (%),${isFinite(efficiency(curve.pmax)) ? efficiency(curve.pmax).toFixed(2) : ''}`,
      'V (V),I (A),P (W)',
    ];
    // ordenado por tensión creciente
    [...curve.points].reverse().forEach((p) => {
      lines.push(`${p.v.toFixed(4)},${p.i.toFixed(4)},${p.p.toFixed(4)}`);
    });
    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IV_PV_G${s.irradiance}_Ta${s.temperature}${s.shadow.enabled ? '_shadow' : ''}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  // Agrupa varios cambios seguidos (p. ej. al arrastrar) en un solo cálculo por frame
  let pending = false;
  document.addEventListener('sim:change', () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => { pending = false; update(); });
  });

  update();
})();
