# ☀️ Moč sončnega sevanja

**Živa stran:** <https://maki99.github.io/soncno-sevanje/>

Preprosta statična spletna stran, ki prikazuje moč sončnega sevanja (osvetljenosti)
za kraj, ki ga vpišeš v iskalno polje (samodejno dopolnjevanje).

- **Iskalnik krajev** — vsa slovenska naselja (~6700) z občino, npr. `Mačkovci (Puconci)`
- **Trenutno sevanje** v W/m² + opis razmer glede na oblačnost
- **GHI / DNI / DHI** razčlenitev (globalno / direktno / difuzno)
- **Graf za danes** — potek sevanja čez dan
- **Napoved za 7 dni** — dnevno sevanje (kWh/m²) in sončne ure
- Čas sončnega vzhoda/zahoda in trenutna višina sonca nad obzorjem
- **Preklop med svetlo in temno temo** (privzeto sledi nastavitvi sistema, izbira se shrani)

Podatki o sevanju: [Open-Meteo](https://open-meteo.com/) — brezplačno, brez API ključa
(vrednosti so modelska napoved, ne meritve).
Seznam krajev: © [OpenStreetMap](https://www.openstreetmap.org/copyright) sodelavci.

## 🔧 Moji sončni paneli ([paneli.html](https://maki99.github.io/soncno-sevanje/paneli.html))

Druga stran izračuna pričakovano pridelavo tvoje lastne sončne elektrarne:

1. Vpišeš naslov → geokodiranje ([Nominatim](https://nominatim.org/)/OpenStreetMap) najde koordinate
2. Na satelitskem posnetku (Esri World Imagery) postaviš enega ali več nizov panelov —
   vsak dobi marker s puščico, ki kaže smer strehe
3. Za vsak niz vpišeš moč (kWp), naklon in azimut (smer neba)
4. Iz Open-Meteo urnih podatkov (GHI/DNI/DHI) in položaja sonca izračunamo obsevanost
   na *tvoji* nagnjeni ploskvi (izotropni model neba, Liu–Jordan) in pretvorimo v W/kWh

Vse (naslov, nizi panelov) se shrani v `localStorage` brskalnika — brez strežnika,
brez računa.

## Zagon lokalno

Ni build koraka. Odpri `index.html` v brskalniku, ali poženi lokalni strežnik:

```bash
python -m http.server 8000
```

Nato odpri <http://localhost:8000>.

## Seznam krajev

[`locations.js`](locations.js) je samodejno ustvarjen iz OpenStreetMap (vsa
naselja) in meja občin. Za ponovno izgradnjo (npr. po spremembah v OSM):

```bash
python tools/build_locations.py
```

Za ročni dodatek samo dopiši vrstico kamorkoli v seznam:

```js
{ name: "Moj kraj", lat: 46.1234, lon: 14.5678 },
```

## Objava na GitHub Pages

Že vklopljeno: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.
Ob vsakem `git push` na `main` se stran samodejno posodobi na
<https://maki99.github.io/soncno-sevanje/>.

## Struktura

| Datoteka | Vsebina |
|---|---|
| `index.html` | Stran s sevanjem po krajih |
| `paneli.html` | Stran z izračunom pridelave mojih panelov |
| `style.css` | Skupna oblika (svetla / temna tema) |
| `paneli.css` | Dodatni slog za stran s paneli (zemljevid, kartice nizov) |
| `theme.js` | Preklop svetla/temna tema (skupno obema stranema) |
| `solar.js` | Položaj sonca + POA obsevanost (skupno obema stranema) |
| `locations.js` | Seznam krajev (samodejno ustvarjen) |
| `app.js` | Logika strani s sevanjem po krajih |
| `paneli.js` | Logika strani s paneli (zemljevid, geokodiranje, izračun) |
| `tools/build_locations.py` | Skripta za izgradnjo seznama krajev |

## Licenca

MIT — glej [`LICENSE`](LICENSE).
