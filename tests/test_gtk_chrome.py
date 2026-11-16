import unittest
from pathlib import Path
import gi
gi.require_version('Gdk', '4.0')
from gi.repository import Gdk
from frameless_window import resize_edge

class ChromeTests(unittest.TestCase):
    def test_resize_edges(self):
        self.assertEqual(resize_edge(2, 100, 1000, 800), Gdk.SurfaceEdge.WEST)
        self.assertEqual(resize_edge(998, 100, 1000, 800), Gdk.SurfaceEdge.EAST)
        self.assertEqual(resize_edge(2, 2, 1000, 800), Gdk.SurfaceEdge.NORTH_WEST)

    def test_chrome_reserves_its_own_row(self):
        from frameless_window import CHROME_HEIGHT
        self.assertGreaterEqual(CHROME_HEIGHT, 24)
        root = Path(__file__).resolve().parents[1]
        chrome = (root / 'frameless_window.py').read_text()
        self.assertIn('layout.append(self.chrome_row)', chrome)
        self.assertIn('layout.append(content)', chrome)

    def test_collapsed_media_button_fits(self):
        from gtk_app import GTK_WEB_CSS
        self.assertIn('.media-pool.collapsed .media-pool-toggle', GTK_WEB_CSS)
        self.assertIn('transform: none', GTK_WEB_CSS)
        self.assertIn('max-width: 100%', GTK_WEB_CSS)
        self.assertIn('writing-mode: horizontal-tb', GTK_WEB_CSS)
        self.assertIn('flex-basis: 76px', GTK_WEB_CSS)

    def test_close_and_chrome(self):
        root = Path(__file__).resolve().parents[1]
        app = (root / 'gtk_app.py').read_text()
        chrome = (root / 'frameless_window.py').read_text()
        self.assertIn('FramelessWindowChrome(', app)
        self.assertIn('close-request', app)
        self.assertIn('set_decorated(False)', chrome)
        self.assertIn('self.window.close()', chrome)

if __name__ == '__main__':
    unittest.main()
