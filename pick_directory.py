#!/usr/bin/env python3
"""Native Tk directory chooser used when selecting an export destination."""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(add_help=False)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--title", default="Välj output-mapp")
    parser.add_argument("--initial-directory", default=str(Path.home()))
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    try:
        import tkinter as tk
        from tkinter import messagebox, ttk
    except Exception as error:
        print(f"Tkinter kunde inte laddas: {error}", file=sys.stderr)
        return 2

    if args.check:
        print(f"tkinter {tk.TkVersion}")
        return 0

    root: tk.Tk | None = None
    try:
        root = tk.Tk()
        root.title(args.title)
        root.geometry("760x520")
        root.minsize(560, 360)
        root.attributes("-topmost", True)
        root.after(500, lambda: root.attributes("-topmost", False))
        initial_directory = os.path.realpath(os.path.expanduser(args.initial_directory))
        if not os.path.isdir(initial_directory):
            initial_directory = str(Path.home())
        selected_directory: list[str] = []
        current_directory = tk.StringVar(value=initial_directory)
        path_entry = ttk.Entry(root, textvariable=current_directory)
        path_entry.pack(fill="x", padx=12, pady=(12, 6))

        shortcuts = ttk.Frame(root)
        shortcuts.pack(fill="x", padx=12, pady=(0, 6))

        browser = ttk.Frame(root)
        browser.pack(fill="both", expand=True, padx=12)
        directory_list = tk.Listbox(browser, activestyle="dotbox")
        scrollbar = ttk.Scrollbar(browser, orient="vertical", command=directory_list.yview)
        directory_list.configure(yscrollcommand=scrollbar.set)
        directory_list.pack(side="left", fill="both", expand=True)
        scrollbar.pack(side="right", fill="y")

        def show_directory(directory: str) -> None:
            resolved = os.path.realpath(os.path.expanduser(directory))
            if not os.path.isdir(resolved):
                messagebox.showerror("Ogiltig mapp", "Mappen finns inte.", parent=root)
                return
            try:
                names = sorted(
                    (entry.name for entry in os.scandir(resolved) if entry.is_dir(follow_symlinks=True)),
                    key=str.casefold,
                )
            except OSError as error:
                messagebox.showerror("Kunde inte öppna mappen", str(error), parent=root)
                return
            current_directory.set(resolved)
            directory_list.delete(0, tk.END)
            if os.path.dirname(resolved) != resolved:
                directory_list.insert(tk.END, "..")
            for name in names:
                directory_list.insert(tk.END, name)

        def open_highlighted(_event: object | None = None) -> None:
            selection = directory_list.curselection()
            if not selection:
                return
            name = directory_list.get(selection[0])
            show_directory(os.path.join(current_directory.get(), name))

        def accept() -> None:
            resolved = os.path.realpath(os.path.expanduser(current_directory.get()))
            if not os.path.isdir(resolved):
                messagebox.showerror("Ogiltig mapp", "Mappen finns inte.", parent=root)
                return
            selected_directory.append(resolved)
            root.quit()

        def cancel() -> None:
            root.quit()

        for label, directory in (
            ("Hem", str(Path.home())),
            ("Media", f"/media/{Path.home().name}"),
            ("Rot /", "/"),
        ):
            if os.path.isdir(directory):
                ttk.Button(shortcuts, text=label, command=lambda value=directory: show_directory(value)).pack(
                    side="left", padx=(0, 6)
                )

        buttons = ttk.Frame(root)
        buttons.pack(fill="x", padx=12, pady=12)
        ttk.Button(buttons, text="Avbryt", command=cancel).pack(side="right")
        ttk.Button(buttons, text="Välj denna mapp", command=accept).pack(side="right", padx=(0, 8))

        path_entry.bind("<Return>", lambda _event: show_directory(current_directory.get()))
        directory_list.bind("<Double-Button-1>", open_highlighted)
        root.protocol("WM_DELETE_WINDOW", cancel)
        show_directory(initial_directory)
        directory_list.focus_set()
        root.mainloop()

        if not selected_directory:
            return 1
        print(selected_directory[0], flush=True)
        return 0
    except Exception as error:
        print(f"Tk-mappväljaren misslyckades: {error}", file=sys.stderr)
        return 2
    finally:
        if root is not None:
            root.destroy()


if __name__ == "__main__":
    raise SystemExit(main())
