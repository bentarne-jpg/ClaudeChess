"""Tests for tools/site.py (run: python3 -m unittest discover tools)."""
import json, tempfile, unittest
from pathlib import Path
import site as _  # noqa: F401  (make sure the stdlib module is loaded before ours)
import importlib.util

spec = importlib.util.spec_from_file_location("sitetool", Path(__file__).with_name("site.py"))
sitetool = importlib.util.module_from_spec(spec); spec.loader.exec_module(sitetool)


class SiteTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp()); self.site = self.tmp / "site"; self.build = self.tmp / "build"
        (self.site / "releases" / "v1.0.0").mkdir(parents=True); (self.build / "assets").mkdir(parents=True)
        (self.site / "index.html").write_text("v1"); (self.site / "releases" / "v1.0.0" / "index.html").write_text("v1")
        (self.build / "index.html").write_text("v2"); (self.build / "assets" / "a.js").write_text("x")

    def run_(self, channel, version=""):
        sitetool.main(str(self.build), channel, version, str(self.site))

    def versions(self):
        return json.loads((self.site / "versions.json").read_text())

    def test_release_keeps_every_version_and_previews(self):
        self.run_("next"); self.run_("dev/My-Feature"); self.run_("production", "v1.1.0")
        self.assertEqual((self.site / "index.html").read_text(), "v2")
        self.assertTrue((self.site / "releases" / "v1.0.0" / "index.html").exists())
        self.assertTrue((self.site / "releases" / "v1.1.0" / "assets" / "a.js").exists())
        self.assertTrue((self.site / "next" / "index.html").exists())
        self.assertTrue((self.site / "dev" / "my-feature" / "index.html").exists())
        self.assertEqual(self.versions()["releases"], ["v1.0.0", "v1.1.0"])

    def test_rollback_restores_an_earlier_release_exactly(self):
        self.run_("production", "v1.1.0"); self.run_("rollback", "v1.0.0")
        self.assertEqual((self.site / "index.html").read_text(), "v1")
        self.assertFalse((self.site / "assets").exists())
        self.assertTrue((self.site / "releases" / "v1.1.0").exists())
        v = self.versions(); self.assertEqual(v["production"], "v1.0.0")
        self.assertEqual([h["action"] for h in v["history"]], ["production", "rollback"])

    def test_refuses_bad_or_repeated_versions(self):
        self.run_("production", "v1.1.0")
        for ch, ver in [("production", "v1.1.0"), ("production", "1.2"), ("rollback", "v9.9.9"), ("dev/bad name!", "")]:
            with self.assertRaises(SystemExit): self.run_(ch, ver)

    def test_removing_a_dev_preview(self):
        self.run_("dev/x"); self.run_("remove-dev/x")
        self.assertEqual(self.versions()["dev"], [])


if __name__ == "__main__":
    unittest.main()
