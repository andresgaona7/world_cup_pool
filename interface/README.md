# World Cup Pool Interface

Static reader for `first_stage/Polla_Mundial_2026.xlsx`.

## Refresh the data

Run this from the project root after editing the workbook:

```bash
python3 interface/build_data.py
```

The script writes `interface/data/pool_data.js`, which is loaded by `index.html`.

## Open the interface

Open `interface/index.html` in a browser. No build step or package install is required.
