from __future__ import annotations

import math
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from flask import Flask, jsonify, request
from flask_cors import CORS
from sklearn.metrics import (
    accuracy_score,
    average_precision_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

BASE_DIR = Path(__file__).resolve().parent
MODEL_DIR = BASE_DIR / "models"
DATA_PATH = BASE_DIR / "data" / "ai4i2020.csv"
DECISION_TREE_PATH = MODEL_DIR / "decision_tree_model.pkl"
RANDOM_FOREST_PATH = MODEL_DIR / "improved_random_forest.pkl"
THRESHOLD_PATH = MODEL_DIR / "failure_threshold.pkl"
DB_PATH = BASE_DIR / "data" / "prediction_history.db"

FEATURES = [
    "Air temperature [K]",
    "Process temperature [K]",
    "Rotational speed [rpm]",
    "Torque [Nm]",
    "Tool wear [min]",
]
API_FIELDS = [
    ("air_temperature", FEATURES[0]),
    ("process_temperature", FEATURES[1]),
    ("rotational_speed", FEATURES[2]),
    ("torque", FEATURES[3]),
    ("tool_wear", FEATURES[4]),
]

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}})

_assets: dict[str, Any] | None = None


def _metric_row(name: str, y_true: pd.Series, scores: np.ndarray, predictions: np.ndarray) -> dict[str, Any]:
    return {
        "model": name,
        "accuracy": round(float(accuracy_score(y_true, predictions)), 4),
        "precision": round(float(precision_score(y_true, predictions, zero_division=0)), 4),
        "recall": round(float(recall_score(y_true, predictions, zero_division=0)), 4),
        "f1": round(float(f1_score(y_true, predictions, zero_division=0)), 4),
        "roc_auc": round(float(roc_auc_score(y_true, scores)), 4),
        "pr_auc": round(float(average_precision_score(y_true, scores)), 4),
    }


def _load_assets() -> dict[str, Any]:
    """Load the user's supplied pickle artifacts and compute metrics from the CSV.

    These model artifacts should only be loaded from a trusted source. They are
    the exact files supplied with this project, not models re-trained here.
    """
    global _assets
    if _assets is not None:
        return _assets

    required = [DECISION_TREE_PATH, RANDOM_FOREST_PATH, THRESHOLD_PATH, DATA_PATH]
    missing = [str(path.relative_to(BASE_DIR)) for path in required if not path.exists()]
    if missing:
        raise FileNotFoundError("Missing required project files: " + ", ".join(missing))

    decision_tree = joblib.load(DECISION_TREE_PATH)
    random_forest = joblib.load(RANDOM_FOREST_PATH)
    threshold = float(joblib.load(THRESHOLD_PATH))

    if not 0.0 < threshold < 1.0:
        raise ValueError("failure_threshold.pkl must contain a value between 0 and 1")

    for label, model in (("Decision Tree", decision_tree), ("Improved Random Forest", random_forest)):
        model_features = list(getattr(model, "feature_names_in_", []))
        if model_features != FEATURES or getattr(model, "n_features_in_", None) != len(FEATURES):
            raise ValueError(
                f"{label} input features do not match the five expected sensor columns. "
                f"Expected {FEATURES}; found {model_features}."
            )
        if not hasattr(model, "predict_proba"):
            raise TypeError(f"{label} must support predict_proba().")

    data = pd.read_csv(DATA_PATH, encoding="utf-8-sig")
    missing_columns = [column for column in FEATURES + ["Machine failure"] if column not in data.columns]
    if missing_columns:
        raise ValueError("Dataset is missing columns: " + ", ".join(missing_columns))

    X = data[FEATURES].copy()
    y = data["Machine failure"].astype(int)
    if set(y.unique()) - {0, 1}:
        raise ValueError("Machine failure target must contain only 0 and 1")

    # Keep evaluation comparable to the supplied project workflow: stratified
    # 80/20 holdout, random_state=42. Models are loaded, not fitted here.
    _X_train, X_test, _y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    dt_scores = decision_tree.predict_proba(X_test)[:, 1]
    dt_predictions = (dt_scores >= 0.5).astype(int)
    rf_scores = random_forest.predict_proba(X_test)[:, 1]
    rf_predictions = (rf_scores >= threshold).astype(int)

    dt_metrics = _metric_row("Decision Tree", y_test, dt_scores, dt_predictions)
    rf_metrics = _metric_row("Improved Random Forest", y_test, rf_scores, rf_predictions)
    rf_cm = confusion_matrix(y_test, rf_predictions, labels=[0, 1]).tolist()

    target_counts = y.value_counts().to_dict()
    total = int(len(data))
    feature_stats: dict[str, Any] = {}
    for column in FEATURES:
        feature_stats[column] = {
            "min": round(float(data[column].min()), 3),
            "max": round(float(data[column].max()), 3),
            "mean": round(float(data[column].mean()), 3),
            "median": round(float(data[column].median()), 3),
        }

    importances = getattr(random_forest, "feature_importances_", np.zeros(len(FEATURES)))
    feature_importance = [
        {"feature": feature, "importance": round(float(value), 4)}
        for feature, value in sorted(zip(FEATURES, importances), key=lambda pair: pair[1], reverse=True)
    ]

    _assets = {
        "decision_tree": decision_tree,
        "random_forest": random_forest,
        "threshold": threshold,
        "dataset": data,
        "features": FEATURES,
        "metrics": {"decision_tree": dt_metrics, "random_forest": rf_metrics},
        "confusion_matrix": rf_cm,
        "feature_importance": feature_importance,
        "profile": {
            "name": "AI4I 2020 Predictive Maintenance Dataset",
            "records": total,
            "columns": int(data.shape[1]),
            "no_failure": int(target_counts.get(0, 0)),
            "failures": int(target_counts.get(1, 0)),
            "failure_rate_percent": round(float(y.mean() * 100), 2),
            "missing_values": int(data.isna().sum().sum()),
            "duplicate_rows": int(data.duplicated().sum()),
            "synthetic": True,
        },
        "feature_stats": feature_stats,
    }
    return _assets


@contextmanager
def _db_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def _init_db() -> None:
    with _db_connection() as connection:
        connection.execute(
            """CREATE TABLE IF NOT EXISTS predictions (
                id TEXT PRIMARY KEY,
                created_at TEXT NOT NULL,
                predicted_failure INTEGER NOT NULL,
                failure_probability REAL NOT NULL,
                threshold REAL NOT NULL,
                air_temperature REAL NOT NULL,
                process_temperature REAL NOT NULL,
                rotational_speed REAL NOT NULL,
                torque REAL NOT NULL,
                tool_wear REAL NOT NULL
            )"""
        )


def _history_item(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "created_at": row["created_at"],
        "predicted_failure": bool(row["predicted_failure"]),
        "failure_probability": float(row["failure_probability"]),
        "threshold": float(row["threshold"]),
        "inputs": {
            "air_temperature": float(row["air_temperature"]),
            "process_temperature": float(row["process_temperature"]),
            "rotational_speed": float(row["rotational_speed"]),
            "torque": float(row["torque"]),
            "tool_wear": float(row["tool_wear"]),
        },
    }


@app.get("/")
def index():
    return jsonify({
        "service": "Industrial Predictive Maintenance API",
        "status": "running",
        "frontend": "http://127.0.0.1:5173",
        "health": "/api/health",
        "dashboard": "/api/dashboard",
        "prediction": "POST /api/predict",
        "history": "/api/predictions",
    })


@app.get("/api/health")
def health():
    try:
        assets = _load_assets()
        return jsonify({
            "status": "ok",
            "model_loaded": True,
            "decision_tree_loaded": assets["decision_tree"] is not None,
            "random_forest_loaded": assets["random_forest"] is not None,
            "threshold": assets["threshold"],
        })
    except Exception as exc:
        app.logger.exception("Health check failed")
        return jsonify({"status": "error", "message": str(exc)}), 500


@app.get("/api/dashboard")
def dashboard():
    try:
        assets = _load_assets()
        profile = assets["profile"]
        return jsonify({
            "dataset": profile,
            "model": {
                "name": "Improved Random Forest",
                "estimators": int(assets["random_forest"].n_estimators),
                "threshold": assets["threshold"],
                "threshold_percent": round(assets["threshold"] * 100, 1),
                "features": assets["features"],
            },
            "metrics": [assets["metrics"]["decision_tree"], assets["metrics"]["random_forest"]],
            "selected_confusion_matrix": assets["confusion_matrix"],
            "feature_importance": assets["feature_importance"],
            "feature_stats": assets["feature_stats"],
            "evaluation": {
                "method": "Stratified 80/20 holdout split",
                "random_state": 42,
                "positive_class": "Machine failure = 1",
            },
            "note": "AI4I 2020 is a synthetic benchmark dataset. Predictions are a proof-of-concept, not a real-machine diagnosis.",
        })
    except Exception as exc:
        app.logger.exception("Dashboard data failed")
        return jsonify({"error": "Could not load dashboard data", "detail": str(exc)}), 500


@app.post("/api/predict")
def predict():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return jsonify({"error": "Send a JSON object containing all five sensor values."}), 400

    values: list[float] = []
    missing: list[str] = []
    invalid: list[str] = []
    for api_key, _column in API_FIELDS:
        if api_key not in payload:
            missing.append(api_key)
            continue
        try:
            number = float(payload[api_key])
            if not math.isfinite(number):
                raise ValueError
            values.append(number)
        except (TypeError, ValueError):
            invalid.append(api_key)

    if missing:
        return jsonify({"error": "Missing required input fields", "fields": missing}), 400
    if invalid:
        return jsonify({"error": "Sensor values must be finite numbers", "fields": invalid}), 400

    try:
        assets = _load_assets()
        frame = pd.DataFrame([values], columns=FEATURES)
        probability = float(assets["random_forest"].predict_proba(frame)[0, 1])
        threshold = float(assets["threshold"])
        predicted_failure = probability >= threshold
        stats = assets["feature_stats"]
        out_of_range = []
        for (api_key, column), value in zip(API_FIELDS, values):
            limits = stats[column]
            if value < limits["min"] or value > limits["max"]:
                out_of_range.append({
                    "field": api_key,
                    "min": limits["min"],
                    "max": limits["max"],
                })

        prediction_id = str(uuid.uuid4())
        created_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
        _init_db()
        with _db_connection() as connection:
            connection.execute(
                """INSERT INTO predictions (
                    id, created_at, predicted_failure, failure_probability, threshold,
                    air_temperature, process_temperature, rotational_speed, torque, tool_wear
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (prediction_id, created_at, int(predicted_failure), probability, threshold, *values),
            )

        return jsonify({
            "prediction_id": prediction_id,
            "created_at": created_at,
            "predicted_failure": bool(predicted_failure),
            "prediction_label": "Failure predicted" if predicted_failure else "No failure predicted",
            "failure_probability": probability,
            "failure_probability_percent": round(probability * 100, 2),
            "threshold": threshold,
            "threshold_percent": round(threshold * 100, 1),
            "risk_level": "Above threshold" if predicted_failure else "Below threshold",
            "out_of_training_range": out_of_range,
            "inputs": {api_key: value for (api_key, _), value in zip(API_FIELDS, values)},
            "disclaimer": "Model score from a synthetic dataset; not a confirmed diagnosis of a real machine.",
        })
    except Exception as exc:
        app.logger.exception("Prediction failed")
        return jsonify({"error": "Prediction failed", "detail": str(exc)}), 500


@app.get("/api/predictions")
def predictions():
    try:
        limit = min(max(int(request.args.get("limit", "25")), 1), 200)
    except ValueError:
        return jsonify({"error": "limit must be an integer"}), 400
    _init_db()
    with _db_connection() as connection:
        rows = connection.execute(
            "SELECT * FROM predictions ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return jsonify({"items": [_history_item(row) for row in rows]})


if __name__ == "__main__":
    # Load and validate the exact supplied artifacts before starting Flask.
    _load_assets()
    _init_db()
    print("Loaded user-supplied Decision Tree, Improved Random Forest and 0.4 threshold.")
    app.run(host="127.0.0.1", port=5000, debug=False, use_reloader=False)
