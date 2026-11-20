/* =========================================================
   mppt.js — algoritmo Perturba y Observa (P&O) con límite
   de potencia. Sin interfaz: recibe la medida y devuelve la
   nueva consigna.
   ---------------------------------------------------------
   · Si la potencia supera el límite, se desplaza hacia
     circuito abierto (lado derecho del MPP) para reducirla.
   · Si no, P&O clásico: si la potencia bajó tras la última
     perturbación, se invierte el sentido.
   ========================================================= */

const MPPT = (() => {
  'use strict';

  function create() {
    return { prevP: null, dir: 1 };
  }

  /**
   * st:       estado del algoritmo (create())
   * ref:      consigna actual (V o A)
   * op:       medida {v, i, p}
   * size:     paso de perturbación (ΔV o ΔI)
   * pLimit:   potencia máxima permitida (W)
   * towardOC: +1 si aumentar la consigna acerca a circuito abierto
   *           (control por tensión), −1 si la aleja (control por corriente)
   */
  function step(st, ref, op, size, pLimit, towardOC) {
    if (op.p > pLimit) {
      st.dir = towardOC;                       // recortar potencia
    } else if (op.i < 1e-3) {
      st.dir = -towardOC;                      // en circuito abierto: volver hacia el MPP
    } else if (op.v < 1e-3) {
      st.dir = towardOC;                       // en cortocircuito: volver hacia el MPP
    } else if (st.prevP !== null && op.p < st.prevP - 1e-9) {
      st.dir = -st.dir;                        // P&O: la potencia bajó → invertir
    }
    st.prevP = op.p;
    return ref + st.dir * size;
  }

  return { create, step };
})();
