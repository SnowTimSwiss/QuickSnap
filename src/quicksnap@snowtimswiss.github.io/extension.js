/*
 * QuickSnap — drag a rectangle, get it on the clipboard.
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 * SPDX-FileCopyrightText: 2026 Tim Bleuer
 */

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

const CAPTURE_KEY = 'capture-area';

// A click without a real drag cancels, rather than copying a few stray pixels
// that nobody meant to select.
const MIN_SELECTION = 5;

// Last-resort release of the input grab. Nobody drags a rectangle for a
// minute, so hitting this means the overlay stopped receiving events at all —
// which, while holding a modal grab, is an unusable session. Cancelling is a
// far better outcome than a power button.
const WATCHDOG_SECONDS = 60;

/**
 * Points the cursor at the crosshair, or puts it back.
 *
 * GNOME Shell 50 dropped Meta.Display.set_cursor() and gave actors their own
 * cursor instead, so both spellings have to be carried. Neither is allowed to
 * throw: the cursor shape is cosmetic, but a failure here used to escape while
 * the overlay held a modal grab, which locks up the whole session.
 *
 * @param {Clutter.Actor} actor - the overlay holding the grab
 * @param {boolean} crosshair - true while selecting, false to restore
 */
function setCursor(actor, crosshair) {
    try {
        if (actor.set_cursor_type) {
            actor.set_cursor_type(crosshair
                ? Clutter.CursorType.CROSSHAIR
                : Clutter.CursorType.INHERIT);
        } else if (global.display.set_cursor) {
            global.display.set_cursor(crosshair
                ? Meta.Cursor.CROSSHAIR
                : Meta.Cursor.DEFAULT);
        }
    } catch (e) {
        console.debug(`QuickSnap: could not change the cursor: ${e}`);
    }
}

/**
 * Fullscreen, input-grabbing overlay that lets the user drag out a rectangle
 * starting from a zero-sized selection.
 */
const SelectionOverlay = GObject.registerClass(
class SelectionOverlay extends St.Widget {
    _init(dim, showSize) {
        super._init({
            visible: false,
            reactive: true,
            can_focus: true,
            x: 0,
            y: 0,
        });

        this._dim = dim;
        this._showSize = showSize;

        this._startX = 0;
        this._startY = 0;
        this._lastX = 0;
        this._lastY = 0;
        this._dragging = false;

        // Doubles as the "still running" state: once it is null the selection
        // has been settled and further input is ignored.
        this._resolve = null;

        this._grab = null;
        this._destroyLaterId = 0;
        this._watchdogId = 0;
        this._lastInputUs = 0;

        this.add_constraint(new Clutter.BindConstraint({
            source: global.stage,
            coordinate: Clutter.BindCoordinate.ALL,
        }));

        // Four panels around the selection rather than one dimmed sheet, so
        // the region being selected stays at full brightness.
        this._shades = [];
        for (let i = 0; i < 4; i++) {
            const shade = new St.Widget({
                style_class: 'quicksnap-shade',
                visible: dim,
            });
            this.add_child(shade);
            this._shades.push(shade);
        }

        this._band = new St.Widget({
            style_class: 'quicksnap-rubberband',
            visible: false,
        });
        this.add_child(this._band);

        this._sizeLabel = new St.Label({
            style_class: 'quicksnap-size-label',
            visible: false,
        });
        this.add_child(this._sizeLabel);

        this.connect('destroy', () => this._onDestroy());
    }

    /**
     * Runs the selection interaction.
     *
     * @returns {Promise<?{x: number, y: number, width: number, height: number}>}
     *     The selected rectangle in stage coordinates, or null if cancelled.
     */
    selectAsync() {
        return new Promise(resolve => {
            this._resolve = resolve;

            // Everything from here on runs with a modal grab in hand. If any
            // of it throws — a removed API on a newer Shell, most likely —
            // the grab has to come back off before the exception leaves this
            // function, or the session is left with no keyboard and no mouse.
            try {
                Main.uiGroup.add_child(this);
                Main.uiGroup.set_child_above_sibling(this, null);
                this._relayout();
                this.show();

                this._grab = Main.pushModal(this, {
                    actionMode: Shell.ActionMode.POPUP,
                });

                // is_revoked() is the one grab check that exists on every
                // Shell from 46 to 50; get_seat_state() was removed in 50.
                if (this._grab.is_revoked?.()) {
                    this._finish(null);
                    return;
                }

                this._startWatchdog();
                this.grab_key_focus();
                setCursor(this, true);
            } catch (e) {
                console.error('QuickSnap: could not start the selection', e);
                this._finish(null);
            }
        });
    }

    _geometry() {
        if (!this._dragging)
            return {x: 0, y: 0, width: 0, height: 0};

        return {
            x: Math.min(this._startX, this._lastX),
            y: Math.min(this._startY, this._lastY),
            width: Math.abs(this._startX - this._lastX) + 1,
            height: Math.abs(this._startY - this._lastY) + 1,
        };
    }

    _relayout() {
        const stageW = global.stage.width;
        const stageH = global.stage.height;
        const {x, y, width, height} = this._geometry();

        if (this._dim) {
            const [top, bottom, left, right] = this._shades;
            top.set_position(0, 0);
            top.set_size(stageW, y);
            bottom.set_position(0, y + height);
            bottom.set_size(stageW, Math.max(0, stageH - (y + height)));
            left.set_position(0, y);
            left.set_size(x, height);
            right.set_position(x + width, y);
            right.set_size(Math.max(0, stageW - (x + width)), height);
        }

        if (!this._dragging) {
            this._band.hide();
            this._sizeLabel.hide();
            return;
        }

        this._band.set_position(x, y);
        this._band.set_size(width, height);
        this._band.show();

        if (!this._showSize)
            return;

        this._sizeLabel.text = `${width} × ${height}`;
        this._sizeLabel.show();

        // Prefer sitting just above the selection; drop below, or flush with
        // the bottom edge, when there is no room.
        const [, labelW] = this._sizeLabel.get_preferred_width(-1);
        const [, labelH] = this._sizeLabel.get_preferred_height(-1);
        const gap = 6;

        let labelY = y - labelH - gap;
        if (labelY < 0)
            labelY = y + height + gap;
        if (labelY + labelH > stageH)
            labelY = Math.max(0, stageH - labelH - gap);

        const labelX = Math.max(0, Math.min(x, stageW - labelW));
        this._sizeLabel.set_position(Math.round(labelX), Math.round(labelY));
    }

    /**
     * Notes that input arrived. Called from every event handler, including
     * motion, so it stays a timestamp write rather than re-arming a timer.
     */
    _noteInput() {
        this._lastInputUs = GLib.get_monotonic_time();
    }

    /**
     * Starts the inactivity watchdog. It re-checks rather than cancels the
     * selection outright, so a slow, deliberate drag is never cut short.
     */
    _startWatchdog() {
        this._noteInput();

        this._watchdogId = GLib.timeout_add_seconds(
            GLib.PRIORITY_DEFAULT, WATCHDOG_SECONDS, () => {
                const idleUs = GLib.get_monotonic_time() - this._lastInputUs;
                if (idleUs < WATCHDOG_SECONDS * GLib.USEC_PER_SEC)
                    return GLib.SOURCE_CONTINUE;

                this._watchdogId = 0;
                console.error(
                    `QuickSnap: no input for ${WATCHDOG_SECONDS}s while ` +
                    'holding a modal grab, cancelling the selection');
                this._finish(null);
                return GLib.SOURCE_REMOVE;
            });
    }

    _cancelWatchdog() {
        if (this._watchdogId) {
            GLib.Source.remove(this._watchdogId);
            this._watchdogId = 0;
        }
    }

    /**
     * Gives the grab back. Safe to call more than once, and never throws:
     * this is the only thing standing between a bug anywhere else in the
     * overlay and an unusable session.
     */
    _releaseGrab() {
        this._cancelWatchdog();

        const grab = this._grab;
        this._grab = null;

        if (grab) {
            try {
                Main.popModal(grab);
            } catch (e) {
                // popModal() throws if the grab is no longer on the stack.
                // Drop it directly rather than leaving it active.
                console.error('QuickSnap: releasing the modal grab failed', e);
                grab.dismiss();
            }
        }

        setCursor(this, false);
    }

    _finish(result) {
        if (!this._resolve)
            return;

        const resolve = this._resolve;
        this._resolve = null;

        // Before anything else, and unconditionally.
        this._releaseGrab();

        // Hide before resolving: the caller captures the screen next, and the
        // overlay must not be part of that frame.
        this.hide();

        // Destroying an actor from inside its own event handler is not safe.
        this._destroyLaterId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._destroyLaterId = 0;
            this.destroy();
            return GLib.SOURCE_REMOVE;
        });

        resolve(result);
    }

    _onDestroy() {
        if (this._destroyLaterId) {
            GLib.Source.remove(this._destroyLaterId);
            this._destroyLaterId = 0;
        }

        // Reached when the extension is disabled mid-selection: release the
        // grab and unblock whoever is waiting on selectAsync().
        this._releaseGrab();

        if (this._resolve) {
            const resolve = this._resolve;
            this._resolve = null;
            resolve(null);
        }
    }

    vfunc_button_press_event(event) {
        if (!this._resolve)
            return Clutter.EVENT_STOP;

        this._noteInput();

        if (event.get_button() !== Clutter.BUTTON_PRIMARY) {
            this._finish(null);
            return Clutter.EVENT_STOP;
        }

        const [x, y] = event.get_coords();
        this._startX = Math.floor(x);
        this._startY = Math.floor(y);
        this._lastX = this._startX;
        this._lastY = this._startY;
        this._dragging = true;
        this._relayout();

        return Clutter.EVENT_STOP;
    }

    vfunc_motion_event(event) {
        if (!this._resolve)
            return Clutter.EVENT_STOP;

        this._noteInput();

        if (!this._dragging)
            return Clutter.EVENT_STOP;

        const [x, y] = event.get_coords();
        this._lastX = Math.floor(x);
        this._lastY = Math.floor(y);
        this._relayout();

        return Clutter.EVENT_STOP;
    }

    vfunc_button_release_event() {
        if (!this._resolve || !this._dragging)
            return Clutter.EVENT_STOP;

        const rect = this._geometry();
        const tooSmall =
            rect.width < MIN_SELECTION || rect.height < MIN_SELECTION;

        this._finish(tooSmall ? null : rect);

        return Clutter.EVENT_STOP;
    }

    vfunc_key_press_event(event) {
        this._noteInput();

        if (event.get_key_symbol() === Clutter.KEY_Escape)
            this._finish(null);

        // Swallow everything else: we hold a modal grab, and keystrokes must
        // not leak through to whatever is underneath.
        return Clutter.EVENT_STOP;
    }
});

export default class QuickSnapExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._overlay = null;
        this._flash = null;
        this._repaintLaterId = 0;

        Main.wm.addKeybinding(
            CAPTURE_KEY,
            this._settings,
            Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this._onCaptureShortcut());
    }

    disable() {
        Main.wm.removeKeybinding(CAPTURE_KEY);

        this._overlay?.destroy();
        this._overlay = null;

        this._flash?.destroy();
        this._flash = null;

        if (this._repaintLaterId) {
            global.compositor.get_laters().remove(this._repaintLaterId);
            this._repaintLaterId = 0;
        }

        this._settings = null;
    }

    _onCaptureShortcut() {
        if (this._overlay)
            return;

        this._capture().catch(e => console.error('QuickSnap: capture failed', e));
    }

    async _capture() {
        // The overview paints over everything and would end up in the shot.
        Main.overview.hide();

        // Read the settings up front. Everything past the first await may run
        // after disable() has already dropped them.
        const dim = this._settings.get_boolean('dim-background');
        const showSize = this._settings.get_boolean('show-size');
        const wantFlash = this._settings.get_boolean('flash');
        const wantSound = this._settings.get_boolean('shutter-sound');

        const overlay = new SelectionOverlay(dim, showSize);
        this._overlay = overlay;

        let rect;
        try {
            rect = await overlay.selectAsync();
        } finally {
            if (this._overlay === overlay)
                this._overlay = null;
        }

        if (!rect)
            return;

        await this._waitForRepaint();
        await this._copyToClipboard(rect);

        if (wantFlash)
            this._flashArea(rect);

        if (wantSound) {
            global.display.get_sound_player().play_from_theme(
                'screen-capture', 'Screenshot taken', null);
        }
    }

    /**
     * Resolves once the compositor is idle, i.e. after the frame that no
     * longer contains the overlay has been painted.
     *
     * @returns {Promise<void>}
     */
    _waitForRepaint() {
        return new Promise(resolve => {
            const laters = global.compositor.get_laters();
            this._repaintLaterId = laters.add(Meta.LaterType.IDLE, () => {
                this._repaintLaterId = 0;
                resolve();
                return GLib.SOURCE_REMOVE;
            });
        });
    }

    _clampToStage(rect) {
        const stageW = global.stage.width;
        const stageH = global.stage.height;

        const x = Math.max(0, Math.min(rect.x, stageW));
        const y = Math.max(0, Math.min(rect.y, stageH));

        return {
            x,
            y,
            width: Math.min(rect.width, stageW - x),
            height: Math.min(rect.height, stageH - y),
        };
    }

    async _copyToClipboard(rect) {
        const {x, y, width, height} = this._clampToStage(rect);
        if (width < 1 || height < 1)
            return;

        // Shell.Screenshot works in device pixels, the stage in logical ones.
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;
        const stream = Gio.MemoryOutputStream.new_resizable();

        await new Promise((resolve, reject) => {
            const shooter = new Shell.Screenshot();
            shooter.screenshot_area(
                Math.round(x * scale),
                Math.round(y * scale),
                Math.round(width * scale),
                Math.round(height * scale),
                stream,
                (obj, result) => {
                    try {
                        obj.screenshot_area_finish(result);
                        resolve();
                    } catch (e) {
                        reject(e);
                    }
                });
        });

        stream.close(null);

        St.Clipboard.get_default().set_content(
            St.ClipboardType.CLIPBOARD, 'image/png', stream.steal_as_bytes());
    }

    _flashArea(rect) {
        this._flash?.destroy();

        const flash = new St.Widget({
            style_class: 'quicksnap-flash',
            x: rect.x,
            y: rect.y,
            width: rect.width,
            height: rect.height,
        });
        this._flash = flash;

        Main.uiGroup.add_child(flash);
        Main.uiGroup.set_child_above_sibling(flash, null);

        flash.ease({
            opacity: 0,
            duration: 250,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
            onComplete: () => {
                if (this._flash === flash)
                    this._flash = null;
                flash.destroy();
            },
        });
    }
}
