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

export default class ShlinkExtension extends Extension {
  enable() {
    this._clipboard = St.Clipboard.get_default()
    this._settings = this.getSettings()
    this._session = new Soup.Session()

    Main.wm.addKeybinding(
      SHORTEN_AND_COPY_KEY,
      this._settings,
      Meta.KeyBindingFlags.NONE,
      Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
      () => this._shorten(),
    )
  }

  disable() {
    Main.wm.removeKeybinding(SHORTEN_AND_COPY_KEY)

    this._session?.abort()
    this._session = null
    this._settings = null
    this._clipboard = null
  }

  _shorten() {
    this._clipboard.get_text(St.ClipboardType.CLIPBOARD, (clipboard, text) => {
      const url = getUrl(text)

      if (url === null) {
        this._notify('No URL found in clipboard')
        return
      }

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
            this._notify(`Could not reach Shlink instance: ${e.message}`)
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
            this._notify(`Could not shorten URL (${status})${detail}`)
            return
          }

          try {
            const data = JSON.parse(responseText)
            this._clipboard.set_text(St.ClipboardType.CLIPBOARD, data.shortUrl)
            this._notify('URL shortened')
          } catch (e) {
            this._notify(`Unexpected response from Shlink: ${e.message}`)
          }
        },
      )
    })
  }

  _notify(text) {
    Main.notify('Shlink', text)
  }
}
