# Industrial Predictive Maintenance Dashboard

A minimal full-stack dashboard for the MITAOE ENTC predictive-maintenance project. The frontend is **React + Vite** and the backend is **Python Flask**. It uses the three model artifacts supplied with the project; it does **not** retrain or replace them.

## What's included

- Minimal React dashboard with three views: Overview, Predict and History.
- Flask backend connected to the supplied pickle artifacts.
- Decision Tree model for comparison.
- Improved Random Forest (200 estimators) as the selected prediction model.
- Saved failure threshold of **0.4**, loaded from `failure_threshold.pkl`.
- AI4I 2020 dataset summary and model test metrics computed by the backend.
- SQLite prediction history stored locally.
- Vite proxy from `/api` to Flask; no manual CORS setup required for local use.

## Project structure

```text
industrial-predictive-maintenance-dashboard-minimal/
├── README.md
├── start_dashboard_windows.bat
├── backend/
│   ├── app.py
│   ├── test_api.py
│   ├── requirements.txt
│   ├── data/
│   │   ├── ai4i2020.csv
│   │   └── prediction_history.db     # created automatically
│   └── models/
│       ├── decision_tree_model.pkl
│       ├── improved_random_forest.pkl
│       └── failure_threshold.pkl
└── frontend/
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── styles.css
```

## Important model compatibility note

The supplied pickle artifacts identify themselves as trained with **scikit-learn 1.6.1**. `backend/requirements.txt` pins `scikit-learn==1.6.1` so the artifacts are loaded with their original scikit-learn version. Avoid upgrading scikit-learn without re-exporting and validating the models.

The supplied Decision Tree and Improved Random Forest both expect exactly these five features, in this order:

1. `Air temperature [K]`
2. `Process temperature [K]`
3. `Rotational speed [rpm]`
4. `Torque [Nm]`
5. `Tool wear [min]`

The separate `AI4I_EDA_and_Model.ipynb` includes `Type` as an additional categorical input for its own notebook pipeline. The supplied pickle files do **not** use `Type`; this dashboard follows the model artifacts' embedded five-feature schema to avoid sending an incompatible input shape.

The artifacts are pickle/joblib files. Only load model artifacts from a trusted source. The project uses the files you supplied.

## Run on Windows

Install Python (3.10 or newer; Python 3.11/3.12 recommended), Node.js LTS and npm.

### 1. Backend setup

Open PowerShell in the project folder:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python app.py
```

The first launch loads and validates all three supplied model artifacts and the CSV. Flask runs at `http://127.0.0.1:5000`. Keep this terminal open.

If PowerShell blocks activation, use:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 2. Frontend setup

Open a second PowerShell window:

```powershell
cd path\to\industrial-predictive-maintenance-dashboard-minimal\frontend
npm install
npm run dev
```

Open `http://127.0.0.1:5173` in the browser. The React app calls `/api`; Vite forwards these requests to Flask on port 5000.

## Check that it is connected

1. Open `http://127.0.0.1:5000/api/health`. Expect `"status": "ok"`, `"model_loaded": true`, and `"threshold": 0.4`.
2. Open `http://127.0.0.1:5173`. The header should show **Backend connected**.
3. Choose **Predict**, keep the example values or enter your own sensor measurements, then click **Predict failure**.
4. The result panel should show the prediction label, failure score, threshold, and prediction reference.
5. Choose **History**. The new prediction should appear there. That confirms React → Flask → Random Forest → SQLite.

### Backend automated tests

With the backend virtual environment active and current directory set to `backend`:

```powershell
python -m unittest test_api.py -v
```

Five tests cover the homepage, artifact health check, dashboard metadata, prediction/history, and input validation.

## API endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/` | Flask API landing information |
| GET | `/api/health` | Confirms all model artifacts are loaded |
| GET | `/api/dashboard` | Dataset profile, holdout metrics and feature importance |
| POST | `/api/predict` | Predict using the supplied Improved Random Forest and threshold 0.4 |
| GET | `/api/predictions?limit=30` | Recent saved predictions |

### Prediction JSON example

```json
{
  "air_temperature": 300.0,
  "process_temperature": 310.0,
  "rotational_speed": 1500,
  "torque": 40.0,
  "tool_wear": 100
}
```

## How evaluation is calculated

The backend loads the uploaded CSV and evaluates the existing pickled models on a stratified 80/20 holdout split (`random_state=42`). It does not fit either model. Decision Tree uses its default 0.5 class decision. Improved Random Forest uses the threshold loaded from `failure_threshold.pkl` (0.4). Metrics are for the positive class `Machine failure = 1` and include accuracy, precision, recall, F1, ROC-AUC and average precision (PR-AUC).

With the supplied CSV and artifacts, the expected key test-set values are approximately:

| Model / threshold | Accuracy | Failure precision | Failure recall | F1 |
|---|---:|---:|---:|---:|
| Decision Tree / 0.5 | 97.75% | 68.25% | 63.24% | 0.656 |
| Improved Random Forest / 0.4 | 98.15% | 79.25% | 61.76% | 0.694 |

Improved Random Forest confusion matrix (rows actual [no failure, failure], columns predicted [no failure, failure]):

```text
[[1921, 11],
 [  26, 42]]
```

These metrics are recomputed from the included data at backend startup; they are not hard-coded in React.

## Interpretation limits

- AI4I 2020 is a synthetic benchmark dataset. This dashboard is a project proof-of-concept, not a connection to live industrial sensors.
- The model classifies the dataset's failure label from five readings. It does not predict remaining useful life or time-to-failure.
- The returned failure score should not be treated as a calibrated real-world probability.
- This prototype is not a safety system or a confirmed machine diagnosis.
