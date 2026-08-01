# App guide

Lokal webbaserad videoredigerare med flerspårstidslinje, transkribering och FFmpeg/NVENC-export.

Aktuell appversion: 0.15.2.

Dubbelklicka på ett tidslinjeklipp för att flytta playhead till den exakta klickpositionen.
Högerklicka på ett videoklipp och välj "Separera från ljud" för att skapa och låsa upp ett separat ljudklipp.
Waveforms beräknas server-side som amplitudpunkter för att långa ljud inte ska blockera preview-uppspelningen.
"AI super-resolution 2×" använder den lokala `models/RealESRGAN_x4plus.pth` via PyTorch/CUDA. Om den miljön saknas används NVIDIA Maxine i `maxine-upscale`-läge; vanlig bilinjär CUDA-skalning räknas inte som AI. Videons bildförhållande bevaras vid export och tom yta fylls i stället för att kanterna tvångsbeskärs.

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
