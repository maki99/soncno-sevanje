// Seznam lokacij za spustni meni.
// Dodaj svojo lokacijo tako, da vpišeš nov objekt { name, lat, lon }.
// Koordinate dobiš npr. na https://www.openstreetmap.org (desni klik → "Show address").
window.LOCATIONS = [
  { name: "Ljubljana",        lat: 46.0511, lon: 14.5051 },
  { name: "Maribor",          lat: 46.5547, lon: 15.6459 },
  { name: "Celje",            lat: 46.2309, lon: 15.2604 },
  { name: "Kranj",            lat: 46.2389, lon: 14.3556 },
  { name: "Koper",            lat: 45.5481, lon: 13.7302 },
  { name: "Novo mesto",       lat: 45.8010, lon: 15.1710 },
  { name: "Nova Gorica",      lat: 45.9558, lon: 13.6493 },
  { name: "Murska Sobota",    lat: 46.6625, lon: 16.1664 },
  { name: "Postojna",         lat: 45.7749, lon: 14.2136 },
  { name: "Bled",             lat: 46.3683, lon: 14.1146 },
  { name: "Kranjska Gora",    lat: 46.4847, lon: 13.7857 },
  { name: "Portorož",         lat: 45.5133, lon: 13.5900 },
  { name: "Rogla",            lat: 46.4494, lon: 15.3319 },
];

// Privzeta izbrana lokacija (ime iz seznama zgoraj).
window.DEFAULT_LOCATION = "Ljubljana";
