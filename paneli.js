"use strict";

const $ = (id) => document.getElementById(id);
const API = "https://api.open-meteo.com/v1/forecast";
const GEOCODE_API = "https://nominatim.openstreetmap.org/search";
const STORE_KEY = "paneli_konfig_v1";
const COLORS = ["#ffb020", "#5aa9e6", "#7ed957", "#ff6b6b", "#c792ea", "#f6c945", "#4dd0c8"];

let state = loadState();
let map, houseMarker;
const arrayMarkers = new Map(); // id -> L.Marker
const arrayLines = new Map(); // id -> L.Polyline (azimutna črta)
let weather = null; // zadnji odgovor Open-Meteo
let todayChart = null;
let weekChart = null;
let saveTimer = null;
let recomputeTimer = null;

// ---- Shranjevanje -----------------------------------------------------------

function loadState() {
  let s = { address: "", lat: null, lon: null, losses: 14, arrays: [] };
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) s = JSON.parse(raw);
  } catch (e) {}
  s.arrays = (s.arrays || []).map(migrateArray);
  return s;
}

// Stari zapisi so imeli samo skupno moč niza (kwp). Pretvorimo jih v
// moč enega panela × število panelov (privzeto 1 panel s to močjo).
function migrateArray(a) {
  if (a.panelW == null || a.panelCount == null) {
    const kwp = a.kwp != null ? a.kwp : 3;
    a.panelW = Math.round(kwp * 1000);
    a.panelCount = 1;
  }
  delete a.kwp;
  return a;
}

function arrayKwp(a) {
  return (a.panelW * a.panelCount) / 1000;
}

function saveState() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(state));
    } catch (e) {}
  }, 300);
}

function colorFor(index) {
  return COLORS[index % COLORS.length];
}

// ---- Zemljevid ----------------------------------------------------------------

function houseIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="house-marker">🏠</div>',
    iconSize: [26, 26],
    iconAnchor: [13, 22],
  });
}

function arrayIcon(color, azimuth) {
  return L.divIcon({
    className: "",
    html: `<div class="panel-marker">
             <div class="pm-arrow" style="border-bottom-color:${color}; transform:rotate(${azimuth}deg)"></div>
             <div class="pm-dot" style="background:${color}"></div>
           </div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
}

function initMap() {
  map = L.map("map").setView([46.1512, 14.9955], 8);
  L.tileLayer(
    "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    {
      maxZoom: 19,
      attribution:
        "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics, and the GIS User Community",
    }
  ).addTo(map);

  // Leaflet meri velikost vsebnika ob inicializaciji; če se ta kasneje
  // spremeni (nalaganje pisav, sprememba velikosti okna, mobilni obrat),
  // je treba zemljevid o tem obvestiti, sicer ostanejo delčki sivi.
  setTimeout(() => map.invalidateSize(), 300);
  let resizeT = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => map.invalidateSize(), 150);
  });
}

function placeHouseMarker(lat, lon) {
  if (houseMarker) {
    houseMarker.setLatLng([lat, lon]);
    return;
  }
  houseMarker = L.marker([lat, lon], { icon: houseIcon(), draggable: true }).addTo(map);
  houseMarker.on("dragend", () => {
    const p = houseMarker.getLatLng();
    state.lat = p.lat;
    state.lon = p.lon;
    saveState();
    fetchWeatherAndRender();
  });
}

const AZ_LINE_M = 14; // dolžina azimutne črte na zemljevidu (metri)

// Cilj: točka oddaljena `distM` metrov od (lat,lon) v smeri `bearingDeg`.
function destPoint(lat, lon, bearingDeg, distM) {
  const R = 6371000;
  const brng = (bearingDeg * Math.PI) / 180;
  const lat1 = (lat * Math.PI) / 180;
  const lon1 = (lon * Math.PI) / 180;
  const dR = distM / R;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(dR) + Math.cos(lat1) * Math.sin(dR) * Math.cos(brng)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(dR) * Math.cos(lat1),
      Math.cos(dR) - Math.sin(lat1) * Math.sin(lat2)
    );
  return [(lat2 * 180) / Math.PI, (lon2 * 180) / Math.PI];
}

function updateArrayLine(arr, color) {
  const end = destPoint(arr.lat, arr.lon, arr.azimuth, AZ_LINE_M);
  let line = arrayLines.get(arr.id);
  if (!line) {
    line = L.polyline([[arr.lat, arr.lon], end], {
      color,
      weight: 3,
      dashArray: "6 5",
      opacity: 0.9,
    }).addTo(map);
    arrayLines.set(arr.id, line);
  } else {
    line.setLatLngs([[arr.lat, arr.lon], end]);
    line.setStyle({ color });
  }
}

function placeArrayMarker(arr, color) {
  let m = arrayMarkers.get(arr.id);
  if (!m) {
    m = L.marker([arr.lat, arr.lon], {
      icon: arrayIcon(color, arr.azimuth),
      draggable: true,
    }).addTo(map);
    m.on("drag", () => {
      const p = m.getLatLng();
      arr.lat = p.lat;
      arr.lon = p.lon;
      updateArrayLine(arr, color);
    });
    m.on("dragend", () => {
      const p = m.getLatLng();
      arr.lat = p.lat;
      arr.lon = p.lon;
      updateArrayLine(arr, color);
      saveState();
    });
    arrayMarkers.set(arr.id, m);
  } else {
    m.setLatLng([arr.lat, arr.lon]);
    m.setIcon(arrayIcon(color, arr.azimuth));
  }
  updateArrayLine(arr, color);
}

function removeArrayMarker(id) {
  const m = arrayMarkers.get(id);
  if (m) {
    map.removeLayer(m);
    arrayMarkers.delete(id);
  }
  const line = arrayLines.get(id);
  if (line) {
    map.removeLayer(line);
    arrayLines.delete(id);
  }
}

// ---- Iskanje naslova (Nominatim) ---------------------------------------------

async function geocode(query) {
  const url = `${GEOCODE_API}?format=jsonv2&addressdetails=1&limit=5&countrycodes=si&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "sl" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

function renderResults(list) {
  const ul = $("results");
  ul.innerHTML = "";
  if (!list.length) {
    ul.hidden = true;
    return;
  }
  list.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r.display_name;
    li.addEventListener("click", () => selectResult(r));
    ul.appendChild(li);
  });
  ul.hidden = false;
}

function selectResult(r) {
  $("results").hidden = true;
  $("address").value = r.display_name;
  setHouseLocation(parseFloat(r.lat), parseFloat(r.lon), r.display_name);
}

function setHouseLocation(lat, lon, address) {
  state.lat = lat;
  state.lon = lon;
  state.address = address || state.address;
  placeHouseMarker(lat, lon);
  map.setView([lat, lon], 19);
  // Če še ni nobenega niza panelov, dodaj privzetega na streho.
  if (state.arrays.length === 0) {
    addArray({ lat: lat + 0.00006, lon: lon + 0.00006 });
  }
  saveState();
  fetchWeatherAndRender();
}

// ---- Nizi panelov -------------------------------------------------------------

function nextId() {
  return "a" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function addArray(overrides) {
  const n = state.arrays.length + 1;
  const base = {
    id: nextId(),
    name: `Niz ${n}`,
    panelW: 400,
    panelCount: 8,
    tilt: 35,
    azimuth: 180,
    lat: state.lat != null ? state.lat + 0.00005 * n : 46.1512,
    lon: state.lon != null ? state.lon + 0.00003 * n : 14.9955,
  };
  const arr = Object.assign(base, overrides);
  state.arrays.push(arr);
  renderArrays();
  saveState();
  scheduleRecompute();
  focusArray(arr);
  return arr;
}

// Poskrbi, da je novo dodan niz očitno viden: povleče pogled do njegove
// kartice in do markerja na zemljevidu (sicer se doda na dno seznama /
// na del zemljevida, ki ni nujno viden, kar je zgledalo, kot da se "nič
// ne zgodi").
function focusArray(arr) {
  const box = $("arrays");
  const card = box.lastElementChild;
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1500);
  }
  if (map) {
    try {
      if (!map.getBounds().contains([arr.lat, arr.lon])) {
        map.panTo([arr.lat, arr.lon]);
      }
    } catch (e) {}
  }
}

function removeArray(id) {
  state.arrays = state.arrays.filter((a) => a.id !== id);
  removeArrayMarker(id);
  renderArrays();
  saveState();
  scheduleRecompute();
}

function renderArrays() {
  const box = $("arrays");
  box.innerHTML = "";
  state.arrays.forEach((arr, i) => {
    const color = colorFor(i);
    placeArrayMarker(arr, color);
    box.appendChild(arrayCard(arr, color));
  });
}

function arrayCard(arr, color) {
  const card = document.createElement("div");
  card.className = "array-card";
  card.innerHTML = `
    <div class="row1">
      <span class="swatch" style="background:${color}"></span>
      <input type="text" class="f-name" value="${escapeAttr(arr.name)}" aria-label="Ime niza" />
      <button type="button" class="remove" aria-label="Izbriši niz">🗑 Izbriši</button>
    </div>
    <div class="fields">
      <div class="field">
        <label>Moč panela (W)</label>
        <input type="number" class="f-panelw" min="1" step="5" value="${arr.panelW}" />
      </div>
      <div class="field">
        <label>Število panelov</label>
        <input type="number" class="f-count" min="1" step="1" value="${arr.panelCount}" />
      </div>
      <div class="field">
        <label>Naklon (°)</label>
        <input type="number" class="f-tilt" min="0" max="90" step="1" value="${arr.tilt}" />
      </div>
      <div class="field">
        <label>Azimut / smer (°)</label>
        <input type="number" class="f-az" min="0" max="359" step="1" value="${arr.azimuth}" />
        <div class="compass">0=S, 90=V, 180=J (optimalno), 270=Z</div>
      </div>
    </div>
    <div class="kwp-total">Skupna moč niza: <strong class="f-kwp-out">${arrayKwp(arr).toFixed(2)}</strong> kWp</div>`;

  const kwpOut = card.querySelector(".f-kwp-out");
  const refreshKwp = () => { kwpOut.textContent = arrayKwp(arr).toFixed(2); };

  card.querySelector(".f-name").addEventListener("input", (e) => {
    arr.name = e.target.value;
    saveState();
    scheduleRecompute();
  });
  card.querySelector(".f-panelw").addEventListener("input", (e) => {
    arr.panelW = Math.max(1, parseFloat(e.target.value) || 0);
    refreshKwp();
    saveState();
    scheduleRecompute();
  });
  card.querySelector(".f-count").addEventListener("input", (e) => {
    arr.panelCount = Math.max(1, Math.round(parseFloat(e.target.value) || 0));
    refreshKwp();
    saveState();
    scheduleRecompute();
  });
  card.querySelector(".f-tilt").addEventListener("input", (e) => {
    arr.tilt = clampNum(e.target.value, 0, 90);
    saveState();
    scheduleRecompute();
  });
  card.querySelector(".f-az").addEventListener("input", (e) => {
    arr.azimuth = clampNum(e.target.value, 0, 359);
    placeArrayMarker(arr, color);
    saveState();
    scheduleRecompute();
  });
  card.querySelector(".remove").addEventListener("click", () => removeArray(arr.id));

  return card;
}

function clampNum(v, min, max) {
  const n = parseFloat(v);
  if (Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

function escapeAttr(s) {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

// ---- Vreme + izračun pridelave ------------------------------------------------

function scheduleRecompute() {
  clearTimeout(recomputeTimer);
  recomputeTimer = setTimeout(computeAndRender, 200);
}

async function fetchWeatherAndRender() {
  if (state.lat == null || state.lon == null) return;
  $("geo-status").textContent = "Nalagam vremenske podatke …";
  $("geo-status").classList.remove("error");
  const params = new URLSearchParams({
    latitude: state.lat,
    longitude: state.lon,
    current: "shortwave_radiation,direct_normal_irradiance,diffuse_radiation",
    hourly: "shortwave_radiation,direct_normal_irradiance,diffuse_radiation",
    daily: "sunrise,sunset",
    timezone: "auto",
    forecast_days: "7",
  });
  try {
    const res = await fetch(`${API}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    weather = await res.json();
    $("geo-status").textContent = `${state.address || ""} · ${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
    computeAndRender();
  } catch (err) {
    $("geo-status").textContent = `Napaka pri nalaganju vremena: ${err.message}`;
    $("geo-status").classList.add("error");
  }
}

// Moč enega niza (kW) za dano obsevanost in sončni položaj.
function arrayPowerKW(arr, ghi, dni, dhi, sun) {
  const poa = poaIrradiance(ghi, dni, dhi, arr.tilt, arr.azimuth, sun);
  const loss = 1 - (parseFloat(state.losses) || 0) / 100;
  return (poa / 1000) * arrayKwp(arr) * loss;
}

function computeAndRender() {
  if (!weather || state.arrays.length === 0) {
    renderEmpty();
    return;
  }
  const h = weather.hourly;
  const offset = weather.utc_offset_seconds || 0;

  // --- "zdaj" iz current bloka ---
  const c = weather.current;
  const now = new Date();
  const sunNow = sunPosition(now, state.lat, state.lon);
  let totalNow = 0;
  const perArrayNow = [];
  state.arrays.forEach((arr, i) => {
    const kw = sunNow.elevation > 0
      ? arrayPowerKW(arr, c.shortwave_radiation, c.direct_normal_irradiance, c.diffuse_radiation, sunNow)
      : 0;
    totalNow += kw;
    perArrayNow.push({ arr, i, kw });
  });
  renderCurrent(totalNow, perArrayNow, sunNow);

  // --- vsaka ura naslednjih 7 dni ---
  const hours = h.time.map((t, idx) => {
    const utcDate = toUtcDate(t, offset);
    const sun = sunPosition(utcDate, state.lat, state.lon);
    const ghi = h.shortwave_radiation[idx];
    const dni = h.direct_normal_irradiance[idx];
    const dhi = h.diffuse_radiation[idx];
    const perArray = state.arrays.map((arr) => arrayPowerKW(arr, ghi, dni, dhi, sun));
    const total = perArray.reduce((a, b) => a + b, 0);
    return { time: t, perArray, total };
  });

  const today = weather.daily.time[0];
  const todayHours = hours.filter((r) => r.time.startsWith(today));
  renderTodayChart(todayHours);

  const days = weather.daily.time.map((d) => {
    const rows = hours.filter((r) => r.time.startsWith(d));
    const perArray = state.arrays.map((_, ai) =>
      rows.reduce((sum, r) => sum + r.perArray[ai], 0)
    );
    const total = perArray.reduce((a, b) => a + b, 0);
    return { date: d, perArray, total };
  });
  renderWeekChart(days);
}

function renderEmpty() {
  $("power-now").textContent = "–";
  $("power-condition").textContent =
    state.lat == null
      ? "Poišči naslov in dodaj vsaj en niz panelov."
      : "Dodaj vsaj en niz panelov zgoraj.";
  $("power-breakdown").innerHTML = "";
  if (todayChart) { todayChart.destroy(); todayChart = null; }
  if (weekChart) { weekChart.destroy(); weekChart = null; }
  $("forecast").innerHTML = "";
}

function renderCurrent(totalKW, perArrayNow, sun) {
  const watts = totalKW * 1000;
  $("power-now").textContent = watts >= 0 ? Math.round(watts).toLocaleString("sl-SI") : "0";
  $("power-condition").textContent =
    sun.elevation <= 0
      ? "Sonce je pod obzorjem — brez pridelave"
      : `Višina sonca ${sun.elevation.toFixed(0)}°, azimut ${sun.azimuth.toFixed(0)}°`;

  const ul = $("power-breakdown");
  ul.innerHTML = "";
  perArrayNow.forEach(({ arr, i, kw }) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="k" style="color:${colorFor(i)}">${escapeAttr(arr.name)}</span><span class="v">${Math.round(kw * 1000)} W</span>`;
    ul.appendChild(li);
  });
}

function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  return { grid: v("--line", "#31404f"), tick: v("--muted", "#9fb0be") };
}

function renderTodayChart(rows) {
  const t = chartTheme();
  const labels = rows.map((r) => r.time.slice(11, 16));
  const datasets = state.arrays.map((arr, i) => ({
    label: arr.name,
    data: rows.map((r) => +(r.perArray[i] * 1000).toFixed(0)),
    borderColor: colorFor(i),
    backgroundColor: colorFor(i) + "33",
    tension: 0.35,
    pointRadius: 0,
    fill: state.arrays.length === 1,
  }));
  if (state.arrays.length > 1) {
    datasets.push({
      label: "Skupaj",
      data: rows.map((r) => +(r.total * 1000).toFixed(0)),
      borderColor: t.tick,
      borderDash: [4, 3],
      tension: 0.35,
      pointRadius: 0,
      fill: false,
    });
  }

  if (todayChart) todayChart.destroy();
  todayChart = new Chart($("todayChart"), {
    type: "line",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index", intersect: false },
      plugins: { legend: { labels: { color: t.tick } } },
      scales: {
        x: { grid: { color: t.grid }, ticks: { color: t.tick, maxTicksLimit: 12 } },
        y: {
          grid: { color: t.grid },
          ticks: { color: t.tick },
          title: { display: true, text: "W", color: t.tick },
        },
      },
    },
  });
}

function renderWeekChart(days) {
  const t = chartTheme();
  const labels = days.map((d) =>
    new Date(d.date).toLocaleDateString("sl-SI", { weekday: "short", day: "numeric" })
  );
  const datasets = state.arrays.map((arr, i) => ({
    label: arr.name,
    data: days.map((d) => +d.perArray[i].toFixed(2)),
    backgroundColor: colorFor(i),
    borderRadius: 4,
    stack: "s",
  }));

  if (weekChart) weekChart.destroy();
  weekChart = new Chart($("weekChart"), {
    type: "bar",
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: t.tick } } },
      scales: {
        x: { stacked: true, grid: { color: t.grid }, ticks: { color: t.tick } },
        y: {
          stacked: true,
          grid: { color: t.grid },
          ticks: { color: t.tick },
          title: { display: true, text: "kWh/dan", color: t.tick },
        },
      },
    },
  });

  const box = $("forecast");
  box.innerHTML = "";
  days.forEach((d) => {
    const el = document.createElement("div");
    el.className = "fc-day";
    el.innerHTML = `
      <div class="d">${new Date(d.date).toLocaleDateString("sl-SI", { weekday: "short" })}</div>
      <div class="s">${d.total.toFixed(1)}</div>
      <div class="h">kWh</div>`;
    box.appendChild(el);
  });
}

// ---- Zagon --------------------------------------------------------------------

function restore() {
  initMap();
  if (state.lat != null && state.lon != null) {
    placeHouseMarker(state.lat, state.lon);
    map.setView([state.lat, state.lon], 18);
    $("address").value = state.address || "";
    $("geo-status").textContent = `${state.address || ""} · ${state.lat.toFixed(4)}, ${state.lon.toFixed(4)}`;
  }
  $("losses").value = state.losses;
  renderArrays();
  if (state.lat != null) fetchWeatherAndRender();
  else renderEmpty();
}

$("search-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const q = $("address").value.trim();
  if (!q) return;
  $("geo-status").textContent = "Iščem …";
  $("geo-status").classList.remove("error");
  try {
    const list = await geocode(q);
    if (list.length === 1) {
      selectResult(list[0]);
    } else if (list.length > 1) {
      renderResults(list);
      $("geo-status").textContent = "Izberi natančen naslov s seznama spodaj.";
    } else {
      $("geo-status").textContent = "Naslova nisem našel. Poskusi drugače (npr. dodaj kraj).";
      $("geo-status").classList.add("error");
    }
  } catch (err) {
    $("geo-status").textContent = `Napaka pri iskanju: ${err.message}`;
    $("geo-status").classList.add("error");
  }
});

$("losses").addEventListener("input", (e) => {
  state.losses = clampNum(e.target.value, 0, 50);
  saveState();
  scheduleRecompute();
});

$("add-array").addEventListener("click", () => addArray());

initTheme(() => computeAndRender());
restore();
