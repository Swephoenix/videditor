import unittest
from unittest.mock import Mock

import gi
gi.require_version('WebKit', '6.0')
from gi.repository import GObject, WebKit
from gtk_app import connect_downloads

class DownloadTests(unittest.TestCase):
    def test_download_signal_is_on_network_session(self):
        GObject.type_class_ref(WebKit.NetworkSession.__gtype__)
        self.assertNotEqual(GObject.signal_lookup('download-started', WebKit.NetworkSession.__gtype__), 0)
        session = Mock()
        webview = Mock()
        webview.get_network_session.return_value = session
        callback = Mock()
        connect_downloads(webview, callback)
        session.connect.assert_called_once_with('download-started', callback)
        webview.get_context.assert_not_called()

if __name__ == '__main__':
    unittest.main()
