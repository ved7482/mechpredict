import tempfile
import unittest
from pathlib import Path

import app as api


class PredictiveMaintenanceApiTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.old_db_path = api.DB_PATH
        api.DB_PATH = Path(self.temp_dir.name) / "test_history.db"
        self.client = api.app.test_client()

    def tearDown(self):
        api.DB_PATH = self.old_db_path
        self.temp_dir.cleanup()

    def test_homepage(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["status"], "running")

    def test_health_loads_supplied_artifacts(self):
        response = self.client.get("/api/health")
        body = response.get_json()
        self.assertEqual(response.status_code, 200, body)
        self.assertTrue(body["model_loaded"])
        self.assertAlmostEqual(body["threshold"], 0.4)

    def test_dashboard_uses_two_supplied_models(self):
        response = self.client.get("/api/dashboard")
        body = response.get_json()
        self.assertEqual(response.status_code, 200, body)
        self.assertEqual(body["model"]["name"], "Improved Random Forest")
        self.assertEqual(body["model"]["estimators"], 200)
        self.assertEqual(len(body["metrics"]), 2)
        self.assertEqual(len(body["model"]["features"]), 5)

    def test_prediction_is_saved_to_history(self):
        payload = {
            "air_temperature": 300,
            "process_temperature": 310,
            "rotational_speed": 1500,
            "torque": 40,
            "tool_wear": 100,
        }
        response = self.client.post("/api/predict", json=payload)
        body = response.get_json()
        self.assertEqual(response.status_code, 200, body)
        self.assertIn("prediction_id", body)
        self.assertAlmostEqual(body["threshold"], 0.4)
        history = self.client.get("/api/predictions").get_json()["items"]
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["id"], body["prediction_id"])

    def test_missing_input_is_rejected(self):
        response = self.client.post("/api/predict", json={"air_temperature": 300})
        self.assertEqual(response.status_code, 400)
        self.assertIn("fields", response.get_json())


if __name__ == "__main__":
    unittest.main(verbosity=2)
