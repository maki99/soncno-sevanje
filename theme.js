"use strict";

// Svetla/temna tema — skupno za index.html in paneli.html.

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
  const icon = document.getElementById("theme-icon");
  const label = document.getElementById("theme-label");
  if (icon) icon.textContent = dark ? "☀️" : "🌙";
  if (label) label.textContent = dark ? "Svetlo" : "Temno";
}

// onChange(theme) se pokliče po vsaki spremembi — uporabno za osvežitev
// barv v že izrisanih Chart.js grafih.
function initTheme(onChange) {
  applyTheme(effectiveTheme());
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next =
        document.documentElement.dataset.theme === "dark" ? "light" : "dark";
      localStorage.setItem("tema", next);
      applyTheme(next);
      if (onChange) onChange(next);
    });
  }
  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (!localStorage.getItem("tema")) {
        const t = effectiveTheme();
        applyTheme(t);
        if (onChange) onChange(t);
      }
    });
}

window.effectiveTheme = effectiveTheme;
window.applyTheme = applyTheme;
window.initTheme = initTheme;
