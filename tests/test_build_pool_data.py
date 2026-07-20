import importlib.util
import unittest
from pathlib import Path


MODULE_PATH = Path(__file__).resolve().parents[1] / "scripts" / "build_pool_data.py"
SPEC = importlib.util.spec_from_file_location("build_pool_data", MODULE_PATH)
build_pool_data = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(build_pool_data)


class BuildPoolDataTests(unittest.TestCase):
    def test_normalize_country_uses_official_bosnia_name(self):
        self.assertEqual(build_pool_data.normalize_country("Bosnia"), "Bosnia-Herzegovina")
        self.assertEqual(
            build_pool_data.normalize_country("Bosnia and Herzegovina"),
            "Bosnia-Herzegovina",
        )
        self.assertEqual(
            build_pool_data.normalize_country("Bosnia-Herzegovina"),
            "Bosnia-Herzegovina",
        )

    def test_normalize_country_uses_official_czechia_and_turkiye_names(self):
        self.assertEqual(build_pool_data.normalize_country("Czech Republic"), "Czechia")
        self.assertEqual(build_pool_data.normalize_country("Czechia"), "Czechia")
        self.assertEqual(build_pool_data.normalize_country("Turkey"), "Türkiye")
        self.assertEqual(build_pool_data.normalize_country("Turkiye"), "Türkiye")
        self.assertEqual(build_pool_data.normalize_country("Türkiye"), "Türkiye")

    def test_normalize_country_translates_spanish_and_removes_flag_emoji(self):
        self.assertEqual(build_pool_data.normalize_country("España"), "Spain")
        self.assertEqual(build_pool_data.normalize_country("Espana"), "Spain")
        self.assertEqual(build_pool_data.normalize_country("Portugal 🇵🇹"), "Portugal")
        self.assertEqual(build_pool_data.normalize_country("france"), "France")

    def test_normalize_country_uses_official_congo_dr_name(self):
        self.assertEqual(build_pool_data.normalize_country("DR Congo"), "Congo DR")
        self.assertEqual(build_pool_data.normalize_country("Congo DR"), "Congo DR")
        self.assertEqual(
            build_pool_data.normalize_country("Democratic Republic of the Congo"),
            "Congo DR",
        )

    def test_country_fields_are_normalized_when_extracting_predictions(self):
        cells = {
            (4, 3): "Bosnia",
            (5, 3): "Czech Republic",
            (6, 3): "DR Congo",
            (8, 3): "Kylian Mbappé - 7",
        }

        futures = build_pool_data.extract_futures(cells, "Player")

        self.assertEqual(futures["champion"]["value"], "Bosnia-Herzegovina")
        self.assertEqual(futures["runner_up"]["value"], "Czechia")
        self.assertEqual(futures["favorite_team"]["value"], "Congo DR")
        self.assertEqual(futures["top_scorer"]["value"], "Kylian Mbappe")


if __name__ == "__main__":
    unittest.main()
