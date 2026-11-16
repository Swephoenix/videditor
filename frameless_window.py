"""Reusable frameless white GTK4 primary-window chrome.

Copy this module into a GTK4/PyGObject project and adapt the CSS and selectors
to the application. It removes native client-side decorations, adds a compact
top drag strip and window controls, and keeps edge resizing available.

Usage:

    content = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
    window = Gtk.ApplicationWindow(application=app, title="My app")
    FramelessWindowChrome(window, content)
    install_window_chrome_css()
    window.present()

The application remains responsible for the content, the `close-request`
cleanup, and any WebKit full-bleed stylesheet.
"""
from __future__ import annotations

import logging

import gi

gi.require_version('Gdk', '4.0')
gi.require_version('Gtk', '4.0')
from gi.repository import Gdk, GLib, Gtk  # noqa: E402

WINDOW_CHROME_CSS = """
window.frameless-white,
window.frameless-white > contents {
  background: #ffffff;
}

.frameless-drag {
  background: transparent;
}

.frameless-controls {
  opacity: 0.45;
  transition: opacity 120ms ease;
}

.frameless-controls:hover {
  opacity: 1;
}

.frameless-controls button {
  min-width: 24px;
  min-height: 24px;
  padding: 0;
  margin: 0;
  border: 0;
  border-radius: 7px;
  background: transparent;
  box-shadow: none;
  color: #68758a;
}

.frameless-controls button:hover {
  background: #eef1f5;
  color: #152033;
}

.frameless-controls button.frameless-close:hover {
  background: #d93b3b;
  color: #ffffff;
}

.frameless-controls button:focus-visible {
  outline: 2px solid alpha(#315fdd, 0.45);
  outline-offset: 1px;
}
"""

RESIZE_MARGIN = 6
CHROME_HEIGHT = 32
DRAG_STRIP_HEIGHT = CHROME_HEIGHT

_EDGE_CURSORS = {
    Gdk.SurfaceEdge.NORTH: 'ns-resize',
    Gdk.SurfaceEdge.SOUTH: 'ns-resize',
    Gdk.SurfaceEdge.EAST: 'ew-resize',
    Gdk.SurfaceEdge.WEST: 'ew-resize',
    Gdk.SurfaceEdge.NORTH_EAST: 'nesw-resize',
    Gdk.SurfaceEdge.SOUTH_WEST: 'nesw-resize',
    Gdk.SurfaceEdge.NORTH_WEST: 'nwse-resize',
    Gdk.SurfaceEdge.SOUTH_EAST: 'nwse-resize',
}


def resize_edge(x: float, y: float, width: int, height: int,
                margin: int = RESIZE_MARGIN) -> Gdk.SurfaceEdge | None:
    """Return the resize edge under (x, y), or None when inside the window."""
    if width <= 0 or height <= 0:
        return None
    left = x < margin
    right = x >= width - margin
    top = y < margin
    bottom = y >= height - margin
    if top and left:
        return Gdk.SurfaceEdge.NORTH_WEST
    if top and right:
        return Gdk.SurfaceEdge.NORTH_EAST
    if bottom and left:
        return Gdk.SurfaceEdge.SOUTH_WEST
    if bottom and right:
        return Gdk.SurfaceEdge.SOUTH_EAST
    if left:
        return Gdk.SurfaceEdge.WEST
    if right:
        return Gdk.SurfaceEdge.EAST
    if top:
        return Gdk.SurfaceEdge.NORTH
    if bottom:
        return Gdk.SurfaceEdge.SOUTH
    return None


def edge_cursor(edge: Gdk.SurfaceEdge | None) -> str | None:
    """Return the standard cursor name for a resize edge."""
    if edge is None:
        return None
    return _EDGE_CURSORS.get(edge)


def install_window_chrome_css(display: Gdk.Display | None = None) -> Gtk.CssProvider | None:
    """Install the window-chrome CSS for the current display."""
    display = display or Gdk.Display.get_default()
    if display is None:
        return None
    provider = Gtk.CssProvider()
    provider.load_from_data(WINDOW_CHROME_CSS)
    Gtk.StyleContext.add_provider_for_display(
        display, provider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
    return provider


class FramelessWindowChrome:
    """Attach frameless white chrome to a primary Gtk.Window.

    Pass the widget that should fill the window. The class wraps it in a
    Gtk.Overlay, removes native decorations, and adds drag, controls and edge
    resize handling. Keep the returned instance alive for the window lifetime.
    """

    def __init__(self, window: Gtk.Window, content: Gtk.Widget, *,
                 drag_strip_height: int = DRAG_STRIP_HEIGHT):
        self.window = window
        self.drag_strip_height = max(0, int(drag_strip_height))
        self._pointer_edge = None
        self._resize_cursors = {}

        self.window.set_decorated(False)
        self.window.add_css_class('frameless-white')

        self.overlay = Gtk.Overlay()
        layout = Gtk.Box(orientation=Gtk.Orientation.VERTICAL)
        self.chrome_row = Gtk.Box()
        self.chrome_row.set_size_request(-1, CHROME_HEIGHT)
        layout.append(self.chrome_row)
        content.set_vexpand(True)
        layout.append(content)
        self.overlay.set_child(layout)
        self.window.set_child(self.overlay)

        self._build_drag_strip()
        self._build_controls()
        self._install_resize_handlers()

    def _build_drag_strip(self):
        handle = Gtk.WindowHandle()
        strip = Gtk.Box()
        strip.add_css_class('frameless-drag')
        strip.set_size_request(-1, self.drag_strip_height)
        strip.set_hexpand(True)
        cursor = Gdk.Cursor.new_from_name('grab')
        if cursor is not None:
            strip.set_cursor(cursor)
        handle.set_child(strip)
        handle.set_halign(Gtk.Align.FILL)
        handle.set_valign(Gtk.Align.START)
        self.overlay.add_overlay(handle)

    def _build_controls(self):
        controls = Gtk.Box(orientation=Gtk.Orientation.HORIZONTAL, spacing=2)
        controls.add_css_class('frameless-controls')
        controls.set_halign(Gtk.Align.END)
        controls.set_valign(Gtk.Align.START)
        controls.set_margin_top(0)
        controls.set_margin_end(4)

        self.minimize_button = self._button(
            'window-minimize-symbolic', 'Minimera',
            lambda _button: self.window.minimize())
        self.maximize_button = self._button(
            'window-maximize-symbolic', 'Maximera',
            lambda _button: self._toggle_maximize())
        self.close_button = self._button(
            'window-close-symbolic', 'Stäng',
            lambda _button: self.window.close())
        self.close_button.add_css_class('frameless-close')

        for button in (self.minimize_button, self.maximize_button, self.close_button):
            controls.append(button)
        self.overlay.add_overlay(controls)

        self.window.connect('notify::maximized', self._update_maximize)
        self._update_maximize()

    @staticmethod
    def _button(icon_name: str, tooltip: str, callback) -> Gtk.Button:
        button = Gtk.Button.new_from_icon_name(icon_name)
        button.add_css_class('flat')
        button.set_tooltip_text(tooltip)
        button.update_property([Gtk.AccessibleProperty.LABEL], [tooltip])
        button.connect('clicked', callback)
        return button

    def _toggle_maximize(self):
        if self.window.is_maximized():
            self.window.unmaximize()
        else:
            self.window.maximize()

    def _update_maximize(self, _window=None, _pspec=None):
        restored = self.window.is_maximized()
        icon = 'window-restore-symbolic' if restored else 'window-maximize-symbolic'
        label = 'Återställ' if restored else 'Maximera'
        self.maximize_button.set_icon_name(icon)
        self.maximize_button.set_tooltip_text(label)
        self.maximize_button.update_property([Gtk.AccessibleProperty.LABEL], [label])

    def _install_resize_handlers(self):
        self._resize_gesture = Gtk.GestureClick()
        self._resize_gesture.set_button(1)
        self._resize_gesture.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        self._resize_gesture.connect('pressed', self._on_edge_pressed)
        self.window.add_controller(self._resize_gesture)

        self._motion_controller = Gtk.EventControllerMotion()
        self._motion_controller.connect('motion', self._on_pointer_motion)
        self._motion_controller.connect('leave', self._on_pointer_leave)
        self.window.add_controller(self._motion_controller)

    def _on_edge_pressed(self, gesture, _n_press, x, y):
        if gesture.get_current_button() != 1:
            return
        edge = resize_edge(x, y, self.window.get_width(), self.window.get_height())
        if edge is None:
            return
        # Preserve the drag strip: do not let the top resize edge consume it.
        if y < self.drag_strip_height and edge in (
                Gdk.SurfaceEdge.NORTH,
                Gdk.SurfaceEdge.NORTH_EAST,
                Gdk.SurfaceEdge.NORTH_WEST):
            return
        surface = self.window.get_surface()
        if surface is None or not hasattr(surface, 'begin_resize'):
            return
        try:
            surface.begin_resize(
                edge, gesture.get_current_event_device(), 1, x, y,
                gesture.get_current_event_time())
        except (AttributeError, GLib.Error, RuntimeError, TypeError) as exc:
            logging.warning('Could not start window resize: %s', exc)
        else:
            gesture.set_state(Gtk.EventSequenceState.CLAIMED)

    def _on_pointer_motion(self, _controller, x, y):
        edge = resize_edge(x, y, self.window.get_width(), self.window.get_height())
        if edge == self._pointer_edge:
            return
        self._pointer_edge = edge
        name = edge_cursor(edge)
        if name is None:
            self.window.set_cursor(None)
            return
        cursor = self._resize_cursors.get(name)
        if cursor is None:
            cursor = Gdk.Cursor.new_from_name(name)
            if cursor is not None:
                self._resize_cursors[name] = cursor
        self.window.set_cursor(cursor)

    def _on_pointer_leave(self, _controller):
        self._pointer_edge = None
        self.window.set_cursor(None)


def add_webkit_full_bleed(webview, css: str):
    """Apply a full-bleed user stylesheet to a WebKitGTK 6.0 WebView.

    `css` should override the embedded page's modal backdrop and panel classes.
    The original HTML files must remain unchanged. The function lazily imports
    WebKit so non-WebKit GTK applications can use this module.
    """
    gi.require_version('WebKit', '6.0')
    from gi.repository import WebKit  # noqa: PLC0415

    manager = webview.get_user_content_manager()
    manager.add_style_sheet(WebKit.UserStyleSheet.new(
        css,
        WebKit.UserContentInjectedFrames.TOP_FRAME,
        WebKit.UserStyleLevel.USER,
        None, None))
    webview.set_background_color(Gdk.RGBA(1.0, 1.0, 1.0, 1.0))
