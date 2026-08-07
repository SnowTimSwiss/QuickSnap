/*
 * QuickSnap preferences.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: 2026 Tim Bleuer
 *
 * The initial implementation was written with AI assistance. It has since been
 * reviewed line by line, is understood, and is maintained by the author.
 */

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GObject from 'gi://GObject';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

const BARE_MODIFIERS = [
    Gdk.KEY_Control_L, Gdk.KEY_Control_R,
    Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
    Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
    Gdk.KEY_Super_L, Gdk.KEY_Super_R,
    Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
    Gdk.KEY_Hyper_L, Gdk.KEY_Hyper_R,
    Gdk.KEY_ISO_Level3_Shift, Gdk.KEY_Caps_Lock, Gdk.KEY_Num_Lock,
];

/**
 * A shortcut needs a real modifier, otherwise it would swallow ordinary
 * typing. Function keys are the usual exception.
 *
 * @param {number} keyval - the pressed key
 * @param {number} mask - active modifiers
 * @returns {boolean} whether this may be bound
 */
function isBindable(keyval, mask) {
    if (BARE_MODIFIERS.includes(keyval))
        return false;

    const isFunctionKey = keyval >= Gdk.KEY_F1 && keyval <= Gdk.KEY_F35;
    const realModifiers = mask & (
        Gdk.ModifierType.CONTROL_MASK |
        Gdk.ModifierType.ALT_MASK |
        Gdk.ModifierType.SUPER_MASK);

    return realModifiers !== 0 || isFunctionKey;
}

const ShortcutRow = GObject.registerClass(
class ShortcutRow extends Adw.ActionRow {
    _init(settings, key) {
        super._init({
            title: 'Capture shortcut',
            subtitle: 'Click to set. Backspace clears, Escape aborts.',
            activatable: true,
        });

        this._settings = settings;
        this._key = key;

        this._label = new Gtk.ShortcutLabel({
            disabled_text: 'Disabled',
            valign: Gtk.Align.CENTER,
        });
        this.add_suffix(this._label);

        this._changedId = settings.connect(
            `changed::${key}`, () => this._sync());
        this.connect('destroy', () => settings.disconnect(this._changedId));
        this.connect('activated', () => this._capture());

        this._sync();
    }

    _sync() {
        const [accel] = this._settings.get_strv(this._key);
        this._label.accelerator = accel ?? '';
    }

    _capture() {
        const dialog = new Adw.Window({
            modal: true,
            transient_for: this.get_root(),
            default_width: 400,
            default_height: 200,
            resizable: false,
        });

        const status = new Adw.StatusPage({
            title: 'Press the new shortcut',
            description: 'Backspace clears it, Escape keeps the current one.',
        });
        dialog.content = status;

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_c, keyval, keycode, state) => {
            const mask = state & Gtk.accelerator_get_default_mod_mask() &
                ~Gdk.ModifierType.LOCK_MASK;

            if (mask === 0 && keyval === Gdk.KEY_Escape) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            if (mask === 0 && keyval === Gdk.KEY_BackSpace) {
                this._settings.set_strv(this._key, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            if (!isBindable(keyval, mask))
                return Gdk.EVENT_STOP;

            const accel = Gtk.accelerator_name_with_keycode(
                null, keyval, keycode, mask);
            this._settings.set_strv(this._key, [accel]);
            dialog.close();

            return Gdk.EVENT_STOP;
        });
        dialog.add_controller(controller);

        dialog.present();
    }
});

export default class QuickSnapPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page = new Adw.PreferencesPage();
        window.add(page);

        const shortcutGroup = new Adw.PreferencesGroup({title: 'Shortcut'});
        shortcutGroup.add(new ShortcutRow(settings, 'capture-area'));
        page.add(shortcutGroup);

        const behaviourGroup = new Adw.PreferencesGroup({
            title: 'Selection',
            description: 'How the screen looks while you drag.',
        });
        behaviourGroup.add(this._switchRow(settings, 'dim-background',
            'Dim outside the selection',
            'Darken everything except the region you are selecting.'));
        behaviourGroup.add(this._switchRow(settings, 'show-size',
            'Show selection size',
            'Display the pixel dimensions while dragging.'));
        page.add(behaviourGroup);

        const feedbackGroup = new Adw.PreferencesGroup({
            title: 'Confirmation',
            description: 'Feedback after the region is copied.',
        });
        feedbackGroup.add(this._switchRow(settings, 'flash',
            'Flash the captured area', null));
        feedbackGroup.add(this._switchRow(settings, 'shutter-sound',
            'Play the shutter sound', null));
        page.add(feedbackGroup);
    }

    _switchRow(settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({title});
        if (subtitle)
            row.subtitle = subtitle;
        settings.bind(key, row, 'active', 0 /* G_SETTINGS_BIND_DEFAULT */);
        return row;
    }
}
