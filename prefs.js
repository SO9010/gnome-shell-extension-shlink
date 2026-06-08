/* prefs.js
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import Adw from 'gi://Adw'
import Gdk from 'gi://Gdk'
import Gio from 'gi://Gio'
import Gtk from 'gi://Gtk'

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js'

const SHORTEN_AND_COPY_KEY = 'shorten-and-copy-shortcut'
const INSTANCE_URL_KEY = 'instance-url'
const API_KEY_KEY = 'api-key'
const AUTO_SHORTEN_KEY = 'auto-shorten'

export default class ShlinkPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings()

    const page = new Adw.PreferencesPage()
    window.add(page)

    // --- Connection ------------------------------------------------------
    const connectionGroup = new Adw.PreferencesGroup({
      title: 'Shlink Connection',
      description: 'The Shlink instance used to shorten URLs',
    })
    page.add(connectionGroup)

    const instanceRow = new Adw.EntryRow({title: 'Shlink instance URL'})
    settings.bind(INSTANCE_URL_KEY, instanceRow, 'text', Gio.SettingsBindFlags.DEFAULT)
    connectionGroup.add(instanceRow)

    const apiKeyRow = new Adw.PasswordEntryRow({title: 'API key'})
    settings.bind(API_KEY_KEY, apiKeyRow, 'text', Gio.SettingsBindFlags.DEFAULT)
    connectionGroup.add(apiKeyRow)

    // --- Behavior --------------------------------------------------------
    const behaviorGroup = new Adw.PreferencesGroup({title: 'Behavior'})
    page.add(behaviorGroup)

    const autoRow = new Adw.SwitchRow({
      title: 'Auto-shorten clipboard URLs',
      subtitle: 'Automatically shorten any URL you copy to the clipboard',
    })
    settings.bind(AUTO_SHORTEN_KEY, autoRow, 'active', Gio.SettingsBindFlags.DEFAULT)
    behaviorGroup.add(autoRow)

    // --- Keyboard shortcut ----------------------------------------------
    const shortcutGroup = new Adw.PreferencesGroup({title: 'Keyboard Shortcut'})
    page.add(shortcutGroup)

    const shortcutRow = new Adw.ActionRow({
      title: 'Shorten URL in clipboard',
      subtitle: 'Click to set a new shortcut',
      activatable: true,
    })

    const shortcutLabel = new Gtk.ShortcutLabel({
      disabled_text: 'Disabled',
      valign: Gtk.Align.CENTER,
    })
    this._syncShortcutLabel(shortcutLabel, settings)

    const changedId = settings.connect(`changed::${SHORTEN_AND_COPY_KEY}`, () => {
      this._syncShortcutLabel(shortcutLabel, settings)
    })
    window.connect('close-request', () => settings.disconnect(changedId))

    shortcutRow.add_suffix(shortcutLabel)
    shortcutRow.connect('activated', () => this._editShortcut(window, settings))
    shortcutGroup.add(shortcutRow)
  }

  _syncShortcutLabel(label, settings) {
    const [accel] = settings.get_strv(SHORTEN_AND_COPY_KEY)
    label.set_accelerator(accel ?? '')
  }

  _editShortcut(window, settings) {
    const dialog = new Adw.MessageDialog({
      transient_for: window,
      modal: true,
      heading: 'Set Shortcut',
      body: 'Press the desired key combination.\nBackspace clears it, Escape cancels.',
    })
    dialog.add_response('cancel', 'Cancel')

    const controller = new Gtk.EventControllerKey()
    controller.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
    dialog.add_controller(controller)

    controller.connect('key-pressed', (_controller, keyval, keycode, state) => {
      let mask = state & Gtk.accelerator_get_default_mod_mask()
      mask &= ~Gdk.ModifierType.LOCK_MASK

      if (keyval === Gdk.KEY_Escape) {
        dialog.close()
        return Gdk.EVENT_STOP
      }

      if (keyval === Gdk.KEY_BackSpace && mask === 0) {
        settings.set_strv(SHORTEN_AND_COPY_KEY, [])
        dialog.close()
        return Gdk.EVENT_STOP
      }

      // Require a modifier so the binding can't swallow ordinary typing.
      if (mask === 0 || !Gtk.accelerator_valid(keyval, mask)) {
        return Gdk.EVENT_STOP
      }

      const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask)
      settings.set_strv(SHORTEN_AND_COPY_KEY, [accel])
      dialog.close()
      return Gdk.EVENT_STOP
    })

    dialog.present()
  }
}
