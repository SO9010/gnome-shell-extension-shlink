/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import St from 'gi://St'
import Soup from 'gi://Soup'
import Meta from 'gi://Meta'
import Shell from 'gi://Shell'
import GLib from 'gi://GLib'

import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js'

import {getUrl} from './utils.js'

const SHORTEN_AND_COPY_KEY = 'shorten-and-copy-shortcut'
const INSTANCE_URL_KEY = 'instance-url'
const API_KEY_KEY = 'api-key'
const AUTO_SHORTEN_KEY = 'auto-shorten'

export default class ShlinkExtension extends Extension {
  enable() {
    this._clipboard = St.Clipboard.get_default()
    this._settings = this.getSettings()
    this._session = new Soup.Session()

    // State for the automatic clipboard watcher. `_lastAutoText` lets us
    // ignore our own writes (and already-shortened links) so we never loop.
    this._lastAutoText = null
    this._autoBusy = false
    this._selection = null
    this._selectionOwnerChangedId = 0

    Main.wm.addKeybinding(
      SHORTEN_AND_COPY_KEY,
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
      () => this._shorten(),
    )

    this._autoChangedId = this._settings.connect(
      `changed::${AUTO_SHORTEN_KEY}`,
      () => this._updateClipboardWatch(),
    )
    this._updateClipboardWatch()
  }

  disable() {
    Main.wm.removeKeybinding(SHORTEN_AND_COPY_KEY)

    if (this._autoChangedId) {
      this._settings.disconnect(this._autoChangedId)
      this._autoChangedId = 0
    }
    this._stopClipboardWatch()

    this._session?.abort()
    this._session = null
    this._settings = null
    this._clipboard = null
  }

  // --- Automatic clipboard watching --------------------------------------

  _updateClipboardWatch() {
    if (this._settings.get_boolean(AUTO_SHORTEN_KEY)) {
      this._startClipboardWatch()
    } else {
      this._stopClipboardWatch()
    }
  }

  _startClipboardWatch() {
    if (this._selectionOwnerChangedId) {
      return
    }

    this._selection = Shell.Global.get().get_display().get_selection()
    this._selectionOwnerChangedId = this._selection.connect(
      'owner-changed',
      (selection, selectionType) => {
        if (selectionType === Meta.SelectionType.SELECTION_CLIPBOARD) {
          this._onClipboardChanged()
        }
      },
    )
  }

  _stopClipboardWatch() {
    if (this._selectionOwnerChangedId) {
      this._selection.disconnect(this._selectionOwnerChangedId)
      this._selectionOwnerChangedId = 0
      this._selection = null
    }
  }

  _onClipboardChanged() {
    // Don't fire a second request while one is already in flight.
    if (this._autoBusy) {
      return
    }

    this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
      if (!text || text === this._lastAutoText) {
        return
      }

      const url = getUrl(text)
      if (url === null) {
        return
      }

      // Never (re)shorten a link that already points at our own instance.
      // This is also what breaks the loop after we write the short URL back.
      const instanceUrl = this._settings.get_string(INSTANCE_URL_KEY).replace(/\/+$/, '')
      if (instanceUrl && text.startsWith(instanceUrl)) {
        return
      }

      this._lastAutoText = text
      this._autoBusy = true
      this._shortenUrl(url, (shortUrl, errorMessage) => {
        this._autoBusy = false
        if (errorMessage) {
          this._notify(errorMessage)
          return
        }
        this._lastAutoText = shortUrl
        this._clipboard.set_text(St.ClipboardType.CLIPBOARD, shortUrl)
        this._notify('URL shortened')
      })
    })
  }

  // --- Manual shortcut ---------------------------------------------------

  _shorten() {
    this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
      const url = getUrl(text)

      if (url === null) {
        this._notify('No URL found in clipboard')
        return
      }

      this._shortenUrl(url, (shortUrl, errorMessage) => {
        if (errorMessage) {
          this._notify(errorMessage)
          return
        }
        // Let the auto-watcher ignore this programmatic write as well.
        this._lastAutoText = shortUrl
        this._clipboard.set_text(St.ClipboardType.CLIPBOARD, shortUrl)
        this._notify('URL shortened')
      })
    })
  }

  // --- Shlink REST API v3 ------------------------------------------------

  _shortenUrl(url, callback) {
    const instanceUrl = this._settings.get_string(INSTANCE_URL_KEY).replace(/\/+$/, '')
    const apiKey = this._settings.get_string(API_KEY_KEY)

    // Shlink REST API v3 (Shlink 3.x / 4.x): POST /rest/v3/short-urls
    const message = Soup.Message.new('POST', `${instanceUrl}/rest/v3/short-urls`)
    message.request_headers.append('X-Api-Key', apiKey)
    message.request_headers.append('Accept', 'application/json')

    const payload = JSON.stringify({longUrl: url})
    message.set_request_body_from_bytes(
      'application/json',
      new GLib.Bytes(new TextEncoder().encode(payload)),
    )

    this._session.send_and_read_async(
      message,
      GLib.PRIORITY_DEFAULT,
      null,
      (session, result) => {
        let bytes
        try {
          bytes = session.send_and_read_finish(result)
        } catch (e) {
          callback(null, `Could not reach Shlink instance: ${e.message}`)
          return
        }

        const status = message.get_status()
        const responseText = new TextDecoder().decode(bytes?.get_data() ?? new Uint8Array())

        if (status !== Soup.Status.OK) {
          let detail = ''
          try {
            const error = JSON.parse(responseText)
            detail = error.detail ? `: ${error.detail}` : ''
          } catch (_e) {
            // Response was not JSON; show the bare status code.
          }
          callback(null, `Could not shorten URL (${status})${detail}`)
          return
        }

        try {
          const data = JSON.parse(responseText)
          callback(data.shortUrl, null)
        } catch (e) {
          callback(null, `Unexpected response from Shlink: ${e.message}`)
        }
      },
    )
  }

  _notify(text) {
    Main.notify('Shlink', text)
  }
}
