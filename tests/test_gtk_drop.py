import io
import json
import tempfile
import subprocess
import unittest
from pathlib import Path
from unittest.mock import Mock, patch
from gtk_app import EditorApplication
from gtk_drop import upload_dropped_file

class FakeResponse:
    status = 201
    def read(self, size=-1):
        return json.dumps({'id': 'm1', 'name': 'klipp.mp4'}).encode()

class FakeConnection:
    instances = []
    def __init__(self, host, port, timeout):
        self.headers = {}
        self.chunks = []
        self.closed = False
        self.instances.append(self)
    def putrequest(self, method, path): self.request = (method, path)
    def putheader(self, name, value): self.headers[name] = value
    def endheaders(self): pass
    def send(self, data): self.chunks.append(data)
    def getresponse(self): return FakeResponse()
    def close(self): self.closed = True

class DropTests(unittest.TestCase):
    def test_streams_only_selected_file_to_loopback_and_closes(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'klipp.mp4'
            file.write_bytes(b'video bytes')
            with patch('gtk_drop.http.client.HTTPConnection', FakeConnection):
                media = upload_dropped_file('http://127.0.0.1:4321/', file)
        conn = FakeConnection.instances[-1]
        self.assertEqual(media['id'], 'm1')
        self.assertEqual(conn.request, ('POST', '/api/media'))
        body = b''.join(conn.chunks)
        self.assertIn(b'video bytes', body)
        self.assertEqual(int(conn.headers['Content-Length']), len(body))
        self.assertTrue(conn.closed)

    def test_multipart_is_accepted_with_unicode_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'klipp åäö.mp4'
            file.write_bytes(b'video bytes')
            with patch('gtk_drop.http.client.HTTPConnection', FakeConnection):
                upload_dropped_file('http://127.0.0.1:4321/', file)
        conn = FakeConnection.instances[-1]
        script = r"""
const busboy = require('busboy');
const parser = busboy({ headers: { 'content-type': process.argv[1] } });
parser.on('file', (name, stream, info) => {
  let data = '';
  stream.on('data', chunk => { data += chunk; });
  stream.on('end', () => console.log(JSON.stringify({ name, filename: info.filename, data })));
});
process.stdin.pipe(parser);
"""
        result = subprocess.run(['node', '-e', script, conn.headers['Content-Type']],
                                input=b''.join(conn.chunks), capture_output=True, check=True)
        self.assertEqual(json.loads(result.stdout), {'name': 'media', 'filename': 'klipp åäö.mp4', 'data': 'video bytes'})

    def test_native_drop_accepts_external_files_only(self):
        app = Mock()
        app.closing = False
        app.server_url = 'http://127.0.0.1:4321/'
        app.drop_active = False
        target = Mock()
        target.get_current_drop.return_value.get_drag.return_value = None
        file_list = Mock()
        file_list.get_files.return_value = [Mock(get_path=Mock(return_value='/tmp/klipp.mp4'))]
        self.assertTrue(EditorApplication.on_file_drop(app, target, file_list, 0, 0))
        self.assertTrue(app.drop_active)
        app.webview.evaluate_javascript.assert_called_once()
        app.drop_active = False
        target.get_current_drop.return_value.get_drag.return_value = object()
        self.assertFalse(EditorApplication.on_file_drop(app, target, file_list, 0, 0))

    def test_refuses_non_loopback_server(self):
        with self.assertRaises(ValueError):
            upload_dropped_file('http://example.com:80/', Path('/no/file.mp4'))

if __name__ == '__main__':
    unittest.main()
