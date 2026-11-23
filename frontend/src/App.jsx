import { useCallback, useEffect, useState } from "react";
import {
  Activity,
  AlertCircle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Cpu,
  Database,
  Gauge,
  History,
  LayoutDashboard,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Zap,
} from "lucide-react";

const API = "/api";
const DEFAULT_INPUTS = {
  air_temperature: "300.0",
  process_temperature: "310.0",
  rotational_speed: "1500",
  torque: "40.0",
  tool_wear: "100",
};
const SENSOR_FIELDS = [
  {
    key: "air_temperature",
    label: "Air temperature",
    unit: "K",
    icon: Thermometer,
    step: "0.1",
  },
  {
    key: "process_temperature",
    label: "Process temperature",
    unit: "K",
    icon: Thermometer,
    step: "0.1",
  },
  {
    key: "rotational_speed",
    label: "Rotational speed",
    unit: "rpm",
    icon: Activity,
    step: "1",
  },
  { key: "torque", label: "Torque", unit: "Nm", icon: Gauge, step: "0.1" },
  {
    key: "tool_wear",
    label: "Tool wear",
    unit: "min",
    icon: Clock3,
    step: "1",
  },
];

async function apiRequest(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(
      body.error || body.message || `Request failed (${response.status})`,
    );
  return body;
}

function ErrorNotice({ message, onRetry }) {
  return (
    <div className="notice error-notice">
      <AlertCircle size={17} />
      <div>
        <strong>Could not load dashboard data</strong>
        <span>{message}</span>
      </div>
      {onRetry && (
        <button className="icon-button" onClick={onRetry} title="Retry">
          <RefreshCw size={16} />
        </button>
      )}
    </div>
  );
}

function App() {
  const [page, setPage] = useState("overview");
  const [health, setHealth] = useState(null);
  const [dashboard, setDashboard] = useState(null);
  const [history, setHistory] = useState([]);
  const [inputs, setInputs] = useState(DEFAULT_INPUTS);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [predicting, setPredicting] = useState(false);
  const [error, setError] = useState("");
  const [historyError, setHistoryError] = useState("");

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [healthData, dashboardData] = await Promise.all([
        apiRequest("/health"),
        apiRequest("/dashboard"),
      ]);
      setHealth(healthData);
      setDashboard(dashboardData);
    } catch (err) {
      setError(err.message || "Check that Flask is running at 127.0.0.1:5000.");
      setHealth(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryError("");
    try {
      const data = await apiRequest("/predictions?limit=30");
      setHistory(data.items || []);
    } catch (err) {
      setHistoryError(err.message);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);
  useEffect(() => {
    if (page === "history") loadHistory();
  }, [page, loadHistory]);

  const handleInput = (key, value) =>
    setInputs((current) => ({ ...current, [key]: value }));

  const handlePredict = async (event) => {
    event.preventDefault();
    setPredicting(true);
    setError("");
    setResult(null);
    try {
      const payload = Object.fromEntries(
        Object.entries(inputs).map(([key, value]) => [key, Number(value)]),
      );
      if (Object.values(payload).some((value) => !Number.isFinite(value))) {
        throw new Error("Enter a valid number for every sensor field.");
      }
      const response = await apiRequest("/predict", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      setResult(response);
      loadHistory();
    } catch (err) {
      setError(err.message || "Prediction failed.");
    } finally {
      setPredicting(false);
    }
  };

  const navigate = (nextPage) => {
    setPage(nextPage);
    setError("");
  };

  if (loading && !dashboard && !error) {
    return (
      <div className="loading-screen">
        <div className="loading-mark">
          <Cpu size={24} />
        </div>
        <strong>Predictive Maintenance</strong>
        <span>Connecting to the ML backend…</span>
        <LoaderCircle className="spin" size={18} />
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-symbol">
            <Activity size={19} strokeWidth={2.4} />
          </div>
          <div>
            <strong>
              Predictive<span>Maintenance</span>
            </strong>
            <small>INDUSTRIAL MACHINE MONITORING</small>
          </div>
        </div>
        <nav className="main-nav" aria-label="Main navigation">
          <button
            className={page === "overview" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("overview")}
          >
            <LayoutDashboard size={16} />
            Overview
          </button>
          <button
            className={page === "predict" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("predict")}
          >
            <Gauge size={16} />
            Predict
          </button>
          <button
            className={page === "history" ? "nav-link active" : "nav-link"}
            onClick={() => navigate("history")}
          >
            <History size={16} />
            History
          </button>
        </nav>
        <div
          className="connection"
          title={
            health?.status === "ok"
              ? "Flask and model artifacts are available"
              : "Backend not connected"
          }
        >
          <span
            className={
              health?.status === "ok"
                ? "connection-dot online"
                : "connection-dot"
            }
          />
          <span>
            {health?.status === "ok" ? "Backend connected" : "Backend offline"}
          </span>
        </div>
      </header>

      <main className="main-content">
        {error && <ErrorNotice message={error} onRetry={loadDashboard} />}
        {!dashboard && !loading ? (
          <section className="empty-panel">
            <div className="empty-icon">
              <AlertCircle size={24} />
            </div>
            <h1>Backend connection required</h1>
            <p>Start the Flask server, then refresh this page.</p>
            <code>cd backend &nbsp;·&nbsp; python app.py</code>
            <button className="primary-button" onClick={loadDashboard}>
              <RefreshCw size={15} /> Retry connection
            </button>
          </section>
        ) : dashboard && page === "overview" ? (
          <Overview
            dashboard={dashboard}
            onPredict={() => navigate("predict")}
          />
        ) : dashboard && page === "predict" ? (
          <PredictionPage
            dashboard={dashboard}
            inputs={inputs}
            result={result}
            predicting={predicting}
            onInput={handleInput}
            onSubmit={handlePredict}
            onClear={() => {
              setResult(null);
              setInputs(DEFAULT_INPUTS);
            }}
          />
        ) : dashboard && page === "history" ? (
          <HistoryPage
            items={history}
            error={historyError}
            onRefresh={loadHistory}
          />
        ) : null}
      </main>
      <footer className="footer">
        <span>MITAOE · ENTC · Semester V · 2026–27</span>
        <span>AI4I 2020 dataset · Educational proof of concept</span>
      </footer>
    </div>
  );
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}

function Overview({ dashboard, onPredict }) {
  const { dataset, model, metrics, feature_importance: importance } = dashboard;
  const selected = metrics.find(
    (item) => item.model === "Improved Random Forest",
  );
  const balance = (dataset.failures / dataset.records) * 100;
  return (
    <>
      <PageHeading
        eyebrow="SYSTEM OVERVIEW"
        title="Machine health at a glance"
        description="A simple view of the dataset, selected model and its test performance."
        action={
          <button className="primary-button" onClick={onPredict}>
            <Gauge size={16} />
            New prediction
            <ChevronRight size={15} />
          </button>
        }
      />
      <section className="stat-grid">
        <StatCard
          icon={Database}
          label="Dataset records"
          value={dataset.records.toLocaleString()}
          detail={`${dataset.columns} columns · ${dataset.missing_values} missing values`}
        />
        <StatCard
          icon={Activity}
          label="Recorded failures"
          value={dataset.failures.toLocaleString()}
          detail={`${dataset.failure_rate_percent}% of all records`}
          tone="amber"
        />
        <StatCard
          icon={Cpu}
          label="Selected model"
          value="Random Forest"
          detail={`${model.estimators} trees · threshold ${model.threshold}`}
          tone="violet"
        />
        <StatCard
          icon={ShieldCheck}
          label="Test accuracy"
          value={`${(selected.accuracy * 100).toFixed(2)}%`}
          detail="Stratified 80/20 holdout"
          tone="green"
        />
      </section>

      <div className="overview-grid">
        <section className="panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">MODEL PERFORMANCE</span>
              <h2>Test-set comparison</h2>
            </div>
            <span className="soft-tag">Failure class = 1</span>
          </div>
          <div className="metric-table-wrap">
            <table className="metric-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Accuracy</th>
                  <th>Precision</th>
                  <th>Recall</th>
                  <th>F1</th>
                </tr>
              </thead>
              <tbody>
                {metrics.map((item) => (
                  <tr
                    key={item.model}
                    className={
                      item.model === "Improved Random Forest"
                        ? "chosen-row"
                        : ""
                    }
                  >
                    <td>
                      <strong>{item.model}</strong>
                      {item.model === "Improved Random Forest" && (
                        <span className="selected-mark">SELECTED</span>
                      )}
                    </td>
                    <td>{(item.accuracy * 100).toFixed(2)}%</td>
                    <td>{(item.precision * 100).toFixed(2)}%</td>
                    <td>{(item.recall * 100).toFixed(2)}%</td>
                    <td>{item.f1.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="panel-footnote">
            Random Forest uses the saved 0.4 decision threshold. Decision Tree
            uses its default class prediction.
          </p>
        </section>

        <section className="panel balance-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">DATASET PROFILE</span>
              <h2>Failure distribution</h2>
            </div>
            <span className="info-icon" title="The dataset is imbalanced">
              <CircleHelp size={15} />
            </span>
          </div>
          <div className="balance-number">
            <strong>{dataset.failure_rate_percent}%</strong>
            <span>recorded failures</span>
          </div>
          <div className="balance-bar">
            <span style={{ width: `${Math.max(balance, 1)}%` }} />
          </div>
          <div className="balance-legend">
            <div>
              <i className="legend-normal" />
              <span>No failure</span>
              <strong>{dataset.no_failure.toLocaleString()}</strong>
            </div>
            <div>
              <i className="legend-failure" />
              <span>Failure</span>
              <strong>{dataset.failures.toLocaleString()}</strong>
            </div>
          </div>
          <div className="dataset-note">
            <AlertCircle size={14} />
            <span>AI4I 2020 is a synthetic research dataset.</span>
          </div>
        </section>
      </div>

      <section className="panel lower-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">MODEL INPUTS</span>
            <h2>Five sensor measurements</h2>
          </div>
          <span className="soft-tag">Live prediction inputs</span>
        </div>
        <div className="sensor-chips">
          {model.features.map((feature) => (
            <span key={feature}>
              {feature.replace(" [", " · ").replace("]", "")}
            </span>
          ))}
        </div>
        <div className="feature-line">
          <div>
            <span className="eyebrow">MOST IMPORTANT IN THIS MODEL</span>
            <strong>
              {importance[0]?.feature.replace(" [", " · ").replace("]", "") ||
                "—"}
            </strong>
          </div>
          <div className="importance-track">
            <span
              style={{ width: `${(importance[0]?.importance || 0) * 100}%` }}
            />
          </div>
          <span className="importance-value">
            {((importance[0]?.importance || 0) * 100).toFixed(1)}%
          </span>
        </div>
      </section>
      <div className="method-note">
        <ShieldCheck size={16} />
        <span>
          Predictions are model estimates from the AI4I benchmark, not confirmed
          machine diagnoses or real-world failure guarantees.
        </span>
      </div>
    </>
  );
}

function StatCard({ icon: Icon, label, value, detail, tone = "blue" }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={17} />
      </div>
      <div className="stat-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

function PredictionPage({
  dashboard,
  inputs,
  result,
  predicting,
  onInput,
  onSubmit,
  onClear,
}) {
  return (
    <>
      <PageHeading
        eyebrow="LIVE PREDICTION"
        title="Check machine condition"
        description="Enter the five operating measurements to estimate the failure risk."
      />
      <div className="predict-grid">
        <form className="panel prediction-form" onSubmit={onSubmit}>
          <div className="panel-title">
            <div>
              <span className="eyebrow">SENSOR MEASUREMENTS</span>
              <h2>Operating parameters</h2>
            </div>
            <span className="soft-tag">5 inputs</span>
          </div>
          <div className="input-grid">
            {SENSOR_FIELDS.map(({ key, label, unit, icon: Icon, step }) => (
              <label className="field" key={key}>
                <span className="field-label">
                  <Icon size={14} />
                  {label}
                </span>
                <div className="input-wrap">
                  <input
                    type="number"
                    step={step}
                    value={inputs[key]}
                    onChange={(event) => onInput(key, event.target.value)}
                    required
                  />
                  <span>{unit}</span>
                </div>
              </label>
            ))}
          </div>
          <div className="form-footer">
            <span>
              <CircleHelp size={14} /> Use the same units shown beside each
              field.
            </span>
            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={onClear}
              >
                Reset
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={predicting}
              >
                {predicting ? (
                  <LoaderCircle className="spin" size={15} />
                ) : (
                  <Zap size={15} />
                )}
                {predicting ? "Checking…" : "Predict failure"}
              </button>
            </div>
          </div>
        </form>

        <section className="panel result-panel">
          <div className="panel-title">
            <div>
              <span className="eyebrow">PREDICTION RESULT</span>
              <h2>Machine status</h2>
            </div>
            <span className="model-mini">
              RF · {dashboard.model.estimators} trees
            </span>
          </div>
          {!result ? (
            <div className="result-empty">
              <div className="empty-gauge">
                <Gauge size={28} />
              </div>
              <strong>Ready for a prediction</strong>
              <span>
                Enter machine readings and select Predict failure. The saved
                model will process the values through the Flask API.
              </span>
            </div>
          ) : (
            <div className="result-content">
              <div
                className={
                  result.predicted_failure
                    ? "result-banner warning"
                    : "result-banner good"
                }
              >
                <div className="result-banner-icon">
                  {result.predicted_failure ? (
                    <AlertCircle size={21} />
                  ) : (
                    <CheckCircle2 size={21} />
                  )}
                </div>
                <div>
                  <strong>{result.prediction_label}</strong>
                  <span>{result.risk_level}</span>
                </div>
              </div>
              <div className="probability-head">
                <span>Failure score</span>
                <strong>
                  {result.failure_probability_percent.toFixed(2)}%
                </strong>
              </div>
              <div className="probability-bar">
                <span
                  className={result.predicted_failure ? "above" : ""}
                  style={{
                    width: `${Math.min(result.failure_probability_percent, 100)}%`,
                  }}
                />
              </div>
              <div className="threshold-info">
                <span>Decision threshold</span>
                <strong>{result.threshold_percent.toFixed(1)}%</strong>
              </div>
              {result.out_of_training_range?.length > 0 && (
                <div className="range-warning">
                  <AlertCircle size={15} />
                  <span>
                    One or more inputs are outside the range seen in the
                    dataset. Interpret this result carefully.
                  </span>
                </div>
              )}
              <div className="result-id">
                <span>Prediction reference</span>
                <code>{result.prediction_id.slice(0, 13)}…</code>
              </div>
              <p className="result-disclaimer">{result.disclaimer}</p>
            </div>
          )}
        </section>
      </div>
      <div className="method-note">
        <ShieldCheck size={16} />
        <span>
          Selected model: Improved Random Forest (200 estimators). The saved
          threshold of {dashboard.model.threshold} is applied to the failure
          score.
        </span>
      </div>
    </>
  );
}

function HistoryPage({ items, error, onRefresh }) {
  return (
    <>
      <PageHeading
        eyebrow="PREDICTION HISTORY"
        title="Recent checks"
        description="Predictions made from this dashboard are saved locally on the backend."
        action={
          <button
            className="secondary-button refresh-button"
            onClick={onRefresh}
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />
      {error && <ErrorNotice message={error} onRetry={onRefresh} />}
      <section className="panel history-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">LOCAL RECORDS</span>
            <h2>{items.length} recent predictions</h2>
          </div>
          <span className="soft-tag">SQLite</span>
        </div>
        {items.length === 0 ? (
          <div className="history-empty">
            <History size={25} />
            <strong>No predictions saved yet</strong>
            <span>Run a prediction to see it listed here.</span>
          </div>
        ) : (
          <div className="table-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date & time</th>
                  <th>Result</th>
                  <th>Failure score</th>
                  <th>Threshold</th>
                  <th>Temperature</th>
                  <th>Speed</th>
                  <th>Torque</th>
                  <th>Tool wear</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.created_at).toLocaleString()}</td>
                    <td>
                      <span
                        className={
                          item.predicted_failure
                            ? "status-pill failure"
                            : "status-pill normal"
                        }
                      >
                        {item.predicted_failure
                          ? "Failure predicted"
                          : "No failure"}
                      </span>
                    </td>
                    <td>
                      <strong>
                        {(item.failure_probability * 100).toFixed(2)}%
                      </strong>
                    </td>
                    <td>{(item.threshold * 100).toFixed(0)}%</td>
                    <td>{item.inputs.air_temperature.toFixed(1)} K</td>
                    <td>{item.inputs.rotational_speed} rpm</td>
                    <td>{item.inputs.torque.toFixed(1)} Nm</td>
                    <td>{item.inputs.tool_wear} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <div className="method-note">
        <Database size={16} />
        <span>
          History is stored in <code>backend/data/prediction_history.db</code>{" "}
          on your computer.
        </span>
      </div>
    </>
  );
}

export default App;
