"""Lifecycle of the local server owned by the desktop window."""
import os
from pathlib import Path
import socket
import subprocess
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parent

class EditorServer:
    def __init__(self, node='node'):
        self.node = node
        self.process = None
        self.log = None

    def start(self, timeout=30):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        env = os.environ.copy()
        env.update(PORT=str(port), HOST='127.0.0.1')
        (ROOT / '.runtime').mkdir(exist_ok=True)
        self.log = open(ROOT / '.runtime' / 'gtk-server.log', 'a', encoding='utf-8')
        try:
            self.process = subprocess.Popen([self.node, str(ROOT / 'server.js')], cwd=ROOT,
                                            env=env, stdout=self.log, stderr=subprocess.STDOUT)
            url = f'http://127.0.0.1:{port}/'
            deadline = time.monotonic() + timeout
            while time.monotonic() < deadline:
                if self.process.poll() is not None:
                    raise RuntimeError('Servern avslutades. Se .runtime/gtk-server.log.')
                try:
                    with urllib.request.urlopen(url, timeout=0.5) as response:
                        if response.status == 200 and self.process.poll() is None:
                            return url
                except (OSError, urllib.error.URLError):
                    time.sleep(0.1)
            raise TimeoutError('Servern startade inte i tid. Se .runtime/gtk-server.log.')
        except BaseException:
            self.stop()
            raise

    def stop(self):
        if self.process and self.process.poll() is None:
            self.process.terminate()
            try:
                self.process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait()
        if self.log and not self.log.closed:
            self.log.close()
