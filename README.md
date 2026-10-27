# Batted-ball explorer

An interactive look at how exit velocity, launch angle, and spray direction relate to hits and extra-base value. Select a hitter to compare his contact with the modeled contact space, or change exit speed to see how the productive range of angles changes.

The site runs in the browser using saved predictions. It needs no Python server or database. Player contact loads in compressed groups when a hitter is selected.

## Run locally

From this directory, run `python -m http.server 8000`, then open `http://localhost:8000`. Opening `index.html` directly will not load the data files.

## Data and evaluation

MLB regular-season Statcast contact from 2023–2026. Base models were fitted on 2023–2024, sigmoid calibration was fitted on 2025, and the final comparison used 2026. Raw 3D is the default. Adding spray direction reduced 2026 Brier score from .1343 to .1081 and contact-value RMSE from .4306 to .3691.

Spray direction is estimated from hit-chart coordinates and normalized by batter handedness. Modeled wOBAcon uses fixed weights: out 0, single .900, double 1.250, triple 1.600, home run 2.000. It is not official Savant xwOBA. The display suppresses combinations with limited nearby training data. Scenarios describe hypothetical contact combinations, not causal swing-change forecasts.

Data: [MLB Statcast](https://baseballsavant.mlb.com/csv-docs). Original visualization concept: [Batted Ball Space](https://mesteviet25.github.io/resources/batted-ball-3d/).

## Update the saved data

Run `python scripts/export_data.py path/to/executed_notebook.ipynb` after executing the analysis notebook. This replaces the exported grids, player summaries, player contacts, and coverage metadata. Commit the updated files to update the published site.

## Hosting

Create a public repository named `batted-ball-explorer`. Upload the contents of this folder so that `index.html`, `assets`, and `data` sit at the repository root. Under Settings → Pages, choose “Deploy from a branch”, select `main` and `/ (root)`, then save. There is no build step.

The app uses browser support for gzip decompression, available in current Chrome, Edge, Firefox, and Safari releases. It does not collect visitor data or require an account.
