/* =========================================================
   i18n.js — textos de la interfaz en inglés y español
   ---------------------------------------------------------
   · En el HTML:  data-i18n="clave"        → textContent
                  data-i18n-html="clave"   → innerHTML
                  data-i18n-title="clave"  → title (tooltip)
                  data-i18n-aria="clave"   → aria-label
   · En JS:       I18N.t('clave')
   · Al cambiar de idioma se emite "i18n:change" en document.
   ========================================================= */

const I18N = (() => {
  'use strict';

  const DICT = {
    en: {
      'app.title': 'PV Module Simulator',
      'lang.label': 'Language',

      'pv.title': 'PV Configuration',
      'pv.tip': 'Configure module parameters',
      'pv.irr': 'Irradiance:',
      'pv.tamb': 'Ambient temperature:',
      'pv.shadow': 'Shadow:',
      'pv.size': 'Size:',
      'pv.rotate': 'Rotate 90°',
      'pv.rotate.tip': 'Rotate the newspaper 90° (or double-click it)',

      'tool.save': 'Save',
      'tool.save.tip': 'Save the current I-V / P-V curves for comparison',
      'tool.clear': 'Clear',
      'tool.clear.tip': 'Clear the saved curves',
      'tool.csv': 'Export',
      'tool.csv.tip': 'Export the current I-V / P-V curve as CSV',
      'confirm.clear.title': 'Delete saved curve?',
      'confirm.clear.body': 'The saved curve ({tag}) will be removed from both charts. This cannot be undone.',
      'btn.delete': 'Delete curve',
      'paper.aria': 'Newspaper shadow. Use the arrow keys to move it (Shift for larger steps) and R to rotate it.',

      'iv.title': 'I-V curve',
      'pv.chart': 'P-V curve',
      'circuit': 'Circuit',
      'thermo.title': 'Cell temp',
      'inv.power': 'Turn microinverter on / off',

      'out.title': 'Output configuration',
      'out.tip': 'Configure the output',
      'd.voltage': 'Voltage',
      'd.current': 'Current',
      'd.power': 'Power',
      'd.eff': 'Efficiency',
      'd.eff.tip': 'Module efficiency = P / (G · A)',
      'out.load': 'Load:',
      'mode.voltage': 'Voltage control',
      'mode.current': 'Current control',
      'sp.voltage': 'Voltage reference',
      'sp.current': 'Current reference',
      'sp.power': 'Max power (limit)',
      'ac.title': 'AC output',

      'scope.title': 'Oscilloscope',
      'scope.window': 'Time window',
      'scope.pause': 'Pause',
      'scope.run': 'Run',
      'scope.csv': 'Export CSV',
      'scope.csv.tip': 'Export the three channels (V, I, P) of the current time window as CSV',
      'scope.ch1': 'CH1 · Voltage',
      'scope.ch2': 'CH2 · Current',
      'scope.ch3': 'CH3 · Power',

      'cfg.title': 'Module parameters (STC)',
      'cfg.tech': 'Cell technology',
      'cell.full': 'Full cell',
      'cell.full.n': '60 cells',
      'cell.half': 'Half cell',
      'cell.half.n': '120 half-cells',
      'sch.full.aria': 'Full cell connection diagram',
      'sch.half.aria': 'Half cell connection diagram',
      'sch.full.cap': '3 substrings of 20 cells in series, one bypass diode each.<br>' +
                      'Each cell carries the module current: Impp = <b class="sch-ifull"></b> A.',
      'sch.half.cap': 'Each substring: left (L) and right (R) strings of 20 half-cells in parallel, ' +
                      'sharing one bypass diode.<br>Each half-cell gives half the current: ' +
                      'Impp/2 = <b class="sch-ihalf"></b> A; L + R = <b class="sch-ifull"></b> A.',
      'sch.str.full': '20 cells in series',
      'sch.str.L': 'L: 20 in series',
      'sch.str.R': 'R: 20 in series',
      'cfg.noct.tip': 'Nominal Operating Cell Temperature: 800 W/m², 20 °C ambient, 1 m/s wind',
      'cfg.length': 'Module length (mm)',
      'cfg.width': 'Module width (mm)',
      'btn.cancel': 'Cancel',
      'btn.apply': 'Apply',

      'out.type': 'Output type',
      'out.load.opt': 'Resistive load',
      'out.inv.opt': 'Microinverter',
      'inv.params': 'Microinverter parameters',
      'inv.mode': 'Control mode',
      'inv.mode.v': 'Voltage',
      'inv.mode.i': 'Current',
      'inv.eff': 'Efficiency (%)',
      'inv.grid': 'Grid voltage (V AC)',
      'inv.freq': 'MPPT frequency (Hz)',
      'inv.stepV': 'MPPT step ΔV (V)',
      'inv.stepI': 'MPPT step ΔI (A)',

      'ax.voltage': 'Voltage (V)',
      'ax.current': 'Current (A)',
      'ax.power': 'Power (W)',
      'lg.pv': 'P-V curve',
      'lg.iv': 'I-V curve',
      'lg.savedPV': 'Saved P-V',
      'lg.savedIV': 'Saved I-V',
      'lg.saved': 'Saved',
      'lg.load': 'Load line',
      'lg.limit': 'Power limit',
      'lg.op': 'Operating point',

      'tag.full': 'full cell',
      'tag.half': 'half cell',
      'err.params': 'Vmpp must be between 0 and Voc, and Impp between 0 and Isc. Adjust the highlighted values and apply again.',
    },

    es: {
      'app.title': 'Simulador de módulo FV',
      'lang.label': 'Idioma',

      'pv.title': 'Configuración FV',
      'pv.tip': 'Configurar los parámetros del módulo',
      'pv.irr': 'Irradiancia:',
      'pv.tamb': 'Temperatura ambiente:',
      'pv.shadow': 'Sombra:',
      'pv.size': 'Tamaño:',
      'pv.rotate': 'Girar 90°',
      'pv.rotate.tip': 'Girar el periódico 90° (o doble clic sobre él)',

      'tool.save': 'Guardar',
      'tool.save.tip': 'Guardar las curvas I-V / P-V actuales para comparar',
      'tool.clear': 'Borrar',
      'tool.clear.tip': 'Borrar las curvas guardadas',
      'tool.csv': 'Exportar',
      'tool.csv.tip': 'Exportar la curva I-V / P-V actual en CSV',
      'confirm.clear.title': '¿Borrar la curva guardada?',
      'confirm.clear.body': 'La curva guardada ({tag}) se quitará de las dos gráficas. No se puede deshacer.',
      'btn.delete': 'Borrar curva',
      'paper.aria': 'Sombra del periódico. Usa las flechas para moverla (Mayús para pasos grandes) y R para girarla.',

      'iv.title': 'Curva I-V',
      'pv.chart': 'Curva P-V',
      'circuit': 'Circuito',
      'thermo.title': 'T. célula',
      'inv.power': 'Encender / apagar el microinversor',

      'out.title': 'Configuración de salida',
      'out.tip': 'Configurar la salida',
      'd.voltage': 'Tensión',
      'd.current': 'Corriente',
      'd.power': 'Potencia',
      'd.eff': 'Eficiencia',
      'd.eff.tip': 'Eficiencia del módulo = P / (G · A)',
      'out.load': 'Carga:',
      'mode.voltage': 'Control por tensión',
      'mode.current': 'Control por corriente',
      'sp.voltage': 'Referencia de tensión',
      'sp.current': 'Referencia de corriente',
      'sp.power': 'Potencia máxima (límite)',
      'ac.title': 'Salida AC',

      'scope.title': 'Osciloscopio',
      'scope.window': 'Ventana de tiempo',
      'scope.pause': 'Pausa',
      'scope.run': 'Continuar',
      'scope.csv': 'Exportar CSV',
      'scope.csv.tip': 'Exportar en CSV los tres canales (V, I, P) de la ventana de tiempo actual',
      'scope.ch1': 'CH1 · Tensión',
      'scope.ch2': 'CH2 · Corriente',
      'scope.ch3': 'CH3 · Potencia',

      'cfg.title': 'Parámetros del módulo (STC)',
      'cfg.tech': 'Tecnología de célula',
      'cell.full': 'Célula entera',
      'cell.full.n': '60 células',
      'cell.half': 'Media célula',
      'cell.half.n': '120 medias células',
      'sch.full.aria': 'Esquema de conexión con células enteras',
      'sch.half.aria': 'Esquema de conexión con medias células',
      'sch.full.cap': '3 subcadenas de 20 células en serie, cada una con su diodo de bypass.<br>' +
                      'Cada célula conduce la corriente del módulo: Impp = <b class="sch-ifull"></b> A.',
      'sch.half.cap': 'Cada subcadena: cadenas izquierda (L) y derecha (R) de 20 medias células en paralelo, ' +
                      'con un diodo de bypass común.<br>Cada media célula da la mitad de corriente: ' +
                      'Impp/2 = <b class="sch-ihalf"></b> A; L + R = <b class="sch-ifull"></b> A.',
      'sch.str.full': '20 células en serie',
      'sch.str.L': 'L: 20 en serie',
      'sch.str.R': 'R: 20 en serie',
      'cfg.noct.tip': 'Temperatura nominal de operación de la célula: 800 W/m², 20 °C ambiente, viento 1 m/s',
      'cfg.length': 'Longitud del módulo (mm)',
      'cfg.width': 'Anchura del módulo (mm)',
      'btn.cancel': 'Cancelar',
      'btn.apply': 'Aplicar',

      'out.type': 'Tipo de salida',
      'out.load.opt': 'Carga resistiva',
      'out.inv.opt': 'Microinversor',
      'inv.params': 'Parámetros del microinversor',
      'inv.mode': 'Modo de control',
      'inv.mode.v': 'Tensión',
      'inv.mode.i': 'Corriente',
      'inv.eff': 'Eficiencia (%)',
      'inv.grid': 'Tensión de red (V AC)',
      'inv.freq': 'Frecuencia del MPPT (Hz)',
      'inv.stepV': 'Paso del MPPT ΔV (V)',
      'inv.stepI': 'Paso del MPPT ΔI (A)',

      'ax.voltage': 'Tensión (V)',
      'ax.current': 'Corriente (A)',
      'ax.power': 'Potencia (W)',
      'lg.pv': 'Curva P-V',
      'lg.iv': 'Curva I-V',
      'lg.savedPV': 'P-V guardada',
      'lg.savedIV': 'I-V guardada',
      'lg.saved': 'Guardada',
      'lg.load': 'Recta de carga',
      'lg.limit': 'Límite de potencia',
      'lg.op': 'Punto de trabajo',

      'tag.full': 'célula entera',
      'tag.half': 'media célula',
      'err.params': 'Vmpp debe estar entre 0 y Voc, e Impp entre 0 e Isc. Ajusta los valores marcados y vuelve a aplicar.',
    },
  };

  const STORE_KEY = 'pvsim.lang';
  let lang = 'en';
  try {
    const saved = localStorage.getItem(STORE_KEY);
    if (saved && DICT[saved]) lang = saved;
  } catch (e) { /* almacenamiento no disponible */ }

  function t(key) {
    const d = DICT[lang];
    if (d && key in d) return d[key];
    return key in DICT.en ? DICT.en[key] : key;
  }

  function apply(root = document) {
    root.querySelectorAll('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => { el.innerHTML = t(el.dataset.i18nHtml); });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => { el.title = t(el.dataset.i18nTitle); });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.dataset.i18nAria)); });
    document.documentElement.lang = lang;
    document.title = t('app.title');
    document.querySelectorAll('[data-lang]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.lang === lang);
    });
  }

  function setLang(l) {
    if (!DICT[l] || l === lang) return;
    lang = l;
    try { localStorage.setItem(STORE_KEY, l); } catch (e) { /* ignorar */ }
    apply();
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: l }));
  }

  // Botones de idioma de la cabecera
  document.querySelectorAll('[data-lang]').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });

  apply();

  return { t, setLang, apply, get lang() { return lang; } };
})();
