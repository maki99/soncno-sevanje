"use strict";

// Položaj sonca (višina + azimut) — poenostavljen NOAA algoritem.
// `date` mora biti pravi UTC trenutek (Date object). lat/lon v stopinjah.
// Vrne { elevation, azimuth } v stopinjah.
// azimuth: 0° = sever, 90° = vzhod, 180° = jug, 270° = zahod (v smeri urinega kazalca).
function sunPosition(date, lat, lon) {
  const rad = Math.PI / 180;
  const clamp = (v) => Math.max(-1, Math.min(1, v));

  const dayMs = 86400000;
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const doy =
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      start) /
    dayMs;
  const frac =
    (date.getUTCHours() +
      date.getUTCMinutes() / 60 +
      date.getUTCSeconds() / 3600) /
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
  const ha = tst / 4 - 180; // urni kot (stopinje); <0 dopoldne, >0 popoldne
  const haR = ha * rad;
  const latR = lat * rad;

  const cosZen = clamp(
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(haR)
  );
  const zen = Math.acos(cosZen); // radiani
  const elevR = Math.PI / 2 - zen;
  const elevation = elevR / rad;

  let azimuth = 0;
  if (Math.cos(elevR) > 1e-6) {
    const cosAz = clamp(
      (Math.sin(decl) - Math.sin(elevR) * Math.sin(latR)) /
        (Math.cos(elevR) * Math.cos(latR))
    );
    azimuth = Math.acos(cosAz) / rad;
    if (ha > 0) azimuth = 360 - azimuth;
  }

  return { elevation, azimuth };
}

// Pretvori niz časa iz Open-Meteo (lokalni, brez offseta, npr. "2026-09-11T14:00")
// v pravi UTC Date, z uporabo `utc_offset_seconds` iz odgovora API-ja.
function toUtcDate(localTimeStr, utcOffsetSeconds) {
  const naiveUtc = new Date(localTimeStr + "Z").getTime();
  return new Date(naiveUtc - utcOffsetSeconds * 1000);
}

// Obsevanost na nagnjeni ploskvi (POA, W/m²) — izotropni model neba (Liu-Jordan).
// ghi/dni/dhi: W/m² (vodoravno / normalno na žarke / razpršeno).
// tiltDeg: naklon panela od vodoravnice (0 = ravno, 90 = navpično).
// panelAzDeg: smer panela (0=sever, 90=vzhod, 180=jug, 270=zahod).
// sun: { elevation, azimuth } v stopinjah. albedo: odbojnost tal (privzeto 0.2).
function poaIrradiance(ghi, dni, dhi, tiltDeg, panelAzDeg, sun, albedo = 0.2) {
  if (sun.elevation <= 0) return 0;
  const rad = Math.PI / 180;
  const tilt = tiltDeg * rad;
  const elevR = sun.elevation * rad;
  const cosAoi =
    Math.sin(elevR) * Math.cos(tilt) +
    Math.cos(elevR) * Math.sin(tilt) * Math.cos((sun.azimuth - panelAzDeg) * rad);
  const beam = dni * Math.max(0, cosAoi);
  const diffuse = dhi * (1 + Math.cos(tilt)) / 2;
  const ground = ghi * albedo * (1 - Math.cos(tilt)) / 2;
  return beam + diffuse + ground;
}

window.sunPosition = sunPosition;
window.toUtcDate = toUtcDate;
window.poaIrradiance = poaIrradiance;
