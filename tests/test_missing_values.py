import unittest

import numpy as np
import pandas as pd

from cauchan.preprocessing import PreprocessingError, impute_missing_values


class TestMissingValueImputation(unittest.TestCase):
    def test_numeric_columns_use_median(self):
        dataframe = pd.DataFrame({"temperature": [100.0, np.nan, 300.0]})

        result = impute_missing_values(dataframe)

        self.assertEqual(result.dataframe["temperature"].tolist(), [100.0, 200.0, 300.0])
        self.assertEqual(result.imputed_counts["temperature"], 1)
        self.assertEqual(result.methods["temperature"], "median")
        self.assertEqual(result.remaining_missing_counts["temperature"], 0)
        self.assertTrue(result.applied)

    def test_non_numeric_columns_use_most_frequent_value(self):
        dataframe = pd.DataFrame({"material": ["A", None, "A", "B"]})

        result = impute_missing_values(dataframe)

        self.assertEqual(result.dataframe["material"].tolist(), ["A", "A", "A", "B"])
        self.assertEqual(result.methods["material"], "most_frequent")
        self.assertEqual(result.imputed_counts["material"], 1)

    def test_original_dataframe_is_not_modified(self):
        dataframe = pd.DataFrame({"property": [1.0, np.nan, 3.0]})

        result = impute_missing_values(dataframe)

        self.assertTrue(pd.isna(dataframe.loc[1, "property"]))
        self.assertFalse(pd.isna(result.dataframe.loc[1, "property"]))

    def test_all_missing_column_raises_clear_error(self):
        dataframe = pd.DataFrame({"property": [np.nan, np.nan]})

        with self.assertRaisesRegex(PreprocessingError, "すべて欠損"):
            impute_missing_values(dataframe)


if __name__ == "__main__":
    unittest.main()
