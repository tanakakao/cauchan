"""Webアプリの固定ポート設定を検証するテスト。"""

from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class WebPortConfigurationTest(unittest.TestCase):
    """bochan・malchanとの同時起動用ポートを検証する。"""

    def test_cauchan_uses_reserved_ports_consistently(self) -> None:
        """FastAPI 8002、React 5175が各設定で一致する。"""
        launcher = (ROOT / "start_web.bat").read_text(encoding="utf-8")
        vite_config = (ROOT / "web" / "vite.config.ts").read_text(
            encoding="utf-8"
        )
        api_client = (ROOT / "web" / "src" / "api.ts").read_text(
            encoding="utf-8"
        )
        env_example = (ROOT / "web" / ".env.example").read_text(
            encoding="utf-8"
        )
        fastapi_app = (
            ROOT / "src" / "cauchan" / "api" / "app.py"
        ).read_text(encoding="utf-8")

        self.assertIn('set "BACKEND_PORT=8002"', launcher)
        self.assertIn('set "FRONTEND_PORT=5175"', launcher)
        self.assertIn("/api/v1/health", launcher)
        self.assertIn("VITE_API_BASE_URL", launcher)
        self.assertIn("CAUCHAN_CORS_ORIGINS", launcher)
        self.assertIn("--strictPort", launcher)

        self.assertIn("port: 5175", vite_config)
        self.assertIn("strictPort: true", vite_config)
        self.assertIn("127.0.0.1:8002/api/v1", api_client)
        self.assertIn("127.0.0.1:8002/api/v1", env_example)
        self.assertIn("127.0.0.1:5175", fastapi_app)
        self.assertIn("localhost:5175", fastapi_app)

    def test_launcher_resolves_src_layout_without_editable_install(self) -> None:
        """Uvicornがsrcディレクトリからcauchanを読み込む。"""
        launcher = (ROOT / "start_web.bat").read_text(encoding="utf-8")

        self.assertIn('set "APP_DIR=%~dp0src"', launcher)
        self.assertIn('--app-dir "%APP_DIR%"', launcher)
        self.assertIn(
            'if not exist "%APP_DIR%\\cauchan\\api\\app.py"',
            launcher,
        )

    def test_ports_do_not_overlap_related_apps(self) -> None:
        """cauchanの既定ポートがbochan・malchanと重複しない。"""
        related_ports = {8000, 8001, 5173, 5174}
        cauchan_ports = {8002, 5175}

        self.assertTrue(cauchan_ports.isdisjoint(related_ports))


if __name__ == "__main__":
    unittest.main()
