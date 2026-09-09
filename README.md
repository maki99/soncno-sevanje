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
| `index.html` | Ogrodje strani |
| `style.css` | Oblika (svetla / temna tema) |
| `locations.js` | Seznam krajev (samodejno ustvarjen) |
| `app.js` | Iskalnik krajev, klic API-ja, izris grafov |
| `tools/build_locations.py` | Skripta za izgradnjo seznama krajev |

## Licenca

MIT — glej [`LICENSE`](LICENSE).
