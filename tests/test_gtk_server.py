import os
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from gtk_server import EditorServer

class ServerTests(unittest.TestCase):
    def test_server_starts_locally_and_stops(self):
        server = EditorServer()
        try:
            url = server.start(timeout=20)
            self.assertTrue(url.startswith('http://127.0.0.1:'))
            self.assertIsNone(server.process.poll())
        finally:
            server.stop()
        self.assertIsNotNone(server.process.poll())

    def test_stop_before_start_prevents_server_spawn(self):
        server = EditorServer()
        server.stop()
        with patch('gtk_server.subprocess.Popen') as spawn:
            with self.assertRaises(RuntimeError):
                server.start()
        spawn.assert_not_called()

    def test_failed_start_reports_error(self):
        server = EditorServer(node='/missing/node')
        with self.assertRaises(OSError):
            server.start(timeout=1)
        server.stop()

if __name__ == '__main__':
    unittest.main()
