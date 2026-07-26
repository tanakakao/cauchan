import unittest

from fastapi.testclient import TestClient

from cauchan.api.app import app


class TestApiApp(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def test_health(self):
        response = self.client.get("/api/v1/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_upload_csv(self):
        response = self.client.post(
            "/api/v1/datasets",
            files={"file": ("sample.csv", b"A,B\n1,2\n3,4\n", "text/csv")},
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body["columns"], ["A", "B"])
        self.assertEqual(body["row_count"], 2)

    def test_validate_graph_endpoint(self):
        response = self.client.post(
            "/api/v1/graphs/validate",
            json={
                "columns": ["A", "B"],
                "causal_edges": [
                    {"source": "A", "target": "B"},
                    {"source": "B", "target": "A"},
                ],
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["valid"])


if __name__ == "__main__":
    unittest.main()
