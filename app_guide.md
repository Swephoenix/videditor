# App guide

Lokal webbaserad videoredigerare med flerspårstidslinje (lager), transkribering, cirkelmasker, undertexter och FFmpeg/NVENC-export.

Aktuell appversion: 0.17.6 (cache-buster `?v=` på alla assets i `index.html`).

## Funktioner

- **Lager**: flera visuella spår (V1, V2…), dra klipp vertikalt mellan spår, ögon-knapp på spåretiketten döljer/visar lagret (gäller även export via `hiddenLayers`). "Lager"-väljaren vid import lägger media direkt på valt lager.
- **Förhandsvisning**: överlappande video/bilder kompositeras live (z-index per spår). Dra media direkt i previewn för att placera (posX/posY), skala med hörnhantagen.
- **Cirkulär mask**: "Form"-sektionen i verktygspanelen – cirkel + storlek på video/bild. Exporten genererar en statisk mask-PNG och använder `alphamerge` (snabb; per-frame-`geq` är fallback).
- **Undertexter**: "Exportera undertexter" i Export-menyn (förifylld om transkribering finns), renderas via ASS i exporten. Autofit behåller då full bredd + bottenremsa.
- **Exportyta**: "Yta"-verktyget (SVG-ikon längst till höger i verktygsfältet) – reglage sätter ett centrerat exportfönster över innehållet utan att media pressas ihop; exporten croppar till fönstret. "Anpassa format till innehåll" beräknar fönstret från klippens faktiska yta (cirkelmedveten).
- **Klistra in bilder**: Ctrl+V utan kopierat klipp importerar bilder från systemets urklipp.
- **Ctrl+A** i tidslinjen markerar alla klipp.
- **Transkription i preview**: ord-fönster med grace-period; döljs utanför det transkriberade klippet och efter sista ordet + 1,5 s.

## Körning

- Installera beroenden: `npm install`
- Starta appen: `npm start` (eller `./start.sh`; servern kan startas i bakgrunden med `setsid nohup node server.js > .runtime/server.log 2>&1 < /dev/null &` och PID i `.runtime/server.pid`)
- Öppna: `http://127.0.0.1:3000/`
- Syntaxkontroll: `npm run check`
- Tester: `npm test` (alla tester i `tests/run-tests.js`; nya tester registreras där)
- Preflight-gate: `python3 ~/.agents/skills/code-preflight-review/scripts/preflight_gate.py . --full`

## Huvuddelar

- `app.js`: editorstatus, tidslinjeinteraktioner, lager/preview-rendering och export-payload (inkl. `exportWindow`, `hiddenLayers`, `subtitles`, `circular`).
- `timeline-model.js`: spårtilldelning, överlapp och lagerordning.
- `server.js`: media-API och FFmpeg-export (cirkelmask-PNG, ASS-undertexter, size-filters med marginal-pad för offset).
- `tests/`: modell-, DOM- och exportregressioner (31 testfiler).

## Exportprestanda (mätt på 243 s-projekt, NVENC lossless)

- Baslinje NVENC: ~18× realtid. Cirkelmasken var tidigare ~80 % av tiden (per-frame-`geq`); med mask-PNG + `alphamerge` gick exporten 151 s → 96 s.

## Roadmap

- [ ] Eliminera marginal-paden för förskjutna klipp genom overlay x/y-positionering i stället för pad+crop (uppskattat 96 s → ~60 s för 243 s-projektet).
- [ ] WebSocket/streamad exportprogress (i stället för pollning).
- [ ] Multikanalsljudmixning i preview för flera lager.
