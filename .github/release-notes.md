## Sol & Luna Card 2.4 🏠🌗

### New / Neu
- **Import your own 3D house** · **Eigenes 3D-Haus importieren** (`house_source: file`, `house_model: /local/…`)
  - **GLB / glTF** with original colours · mit Originalfarben
  - **LoD2 / CityJSON** – official building models, the building at your location is picked automatically · amtliche Gebäudemodelle, das Gebäude am Standort wird automatisch gewählt
  - **OBJ** (+ colours from the `.mtl` file) · OBJ (+ Farben aus der `.mtl`-Datei)
  - lawn and paths are drawn as ground cover, shadows per part · Rasen und Wege als Bodenbelag, Schatten pro Bauteil
- **Zoom** in the 3D view with mouse wheel or two fingers · **Zoomen** in der 3D-Ansicht mit Mausrad oder zwei Fingern
- New options · Neue Optionen: `model_rotation`, `model_scale`, `model_up`, `model_zoom`, `pv_flat_roofs`

### Fixed / Behoben
- After a loading error (e.g. HTTP 404) the model is retried automatically, the error shows the path · Nach einem Ladefehler wird das Modell automatisch erneut geladen, die Meldung zeigt den Pfad
- The 3D tab always opens at the current time · Der 3D-Tab öffnet immer mit der aktuellen Uhrzeit

Put model files in `/config/www` and enter them as `/local/filename`. · Modelldateien nach `/config/www` legen und als `/local/Dateiname` eintragen.

**Install:** HACS → Custom repositories → `https://github.com/muhkuh666/Sol-Luna-Card` (type **Dashboard**)

☕ Like it? [Buy me a coffee](https://buymeacoffee.com/muhkuh666)
