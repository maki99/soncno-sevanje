"use strict";

const $ = (id) => document.getElementById(id);
const API = "https://api.open-meteo.com/v1/forecast";

let todayChart = null;
let weekChart = null;
let lastData = null;
let lastLoc = null;

// ---- Tema (svetla / temna) ----------------------------------------------------

function effectiveTheme() {
  const saved = localStorage.getItem("tema");
  if (saved === "light" || saved === "dark") return saved;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const dark = theme === "dark";
  const icon = $("theme-icon");
  const label = $("theme-label");
  if (icon) icon.textContent = dark ? "☀️" : "🌙";
  if (label) label.textContent = dark ? "Svetlo" : "Temno";
}

function toggleTheme() {
  const next =
    document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("tema", next);
  applyTheme(next);
  if (lastData) render(lastData, lastLoc); // osveži barve grafov
}

function initTheme() {
  applyTheme(effectiveTheme());
  const btn = $("theme-toggle");
  if (btn) btn.addEventListener("click", toggleTheme);

  // Sledi sistemu, dokler uporabnik ne izbere ročno
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    if (!localStorage.getItem("tema")) {
      applyTheme(effectiveTheme());
      if (lastData) render(lastData, lastLoc);
    }
  });
}

// ---- Zagon -----------------------------------------------------------------

const locByName = new Map(LOCATIONS.map((l) => [l.name.toLowerCase(), l]));

function selectedLoc() {
  return locByName.get($("location").value.trim().toLowerCase()) || null;
}

function initLocations() {
  const input = $("location");
  const dl = $("loc-list");
  const saved = localStorage.getItem("lokacija");

  input.value =
    saved && locByName.has(saved.toLowerCase()) ? saved : DEFAULT_LOCATION;

  // Datalist napolnimo sproti glede na vpisano besedilo (največ 60 zadetkov),
  // da ne ustvarimo 6000+ DOM elementov.
  function fillOptions() {
    const q = input.value.trim().toLowerCase();
    dl.textContent = "";
    if (q.length < 2) return;
    const starts = [];
    const contains = [];
    for (const l of LOCATIONS) {
      const n = l.name.toLowerCase();
      if (n.startsWith(q)) starts.push(l.name);
      else if (n.includes(q)) contains.push(l.name);
      if (starts.length >= 60) break;
    }
    for (const name of starts.concat(contains).slice(0, 60)) {
      const o = document.createElement("option");
      o.value = name;
      dl.appendChild(o);
    }
  }

  let t = null;
  input.addEventListener("input", () => {
    fillOptions();
    const loc = selectedLoc();
    if (loc) {
      localStorage.setItem("lokacija", loc.name);
      clearTimeout(t);
      t = setTimeout(load, 150);
    }
  });
  input.addEventListener("focus", () => input.select());
  fillOptions();
}

// ---- Pomožne funkcije -----------------------------------------------------

const fmt = (n, unit) =>
  n == null || Number.isNaN(n) ? "–" : `${Math.round(n)}${unit || ""}`;

function conditionText(ghi, cloud) {
  if (ghi != null && ghi < 5) return "Sonce je pod obzorjem — brez sevanja";
  if (cloud == null) return "–";
  if (cloud < 15) return "Jasno — polna moč sonca";
  if (cloud < 40) return "Pretežno jasno";
  if (cloud < 70) return "Delno oblačno";
  if (cloud < 90) return "Pretežno oblačno";
  return "Oblačno — šibko razpršeno sevanje";
}

function timeHM(iso) {
  return new Date(iso).toLocaleTimeString("sl-SI", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// Približna višina sonca nad obzorjem (stopinje) — NOAA poenostavljeni algoritem.
function sunElevation(date, lat, lon) {
  const rad = Math.PI / 180;
  const dayMs = 86400000;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy = (Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate()
  ) - start) / dayMs;
  const frac =
    (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) /
    24;
  const g = 2 * Math.PI * ((doy - 1 + (frac - 0.5)) / 365);
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eqtime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  const tst = frac * 1440 + eqtime + 4 * lon; // pravi sončni čas (min)
  const ha = (tst / 4 - 180) * rad; // urni kot
  const latR = lat * rad;
  const cosZen =
    Math.sin(latR) * Math.sin(decl) +
    Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
  return 90 - Math.acos(Math.max(-1, Math.min(1, cosZen))) / rad;
}

// ---- Nalaganje podatkov -------------------------------------------------------

async function load() {
  const loc = selectedLoc();
  if (!loc) {
    $("meta").textContent = "Vpiši ime kraja in ga izberi s seznama.";
    return;
  }
  $("meta").textContent = `Nalagam podatke za ${loc.name} …`;
  $("meta").classList.remove("error");

  const params = new URLSearchParams({
    latitude: loc.lat,
    longitude: loc.lon,
    current:
      "shortwave_radiation,direct_normal_irradiance,diffuse_radiation,cloud_cover,temperature_2m",
    hourly: "shortwave_radiation,direct_normal_irradiance,diffuse_radiation",
    daily: "sunrise,sunset,shortwave_radiation_sum,sunshine_duration",
    timezone: "auto",
    forecast_days: "7",
  });

  try {
    const res = await fetch(`${API}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    render(data, loc);
  } catch (err) {
    $("meta").textContent = `Napaka pri nalaganju: ${err.message}. Poskusi znova.`;
    $("meta").classList.add("error");
  }
}

// ---- Prikaz ----------------------------------------------------------------

function render(data, loc) {
  lastData = data;
  lastLoc = loc;
  const c = data.current;
  const now = new Date();

  $("ghi-now").textContent = fmt(c.shortwave_radiation);
  $("condition").textContent = conditionText(
    c.shortwave_radiation,
    c.cloud_cover
  );
  $("cloud").textContent = fmt(c.cloud_cover, " %");
  $("temp").textContent =
    c.temperature_2m == null ? "–" : `${c.temperature_2m.toFixed(1)} °C`;

  const elev = sunElevation(now, loc.lat, loc.lon);
  $("elevation").textContent = `${elev.toFixed(1)}°`;

  const sr = data.daily.sunrise[0];
  const ss = data.daily.sunset[0];
  $("sun").textContent = `${timeHM(sr)} / ${timeHM(ss)}`;

  $("ghi").textContent = fmt(c.shortwave_radiation, " W/m²");
  $("dni").textContent = fmt(c.direct_normal_irradiance, " W/m²");
  $("dhi").textContent = fmt(c.diffuse_radiation, " W/m²");

  const updated = new Date(c.time).toLocaleString("sl-SI", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  $("meta").textContent = `${loc.name} · ${loc.lat.toFixed(3)}, ${loc.lon.toFixed(
    3
  )} · osveženo ${updated}`;

  drawToday(data);
  drawWeek(data);
}

function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fallback) =>
    (cs.getPropertyValue(name).trim() || fallback);
  return {
    grid: v("--line", "#31404f"),
    tick: v("--muted", "#9fb0be"),
    accent: v("--accent", "#ffb020"),
  };
}

function drawToday(data) {
  const h = data.hourly;
  const todayStr = data.daily.time[0];
  const idx = h.time
    .map((t, i) => (t.startsWith(todayStr) ? i : -1))
    .filter((i) => i >= 0);

  const labels = idx.map((i) => h.time[i].slice(11, 16));
  const ghi = idx.map((i) => h.shortwave_radiation[i]);
  const dni = idx.map((i) => h.direct_normal_irradiance[i]);
  const dhi = idx.map((i) => h.diffuse_radiation[i]);
  const t = chartTheme();

  if (todayChart) todayChart.destroy();
  todayChart = new Chart($("todayChart"), {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "GHI (W/m²)",
          data: ghi,
          borderColor: t.accent,
          backgroundColor: "rgba(255,176,32,0.15)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
        },
        {
          label: "DNI (W/m²)",
          data: dni,
          borderColor: "#ff7a1a",
          fill: false,
          tension: 0.35,
          pointRadius: 0,
        },
        {
          label: "DHI (W/m²)",
          data: dhi,
          borderColor: "#5aa9e6",
          fill: false,
          tension: 0.35,
          pointRadius: 0,
        },
      ],
    },
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
          title: { display: true, text: "W/m²", color: t.tick },
        },
      },
    },
  });
}

function drawWeek(data) {
  const d = data.daily;
  const t = chartTheme();
  const labels = d.time.map((s) =>
    new Date(s).toLocaleDateString("sl-SI", { weekday: "short", day: "numeric" })
  );
  const kwh = d.shortwave_radiation_sum.map((v) =>
    v == null ? null : +(v / 3.6).toFixed(2)
  ); // MJ/m² -> kWh/m²
  const sunHours = d.sunshine_duration.map((v) =>
    v == null ? null : +(v / 3600).toFixed(1)
  );

  if (weekChart) weekChart.destroy();
  weekChart = new Chart($("weekChart"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Dnevno sevanje (kWh/m²)",
          data: kwh,
          backgroundColor: t.accent,
          borderRadius: 6,
          yAxisID: "y",
        },
        {
          label: "Sončne ure",
          data: sunHours,
          type: "line",
          borderColor: "#5aa9e6",
          backgroundColor: "#5aa9e6",
          tension: 0.3,
          yAxisID: "y1",
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: t.tick } } },
      scales: {
        x: { grid: { color: t.grid }, ticks: { color: t.tick } },
        y: {
          position: "left",
          grid: { color: t.grid },
          ticks: { color: t.tick },
          title: { display: true, text: "kWh/m²", color: t.tick },
        },
        y1: {
          position: "right",
          grid: { drawOnChartArea: false },
          ticks: { color: t.tick },
          title: { display: true, text: "ur", color: t.tick },
        },
      },
    },
  });

  const box = $("forecast");
  box.innerHTML = "";
  d.time.forEach((s, i) => {
    const el = document.createElement("div");
    el.className = "fc-day";
    el.innerHTML = `
      <div class="d">${new Date(s).toLocaleDateString("sl-SI", {
        weekday: "short",
      })}</div>
      <div class="s">${kwh[i] ?? "–"}</div>
      <div class="h">kWh/m²</div>
      <div class="h">${sunHours[i] ?? "–"} h sonca</div>`;
    box.appendChild(el);
  });
}

// ---- Osvežuj vsakih 10 minut ----------------------------------------------

initTheme();
initLocations();
load();
setInterval(load, 10 * 60 * 1000);
