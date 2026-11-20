/* =========================================================
   pvModel.js — modelo eléctrico del módulo FV (sin interfaz)
   ---------------------------------------------------------
   · Modelo de un diodo con resistencias serie (Rs) y paralelo (Rsh).
   · 3 subcadenas, cada una con su diodo de bypass en antiparalelo:
       Full cell: 60 células → 3 subcadenas de 20 células en serie.
       Half cell: 120 medias células → cada subcadena son DOS ramas
                  de 20 medias células en paralelo (mitad izquierda y
                  derecha del módulo), con un único bypass.
   · Parámetros n, Rs y Rsh ajustados a partir de la hoja de
     características (Voc, Isc, Vmpp, Impp) en STC. Con sol uniforme
     ambas tecnologías dan la misma curva; difieren con sombra.
   · Coeficientes: α (Isc), β (Voc) y γ (Pmax). γ se usa para
     calibrar la variación de Rs con la temperatura.

   Ecuación de una rama de células (corriente I, tensión V):
       I = Iph − I0·[exp((V + I·Rs)/a) − 1] − (V + I·Rs)/Rsh
   con a = n·Ns·k·T/q. Se usa su solución explícita con la
   función W de Lambert, tanto V(I) como I(V).
   ========================================================= */

const PVModel = (() => {
  'use strict';

  const K = 1.380649e-23;       // J/K
  const Q = 1.602176634e-19;    // C
  const T_STC = 298.15;         // K

  const NS = 60;                // células (equivalentes) en serie
  const NSUB = 3;               // subcadenas / diodos de bypass (fijo)
  const ROWS = 6;               // disposición física: 2 filas por subcadena
  // Columnas y ramas en paralelo por subcadena según la tecnología
  const LAYOUTS = {
    full: { cols: 10, branches: 1 },
    half: { cols: 20, branches: 2 },   // ramas: columnas 0-9 (izq.) y 10-19 (dcha.)
  };

  // Diodo de bypass (Schottky): Vf ≈ 0.5 V a 10 A
  const BYPASS = { Is: 1e-6, n: 1.2 };

  // Fracción de luz que atraviesa la hoja (radiación difusa que llega)
  const LEAF_TRANSMITTANCE = 0.05;

  // Cómo se obtiene la sombra de una subcadena a partir de sus células:
  //  'worst-cell' → manda la célula más sombreada (comportamiento real
  //                 de células en serie: limitan la corriente).
  //  'average'    → media de las 20 células (aproximación por área).
  const SHADING_MODE = 'worst-cell';

  const vt = (Tk) => K * Tk / Q;

  /* -------------------------------------------------------
     Ajuste de n y Rs a partir de la hoja de características
     ------------------------------------------------------- */
  function fitModule(p) {
    const { voc, isc, vmpp, impp } = p;
    if (!(voc > 0 && isc > 0 && vmpp > 0 && impp > 0 && vmpp < voc && impp < isc)) {
      return { error: 'Invalid parameters: 0 < Vmpp < Voc and 0 < Impp < Isc are required.' };
    }
    const vtS = vt(T_STC);

    // Para n y Rs dados: Rsh, Iph e I0 tales que la curva pasa por
    // (0, Isc), (Voc, 0) y (Vmpp, Impp)  [método iterativo de Villalva].
    // Devuelve además el residuo h de la condición dP/dV = 0 en el MPP.
    function evalRs(a, rs) {
      const vx = vmpp + impp * rs;
      let rsh = 1e6, iph = isc, i0 = 0;
      for (let k = 0; k < 300; k++) {
        iph = isc * (rsh + rs) / rsh;
        i0 = (iph - voc / rsh) / Math.expm1(voc / a);
        const den = iph - i0 * Math.expm1(vx / a) - impp;
        if (!(den > 0)) return null;               // exigiría Rsh < 0
        const next = Math.min(vx / den, 1e7);
        const done = Math.abs(next - rsh) < 1e-10 * rsh;
        rsh = next;
        if (done) break;
      }
      iph = isc * (rsh + rs) / rsh;
      i0 = (iph - voc / rsh) / Math.expm1(voc / a);
      const gt = (i0 / a) * Math.exp(vx / a) + 1 / rsh;
      return { rs, rsh, h: impp / vmpp - gt / (1 + rs * gt) };
    }

    // Para un n dado, busca Rs ≥ 0 que anula h
    function solveN(n) {
      const a = n * NS * vtS;
      const rsMax = (voc - vmpp) / impp;
      const steps = 200;
      let prev = null;
      for (let j = 0; j <= steps; j++) {
        const r = evalRs(a, rsMax * j / steps);
        if (!r || !isFinite(r.h)) { prev = null; continue; }
        if (prev && Math.sign(prev.h) !== Math.sign(r.h)) {
          let lo = prev.rs, hi = r.rs, hLo = prev.h;
          for (let k = 0; k < 50; k++) {
            const mid = (lo + hi) / 2;
            const m = evalRs(a, mid);
            if (!m) { hi = mid; continue; }
            if (Math.sign(m.h) === Math.sign(hLo)) { lo = mid; hLo = m.h; } else { hi = mid; }
          }
          const sol = evalRs(a, (lo + hi) / 2);
          return sol ? { n, rs: sol.rs, rsh: sol.rsh } : null;
        }
        prev = r;
      }
      return null;
    }

    // Recorre n y se queda con la solución válida más cercana a n = 1.1
    // (valor típico para silicio cristalino).
    let best = null;
    for (let n = 0.8; n <= 2.0001; n += 0.02) {
      const s = solveN(n);
      if (s && (!best || Math.abs(s.n - 1.1) < Math.abs(best.n - 1.1))) best = s;
    }
    if (!best) best = { n: 1.2, rs: 0, rsh: 1e7 };   // datos poco coherentes

    const fit = { ...p, n: best.n, rs: best.rs, rsh: best.rsh, kR: 0 };
    calibrateGamma(fit);
    return fit;
  }

  // Ajusta kR (variación relativa de Rs por °C) para que la Pmax del
  // modelo siga el coeficiente γ de la hoja de características.
  // (con sol uniforme full y half dan la misma curva: se calibra con full)
  const UNIFORM = [[1], [1], [1]];
  function calibrateGamma(fit) {
    const pmax25 = computeCurve(fit, 1000, 25, UNIFORM).pmax;
    const target = pmax25 * (1 + fit.gamma / 100 * 40);
    const f = (kR) => { fit.kR = kR; return computeCurve(fit, 1000, 65, UNIFORM).pmax - target; };
    let lo = -0.024, hi = 0.2;
    if (fit.rs <= 1e-6 || f(lo) < 0) { fit.kR = fit.rs <= 1e-6 ? 0 : lo; }
    else if (f(hi) > 0) { fit.kR = hi; }
    else {
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2;
        if (f(mid) > 0) lo = mid; else hi = mid;
      }
      fit.kR = (lo + hi) / 2;
    }
    const p65 = computeCurve(fit, 1000, 65, UNIFORM).pmax;
    fit.gammaModel = (p65 / pmax25 - 1) / 40 * 100;   // %/°C conseguido
  }

  /* -------------------------------------------------------
     Temperatura de célula (modelo NOCT):
         Tc = Ta + (NOCT − 20) / 800 · G
     NOCT: temperatura de célula a 800 W/m², 20 °C ambiente y 1 m/s de viento.
     ------------------------------------------------------- */
  function cellTemperature(Ta, G, noct) {
    return Ta + (noct - 20) / 800 * G;
  }

  /* -------------------------------------------------------
     Parámetros a la temperatura de célula T (°C)
     ------------------------------------------------------- */
  function conditions(fit, T) {
    const Tk = T + 273.15;
    const dT = T - 25;
    const iscT = fit.isc * (1 + fit.alpha / 100 * dT);
    const vocT = fit.voc * (1 + fit.beta / 100 * dT);
    const a = fit.n * NS * vt(Tk);
    const rs = fit.rs * Math.max(0, 1 + fit.kR * dT);
    const iphT = iscT * (fit.rsh + rs) / fit.rsh;       // Iph a 1000 W/m²
    const I0 = (iphT - vocT / fit.rsh) / Math.expm1(vocT / a); // garantiza Voc(T) según β
    return {
      iphT, I0,
      aSub: a / NSUB, rsSub: rs / NSUB, rshSub: fit.rsh / NSUB,
      // rama half-cell: mitad de corriente → I0/2, resistencias ×2
      I0b: I0 / 2, rsB: 2 * rs / NSUB, rshB: 2 * fit.rsh / NSUB,
      vtB: BYPASS.n * vt(Tk),
    };
  }

  // Resuelve w + ln(w) = x  →  w = W(e^x)  (Lambert W en dominio logarítmico)
  function lambertWexp(x) {
    let w = x > 1 ? x - Math.log(x) : Math.exp(x);
    for (let k = 0; k < 30; k++) {
      const f = w + Math.log(w) - x;
      const wn = w - f / (1 + 1 / w);
      w = wn > 0 ? wn : w / 10;
      if (Math.abs(f) < 1e-12 * Math.max(1, Math.abs(x))) break;
    }
    return w;
  }

  // Tensión de las 20 células de una subcadena a corriente ic (solución explícita):
  // V = (Iph + I0 − I)·Rsh − I·Rs − a·W[(I0·Rsh/a)·exp((Iph + I0 − I)·Rsh/a)]
  function cellsVoltage(ic, iph, c) {
    const u = (iph + c.I0 - ic) * c.rshSub;
    const x = Math.log(c.I0 * c.rshSub / c.aSub) + u / c.aSub;
    return u - ic * c.rsSub - c.aSub * lambertWexp(x);
  }

  // Corriente de una rama half-cell (20 medias células) a tensión V (solución explícita):
  // I = (Rsh(Iph+I0) − V)/(Rs+Rsh) − (a/Rs)·W[(Rs·I0·Rsh/(a(Rs+Rsh)))·exp(Rsh(Rs(Iph+I0)+V)/(a(Rs+Rsh)))]
  function branchCurrent(V, iph, c) {
    const rs = c.rsB, rsh = c.rshB, a = c.aSub, i0 = c.I0b;
    if (rs < 1e-9) return iph - i0 * Math.expm1(V / a) - V / rsh;
    const k = rs + rsh;
    const x = Math.log(rs * i0 * rsh / (a * k)) + rsh * (rs * (iph + i0) + V) / (a * k);
    return (rsh * (iph + i0) - V) / k - (a / rs) * lambertWexp(x);
  }

  /* -------------------------------------------------------
     Tensión de una subcadena (con su bypass) a corriente I
     branches: Iph de cada rama ([Iph] full, [IphL, IphR] half)
     ------------------------------------------------------- */
  function subVoltage(I, branches, c) {
    return branches.length === 1 ? subVoltageSeries(I, branches[0], c) : subVoltageParallel(I, branches, c);
  }

  // Half cell: I = IL(V) + IR(V) + Ib(V); todas decrecen con V → bisección en V
  function subVoltageParallel(I, branches, c) {
    const ib = (V) => BYPASS.Is * Math.expm1(-V / c.vtB);
    const total = (V) => {
      let s = ib(V);
      for (const iph of branches) s += branchCurrent(V, iph, c);
      return s;
    };
    let lo = -c.vtB * Math.log1p(I / BYPASS.Is) - 0.05;
    let hi = c.aSub * Math.log1p(Math.max(...branches, 0) / c.I0b) + 0.5;
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (total(mid) > I) lo = mid; else hi = mid;
    }
    const v = (lo + hi) / 2;
    const b = ib(v);
    return { v, ic: I - b, ib: b };
  }

  // Full cell: se reparte I = Ic (células) + Ib (bypass) con Vc = Vb
  function subVoltageSeries(I, iph, c) {
    const vCells = (ic) => cellsVoltage(ic, iph, c);
    const vBypass = (ib) => -c.vtB * Math.log1p(ib / BYPASS.Is);
    let lo = 0;
    let hi = I + BYPASS.Is;
    // f(ic) = vCells(ic) − vBypass(I − ic) es decreciente en ic
    for (let k = 0; k < 50; k++) {
      const mid = (lo + hi) / 2;
      if (vCells(mid) - vBypass(I - mid) > 0) lo = mid; else hi = mid;
    }
    const ic = (lo + hi) / 2;
    return { v: vCells(ic), ic, ib: I - ic };
  }

  function moduleVoltage(I, subs, c) {
    let v = 0;
    for (const branches of subs) v += subVoltage(I, branches, c).v;
    return v;
  }

  /* -------------------------------------------------------
     Curva I-V / P-V completa
     G: irradiancia (W/m²) · T: temperatura de célula (°C)
     subFactors: por subcadena, fracción de irradiancia efectiva de
                 cada rama: [[f],[f],[f]] (full) o [[fL,fR],…] (half)
     ------------------------------------------------------- */
  function computeCurve(fit, G, T, subFactors = UNIFORM) {
    const c = conditions(fit, T);
    // Iph de cada rama: en half cell cada rama aporta la mitad
    const subs = subFactors.map((br) => br.map((f) => c.iphT * (G / 1000) * f / br.length));
    const totals = subs.map((br) => br.reduce((s, x) => s + x, 0));
    const iMax = Math.max(...totals);

    const empty = { points: [{ v: 0, i: 0, p: 0 }], voc: 0, isc: 0, vmpp: 0, impp: 0, pmax: 0, ff: 0, subs, c };
    if (iMax < 1e-6) return empty;

    // Muestreo en corriente: uniforme + puntos densos junto a cada codo
    const currents = [];
    const N = 400;
    for (let k = 0; k <= N; k++) currents.push(iMax * 1.01 * k / N);
    const knees = new Set(totals);
    subs.forEach((br) => br.forEach((x) => knees.add(x)));
    for (const iph of knees) {
      if (iph <= 0) continue;
      for (let k = 1; k <= 12; k++) {
        const d = Math.pow(10, -k / 2);
        currents.push(iph * (1 - d), iph * (1 + d * 0.01));
      }
    }
    currents.sort((x, y) => x - y);

    const points = [];
    let last = -1;
    for (const I of currents) {
      if (I < 0 || I - last < 1e-9) continue;
      last = I;
      const v = moduleVoltage(I, subs, c);
      points.push({ v, i: I, p: v * I });
      if (v < 0) break;                  // ya hemos cruzado V = 0
    }

    // Recortar en V = 0 (cortocircuito) interpolando
    const n = points.length;
    if (n >= 2 && points[n - 1].v < 0) {
      const a = points[n - 2], b = points[n - 1];
      const t = a.v / (a.v - b.v);
      const iscI = a.i + t * (b.i - a.i);
      points[n - 1] = { v: 0, i: iscI, p: 0 };
    }

    // MPP: máximo muestreado + refinamiento por búsqueda ternaria
    let k = 0;
    for (let j = 1; j < points.length; j++) if (points[j].p > points[k].p) k = j;
    let lo = points[Math.max(0, k - 1)].i, hi = points[Math.min(points.length - 1, k + 1)].i;
    const P = (I) => I * moduleVoltage(I, subs, c);
    for (let j = 0; j < 40; j++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (P(m1) < P(m2)) lo = m1; else hi = m2;
    }
    const impp = (lo + hi) / 2;
    const vmpp = moduleVoltage(impp, subs, c);
    const pmax = vmpp * impp;

    const voc = points[0].v;
    const isc = points[points.length - 1].i;
    const ff = voc > 0 && isc > 0 ? pmax / (voc * isc) : 0;

    return { points, voc, isc, vmpp, impp, pmax, ff, subs, c };
  }

  /* -------------------------------------------------------
     Punto de trabajo con carga resistiva R (V = I·R)
     ------------------------------------------------------- */
  function operatingPoint(curve, R) {
    const pts = curve.points;
    if (pts.length < 2) return { v: 0, i: 0, p: 0 };
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1];
      const fa = a.v - a.i * R, fb = b.v - b.i * R;
      if (fa >= 0 && fb <= 0) {
        const t = fa === fb ? 0 : fa / (fa - fb);
        const i = a.i + t * (b.i - a.i);
        const v = i * R;
        return { v, i, p: v * i };
      }
    }
    const l = pts[pts.length - 1];
    return { v: l.v, i: l.i, p: l.p };
  }

  // Tensión del módulo para una corriente impuesta (control por corriente)
  function voltageAtCurrent(curve, I) {
    if (curve.isc <= 0 || I <= 0) return curve.voc;
    if (I >= curve.isc) return 0;
    return Math.max(0, moduleVoltage(I, curve.subs, curve.c));
  }

  // Corriente del módulo para una tensión impuesta (control por tensión)
  function currentAtVoltage(curve, V) {
    if (curve.isc <= 0 || V >= curve.voc) return 0;
    if (V <= 0) return curve.isc;
    let lo = 0, hi = curve.isc;                // V(I) es decreciente
    for (let k = 0; k < 40; k++) {
      const mid = (lo + hi) / 2;
      if (moduleVoltage(mid, curve.subs, curve.c) > V) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Estado de cada subcadena a corriente I (tensión y si el bypass conduce)
  function substringState(curve, I) {
    return curve.subs.map((branches) => {
      const s = subVoltage(I, branches, curve.c);
      return { v: s.v, iCells: s.ic, iBypass: s.ib, bypassOn: s.ib > 0.01 };
    });
  }

  /* -------------------------------------------------------
     Sombra: de fracción sombreada por célula (fila a fila,
     6×10 full o 6×20 half) a factor de irradiancia por rama.
     Devuelve shade y factors como [[…ramas…] × 3 subcadenas].
     ------------------------------------------------------- */
  function substringShading(cellShade, cellType = 'full') {
    const L = LAYOUTS[cellType] || LAYOUTS.full;
    const colsPerBranch = L.cols / L.branches;
    const cellsPerBranch = 2 * colsPerBranch;
    const shade = [];
    for (let s = 0; s < NSUB; s++) {
      const br = [];
      for (let b = 0; b < L.branches; b++) {
        let max = 0, sum = 0;
        for (let r = 2 * s; r < 2 * s + 2; r++) {
          for (let col = b * colsPerBranch; col < (b + 1) * colsPerBranch; col++) {
            const v = cellShade ? cellShade[r * L.cols + col] || 0 : 0;
            max = Math.max(max, v);
            sum += v;
          }
        }
        br.push(SHADING_MODE === 'average' ? sum / cellsPerBranch : max);
      }
      shade.push(br);
    }
    const factors = shade.map((br) => br.map((sh) => 1 - sh * (1 - LEAF_TRANSMITTANCE)));
    return { shade, factors };
  }

  /* -------------------------------------------------------
     Límites fijos de los ejes con divisiones iguales:
     paso "redondo" (1, 2, 2.5, 5 × 10^k) y máximo múltiplo del paso
     ------------------------------------------------------- */
  function niceAxis(target, divisions = 10) {
    const raw = target / divisions;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10) * mag;
    return { max: Math.ceil(target / step - 1e-9) * step, step };
  }

  function axisLimits(fit) {
    const v = niceAxis(fit.voc * (1 + Math.abs(fit.beta) / 100 * 45) * 1.03);
    // 1.2 = irradiancia máxima del slider (1200 W/m²) respecto a STC
    const i = niceAxis(fit.isc * 1.2 * (1 + Math.max(0, fit.alpha) / 100 * 45) * 1.05);
    const p = niceAxis(fit.vmpp * fit.impp * 1.2 * (1 + Math.abs(fit.gamma) / 100 * 45) * 1.03);
    return { vMax: v.max, vStep: v.step, iMax: i.max, iStep: i.step, pMax: p.max, pStep: p.step };
  }

  return {
    NS, NSUB, ROWS, LAYOUTS,
    fitModule, computeCurve, operatingPoint, cellTemperature, voltageAtCurrent, currentAtVoltage,
    substringState, substringShading, axisLimits,
  };
})();
