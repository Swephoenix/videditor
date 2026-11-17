"""Stream files explicitly dropped onto the GTK window to its local server."""
import http.client
import json
import mimetypes
from pathlib import Path
from urllib.parse import quote, urlsplit
from uuid import uuid4


def upload_dropped_file(server_url, path, cancelled=None):
    url = urlsplit(server_url)
    if url.scheme != 'http' or url.hostname != '127.0.0.1' or not url.port:
        raise ValueError('Ogiltig lokal serveradress.')
    path = Path(path)
    boundary = 'videditor-' + uuid4().hex
    filename = quote(path.name, safe='')
    content_type = mimetypes.guess_type(path.name)[0] or 'application/octet-stream'
    header = (f'--{boundary}\r\nContent-Disposition: form-data; name="media"; '
              f"filename*=UTF-8''{filename}\r\nContent-Type: {content_type}\r\n\r\n").encode('ascii')
    trailer = f'\r\n--{boundary}--\r\n'.encode('ascii')
    conn = http.client.HTTPConnection(url.hostname, url.port, timeout=30)
    try:
        with path.open('rb') as source:
            length = len(header) + path.stat().st_size + len(trailer)
            conn.putrequest('POST', '/api/media')
            conn.putheader('Content-Type', f'multipart/form-data; boundary={boundary}')
            conn.putheader('Content-Length', str(length))
            conn.endheaders()
            conn.send(header)
            while True:
                if cancelled is not None and cancelled.is_set():
                    raise RuntimeError('Importen avbröts.')
                chunk = source.read(1024 * 1024)
                if not chunk:
                    break
                conn.send(chunk)
            conn.send(trailer)
            response = conn.getresponse()
            data = json.loads(response.read(1024 * 1024).decode('utf-8'))
            if response.status >= 400:
                raise RuntimeError(data.get('error', f'Serverfel {response.status}'))
            return data
    finally:
        conn.close()
