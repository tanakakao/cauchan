import unittest

import numpy as np

from cauchan.api.schemas import EdgeDefinition, GraphValidationRequest
from cauchan.api.services import matrix_to_edges, read_dataframe, validate_graph


class TestApiServices(unittest.TestCase):
    def test_read_cp932_csv(self):
        content = "物性,温度\n10,100\n20,200\n".encode("cp932")

        dataframe = read_dataframe("sample.csv", content)

        self.assertEqual(dataframe.columns.tolist(), ["物性", "温度"])
        self.assertEqual(len(dataframe), 2)

    def test_matrix_to_edges_keeps_pc_undirected_edge(self):
        columns = ["A", "B", "C"]
        matrix = np.array(
            [
                [0, 1, 0],
                [1, 0, 2.5],
                [0, 0, 0],
            ]
        )

        edges = matrix_to_edges(columns, matrix)

        self.assertEqual(edges[0].kind, "undirected")
        self.assertEqual((edges[0].source, edges[0].target), ("A", "B"))
        self.assertEqual(edges[1].kind, "directed")
        self.assertEqual((edges[1].source, edges[1].target), ("B", "C"))
        self.assertEqual(edges[1].weight, 2.5)

    def test_graph_validation_detects_cycle_and_constraint_conflict(self):
        request = GraphValidationRequest(
            columns=["A", "B", "C"],
            causal_edges=[
                EdgeDefinition(source="A", target="B"),
                EdgeDefinition(source="B", target="C"),
                EdgeDefinition(source="C", target="A"),
            ],
            required_edges=[EdgeDefinition(source="A", target="B")],
            forbidden_edges=[EdgeDefinition(source="A", target="B")],
        )

        errors, _ = validate_graph(request)

        self.assertTrue(any("循環" in error for error in errors))
        self.assertTrue(any("必須と禁止" in error for error in errors))

    def test_forbidden_parent_conflict_is_detected(self):
        request = GraphValidationRequest(
            columns=["property", "material"],
            causal_edges=[EdgeDefinition(source="property", target="material")],
            forbidden_parents=["property"],
        )

        errors, _ = validate_graph(request)

        self.assertTrue(any("原因にしない" in error for error in errors))


if __name__ == "__main__":
    unittest.main()
