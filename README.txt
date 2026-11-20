==============================================================
 PV VIRTUAL LAB - PV Module Simulator
==============================================================

A virtual laboratory for studying photovoltaic modules. It runs
directly in the web browser, with nothing to install, on
computers, tablets and phones. The interface is available in
English and Spanish.

Teaching Innovation Project 2025-26 - University of Valladolid
(Universidad de Valladolid, Spain).

Open the simulator:
  https://alberredon.github.io/PV-virtual-lab/


--------------------------------------------------------------
 FEATURES
--------------------------------------------------------------

PV module
  - Adjustable irradiance (0-1200 W/m²) and ambient temperature
    (-20 to 50 °C).
  - Cell temperature calculated from the NOCT and shown on a
    thermometer.
  - Datasheet parameters at STC: Voc, Isc, Vmpp, Impp,
    temperature coefficients α, β, γ, NOCT and module
    dimensions.
  - Cell technology: full cell (60 cells) or half cell
    (120 half-cells), with the connection diagram of each.

Partial shading
  - A draggable newspaper covers part of the module. It can be
    resized, rotated 90° and moved with the mouse, by touch or
    with the keyboard (arrow keys and R).
  - The shading percentage of each substring is shown, along
    with which bypass diodes are conducting.

Curves and parameters
  - Real-time I-V and P-V curves with the operating point.
  - Characteristic parameters: Voc, Vmpp, Isc, Impp, Pmax and
    fill factor (FF).
  - Save a curve to compare it with the current one.
  - Export the current curve as CSV.

Output
  - Resistive load (0-100 Ω, logarithmic scale) with its load
    line.
  - Microinverter with voltage or current control, maximum
    power point tracking (MPPT) using the perturb and observe
    method, and AC output.
  - Displays for voltage, current, power and module efficiency.

Oscilloscope
  - Three channels (voltage, current and power) with a time
    window from 5 to 60 s, pause, and CSV export.

Projector mode
  - Full screen and larger text for classroom use.


--------------------------------------------------------------
 PHYSICAL MODEL
--------------------------------------------------------------

  - Single-diode model per cell. The ideality factor (n), series
    resistance (Rs) and shunt resistance (Rsh) are fitted from
    the datasheet values entered.
  - Temperature dependence through the coefficients α (Isc),
    β (Voc) and γ (Pmax).
  - Cell temperature:  Tc = Ta + (NOCT - 20) · G / 800.
  - Three substrings of 20 cells (or 2 × 20 half-cells in
    parallel), each with its own bypass diode.
  - Module efficiency:  η = P / (G · A).


--------------------------------------------------------------
 RUNNING LOCALLY
--------------------------------------------------------------

No build step is needed. Serve the folder with any static web
server, for example:

    python -m http.server 8000

and open http://localhost:8000 in the browser.

The charting library (Chart.js 4.4.1) is loaded from a CDN, so
an internet connection is required.


--------------------------------------------------------------
 PROJECT STRUCTURE
--------------------------------------------------------------

  index.html        Page and circuit diagram (SVG)
  img/logo-uva.svg  University of Valladolid logo
  img/favicon.svg   Browser tab icon
  css/styles.css    Styles
  js/i18n.js        English and Spanish texts
  js/pvModel.js     PV module model
  js/mppt.js        MPPT algorithm (perturb and observe)
  js/charts.js      I-V and P-V curves
  js/scope.js       Oscilloscope
  js/ui.js          Controls and interaction
  js/main.js        Links the model, interface and charts


--------------------------------------------------------------
 AUTHOR, CITATION AND LICENSE
--------------------------------------------------------------

Author:   Alberto Redondo Plaza
Code:     https://github.com/alberredon/PV-virtual-lab
DOI:      [to be completed with the Zenodo DOI]
License:  [to be completed]
