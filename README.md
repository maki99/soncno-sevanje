# ☀️ Moč sončnega sevanja

**Živa stran:** <https://maki99.github.io/soncno-sevanje/>

Preprosta statična spletna stran, ki prikazuje moč sončnega sevanja (osvetljenosti)
za lokacijo, izbrano iz spustnega menija.

- **Trenutno sevanje** v W/m² + opis razmer glede na oblačnost
- **GHI / DNI / DHI** razčlenitev (globalno / direktno / difuzno)
- **Graf za danes** — potek sevanja čez dan
- **Napoved za 7 dni** — dnevno sevanje (kWh/m²) in sončne ure
- Čas sončnega vzhoda/zahoda in trenutna višina sonca nad obzorjem

Podatki: [Open-Meteo](https://open-meteo.com/) — brezplačno, brez API ključa.
Vrednosti so modelska napoved, ne meritve.

## Zagon lokalno

Ni build koraka. Odpri `index.html` v brskalniku, ali poženi lokalni strežnik:

```bash
python -m http.server 8000
```

Nato odpri <http://localhost:8000>.

## Dodajanje lokacij

Uredi [`locations.js`](locations.js) — dodaj vrstico z imenom in koordinatami:

```js
{ name: "Moj kraj", lat: 46.1234, lon: 14.5678 },
```

Koordinate dobiš z desnim klikom na [openstreetmap.org](https://www.openstreetmap.org).

## Objava na GitHub Pages

Že vklopljeno: **Settings → Pages → Deploy from a branch → `main` / `/ (root)`**.
Ob vsakem `git push` na `main` se stran samodejno posodobi na
<https://maki99.github.io/soncno-sevanje/>.

## Struktura

| Datoteka | Vsebina |
|---|---|
| `index.html` | Ogrodje strani |
| `style.css` | Oblika (temna tema) |
| `locations.js` | Seznam lokacij za meni |
| `app.js` | Klic API-ja in izris grafov |

## Licenca

MIT — glej [`LICENSE`](LICENSE).
