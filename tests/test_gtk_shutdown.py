import unittest
from unittest.mock import Mock
from gtk_app import EditorApplication

class ShutdownTests(unittest.TestCase):
    def test_close_stops_server_even_before_process_is_assigned(self):
        app = Mock()
        app.server.process = None
        self.assertFalse(EditorApplication.on_close(app, None))
        self.assertTrue(app.closing)
        app.server.stop.assert_called_once_with()

    def test_signal_closes_window_with_or_without_callback_data(self):
        app = Mock()
        self.assertFalse(EditorApplication.stop_from_signal(app, None))
        app.window.close.assert_called_once_with()

if __name__ == '__main__':
    unittest.main()
