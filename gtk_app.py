#!/usr/bin/python3
"""GTK shell for the local video editor."""
import threading
import signal
import traceback
from pathlib import Path
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('WebKit', '6.0')
from gi.repository import Gtk, GLib, WebKit
from frameless_window import FramelessWindowChrome, install_window_chrome_css, add_webkit_full_bleed
from gtk_server import EditorServer

GTK_WEB_CSS = """
html { margin: 0; }
@media (min-width: 901px) {
    .media-pool.collapsed { flex-basis: 76px !important; min-width: 76px !important; }
}
.media-pool.collapsed .media-pool-toggle {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    writing-mode: horizontal-tb !important;
    white-space: nowrap !important;
    transform: none !important;
    overflow: hidden !important;
}
"""


def connect_downloads(webview, callback):
    webview.get_network_session().connect('download-started', callback)


class EditorApplication(Gtk.Application):
    def __init__(self):
        super().__init__(application_id='se.videditor.Desktop')
        self.server = EditorServer()
        self.closing = False

    def do_activate(self):
        if self.props.active_window:
            self.props.active_window.present()
            return
        self.window = Gtk.ApplicationWindow(application=self, title='Videoredigeraren')
        self.window.set_default_size(1440, 900)
        self.stack = Gtk.Stack()
        self.status = Gtk.Label(label='Startar videoredigeraren…', wrap=True)
        self.stack.add_named(self.status, 'status')
        self.webview = WebKit.WebView()
        connect_downloads(self.webview, self.on_download)
        add_webkit_full_bleed(self.webview, GTK_WEB_CSS)
        self.stack.add_named(self.webview, 'editor')
        self.chrome = FramelessWindowChrome(self.window, self.stack)
        install_window_chrome_css()
        self.window.connect('close-request', self.on_close)
        self.window.present()
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, self.stop_from_signal)
        GLib.unix_signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, self.stop_from_signal)
        threading.Thread(target=self.start_server, daemon=True).start()

    def on_download(self, _context, download):
        download.connect('decide-destination', self.choose_download_destination)

    def choose_download_destination(self, download, suggested_name):
        chooser = Gtk.FileChooserNative.new('Spara fil', self.window,
                                            Gtk.FileChooserAction.SAVE, 'Spara', 'Avbryt')
        chooser.set_current_name(Path(suggested_name).name)
        def response(dialog, result):
            selected = dialog.get_file() if result == Gtk.ResponseType.ACCEPT else None
            if selected:
                download.set_destination(selected.get_uri())
            else:
                download.cancel()
            dialog.destroy()
        chooser.connect('response', response)
        chooser.show()
        return True

    def start_server(self):
        try:
            url = self.server.start()
            GLib.idle_add(self.show_editor, url)
        except Exception as error:
            traceback.print_exc()
            GLib.idle_add(self.show_error, str(error))
        finally:
            if self.closing:
                self.server.stop()

    def show_editor(self, url):
        if not self.closing:
            self.webview.load_uri(url)
            self.stack.set_visible_child_name('editor')
        return False

    def show_error(self, message):
        if not self.closing:
            self.status.set_label('Kunde inte starta videoredigeraren:\n' + message)
        return False

    def stop_from_signal(self):
        self.window.close()
        return False

    def on_close(self, _window):
        self.closing = True
        if self.server.process:
            self.server.stop()
        return False

if __name__ == '__main__':
    import sys
    sys.exit(EditorApplication().run(sys.argv))
