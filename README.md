# gnome-shell-extension-shlink

A GNOME Shell extension that shortens URLs in your clipboard
using your [Shlink](https://shlink.io/) instance when pressing a shortcut (default: Ctrl+Super+Q).

## Requirements

- **GNOME Shell 45–50**
- A **Shlink 3.x / 4.x** instance (uses the Shlink REST API v3)
- An API key for that instance

## Installation

Copy the extension into your local extensions directory, compile the settings
schema, then enable it:

```sh
uuid=shlink@timoschwarzer.github.io
cp -r . ~/.local/share/gnome-shell/extensions/$uuid
glib-compile-schemas ~/.local/share/gnome-shell/extensions/$uuid/schemas
gnome-extensions enable $uuid
```

On X11 reload the shell with <kbd>Alt</kbd>+<kbd>F2</kbd> → `r`.
On Wayland log out and back in.

## Configuration

Open the extension's preferences (`gnome-extensions prefs $uuid`) and set:

- **Shlink instance URL** – e.g. `https://s.example.com`
- **API key** – an API key generated on your Shlink instance
- **Auto-shorten clipboard URLs** – when enabled, any URL you copy is shortened
  automatically (off by default)
- **Keyboard shortcut** – the shortcut that shortens the clipboard URL

## Usage

Copy a URL to the clipboard and press the shortcut. The shortened URL replaces
the clipboard contents and a notification confirms the result.

Alternatively, enable **Auto-shorten clipboard URLs** in the preferences and
every URL you copy is shortened automatically — no shortcut needed. Links that
already point at your Shlink instance are left untouched, so it never loops.
