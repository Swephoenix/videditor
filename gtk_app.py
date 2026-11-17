#!/usr/bin/python3
"""GTK shell for the local video editor."""
import threading
import signal
import json
import traceback
from pathlib import Path
import gi
gi.require_version('Gtk', '4.0')
gi.require_version('Gdk', '4.0')
gi.require_version('WebKit', '6.0')
from gi.repository import Gtk, Gdk, GLib, WebKit
try:
    gi.require_version('GLibUnix', '2.0')
    from gi.repository import GLibUnix
except (ValueError, ImportError):
    GLibUnix = None
from frameless_window import FramelessWindowChrome, install_window_chrome_css, add_webkit_full_bleed
from gtk_server import EditorServer
from gtk_drop import upload_dropped_file

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
        self.server_url = None
        self.drop_cancel = threading.Event()
        self.drop_active = False

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
        self.drop_target = Gtk.DropTarget.new(Gdk.FileList.__gtype__, Gdk.DragAction.COPY)
        self.drop_target.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        self.drop_target.connect('drop', self.on_file_drop)
        self.drop_target.connect('leave', self.on_file_drag_leave)
        self.window.add_controller(self.drop_target)
        add_webkit_full_bleed(self.webview, GTK_WEB_CSS)
        self.stack.add_named(self.webview, 'editor')
        self.chrome = FramelessWindowChrome(self.window, self.stack)
        install_window_chrome_css()
        self.window.connect('close-request', self.on_close)
        self.window.present()
        signal_add = GLibUnix.signal_add if GLibUnix else GLib.unix_signal_add
        signal_add(GLib.PRIORITY_DEFAULT, signal.SIGTERM, self.stop_from_signal)
        signal_add(GLib.PRIORITY_DEFAULT, signal.SIGINT, self.stop_from_signal)
        threading.Thread(target=self.start_server, daemon=True).start()

    def on_file_drag_leave(self, _target):
        if self.server_url and not self.closing:
            self.webview.evaluate_javascript('window.clearNativeMediaDrag?.()', -1, None, None, None, None, None)

    def on_file_drop(self, target, file_list, _x, _y):
        drop = target.get_current_drop()
        # A local GdkDrag originates in this process; let WebKit handle internal drags.
        if drop is not None and drop.get_drag() is not None:
            return False
        if self.closing or not self.server_url or self.drop_active:
            return False
        paths = [item.get_path() for item in file_list.get_files()]
        paths = [path for path in paths if path]
        if not paths:
            return False
        self.drop_active = True
        self.webview.evaluate_javascript('window.prepareNativeMediaDrop()', -1, None, None, None,
                                         self.on_drop_prepared, paths)
        return True

    def on_drop_prepared(self, webview, result, paths):
        try:
            ready = webview.evaluate_javascript_finish(result).to_boolean()
        except (GLib.Error, AttributeError) as error:
            self.drop_active = False
            print(f'Kunde inte förbereda filimport: {error}', flush=True)
            return
        if not ready or self.closing:
            self.drop_active = False
            return
        threading.Thread(target=self.import_dropped_files, args=(paths,), daemon=True).start()

    def import_dropped_files(self, paths):
        media, failures = [], []
        for path in paths:
            if self.drop_cancel.is_set():
                break
            try:
                media.append(upload_dropped_file(self.server_url, path, self.drop_cancel))
            except (OSError, ValueError, RuntimeError) as error:
                failures.append(f'{Path(path).name}: {error}')
        GLib.idle_add(self.finish_dropped_files, media, failures)

    def finish_dropped_files(self, media, failures):
        self.drop_active = False
        if not self.closing:
            script = f'window.finishNativeMediaDrop({json.dumps(media)}, {json.dumps(failures)})'
            self.webview.evaluate_javascript(script, -1, None, None, None, None, None)
        return False

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
            self.server_url = url
            self.webview.load_uri(url)
            self.stack.set_visible_child_name('editor')
        return False

    def show_error(self, message):
        if not self.closing:
            self.status.set_label('Kunde inte starta videoredigeraren:\n' + message)
        return False

    def stop_from_signal(self, *_args):
        self.window.close()
        return False

    def on_close(self, _window):
        self.closing = True
        self.drop_cancel.set()
        self.server.stop()
        return False

if __name__ == '__main__':
    import sys
    sys.exit(EditorApplication().run(sys.argv))
