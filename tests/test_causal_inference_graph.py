import unittest

import networkx as nx
import numpy as np
import pandas as pd

from src.cauchan.models.model import CausalInference


class TestCausalInferenceGraph(unittest.TestCase):
    def test_pc_bidirectional_edge_is_oriented_without_cycle(self):
        columns = [
            "property",
            "raw material 1",
            "raw material 2",
            "temperature",
        ]
        causal_matrix = np.array(
            [
                [0, 1, 0, 0],
                [1, 0, 0, 1],
                [0, 0, 0, 0],
                [0, 0, 0, 0],
            ]
        )
        df = pd.DataFrame(np.zeros((2, len(columns))), columns=columns)
        model = CausalInference(df, columns, causal_matrix)

        dag = model._make_dag()

        self.assertTrue(nx.is_directed_acyclic_graph(dag))
        self.assertEqual(set(dag.nodes), set(columns))
        self.assertNotEqual(
            dag.has_edge("property", "raw material 1"),
            dag.has_edge("raw material 1", "property"),
        )

    def test_dot_graph_contains_isolated_nodes(self):
        columns = ["treatment", "outcome", "isolated"]
        causal_matrix = np.array(
            [
                [0, 1, 0],
                [0, 0, 0],
                [0, 0, 0],
            ]
        )
        df = pd.DataFrame(np.zeros((2, len(columns))), columns=columns)
        model = CausalInference(df, columns, causal_matrix)

        graph = model._make_graph_str()

        self.assertIn('"isolated";', graph)
        self.assertIn('"treatment" -> "outcome";', graph)

    def test_directed_cycle_is_rejected(self):
        columns = ["A", "B", "C"]
        causal_matrix = np.array(
            [
                [0, 1, 0],
                [0, 0, 1],
                [1, 0, 0],
            ]
        )
        df = pd.DataFrame(np.zeros((2, len(columns))), columns=columns)
        model = CausalInference(df, columns, causal_matrix)

        with self.assertRaisesRegex(ValueError, "循環"):
            model._make_dag()


if __name__ == "__main__":
    unittest.main()
