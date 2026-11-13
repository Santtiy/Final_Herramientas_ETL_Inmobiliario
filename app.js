"use strict";


/* ------------------------------------------------------------------
   Decodificación de los arrays columnares
   ------------------------------------------------------------------ */
const N = DATOS.n;
const DIC = DATOS.dic;

function decodificar(cadena) {
  const a = new Uint8Array(cadena.length);
  for (let i = 0; i < cadena.length; i++) {
    const c = cadena.charCodeAt(i);
    a[i] = c < 58 ? c - 48 : c - 87;
  }
  return a;
}

const CAT = {};
for (const k in DATOS.cat) CAT[k] = decodificar(DATOS.cat[k]);
const PRECIO = Float64Array.from(DATOS.precio);
const M2 = Float64Array.from(DATOS.m2, v => v / 100);
const LAT = Float64Array.from(DATOS.lat, v => v / 10000);
const LON = Float64Array.from(DATOS.lon, v => v / 10000);
const ANIO = Int16Array.from(DATOS.anio);
const ZONA = Uint8Array.from(DATOS.zona);
const CIUDAD_DE_ZONA = Uint8Array.from(DIC.zonas, z => z[1]);
const CIUDAD = Uint8Array.from(ZONA, z => CIUDAD_DE_ZONA[z]);

let anioMin = 9999, anioMax = 0;
for (let i = 0; i < N; i++) { if (ANIO[i] < anioMin) anioMin = ANIO[i]; if (ANIO[i] > anioMax) anioMax = ANIO[i]; }

/* ------------------------------------------------------------------
   Formato numérico en español: miles con punto, decimales con coma
   ------------------------------------------------------------------ */
function fmtNum(x, dec = 0) {
  if (!isFinite(x)) return "—";
  const partes = Math.abs(x).toFixed(dec).split(".");
  const entero = partes[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const texto = entero + (partes[1] ? "," + partes[1] : "");
  return (x < 0 && Number(partes.join(".")) !== 0 ? "−" : "") + texto;
}
const fmtUSD = x => !isFinite(x) ? "—" : (x < 0 && Math.round(-x) !== 0 ? "−" : "") + "$" + fmtNum(Math.abs(x), 0);
const fmtM2 = x => fmtNum(x, 1) + " m²";
const fmtPct = x => fmtNum(x, 1) + " %";
const fmtEntero = x => fmtNum(x, 0);

function escapar(t) {
  return String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ------------------------------------------------------------------
   Filtros
   ------------------------------------------------------------------ */
const $ = id => document.getElementById(id);
const filtro = { seg: -1, tipo: -1, ciudad: -1, agua: -1, pMin: -Infinity, pMax: Infinity, aMin: -Infinity, aMax: Infinity };
const SELECCION_BUFFER = new Int32Array(N);
let seleccion = SELECCION_BUFFER.subarray(0, 0);

function aplicarFiltros() {
  const f = filtro, out = SELECCION_BUFFER;
  const seg = CAT.seg, tipo = CAT.tipo, agua = CAT.agua;
  let k = 0;
  for (let i = 0; i < N; i++) {
    if (f.seg >= 0 && seg[i] !== f.seg) continue;
    if (f.tipo >= 0 && tipo[i] !== f.tipo) continue;
    if (f.ciudad >= 0 && CIUDAD[i] !== f.ciudad) continue;
    if (f.agua >= 0 && agua[i] !== f.agua) continue;
    const p = PRECIO[i];
    if (p < f.pMin || p > f.pMax) continue;
    const a = ANIO[i];
    if (a < f.aMin || a > f.aMax) continue;
    out[k++] = i;
  }
  return out.subarray(0, k);
}

function opciones(select, etiquetaTodas, etiquetas) {
  select.innerHTML = `<option value="-1">${etiquetaTodas}</option>` +
    etiquetas.map((e, i) => `<option value="${i}">${escapar(e)}</option>`).join("");
}

function leerFiltros() {
  filtro.seg = +$("f-seg").value;
  filtro.tipo = +$("f-tipo").value;
  filtro.ciudad = +$("f-ciudad").value;
  filtro.agua = +$("f-agua").value;
  const num = (id, def) => { const v = $(id).value.trim(); return v === "" || isNaN(+v) ? def : +v; };
  filtro.pMin = num("f-pmin", -Infinity);
  filtro.pMax = num("f-pmax", Infinity);
  filtro.aMin = num("f-amin", -Infinity);
  filtro.aMax = num("f-amax", Infinity);
}

/* Número de filtros que realmente restringen algo (para el botón plegable en móvil). */
function filtrosActivos() {
  const f = filtro;
  return (f.seg >= 0) + (f.tipo >= 0) + (f.ciudad >= 0) + (f.agua >= 0) +
    (f.pMin > -Infinity || f.pMax < Infinity) + (f.aMin > anioMin || f.aMax < anioMax);
}

/* Texto para cuando la combinación de filtros no deja ninguna venta. */
function mensajeVacio() {
  const f = filtro;
  if (f.pMin > f.pMax) return "El precio mínimo es mayor que el máximo. Corrige el rango o pulsa «Limpiar filtros».";
  if (f.aMin > f.aMax) return "El año mínimo es mayor que el máximo. Corrige el rango o pulsa «Limpiar filtros».";
  return "Ninguna venta cumple todos los filtros a la vez. Quita alguno o pulsa «Limpiar filtros».";
}

function avisoLienzo(id, vacio) {
  const el = $(id);
  el.hidden = !vacio;
  if (vacio) el.firstElementChild.textContent = mensajeVacio();
}

function limpiarFiltros() {
  ["f-seg", "f-tipo", "f-ciudad", "f-agua"].forEach(id => { $(id).value = "-1"; });
  ["f-pmin", "f-pmax"].forEach(id => { $(id).value = ""; });
  $("f-amin").value = anioMin;
  $("f-amax").value = anioMax;
}

/* ------------------------------------------------------------------
   Agrupaciones y medidas
   ------------------------------------------------------------------ */
function etiquetasNumericas(singular, plural) {
  return Array.from({ length: 36 }, (_, n) => `${n} ${n === 1 ? singular : plural}`);
}

const AGRUPACIONES = {
  zona:    { nombre: "Zona", arr: ZONA, etiquetas: DIC.zonas.map(z => z[0]) },
  ciudad:  { nombre: "Ciudad", arr: CIUDAD, etiquetas: DIC.ciudades },
  tipo:    { nombre: "Tipo de vivienda", arr: CAT.tipo, etiquetas: DIC.tipos },
  seg:     { nombre: "Segmento de precio", arr: CAT.seg, etiquetas: DIC.segmentos },
  decada:  { nombre: "Década de construcción", arr: CAT.decada, etiquetas: DIC.decadas },
  hab:     { nombre: "Habitaciones", arr: CAT.hab, etiquetas: etiquetasNumericas("habitación", "habitaciones") },
  banos:   { nombre: "Baños", arr: CAT.banos, etiquetas: etiquetasNumericas("baño", "baños") },
  calidad: { nombre: "Calidad", arr: CAT.calidad, etiquetas: DIC.calidades },
  vista:   { nombre: "Nivel de vista", arr: CAT.vista, etiquetas: DIC.vistas },
  agua:    { nombre: "Frente al agua", arr: CAT.agua, etiquetas: ["Sin frente al agua", "Con frente al agua"] },
  sotano:  { nombre: "Sótano", arr: CAT.sotano, etiquetas: ["Sin sótano", "Con sótano"] },
  renov:   { nombre: "Renovada", arr: CAT.renov, etiquetas: ["No renovada", "Renovada"] },
  mes:     { nombre: "Mes de venta", arr: CAT.mes, etiquetas: DIC.meses },
};

function mediana(valores) {
  const n = valores.length;
  if (!n) return NaN;
  const a = Float64Array.from(valores).sort();
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2;
}

const MEDIDAS = {
  prom: { nombre: "Precio promedio", fmt: fmtUSD, calc: g => g.sp / g.n },
  med:  { nombre: "Precio mediano", fmt: fmtUSD, calc: g => mediana(g.precios) },
  pm2:  { nombre: "Precio por m²", fmt: fmtUSD, calc: g => g.sp / g.sm },
  area: { nombre: "Área promedio", fmt: fmtM2, calc: g => g.sm / g.n },
  n:    { nombre: "Número de ventas", fmt: fmtEntero, calc: g => g.n },
  pct:  { nombre: "% del total", fmt: fmtPct, calc: (g, total) => 100 * g.n / total },
};

/* Agrega la selección por grupo en una sola pasada. */
function agregar(sel, clave, medidaClave) {
  const agr = AGRUPACIONES[clave], arr = agr.arr, G = agr.etiquetas.length;
  const n = new Float64Array(G), sp = new Float64Array(G), sm = new Float64Array(G);
  const conMediana = medidaClave === "med";
  const precios = conMediana ? Array.from({ length: G }, () => []) : null;
  for (let j = 0; j < sel.length; j++) {
    const i = sel[j], g = arr[i];
    n[g]++; sp[g] += PRECIO[i]; sm[g] += M2[i];
    if (conMediana) precios[g].push(PRECIO[i]);
  }
  const medida = MEDIDAS[medidaClave], filas = [];
  for (let g = 0; g < G; g++) {
    if (!n[g]) continue;
    const grupo = { n: n[g], sp: sp[g], sm: sm[g], precios: conMediana ? precios[g] : null };
    filas.push({ orden: g, etiqueta: agr.etiquetas[g], n: n[g], valor: medida.calc(grupo, sel.length) });
  }
  return filas;
}

function resumen(sel) {
  let sp = 0, sm = 0;
  const precios = new Float64Array(sel.length);
  for (let j = 0; j < sel.length; j++) { const i = sel[j]; sp += PRECIO[i]; sm += M2[i]; precios[j] = PRECIO[i]; }
  return { n: sel.length, sp, sm, precios };
}

/* ------------------------------------------------------------------
   Escalas
   ------------------------------------------------------------------ */
function pasoBonito(bruto) {
  const mag = Math.pow(10, Math.floor(Math.log10(bruto)));
  const r = bruto / mag;
  return (r <= 1 ? 1 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 5 ? 5 : 10) * mag;
}
function marcas(min, max, cuenta) {
  if (!(max > min)) { max = min + (min === 0 ? 1 : Math.abs(min)); }
  const paso = pasoBonito((max - min) / cuenta);
  const ini = Math.floor(min / paso) * paso, fin = Math.ceil(max / paso) * paso;
  const lista = [];
  for (let v = ini; v <= fin + paso * 1e-9; v += paso) lista.push(Math.round(v / paso) * paso);
  return lista;
}

/* ------------------------------------------------------------------
   Explorador: gráficos SVG y tabla
   ------------------------------------------------------------------ */
function medirTexto(t, px = 12) { return String(t).length * px * 0.56; }

function svgBarras(filas, medida, ancho) {
  const maxEtq = Math.max(...filas.map(f => medirTexto(f.etiqueta)));
  const etqW = Math.min(Math.max(90, maxEtq + 12), ancho * 0.4);
  const valW = Math.max(...filas.map(f => medirTexto(medida.fmt(f.valor)))) + 14;
  const sup = 26, alto = 26, plotW = Math.max(60, ancho - etqW - valW);
  const H = sup + filas.length * alto + 6;
  const maxV = Math.max(0, ...filas.map(f => f.valor));
  const ticks = marcas(0, maxV, ancho < 520 ? 3 : 5);
  const tope = ticks[ticks.length - 1];
  const x = v => etqW + (v / tope) * plotW;
  const idxMax = filas.reduce((m, f, i) => f.valor > filas[m].valor ? i : m, 0);
  let s = `<svg viewBox="0 0 ${ancho} ${H}" width="${ancho}" height="${H}" role="img" aria-label="Barras horizontales">`;
  s += `<g class="eje">`;
  for (const t of ticks) {
    s += `<line x1="${x(t)}" x2="${x(t)}" y1="${sup - 6}" y2="${H}"/>`;
    s += `<text x="${x(t)}" y="${sup - 12}" text-anchor="middle">${escapar(medida.fmt(t))}</text>`;
  }
  s += `</g>`;
  filas.forEach((f, i) => {
    const y = sup + i * alto;
    const w = Math.max(0, x(Math.max(0, f.valor)) - etqW);
    let etq = f.etiqueta;
    while (medirTexto(etq) > etqW - 10 && etq.length > 4) etq = etq.slice(0, -2) + "…";
    s += `<text x="${etqW - 10}" y="${y + alto / 2 + 4}" text-anchor="end">${escapar(etq)}</text>`;
    s += `<rect class="b${i === idxMax ? " max" : ""}" x="${etqW}" y="${y + 4}" width="${w}" height="${alto - 8}"><title>${escapar(f.etiqueta)}: ${escapar(medida.fmt(f.valor))} · ${fmtEntero(f.n)} ventas</title></rect>`;
    s += `<text class="etq-valor num" x="${etqW + w + 6}" y="${y + alto / 2 + 4}">${escapar(medida.fmt(f.valor))}</text>`;
  });
  s += `<line class="base" x1="${etqW}" x2="${etqW}" y1="${sup - 6}" y2="${H}"/>`;
  return s + `</svg>`;
}

function svgColumnasOLinea(filas, medida, ancho, tipo) {
  const izq = Math.max(...marcas(0, Math.max(...filas.map(f => f.valor)), 5).map(t => medirTexto(medida.fmt(t)))) + 12;
  const der = 12, sup = 16, plotW = Math.max(60, ancho - izq - der);
  const banda = plotW / filas.length;
  const maxEtq = Math.max(...filas.map(f => medirTexto(f.etiqueta)));
  const rotar = maxEtq > banda - 6;
  const inf = rotar ? Math.min(170, maxEtq * 0.72 + 18) : 30;
  const plotH = ancho < 520 ? 240 : 320, H = sup + plotH + inf;
  const valores = filas.map(f => f.valor);
  let vMin = 0, vMax = Math.max(0, ...valores);
  if (tipo === "linea" && filas.length > 1) {
    const lo = Math.min(...valores), hi = Math.max(...valores), pad = (hi - lo) * 0.15 || Math.abs(hi) * 0.1 || 1;
    vMin = Math.max(0, lo - pad); vMax = hi + pad;
  }
  const ticks = marcas(vMin, vMax, 5);
  const t0 = ticks[0], t1 = ticks[ticks.length - 1];
  const y = v => sup + plotH - ((v - t0) / (t1 - t0)) * plotH;
  const cx = i => izq + banda * (i + 0.5);
  const idxMax = valores.indexOf(Math.max(...valores));
  let s = `<svg viewBox="0 0 ${ancho} ${H}" width="${ancho}" height="${H}" role="img" aria-label="${tipo === "linea" ? "Gráfico de línea" : "Columnas"}">`;
  s += `<g class="eje">`;
  for (const t of ticks) {
    s += `<line x1="${izq}" x2="${ancho - der}" y1="${y(t)}" y2="${y(t)}"/>`;
    s += `<text x="${izq - 8}" y="${y(t) + 4}" text-anchor="end">${escapar(medida.fmt(t))}</text>`;
  }
  s += `</g>`;
  if (tipo === "columnas") {
    const w = Math.max(1, banda * 0.72);
    filas.forEach((f, i) => {
      const yv = y(Math.max(t0, f.valor));
      s += `<rect class="b${i === idxMax ? " max" : ""}" x="${cx(i) - w / 2}" y="${yv}" width="${w}" height="${Math.max(0, y(t0) - yv)}"><title>${escapar(f.etiqueta)}: ${escapar(medida.fmt(f.valor))} · ${fmtEntero(f.n)} ventas</title></rect>`;
    });
  } else {
    const puntos = filas.map((f, i) => `${cx(i).toFixed(1)},${y(f.valor).toFixed(1)}`).join(" ");
    s += `<polyline points="${puntos}" fill="none" stroke="var(--acento)" stroke-width="2" stroke-linejoin="round"/>`;
    filas.forEach((f, i) => {
      s += `<circle cx="${cx(i)}" cy="${y(f.valor)}" r="${filas.length > 30 ? 2.5 : 4}" fill="var(--papel)" stroke="var(--acento)" stroke-width="2"><title>${escapar(f.etiqueta)}: ${escapar(medida.fmt(f.valor))} · ${fmtEntero(f.n)} ventas</title></circle>`;
    });
  }
  s += `<line class="base" x1="${izq}" x2="${ancho - der}" y1="${y(t0)}" y2="${y(t0)}"/>`;
  const cada = Math.max(1, Math.ceil(filas.length / Math.max(1, Math.floor(plotW / (rotar ? 15 : 40)))));
  filas.forEach((f, i) => {
    if (i % cada) return;
    let etq = f.etiqueta;
    if (rotar && etq.length > 26) etq = etq.slice(0, 25) + "…";
    const yy = sup + plotH + 16;
    s += rotar
      ? `<text x="${cx(i)}" y="${yy}" text-anchor="end" transform="rotate(-40 ${cx(i)} ${yy})">${escapar(etq)}</text>`
      : `<text x="${cx(i)}" y="${yy}" text-anchor="middle">${escapar(etq)}</text>`;
  });
  return s + `</svg>`;
}

function renderExplorador() {
  const t0 = performance.now();
  const medidaClave = $("e-medida").value, grupoClave = $("e-grupo").value;
  const tipo = $("e-grafico").value, orden = $("e-orden").value, top = +$("e-top").value;
  const medida = MEDIDAS[medidaClave], agr = AGRUPACIONES[grupoClave];
  let filas = agregar(seleccion, grupoClave, medidaClave);
  const totalGrupos = filas.length;
  if (orden === "desc") filas.sort((a, b) => b.valor - a.valor || a.orden - b.orden);
  else if (orden === "asc") filas.sort((a, b) => a.valor - b.valor || a.orden - b.orden);
  else filas.sort((a, b) => a.orden - b.orden);
  if (top > 0) filas = filas.slice(0, top);

  const grafico = $("grafico");
  const ancho = Math.max(280, Math.floor(grafico.clientWidth || 800));
  const vacio = !filas.length;
  $("tabla-envoltura").hidden = vacio;
  if (vacio) grafico.innerHTML = `<div class="vacio" role="status">${escapar(mensajeVacio())}</div>`;
  else if (tipo === "tabla") grafico.innerHTML = "";
  else if (tipo === "barras") grafico.innerHTML = svgBarras(filas, medida, ancho);
  else grafico.innerHTML = svgColumnasOLinea(filas, medida, ancho, tipo);
  grafico.style.display = tipo === "tabla" && filas.length ? "none" : "";

  const r = resumen(seleccion);
  const total = r.n ? medida.calc({ n: r.n, sp: r.sp, sm: r.sm, precios: medidaClave === "med" ? r.precios : null }, r.n) : NaN;
  const cuerpo = filas.map(f =>
    `<tr><td>${escapar(f.etiqueta)}</td><td class="d">${escapar(medida.fmt(f.valor))}</td><td class="d">${fmtEntero(f.n)}</td></tr>`).join("");
  $("tabla").innerHTML =
    `<thead><tr><th>${escapar(agr.nombre)}</th><th class="d">${escapar(medida.nombre)}${medidaClave === "area" ? " (m²)" : ""}</th><th class="d">Ventas</th></tr></thead>` +
    `<tbody>${cuerpo}</tbody>` +
    `<tfoot><tr><td>Total de la selección</td><td class="d">${escapar(medida.fmt(total))}</td><td class="d">${fmtEntero(r.n)}</td></tr></tfoot>`;
  $("nota-grupos").textContent = vacio ? "" : filas.length < totalGrupos
    ? `Mostrando ${filas.length} de ${totalGrupos} grupos`
    : `${totalGrupos} ${totalGrupos === 1 ? "grupo" : "grupos"}`;
  $("nota-tiempo").textContent = `Calculado en ${fmtNum(performance.now() - t0, 1)} ms`;
}

function renderCifras() {
  const r = resumen(seleccion);
  $("k-n").textContent = fmtEntero(r.n);
  $("k-prom").textContent = r.n ? fmtUSD(r.sp / r.n) : "—";
  $("k-med").textContent = r.n ? fmtUSD(mediana(r.precios)) : "—";
  $("k-pm2").textContent = r.n ? fmtUSD(r.sp / r.sm) : "—";
  const conteo = $("conteo");
  conteo.textContent = fmtEntero(r.n);
  conteo.classList.toggle("parcial", r.n !== N);
  const activos = filtrosActivos();
  $("boton-filtros").textContent = activos ? `Filtros (${activos})` : "Filtros";
}

/* ------------------------------------------------------------------
   Mapa en canvas
   ------------------------------------------------------------------ */
const COLORES_SEGMENTO = ["#4f8fd8", "#43b5a0", "#e7b04b", "#e4573f"];
const LIMITES = (() => {
  let la0 = 90, la1 = -90, lo0 = 180, lo1 = -180;
  for (let i = 0; i < N; i++) {
    if (LAT[i] < la0) la0 = LAT[i]; if (LAT[i] > la1) la1 = LAT[i];
    if (LON[i] < lo0) lo0 = LON[i]; if (LON[i] > lo1) lo1 = LON[i];
  }
  const kx = Math.cos(((la0 + la1) / 2) * Math.PI / 180);
  return { la0, la1, lo0, lo1, kx, w: (lo1 - lo0) * kx, h: la1 - la0 };
})();
const CENTROS_CIUDAD = (() => {
  const G = DIC.ciudades.length, n = new Float64Array(G), sla = new Float64Array(G), slo = new Float64Array(G);
  for (let i = 0; i < N; i++) { const c = CIUDAD[i]; n[c]++; sla[c] += LAT[i]; slo[c] += LON[i]; }
  return DIC.ciudades.map((nombre, c) => ({ nombre, n: n[c], lat: sla[c] / n[c], lon: slo[c] / n[c] }))
    .sort((a, b) => b.n - a.n).slice(0, 10);
})();

let puntosMapa = null;
const CELDA = 10;

function dibujarMapa() {
  const canvas = $("mapa"), marco = $("mapa-marco");
  const ancho = Math.max(280, marco.clientWidth);
  const alto = Math.round(Math.min(ancho * LIMITES.h / LIMITES.w, window.innerHeight * 0.85, 780));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(ancho * dpr); canvas.height = Math.round(alto * dpr);
  canvas.style.height = alto + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#14171c";
  ctx.fillRect(0, 0, ancho, alto);

  const margen = 14;
  const escala = Math.min((ancho - 2 * margen) / LIMITES.w, (alto - 2 * margen) / LIMITES.h);
  const ox = (ancho - LIMITES.w * escala) / 2, oy = (alto - LIMITES.h * escala) / 2;
  const px = lon => ox + (lon - LIMITES.lo0) * LIMITES.kx * escala;
  const py = lat => oy + (LIMITES.la1 - lat) * escala;

  const sel = seleccion, n = sel.length, seg = CAT.seg;
  const xs = new Float32Array(n), ys = new Float32Array(n), idx = new Int32Array(n);
  const radio = ancho < 600 ? 1.1 : 1.5, lado = radio * 2;
  const cuenta = [0, 0, 0, 0];
  let k = 0;
  ctx.globalAlpha = n > 8000 ? 0.62 : 0.85;
  for (let s = 0; s < 4; s++) {
    ctx.fillStyle = COLORES_SEGMENTO[s];
    for (let j = 0; j < n; j++) {
      const i = sel[j];
      if (seg[i] !== s) continue;
      const x = px(LON[i]), y = py(LAT[i]);
      ctx.fillRect(x - radio, y - radio, lado, lado);
      xs[k] = x; ys[k] = y; idx[k] = i; k++;
      cuenta[s]++;
    }
  }
  ctx.globalAlpha = 1;

  ctx.font = "12px " + getComputedStyle(document.body).fontFamily;
  ctx.textAlign = "center";
  ctx.lineWidth = 3; ctx.strokeStyle = "rgba(20,23,28,.85)"; ctx.fillStyle = "rgba(233,230,224,.78)";
  for (const c of CENTROS_CIUDAD) {
    const x = px(c.lon), y = py(c.lat);
    ctx.strokeText(c.nombre, x, y); ctx.fillText(c.nombre, x, y);
  }

  const rejilla = new Map();
  for (let j = 0; j < k; j++) {
    const clave = ((xs[j] / CELDA) | 0) * 4096 + ((ys[j] / CELDA) | 0);
    const celda = rejilla.get(clave);
    if (celda) celda.push(j); else rejilla.set(clave, [j]);
  }
  puntosMapa = { xs, ys, idx, rejilla };

  $("leyenda").innerHTML = DIC.segmentos.map((nombre, s) =>
    `<span><b style="background:${COLORES_SEGMENTO[s]}"></b>${escapar(nombre)} <em>${fmtEntero(cuenta[s])}</em></span>`).join("");
  avisoLienzo("vacio-mapa", n === 0);
  ocultarTip();
}

function puntoCercano(x, y) {
  if (!puntosMapa) return -1;
  const { xs, ys, rejilla } = puntosMapa;
  const cx = (x / CELDA) | 0, cy = (y / CELDA) | 0;
  let mejor = -1, mejorD = 49;
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
    const celda = rejilla.get((cx + dx) * 4096 + (cy + dy));
    if (!celda) continue;
    for (const j of celda) {
      const d = (xs[j] - x) ** 2 + (ys[j] - y) ** 2;
      if (d <= mejorD) { mejorD = d; mejor = j; }
    }
  }
  return mejor;
}

function ocultarTip() { $("tip-mapa").style.display = "none"; $("anillo").style.display = "none"; }

function moverSobreMapa(ev) {
  const rect = $("mapa").getBoundingClientRect();
  const x = ev.clientX - rect.left, y = ev.clientY - rect.top;
  const j = puntoCercano(x, y);
  if (j < 0) { ocultarTip(); return; }
  const i = puntosMapa.idx[j];
  const tip = $("tip-mapa"), anillo = $("anillo");
  tip.innerHTML = `<strong>${escapar(DIC.zonas[ZONA[i]][0])}</strong>` +
    `Precio: ${fmtUSD(PRECIO[i])}<br>Superficie: ${fmtM2(M2[i])}<br>Construida en ${ANIO[i]}`;
  tip.style.display = "block";
  anillo.style.display = "block";
  anillo.style.left = puntosMapa.xs[j] + "px"; anillo.style.top = puntosMapa.ys[j] + "px";
  const tw = tip.offsetWidth, th = tip.offsetHeight, w = rect.width;
  let tx = puntosMapa.xs[j] + 14, ty = puntosMapa.ys[j] - th - 10;
  if (tx + tw > w) tx = puntosMapa.xs[j] - tw - 14;
  if (tx < 0) tx = 4;
  if (ty < 0) ty = puntosMapa.ys[j] + 14;
  tip.style.left = tx + "px"; tip.style.top = ty + "px";
}

/* ------------------------------------------------------------------
   Dispersión m² contra precio
   ------------------------------------------------------------------ */
function regresion(sel) {
  const n = sel.length;
  let sx = 0, sy = 0;
  for (let j = 0; j < n; j++) { sx += M2[sel[j]]; sy += PRECIO[sel[j]]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, syy = 0, sxy = 0;
  for (let j = 0; j < n; j++) {
    const dx = M2[sel[j]] - mx, dy = PRECIO[sel[j]] - my;
    sxx += dx * dx; syy += dy * dy; sxy += dx * dy;
  }
  const b = sxy / sxx;
  return { n, b, a: my - b * mx, r: sxy / Math.sqrt(sxx * syy) };
}

function dibujarDispersion() {
  const canvas = $("dispersion");
  const ancho = Math.max(260, canvas.parentElement.clientWidth);
  const alto = Math.round(Math.min(480, Math.max(280, ancho * 0.7)));
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(ancho * dpr); canvas.height = Math.round(alto * dpr);
  canvas.style.height = alto + "px";
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, ancho, alto);
  const estilo = getComputedStyle(document.documentElement);
  const color = v => estilo.getPropertyValue(v).trim();
  const fuente = getComputedStyle(document.body).fontFamily;

  const sel = seleccion, n = sel.length;
  let xMax = 0, yMax = 0;
  for (let j = 0; j < n; j++) { const i = sel[j]; if (M2[i] > xMax) xMax = M2[i]; if (PRECIO[i] > yMax) yMax = PRECIO[i]; }
  const tx = marcas(0, xMax || 100, ancho < 480 ? 4 : 6), ty = marcas(0, yMax || 1e6, 5);
  const X1 = tx[tx.length - 1], Y1 = ty[ty.length - 1];
  ctx.font = "12px " + fuente;
  const izq = Math.max(...ty.map(t => ctx.measureText(fmtUSD(t)).width)) + 12, der = 10, sup = 10, inf = 40;
  const pw = ancho - izq - der, ph = alto - sup - inf;
  const X = v => izq + (v / X1) * pw, Y = v => sup + ph - (v / Y1) * ph;

  ctx.strokeStyle = color("--linea-suave"); ctx.lineWidth = 1; ctx.fillStyle = color("--tinta-2");
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  for (const t of ty) {
    const y = Math.round(Y(t)) + 0.5;
    ctx.beginPath(); ctx.moveTo(izq, y); ctx.lineTo(ancho - der, y); ctx.stroke();
    ctx.fillText(fmtUSD(t), izq - 8, y);
  }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  for (const t of tx) {
    const x = Math.round(X(t)) + 0.5;
    ctx.beginPath(); ctx.moveTo(x, sup); ctx.lineTo(x, sup + ph); ctx.stroke();
    ctx.fillText(fmtNum(t), x, sup + ph + 8);
  }
  ctx.fillText("m² construidos", izq + pw / 2, sup + ph + 24);
  ctx.strokeStyle = color("--tinta-2");
  ctx.beginPath(); ctx.moveTo(izq, sup + ph + 0.5); ctx.lineTo(ancho - der, sup + ph + 0.5); ctx.stroke();

  ctx.fillStyle = color("--tinta");
  ctx.globalAlpha = n > 5000 ? 0.16 : n > 1000 ? 0.28 : 0.5;
  for (let j = 0; j < n; j++) { const i = sel[j]; ctx.fillRect(X(M2[i]) - 1, Y(PRECIO[i]) - 1, 2, 2); }
  ctx.globalAlpha = 1;

  const reg = n >= 2 ? regresion(sel) : null;
  const valida = reg && isFinite(reg.b) && isFinite(reg.r);
  if (valida) {
    ctx.save();
    ctx.beginPath(); ctx.rect(izq, sup, pw, ph); ctx.clip();
    ctx.strokeStyle = color("--acento"); ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(X(0), Y(reg.a)); ctx.lineTo(X(X1), Y(reg.a + reg.b * X1)); ctx.stroke();
    ctx.restore();
  }
  $("s-r").textContent = valida ? fmtNum(reg.r, 2) : "—";
  $("s-pend").textContent = valida ? (reg.b < 0 ? "" : "+") + fmtUSD(reg.b) : "—";
  $("s-n").textContent = fmtEntero(n);
  avisoLienzo("vacio-dispersion", n === 0);
}

/* ------------------------------------------------------------------
   Simulador (regresión lineal múltiple del proyecto)
   ------------------------------------------------------------------ */
const MODELO = { intercepto: -552590.14, superficie: 1782.2041, calidad: 94984.8375, agua: 590262.6690, vista: 70463.2666 };
const NOMBRES_VISTA = DIC.vistas;

function estimarPrecio(superficie, calidad, agua, vista) {
  return MODELO.intercepto + MODELO.superficie * superficie + MODELO.calidad * calidad +
    MODELO.agua * agua + MODELO.vista * vista;
}

function actualizarSimulador() {
  const sup = +$("m-sup").value, cal = +$("m-cal").value, vis = +$("m-vis").value, agua = +$("m-agua").value;
  $("o-sup").textContent = fmtNum(sup) + " m²";
  $("o-cal").textContent = cal;
  $("o-vis").textContent = `${vis} · ${NOMBRES_VISTA[vis]}`;
  $("o-agua").textContent = agua ? "Sí" : "No";
  const p = estimarPrecio(sup, cal, agua, vis);
  const salida = $("m-precio");
  salida.textContent = fmtUSD(p);
  salida.classList.toggle("negativo", p < 0);
  $("m-aviso").classList.toggle("alerta", p < 0);
}

/* ------------------------------------------------------------------
   Orquestación
   ------------------------------------------------------------------ */
let pendiente = 0;
function programar(fn) {
  cancelAnimationFrame(pendiente);
  pendiente = requestAnimationFrame(fn);
}
function actualizarTodo() {
  leerFiltros();
  seleccion = aplicarFiltros();
  renderCifras();
  renderExplorador();
  dibujarMapa();
  dibujarDispersion();
}

function iniciar() {
  opciones($("f-seg"), "Todos", DIC.segmentos);
  opciones($("f-tipo"), "Todos", DIC.tipos);
  opciones($("f-ciudad"), "Todas", DIC.ciudades);
  for (const id of ["f-amin", "f-amax"]) { $(id).min = anioMin; $(id).max = anioMax; }
  limpiarFiltros();

  for (const id of ["f-seg", "f-tipo", "f-ciudad", "f-agua", "f-pmin", "f-pmax", "f-amin", "f-amax"]) {
    $(id).addEventListener("input", () => programar(actualizarTodo));
  }
  $("conteo-total").textContent = fmtEntero(N);
  $("limpiar").addEventListener("click", () => { cancelAnimationFrame(pendiente); limpiarFiltros(); actualizarTodo(); });
  $("boton-filtros").addEventListener("click", () => {
    const abierto = $("filtros").classList.toggle("abierto");
    $("boton-filtros").setAttribute("aria-expanded", abierto);
  });
  for (const id of ["e-medida", "e-grupo", "e-grafico", "e-orden", "e-top"]) {
    $(id).addEventListener("change", renderExplorador);
  }
  for (const id of ["m-sup", "m-cal", "m-vis", "m-agua"]) $(id).addEventListener("input", actualizarSimulador);

  const mapa = $("mapa");
  mapa.addEventListener("mousemove", moverSobreMapa);
  mapa.addEventListener("mouseleave", ocultarTip);

  let anchoPrevio = window.innerWidth, temporizador = 0;
  window.addEventListener("resize", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => {
      if (window.innerWidth === anchoPrevio) return;
      anchoPrevio = window.innerWidth;
      renderExplorador(); dibujarMapa(); dibujarDispersion();
    }, 120);
  });

  actualizarTodo();
  actualizarSimulador();
}

iniciar();
