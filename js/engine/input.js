/**
 * Hotline Miami: VISEO Arcade Edition
 * Input Management System - js/engine/input.js
 * 
 * Features:
 * - Seamless WASD, ZQSD (AZERTY), and Arrow keys support
 * - Normalized 8-directional movement vector (keyboard & analog sticks)
 * - Mouse cursor tracking & World-space projection
 * - 360-degree aiming angle calculations (mouse & right stick)
 * - Complete gamepad support with edge detection for all buttons (Xbox / PS / Switch / Generic)
 * - Automatic input device switching & OS cursor management (gamepad vs mouse/keyboard)
 * - Virtual world & screen reticle for smooth controller crosshair tracking
 * - Dedicated query methods: attack, throw/pickup, execute, lookahead, pause, restart, menu nav
 * - Dual-Rumble haptic feedback on weapons, melee hits, door kicks, executions, and impacts
 * - Retro neon crosshair drawing helper
 */

(function (root, factory) {
    const result = factory();
    if (typeof define === 'function' && define.amd) {
        define([], () => result);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = result;
    }
    if (typeof window !== 'undefined') {
        window.Input = result;
        window.InputManager = result.InputManager;
        window.input = result;
    }
    root.Input = result;
    root.InputManager = result.InputManager;
    root.input = result;
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    class InputManager {
        constructor(canvas = null, camera = null) {
            // Key state maps: [code: string] -> boolean
            this.keysDown = Object.create(null);
            this.keysJustPressed = Object.create(null);
            this.keysJustReleased = Object.create(null);

            // Mouse state
            this.mouse = {
                x: 0,
                y: 0,
                normalizedX: 0,
                normalizedY: 0,
                worldX: 0,
                worldY: 0,
                left: false,
                leftJustPressed: false,
                leftJustReleased: false,
                right: false,
                rightJustPressed: false,
                rightJustReleased: false,
                middle: false,
                wheelDelta: 0,
                insideCanvas: true
            };

            // Gamepad state
            this.gamepad = {
                connected: false,
                index: 0,
                id: 'Standard Gamepad',
                leftStick: { x: 0, y: 0 },
                rightStick: { x: 0, y: 0 },
                rawLeftStick: { x: 0, y: 0 },
                rawRightStick: { x: 0, y: 0 },
                triggerRight: 0,
                triggerLeft: 0,
                buttonA: false,      // 0: Interact / Select / Confirm
                buttonB: false,      // 1: Throw / Cancel / Back
                buttonX: false,      // 2: Pickup / Interact / Door Kick
                buttonY: false,      // 3: Execute
                buttonLB: false,     // 4: Lookahead
                buttonRB: false,     // 5: Throw / Pickup
                buttonLT: false,     // 6: Trigger Left (>0.3)
                buttonRT: false,     // 7: Trigger Right (>0.3)
                buttonSelect: false, // 8: Back / Select / Restart
                buttonStart: false,  // 9: Start / Menu / Pause
                buttonL3: false,     // 10: Left Stick Click
                buttonR3: false,     // 11: Right Stick Click
                dpadUp: false,       // 12
                dpadDown: false,     // 13
                dpadLeft: false,     // 14
                dpadRight: false,    // 15
                justPressed: Object.create(null),
                justReleased: Object.create(null),
                prevButtons: Object.create(null)
            };

            // Active Input Device Mode ('keyboard' or 'gamepad')
            this.isGamepadMode = false;
            this.lastInputMode = 'keyboard';
            this.gamepadAimAngle = 0;

            // Virtual crosshair coordinates in world and screen space
            this.virtualAim = {
                worldX: 0,
                worldY: 0,
                screenX: 0,
                screenY: 0,
                distance: 180
            };

            // Menu stick navigation debounce timer
            this._stickNavDebounce = 0;

            // Reference Player position for world-space gamepad aiming
            this.playerRef = null;

            // Attached elements
            this.canvas = null;
            this.camera = null;

            // Key aliases for international keyboards
            this.MOVEMENT_KEYS = {
                UP: ['KeyW', 'KeyZ', 'ArrowUp'],
                LEFT: ['KeyA', 'KeyQ', 'ArrowLeft'],
                DOWN: ['KeyS', 'ArrowDown'],
                RIGHT: ['KeyD', 'ArrowRight']
            };

            this.INTERACT_KEYS = ['KeyE', 'KeyF'];
            this.RESTART_KEYS = ['KeyR'];
            this.LOOKAHEAD_KEYS = ['ShiftLeft', 'ShiftRight'];
            this.SPACE_KEYS = ['Space'];
            this.PAUSE_KEYS = ['Escape', 'KeyP'];

            // Bound event listener references for clean removal
            this._boundKeyDown = this._onKeyDown.bind(this);
            this._boundKeyUp = this._onKeyUp.bind(this);
            this._boundBlur = this._onBlur.bind(this);
            this._boundMouseMove = this._onMouseMove.bind(this);
            this._boundMouseDown = this._onMouseDown.bind(this);
            this._boundMouseUp = this._onMouseUp.bind(this);
            this._boundContextMenu = this._onContextMenu.bind(this);
            this._boundWheel = this._onWheel.bind(this);
            this._boundMouseEnter = this._onMouseEnter.bind(this);
            this._boundMouseLeave = this._onMouseLeave.bind(this);
            this._boundGamepadConnected = this._onGamepadConnected.bind(this);
            this._boundGamepadDisconnected = this._onGamepadDisconnected.bind(this);
            this.initialized = false;

            if (canvas) {
                this.init(canvas, camera);
            }
        }

        /**
         * Initialize and attach event listeners to target canvas and window.
         * @param {HTMLCanvasElement} canvas 
         * @param {Object} [camera] Camera instance for world-space projection
         */
        init(canvas, camera = null) {
            if (this.initialized) {
                this.destroy();
            }

            this.canvas = canvas || (typeof document !== 'undefined' ? document.querySelector('canvas') : null);
            this.camera = camera;

            if (typeof window !== 'undefined') {
                window.addEventListener('keydown', this._boundKeyDown);
                window.addEventListener('keyup', this._boundKeyUp);
                window.addEventListener('blur', this._boundBlur);
                window.addEventListener('gamepadconnected', this._boundGamepadConnected);
                window.addEventListener('gamepaddisconnected', this._boundGamepadDisconnected);
            }

            if (this.canvas) {
                this.canvas.addEventListener('mousemove', this._boundMouseMove);
                this.canvas.addEventListener('mousedown', this._boundMouseDown);
                this.canvas.addEventListener('mouseup', this._boundMouseUp);
                this.canvas.addEventListener('contextmenu', this._boundContextMenu);
                this.canvas.addEventListener('wheel', this._boundWheel, { passive: true });
                this.canvas.addEventListener('mouseenter', this._boundMouseEnter);
                this.canvas.addEventListener('mouseleave', this._boundMouseLeave);
            } else if (typeof window !== 'undefined') {
                window.addEventListener('mousemove', this._boundMouseMove);
                window.addEventListener('mousedown', this._boundMouseDown);
                window.addEventListener('mouseup', this._boundMouseUp);
                window.addEventListener('contextmenu', this._boundContextMenu);
            }

            this.initialized = true;
            return this;
        }

        /**
         * Set or update the active camera for screen-to-world conversion.
         * @param {Object} camera 
         */
        setCamera(camera) {
            this.camera = camera;
        }

        /**
         * Set player reference for gamepad world-space aiming calculation.
         * @param {Object} player 
         */
        setPlayer(player) {
            this.playerRef = player;
        }

        /**
         * Switch between Gamepad and Keyboard/Mouse input modes.
         * Automatically hides/shows the OS hardware cursor and updates body styling.
         * @param {boolean} active 
         */
        setGamepadMode(active) {
            if (this.isGamepadMode === active) return;
            this.isGamepadMode = active;
            this.lastInputMode = active ? 'gamepad' : 'keyboard';

            if (typeof document !== 'undefined' && document.body) {
                if (active) {
                    document.body.classList.add('gamepad-mode');
                    document.body.style.cursor = 'none';
                } else {
                    document.body.classList.remove('gamepad-mode');
                    document.body.style.cursor = 'crosshair';
                }
            }
        }

        /**
         * Teardown all listeners.
         */
        destroy() {
            if (typeof window !== 'undefined') {
                window.removeEventListener('keydown', this._boundKeyDown);
                window.removeEventListener('keyup', this._boundKeyUp);
                window.removeEventListener('blur', this._boundBlur);
                window.removeEventListener('gamepadconnected', this._boundGamepadConnected);
                window.removeEventListener('gamepaddisconnected', this._boundGamepadDisconnected);
            }

            if (this.canvas) {
                this.canvas.removeEventListener('mousemove', this._boundMouseMove);
                this.canvas.removeEventListener('mousedown', this._boundMouseDown);
                this.canvas.removeEventListener('mouseup', this._boundMouseUp);
                this.canvas.removeEventListener('contextmenu', this._boundContextMenu);
                this.canvas.removeEventListener('wheel', this._boundWheel);
                this.canvas.removeEventListener('mouseenter', this._boundMouseEnter);
                this.canvas.removeEventListener('mouseleave', this._boundMouseLeave);
            } else if (typeof window !== 'undefined') {
                window.removeEventListener('mousemove', this._boundMouseMove);
                window.removeEventListener('mousedown', this._boundMouseDown);
                window.removeEventListener('mouseup', this._boundMouseUp);
                window.removeEventListener('contextmenu', this._boundContextMenu);
            }

            this.reset();
            this.initialized = false;
        }

        /**
         * Resets all pressed keys and buttons (useful on blur or death).
         */
        reset() {
            this.keysDown = Object.create(null);
            this.keysJustPressed = Object.create(null);
            this.keysJustReleased = Object.create(null);
            this.mouse.left = false;
            this.mouse.leftJustPressed = false;
            this.mouse.leftJustReleased = false;
            this.mouse.right = false;
            this.mouse.rightJustPressed = false;
            this.mouse.rightJustReleased = false;
            this.mouse.middle = false;
            this.mouse.wheelDelta = 0;

            if (this.gamepad) {
                this.gamepad.justPressed = Object.create(null);
                this.gamepad.justReleased = Object.create(null);
                this.gamepad.prevButtons = Object.create(null);
            }
        }

        // ==================== EVENT HANDLERS ====================

        _onKeyDown(e) {
            this.setGamepadMode(false);
            const code = e.code || e.key;
            if (!this.keysDown[code]) {
                this.keysJustPressed[code] = true;
            }
            this.keysDown[code] = true;

            // Prevent default browser scrolling on Space, Arrow Keys, Tab
            if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(code)) {
                e.preventDefault();
            }
        }

        _onKeyUp(e) {
            const code = e.code || e.key;
            this.keysDown[code] = false;
            this.keysJustReleased[code] = true;
        }

        _onMouseMove(e) {
            this.setGamepadMode(false);
            let clientX = e.clientX;
            let clientY = e.clientY;

            if (this.canvas) {
                const rect = this.canvas.getBoundingClientRect();
                const scaleX = this.canvas.width / rect.width;
                const scaleY = this.canvas.height / rect.height;

                this.mouse.x = (clientX - rect.left) * scaleX;
                this.mouse.y = (clientY - rect.top) * scaleY;

                this.mouse.normalizedX = ((this.mouse.x / this.canvas.width) * 2) - 1;
                this.mouse.normalizedY = ((this.mouse.y / this.canvas.height) * 2) - 1;
            } else {
                this.mouse.x = clientX;
                this.mouse.y = clientY;
            }

            this._updateWorldMouse();
        }

        _onMouseDown(e) {
            this.setGamepadMode(false);
            if (e.button === 0) {
                if (!this.mouse.left) this.mouse.leftJustPressed = true;
                this.mouse.left = true;
            } else if (e.button === 2) {
                if (!this.mouse.right) this.mouse.rightJustPressed = true;
                this.mouse.right = true;
            } else if (e.button === 1) {
                this.mouse.middle = true;
            }
        }

        _onMouseUp(e) {
            if (e.button === 0) {
                this.mouse.left = false;
                this.mouse.leftJustReleased = true;
            } else if (e.button === 2) {
                this.mouse.right = false;
                this.mouse.rightJustReleased = true;
            } else if (e.button === 1) {
                this.mouse.middle = false;
            }
        }

        _onContextMenu(e) {
            // Suppress browser right-click menu
            e.preventDefault();
            return false;
        }

        _onWheel(e) {
            this.mouse.wheelDelta = e.deltaY;
        }

        _onMouseEnter() {
            this.mouse.insideCanvas = true;
        }

        _onMouseLeave() {
            this.mouse.insideCanvas = false;
        }

        _onBlur() {
            this.reset();
        }

        _onGamepadConnected(e) {
            this.gamepad.connected = true;
            if (e.gamepad) {
                this.gamepad.id = e.gamepad.id || 'Standard Gamepad';
                this.gamepad.index = e.gamepad.index || 0;
            }
            this.setGamepadMode(true);
        }

        _onGamepadDisconnected(e) {
            this.gamepad.connected = false;
            this.setGamepadMode(false);
        }

        // ==================== FRAME UPDATE ====================

        /**
         * Call at the start of every frame to update gamepad polling, world mouse, and reset transient triggers.
         * @param {number} [dt] Delta time in seconds
         * @param {Object} [player] Optional player reference for aim projection
         */
        update(dt = 1 / 60, player = null) {
            if (player) {
                this.playerRef = player;
            }

            if (this._stickNavDebounce > 0) {
                this._stickNavDebounce -= dt;
            }

            // 1. Poll Gamepad State
            this._pollGamepad();

            // 2. Update Aim & Crosshair Coordinates
            if (this.isGamepadMode) {
                this._updateGamepadAim();
            } else {
                this._updateWorldMouse();
            }
        }

        /**
         * Clear single-frame transition triggers. Call at the end of the game loop frame.
         */
        clearFrameTriggers() {
            this.keysJustPressed = Object.create(null);
            this.keysJustReleased = Object.create(null);
            this.mouse.leftJustPressed = false;
            this.mouse.leftJustReleased = false;
            this.mouse.rightJustPressed = false;
            this.mouse.rightJustReleased = false;
            this.mouse.wheelDelta = 0;

            if (this.gamepad) {
                this.gamepad.justPressed = Object.create(null);
                this.gamepad.justReleased = Object.create(null);
            }
        }

        _updateWorldMouse() {
            if (this.camera && typeof this.camera.screenToWorld === 'function') {
                const worldPos = this.camera.screenToWorld(this.mouse.x, this.mouse.y);
                this.mouse.worldX = worldPos.x;
                this.mouse.worldY = worldPos.y;
            } else {
                this.mouse.worldX = this.mouse.x;
                this.mouse.worldY = this.mouse.y;
            }
        }

        _updateGamepadAim() {
            const playerX = (this.playerRef && typeof this.playerRef.x === 'number') ? this.playerRef.x : (this.camera ? this.camera.x : 0);
            const playerY = (this.playerRef && typeof this.playerRef.y === 'number') ? this.playerRef.y : (this.camera ? this.camera.y : 0);

            // Right stick tilt magnitude
            const rMag = Math.hypot(this.gamepad.rightStick.x, this.gamepad.rightStick.y);
            if (rMag > 0.2) {
                this.gamepadAimAngle = Math.atan2(this.gamepad.rightStick.y, this.gamepad.rightStick.x);
            } else {
                // If right stick is idle, but left stick is moving, look towards movement
                const lMag = Math.hypot(this.gamepad.leftStick.x, this.gamepad.leftStick.y);
                if (lMag > 0.25 && (!this.playerRef || this.playerRef.state === 'WALK')) {
                    if (rMag === 0 && this.gamepadAimAngle === 0) {
                        this.gamepadAimAngle = Math.atan2(this.gamepad.leftStick.y, this.gamepad.leftStick.x);
                    }
                }
            }

            // Crosshair projection distance
            const baseDist = 180;
            const dist = baseDist + (rMag > 0.2 ? (rMag - 0.2) * 80 : 0);
            this.virtualAim.distance = dist;

            this.virtualAim.worldX = playerX + Math.cos(this.gamepadAimAngle) * dist;
            this.virtualAim.worldY = playerY + Math.sin(this.gamepadAimAngle) * dist;

            // Sync to mouse world coordinates so systems checking worldMouseX/Y get gamepad position
            this.mouse.worldX = this.virtualAim.worldX;
            this.mouse.worldY = this.virtualAim.worldY;

            // Project to screen space
            if (this.camera && typeof this.camera.worldToScreen === 'function') {
                const sPos = this.camera.worldToScreen(this.virtualAim.worldX, this.virtualAim.worldY);
                this.virtualAim.screenX = sPos.x;
                this.virtualAim.screenY = sPos.y;
                this.mouse.x = sPos.x;
                this.mouse.y = sPos.y;
            } else if (this.canvas) {
                this.virtualAim.screenX = this.canvas.width * 0.5 + Math.cos(this.gamepadAimAngle) * dist;
                this.virtualAim.screenY = this.canvas.height * 0.5 + Math.sin(this.gamepadAimAngle) * dist;
                this.mouse.x = this.virtualAim.screenX;
                this.mouse.y = this.virtualAim.screenY;
            }
        }

        _pollGamepad() {
            if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
            const gamepads = navigator.getGamepads();
            if (!gamepads) {
                this.gamepad.connected = false;
                return;
            }

            // Find first connected active gamepad
            let gp = null;
            for (let i = 0; i < gamepads.length; i++) {
                const candidate = gamepads[i];
                if (candidate && candidate.connected !== false) {
                    gp = candidate;
                    break;
                }
            }

            if (!gp) {
                this.gamepad.connected = false;
                return;
            }

            this.gamepad.connected = true;
            this.gamepad.id = gp.id || 'Standard Gamepad';
            this.gamepad.index = gp.index || 0;

            // Process Analog Sticks with Radial Deadzone
            const deadzone = 0.18;
            const processStick = (rawX, rawY) => {
                const len = Math.hypot(rawX, rawY);
                if (len < deadzone) return { x: 0, y: 0 };
                const factor = Math.min(1, (len - deadzone) / (1 - deadzone)) / len;
                return { x: rawX * factor, y: rawY * factor };
            };

            const rawLX = gp.axes && gp.axes.length > 0 ? gp.axes[0] : 0;
            const rawLY = gp.axes && gp.axes.length > 1 ? gp.axes[1] : 0;
            const rawRX = gp.axes && gp.axes.length > 2 ? gp.axes[2] : 0;
            const rawRY = gp.axes && gp.axes.length > 3 ? gp.axes[3] : 0;

            this.gamepad.rawLeftStick = { x: rawLX, y: rawLY };
            this.gamepad.rawRightStick = { x: rawRX, y: rawRY };
            this.gamepad.leftStick = processStick(rawLX, rawLY);
            this.gamepad.rightStick = processStick(rawRX, rawRY);

            // Trigger analog values
            const rawLT = (gp.buttons && gp.buttons[6]) ? (typeof gp.buttons[6] === 'object' ? gp.buttons[6].value : gp.buttons[6]) : 0;
            const rawRT = (gp.buttons && gp.buttons[7]) ? (typeof gp.buttons[7] === 'object' ? gp.buttons[7].value : gp.buttons[7]) : 0;
            this.gamepad.triggerLeft = rawLT || 0;
            this.gamepad.triggerRight = rawRT || 0;

            // Helper to get button pressed state
            const btnPressed = (idx) => {
                if (!gp.buttons || !gp.buttons[idx]) return false;
                const b = gp.buttons[idx];
                return typeof b === 'object' ? b.pressed : b > 0.5;
            };

            // Current button snapshot
            const currentButtons = {
                buttonA: btnPressed(0),
                buttonB: btnPressed(1),
                buttonX: btnPressed(2),
                buttonY: btnPressed(3),
                buttonLB: btnPressed(4),
                buttonRB: btnPressed(5),
                buttonLT: this.gamepad.triggerLeft > 0.3 || btnPressed(6),
                buttonRT: this.gamepad.triggerRight > 0.3 || btnPressed(7),
                buttonSelect: btnPressed(8),
                buttonStart: btnPressed(9),
                buttonL3: btnPressed(10),
                buttonR3: btnPressed(11),
                dpadUp: btnPressed(12),
                dpadDown: btnPressed(13),
                dpadLeft: btnPressed(14),
                dpadRight: btnPressed(15)
            };

            // Check if any gamepad input is actively being used to switch mode
            const stickActive = Math.hypot(rawLX, rawLY) > 0.25 || Math.hypot(rawRX, rawRY) > 0.25;
            let anyButtonPressed = false;

            // Compute edge detections (justPressed and justReleased)
            const prev = this.gamepad.prevButtons;
            for (const key in currentButtons) {
                const isDown = currentButtons[key];
                const wasDown = prev[key] || false;

                if (isDown) anyButtonPressed = true;

                if (isDown && !wasDown) {
                    this.gamepad.justPressed[key] = true;
                }
                if (!isDown && wasDown) {
                    this.gamepad.justReleased[key] = true;
                }

                this.gamepad[key] = isDown;
                prev[key] = isDown;
            }

            if (stickActive || anyButtonPressed) {
                this.setGamepadMode(true);
            }
        }

        // Stick menu navigation edge helpers
        _justPushedStickLeft() {
            if (this._stickNavDebounce <= 0 && this.gamepad.leftStick.x < -0.55) {
                this._stickNavDebounce = 0.22;
                return true;
            }
            return false;
        }

        _justPushedStickRight() {
            if (this._stickNavDebounce <= 0 && this.gamepad.leftStick.x > 0.55) {
                this._stickNavDebounce = 0.22;
                return true;
            }
            return false;
        }

        _justPushedStickUp() {
            if (this._stickNavDebounce <= 0 && this.gamepad.leftStick.y < -0.55) {
                this._stickNavDebounce = 0.22;
                return true;
            }
            return false;
        }

        _justPushedStickDown() {
            if (this._stickNavDebounce <= 0 && this.gamepad.leftStick.y > 0.55) {
                this._stickNavDebounce = 0.22;
                return true;
            }
            return false;
        }

        /**
         * Trigger haptic vibration on connected gamepad (Dual-Rumble)
         * @param {number} [duration=120] Duration in milliseconds
         * @param {number} [strong=0.6] Low-frequency motor magnitude [0, 1]
         * @param {number} [weak=0.4] High-frequency motor magnitude [0, 1]
         */
        vibrate(duration = 120, strong = 0.6, weak = 0.4) {
            try {
                if (typeof navigator === 'undefined' || !navigator.getGamepads) return;
                const gamepads = navigator.getGamepads();
                if (!gamepads) return;

                for (let i = 0; i < gamepads.length; i++) {
                    const gp = gamepads[i];
                    if (gp && gp.connected !== false && gp.vibrationActuator && typeof gp.vibrationActuator.playEffect === 'function') {
                        gp.vibrationActuator.playEffect('dual-rumble', {
                            startDelay: 0,
                            duration: Math.max(10, duration),
                            weakMagnitude: Math.min(1, Math.max(0, weak)),
                            strongMagnitude: Math.min(1, Math.max(0, strong))
                        }).catch(() => {});
                    }
                }
            } catch (e) {}
        }

        // ==================== QUERY METHODS ====================

        /**
         * Check if any of the given key codes are currently held down.
         * @param {...string} codes 
         * @returns {boolean}
         */
        isDown(...codes) {
            for (let i = 0; i < codes.length; i++) {
                if (this.keysDown[codes[i]]) return true;
            }
            return false;
        }

        /**
         * Check if any of the given key codes were pressed on this specific frame.
         * @param {...string} codes 
         * @returns {boolean}
         */
        isJustPressed(...codes) {
            for (let i = 0; i < codes.length; i++) {
                if (this.keysJustPressed[codes[i]]) return true;
            }
            return false;
        }

        /**
         * Check if any of the given key codes were released on this specific frame.
         * @param {...string} codes 
         * @returns {boolean}
         */
        isJustReleased(...codes) {
            for (let i = 0; i < codes.length; i++) {
                if (this.keysJustReleased[codes[i]]) return true;
            }
            return false;
        }

        /**
         * Returns normalized 8-directional movement vector {x, y, length}.
         * Smoothly handles keyboard WASD/ZQSD/Arrows and gamepad analog stick.
         * @returns {{x: number, y: number, length: number}}
         */
        getMovementVector() {
            // Check gamepad analog stick first if connected & active
            if (this.gamepad.connected && (Math.abs(this.gamepad.leftStick.x) > 0.05 || Math.abs(this.gamepad.leftStick.y) > 0.05)) {
                const dx = this.gamepad.leftStick.x;
                const dy = this.gamepad.leftStick.y;
                const len = Math.hypot(dx, dy);
                return {
                    x: dx,
                    y: dy,
                    length: Math.min(1, len)
                };
            }

            // Gamepad D-pad fallback
            if (this.gamepad.connected) {
                let dpadX = 0;
                let dpadY = 0;
                if (this.gamepad.dpadUp) dpadY -= 1;
                if (this.gamepad.dpadDown) dpadY += 1;
                if (this.gamepad.dpadLeft) dpadX -= 1;
                if (this.gamepad.dpadRight) dpadX += 1;

                const dpadLen = Math.hypot(dpadX, dpadY);
                if (dpadLen > 0) {
                    return {
                        x: dpadX / dpadLen,
                        y: dpadY / dpadLen,
                        length: 1
                    };
                }
            }

            // Keyboard WASD, ZQSD, Arrow Keys
            let dx = 0;
            let dy = 0;

            if (this.isDown(...this.MOVEMENT_KEYS.UP)) dy -= 1;
            if (this.isDown(...this.MOVEMENT_KEYS.DOWN)) dy += 1;
            if (this.isDown(...this.MOVEMENT_KEYS.LEFT)) dx -= 1;
            if (this.isDown(...this.MOVEMENT_KEYS.RIGHT)) dx += 1;

            const len = Math.hypot(dx, dy);
            if (len > 0) {
                return {
                    x: dx / len,
                    y: dy / len,
                    length: 1
                };
            }

            return { x: 0, y: 0, length: 0 };
        }

        /**
         * Calculates 360-degree angle from given origin to aim target in world coordinates.
         * @param {number} originX 
         * @param {number} originY 
         * @returns {number} Angle in radians [-Math.PI, Math.PI]
         */
        getAimAngle(originX, originY) {
            if (this.isGamepadMode) {
                return this.gamepadAimAngle;
            }

            const dx = this.mouse.worldX - originX;
            const dy = this.mouse.worldY - originY;
            return Math.atan2(dy, dx);
        }

        /**
         * Distance in world units between an origin point and mouse/reticle position.
         * @param {number} originX 
         * @param {number} originY 
         * @returns {number}
         */
        getDistanceToMouse(originX, originY) {
            return Math.hypot(this.mouse.worldX - originX, this.mouse.worldY - originY);
        }

        /**
         * Attack / Shoot trigger (single press).
         * @returns {boolean}
         */
        isAttackJustPressed() {
            const kbMouse = this.mouse.leftJustPressed || this.isJustPressed('KeyJ', 'Enter');
            const gp = this.gamepad.connected && this.gamepad.justPressed.buttonRT;
            return Boolean(kbMouse || gp);
        }

        isAttackDown() {
            const kbMouse = this.mouse.left || this.isDown('KeyJ', 'Enter');
            const gp = this.gamepad.connected && this.gamepad.buttonRT;
            return Boolean(kbMouse || gp);
        }

        isThrowOrPickupJustPressed() {
            const kbMouse = this.mouse.rightJustPressed || this.isJustPressed('KeyK', 'KeyE', 'KeyF');
            const gp = this.gamepad.connected && (this.gamepad.justPressed.buttonLT || this.gamepad.justPressed.buttonRB || this.gamepad.justPressed.buttonX);
            return Boolean(kbMouse || gp);
        }

        isExecuteJustPressed() {
            const kbMouse = this.isJustPressed(...this.SPACE_KEYS);
            const gp = this.gamepad.connected && this.gamepad.justPressed.buttonY;
            return Boolean(kbMouse || gp);
        }

        isLookaheadDown() {
            const kbMouse = this.isDown(...this.LOOKAHEAD_KEYS);
            const gp = this.gamepad.connected && this.gamepad.buttonLB;
            return Boolean(kbMouse || gp);
        }

        isInteractJustPressed() {
            const kbMouse = this.isJustPressed(...this.INTERACT_KEYS);
            const gp = this.gamepad.connected && (this.gamepad.justPressed.buttonX || this.gamepad.justPressed.buttonA);
            return Boolean(kbMouse || gp);
        }

        isRestartJustPressed() {
            const kbMouse = this.isJustPressed(...this.RESTART_KEYS);
            const gp = this.gamepad.connected && this.gamepad.justPressed.buttonSelect;
            return Boolean(kbMouse || gp);
        }

        isPauseJustPressed() {
            const kbMouse = this.isJustPressed(...this.PAUSE_KEYS);
            const gp = this.gamepad.connected && this.gamepad.justPressed.buttonStart;
            return Boolean(kbMouse || gp);
        }

        isMenuConfirmJustPressed() {
            const kbMouse = this.isJustPressed('Enter', 'Space', 'KeyE');
            const gp = this.gamepad.connected && (this.gamepad.justPressed.buttonA || this.gamepad.justPressed.buttonRT || this.gamepad.justPressed.buttonStart);
            return Boolean(kbMouse || gp);
        }

        isMenuCancelJustPressed() {
            const kbMouse = this.isJustPressed('Escape', 'Backspace');
            const gp = this.gamepad.connected && (this.gamepad.justPressed.buttonB || this.gamepad.justPressed.buttonSelect);
            return Boolean(kbMouse || gp);
        }

        isMenuPrevJustPressed() {
            const kbMouse = this.isJustPressed('ArrowLeft', 'KeyA', 'KeyQ');
            const gp = this.gamepad.connected && (this.gamepad.justPressed.dpadLeft || this.gamepad.justPressed.buttonLB || this._justPushedStickLeft());
            return Boolean(kbMouse || gp);
        }

        isMenuNextJustPressed() {
            const kbMouse = this.isJustPressed('ArrowRight', 'KeyD');
            const gp = this.gamepad.connected && (this.gamepad.justPressed.dpadRight || this.gamepad.justPressed.buttonRB || this._justPushedStickRight());
            return Boolean(kbMouse || gp);
        }

        // Property Getters for easy engine access
        get worldMouseX() { return this.mouse.worldX || 0; }
        get worldMouseY() { return this.mouse.worldY || 0; }
        get mouseX() { return this.mouse.x || 0; }
        get mouseY() { return this.mouse.y || 0; }
        get isShiftDown() { return this.isLookaheadDown(); }
        get isSpaceDown() { return this.isDown(...this.SPACE_KEYS); }
        get isMouseDown() { return this.isAttackDown(); }
        get isRightMouseDown() { return this.mouse.right || (this.gamepad.connected && (this.gamepad.buttonLT || this.gamepad.buttonRB || this.gamepad.buttonX)); }

        // ==================== HUD / RETICLE RENDERING ====================

        /**
         * Compute the long player-to-reticle aim guide in screen space.
         * Keeping geometry separate also makes mouse/gamepad aiming deterministic and testable.
         */
        getAimGuideLine() {
            if (!this.playerRef || !this.camera || typeof this.camera.worldToScreen !== 'function') return null;

            const screenPlayer = this.camera.worldToScreen(this.playerRef.x, this.playerRef.y);
            const targetX = this.isGamepadMode ? this.virtualAim.screenX : this.mouse.x;
            const targetY = this.isGamepadMode ? this.virtualAim.screenY : this.mouse.y;
            const dx = targetX - screenPlayer.x;
            const dy = targetY - screenPlayer.y;
            const distance = Math.hypot(dx, dy);
            if (!Number.isFinite(distance) || distance < 44) return null;

            const nx = dx / distance;
            const ny = dy / distance;
            const playerPadding = 20;
            const reticlePadding = 20;
            return {
                startX: screenPlayer.x + nx * playerPadding,
                startY: screenPlayer.y + ny * playerPadding,
                endX: targetX - nx * reticlePadding,
                endY: targetY - ny * reticlePadding,
                distance
            };
        }

        /**
         * Draw authentic Hotline Miami style neon crosshair.
         * In Gamepad Mode: draws at virtual screen reticle smoothly projected along aim direction.
         * In Mouse Mode: draws directly at mouse cursor.
         * @param {CanvasRenderingContext2D} ctx 
         * @param {Object} [options]
         */
        drawCrosshair(ctx, options = {}) {
            if (!ctx) return;

            let x = this.mouse.x;
            let y = this.mouse.y;

            if (this.isGamepadMode) {
                x = this.virtualAim.screenX;
                y = this.virtualAim.screenY;
            }

            const color = options.color || '#00ffcc';
            const lockOn = options.lockOn || false;
            const ammo = options.ammo !== undefined ? options.ammo : null;
            const time = options.time || (performance.now() * 0.003);

            // Long sight guide from the player body almost all the way to the cursor.
            const aimGuide = this.getAimGuideLine();
            if (aimGuide && this.isLookaheadDown()) {
                ctx.save();
                ctx.strokeStyle = lockOn ? 'rgba(255, 0, 85, 0.52)' : 'rgba(0, 255, 204, 0.42)';
                ctx.shadowColor = lockOn ? '#ff0055' : '#00ffcc';
                ctx.shadowBlur = 5;
                ctx.lineWidth = 1.25;
                ctx.setLineDash([8, 6]);
                ctx.beginPath();
                ctx.moveTo(aimGuide.startX, aimGuide.startY);
                ctx.lineTo(aimGuide.endX, aimGuide.endY);
                ctx.stroke();
                ctx.restore();
            }

            ctx.save();
            ctx.translate(x, y);

            // Subtle breathing pulse
            const pulse = 1 + Math.sin(time * 6) * 0.08;
            const size = (options.size || (this.isGamepadMode ? 16 : 14)) * pulse;

            ctx.lineWidth = 1.8;
            ctx.strokeStyle = lockOn ? '#ff0055' : color;
            ctx.shadowColor = lockOn ? '#ff0055' : color;
            ctx.shadowBlur = 8;

            // Outer brackets
            const bracketDist = size * 1.2;
            const bracketSize = size * 0.45;

            // Top-Left
            ctx.beginPath();
            ctx.moveTo(-bracketDist, -bracketDist + bracketSize);
            ctx.lineTo(-bracketDist, -bracketDist);
            ctx.lineTo(-bracketDist + bracketSize, -bracketDist);
            ctx.stroke();

            // Top-Right
            ctx.beginPath();
            ctx.moveTo(bracketDist - bracketSize, -bracketDist);
            ctx.lineTo(bracketDist, -bracketDist);
            ctx.lineTo(bracketDist, -bracketDist + bracketSize);
            ctx.stroke();

            // Bottom-Left
            ctx.beginPath();
            ctx.moveTo(-bracketDist, bracketDist - bracketSize);
            ctx.lineTo(-bracketDist, bracketDist);
            ctx.lineTo(-bracketDist + bracketSize, bracketDist);
            ctx.stroke();

            // Bottom-Right
            ctx.beginPath();
            ctx.moveTo(bracketDist - bracketSize, bracketDist);
            ctx.lineTo(bracketDist, bracketDist);
            ctx.lineTo(bracketDist, bracketDist - bracketSize);
            ctx.stroke();

            // Center target pip
            ctx.fillStyle = lockOn ? '#ff0055' : '#ffffff';
            ctx.beginPath();
            ctx.arc(0, 0, 2.4, 0, Math.PI * 2);
            ctx.fill();

            // Four cardinal tick marks
            const tickInner = 4;
            const tickOuter = 9;
            ctx.beginPath();
            ctx.moveTo(0, -tickInner); ctx.lineTo(0, -tickOuter);
            ctx.moveTo(0, tickInner); ctx.lineTo(0, tickOuter);
            ctx.moveTo(-tickInner, 0); ctx.lineTo(-tickOuter, 0);
            ctx.moveTo(tickInner, 0); ctx.lineTo(tickOuter, 0);
            ctx.stroke();

            // Ammo counter pip indicator around reticle if armed
            if (ammo !== null && ammo >= 0) {
                ctx.fillStyle = '#ffff00';
                ctx.font = '900 10px "Courier New", monospace';
                ctx.textAlign = 'center';
                ctx.fillText(ammo > 0 ? `${ammo}` : 'EMPTY', 0, bracketDist + 14);
            }

            ctx.restore();
        }
    }

    InputManager.prototype.renderCrosshair = InputManager.prototype.drawCrosshair;

    // Export singleton instance or class
    const instance = new InputManager();
    instance.InputManager = InputManager;
    return instance;
}));
