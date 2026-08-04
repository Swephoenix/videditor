# App guide

Lokal webbaserad videoredigerare med flerspårstidslinje, transkribering och FFmpeg/NVENC-export.

Aktuell appversion: 0.15.3.

Dubbelklicka på ett tidslinjeklipp för att flytta playhead till den exakta klickpositionen.
Högerklicka på ett videoklipp och välj "Separera från ljud" för att skapa och låsa upp ett separat ljudklipp.
Waveforms beräknas server-side som amplitudpunkter för att långa ljud inte ska blockera preview-uppspelningen.
"Snabb AI super-resolution 2×" använder normalt den kompakta `models/realesr-general-x4v3.pth` via PyTorch/CUDA. Den äldre kvalitetsmodellen `RealESRGAN_x4plus.pth` används som reserv om snabbmodellen saknas. Snabbläget prioriterar ungefär tio gånger högre genomströmning framför maximal detaljåterskapning. Om Python-miljön saknas används NVIDIA Maxine i `maxine-upscale`-läge. Videons bildförhållande bevaras vid export.

## Körning

- Installera beroenden: `npm install`
- Starta appen: `npm start`
- Öppna: `http://127.0.0.1:3000/`
- Syntaxkontroll: `npm run check`
- Tester: `npm test`
- Real-ESRGAN Python kan anges med `REALESRGAN_PYTHON`; annars söks `.venv/bin/python` och `../venv/bin/python`.

## Huvuddelar

- `app.js`: editorstatus, tidslinjeinteraktioner och preview.
- `timeline-model.js`: spårtilldelning, överlapp och lagerordning.
- `server.js`: media-API och FFmpeg-export.
- `tests/`: modell-, DOM- och exportregressioner.

## Roadmap

Inga uppskjutna funktioner noterade.
