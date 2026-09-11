/**
 * Automated Verification Suite for Hotline Miami Gamepad / Controller Integration
 */

const assert = require('assert');

let mockGamepads = [];
if (!globalThis.navigator) {
    globalThis.navigator = {};
}
globalThis.navigator.getGamepads = () => mockGamepads;
global.document = {
    body: {
        classList: {
            add: () => {},
            remove: () => {},
            toggle: () => {}
        },
        style: {}
    },
    querySelector: () => null,
    getElementById: () => null
};
global.window = {
    addEventListener: () => {},
    removeEventListener: () => {}
};
global.performance = {
    now: () => Date.now()
};

// Import Input engine
const input = require('./js/engine/input.js');

console.log('=== RUNNING GAMEPAD VERIFICATION SUITE ===');

// Helper to create a mock gamepad
function createMockGamepad(options = {}) {
    const buttons = [];
    for (let i = 0; i < 16; i++) {
        buttons.push({
            pressed: (options.pressedButtons && options.pressedButtons.includes(i)) || false,
            value: (options.buttonValues && options.buttonValues[i] !== undefined) ? options.buttonValues[i] : ((options.pressedButtons && options.pressedButtons.includes(i)) ? 1.0 : 0.0)
        });
    }

    return {
        id: options.id || 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
        index: 0,
        connected: options.connected !== false,
        axes: options.axes || [0, 0, 0, 0], // LX, LY, RX, RY
        buttons: buttons,
        vibrationActuator: {
            playEffect: (type, params) => {
                return Promise.resolve();
            }
        }
    };
}

// -------------------------------------------------------------
// Test 1: Gamepad Connection & Mode Switching
// -------------------------------------------------------------
console.log('Test 1: Gamepad Detection & Input Mode Switching');
mockGamepads = [createMockGamepad({ axes: [0, 0, 0, 0] })];
input.update(1 / 60);
assert.strictEqual(input.gamepad.connected, true, 'Gamepad must be detected as connected');

// Move left stick
mockGamepads = [createMockGamepad({ axes: [0.8, 0.0, 0, 0] })];
input.update(1 / 60);
assert.strictEqual(input.isGamepadMode, true, 'Input mode should switch to Gamepad when stick is moved');

// Keyboard event switches mode back
input._onKeyDown({ code: 'KeyW' });
assert.strictEqual(input.isGamepadMode, false, 'Input mode should switch back to Keyboard on keydown');
input._onKeyUp({ code: 'KeyW' });
console.log('✓ Test 1 Passed: Connection and mode switching verified.');

// -------------------------------------------------------------
// Test 2: Deadzone & Analog Movement
// -------------------------------------------------------------
console.log('Test 2: Analog Movement & Deadzone Calculation');
// Below deadzone (0.10 < 0.18)
mockGamepads = [createMockGamepad({ axes: [0.10, 0.10, 0, 0] })];
input.update(1 / 60);
let moveVec = input.getMovementVector();
assert.strictEqual(moveVec.length, 0, 'Inputs below deadzone must return length 0');

// Above deadzone (0.8, 0.6)
mockGamepads = [createMockGamepad({ axes: [0.8, 0.6, 0, 0] })];
input.update(1 / 60);
moveVec = input.getMovementVector();
assert(moveVec.length > 0.7, 'Inputs above deadzone must return scaled analog vector');
assert(Math.abs(moveVec.x - 0.8) < 0.1, 'X vector matches stick direction');
assert(Math.abs(moveVec.y - 0.6) < 0.1, 'Y vector matches stick direction');
console.log('✓ Test 2 Passed: Deadzone and analog movement verified.');

// -------------------------------------------------------------
// Test 3: 360-Degree Aiming with Right Stick
// -------------------------------------------------------------
console.log('Test 3: 360-Degree Aiming with Right Stick');
// Aim Right (RX=1, RY=0) -> angle should be 0 radians
mockGamepads = [createMockGamepad({ axes: [0, 0, 1.0, 0.0] })];
input.update(1 / 60);
let aim = input.getAimAngle(0, 0);
assert(Math.abs(aim - 0) < 1e-3, `Aiming Right must equal 0 radians (got ${aim})`);

// Aim Down (RX=0, RY=1) -> angle should be PI/2 radians
mockGamepads = [createMockGamepad({ axes: [0, 0, 0.0, 1.0] })];
input.update(1 / 60);
aim = input.getAimAngle(0, 0);
assert(Math.abs(aim - Math.PI / 2) < 1e-3, `Aiming Down must equal PI/2 radians (got ${aim})`);

// Aim Left (RX=-1, RY=0) -> angle should be PI or -PI
mockGamepads = [createMockGamepad({ axes: [0, 0, -1.0, 0.0] })];
input.update(1 / 60);
aim = input.getAimAngle(0, 0);
assert(Math.abs(Math.abs(aim) - Math.PI) < 1e-3, `Aiming Left must equal PI radians (got ${aim})`);
console.log('✓ Test 3 Passed: 360-Degree Right Stick Aiming verified.');

// -------------------------------------------------------------
// Test 4: Attack & Shooting (RT / R2 & Button A)
// -------------------------------------------------------------
console.log('Test 4: Attack / Shoot Triggers & Edge Detection');
// Press RT (Trigger Right = button 7)
mockGamepads = [createMockGamepad({ pressedButtons: [7], buttonValues: { 7: 1.0 } })];
input.update(1 / 60);
assert.strictEqual(input.isAttackJustPressed(), true, 'RT press must trigger isAttackJustPressed');
assert.strictEqual(input.isAttackDown(), true, 'RT held must trigger isAttackDown');

// Clear frame trigger, hold RT
input.clearFrameTriggers();
mockGamepads = [createMockGamepad({ pressedButtons: [7], buttonValues: { 7: 1.0 } })];
input.update(1 / 60);
assert.strictEqual(input.isAttackJustPressed(), false, 'Holding RT should not trigger isAttackJustPressed on second frame');
assert.strictEqual(input.isAttackDown(), true, 'Holding RT must still return isAttackDown true');

// Release RT
mockGamepads = [createMockGamepad({ pressedButtons: [] })];
input.update(1 / 60);
assert.strictEqual(input.isAttackDown(), false, 'Releasing RT must return isAttackDown false');

// Button A is reserved for interaction/menu confirmation and MUST NOT also fire.
mockGamepads = [createMockGamepad({ pressedButtons: [0] })];
input.update(1 / 60);
assert.strictEqual(input.isAttackJustPressed(), false, 'Button A must not fire; RT is the dedicated firearm trigger');
assert.strictEqual(input.isInteractJustPressed(), true, 'Button A must remain available for interaction');
console.log('✓ Test 4 Passed: Dedicated RT Attack & Shooting triggers verified.');

// -------------------------------------------------------------
// Test 5: Pickup & Throw (LT, Button X, Button RB)
// -------------------------------------------------------------
console.log('Test 5: Weapon Pickup & Throw (LT, X, RB)');
// Button X (button 2)
mockGamepads = [createMockGamepad({ pressedButtons: [2] })];
input.update(1 / 60);
assert.strictEqual(input.isThrowOrPickupJustPressed(), true, 'Button X must trigger isThrowOrPickupJustPressed');

// Button RB (button 5)
input.clearFrameTriggers();
mockGamepads = [createMockGamepad({ pressedButtons: [5] })];
input.update(1 / 60);
assert.strictEqual(input.isThrowOrPickupJustPressed(), true, 'Button RB must trigger isThrowOrPickupJustPressed');

// Trigger LT (button 6)
input.clearFrameTriggers();
mockGamepads = [createMockGamepad({ pressedButtons: [6], buttonValues: { 6: 0.9 } })];
input.update(1 / 60);
assert.strictEqual(input.isThrowOrPickupJustPressed(), true, 'Trigger LT must trigger isThrowOrPickupJustPressed');
console.log('✓ Test 5 Passed: Weapon Pickup & Throw verified.');

// -------------------------------------------------------------
// Test 6: Ground Executions (Button Y)
// -------------------------------------------------------------
console.log('Test 6: Ground Executions (Button Y)');
// Button Y (button 3)
mockGamepads = [createMockGamepad({ pressedButtons: [3] })];
input.update(1 / 60);
assert.strictEqual(input.isExecuteJustPressed(), true, 'Button Y must trigger isExecuteJustPressed');
console.log('✓ Test 6 Passed: Ground Executions verified.');

// -------------------------------------------------------------
// Test 7: Lookahead (Button LB)
// -------------------------------------------------------------
console.log('Test 7: Lookahead View (Button LB)');
// Button LB (button 4)
mockGamepads = [createMockGamepad({ pressedButtons: [4] })];
input.update(1 / 60);
assert.strictEqual(input.isLookaheadDown(), true, 'Button LB must trigger isLookaheadDown');
console.log('✓ Test 7 Passed: Lookahead verified.');

// -------------------------------------------------------------
// Test 8: Pause & Restart (Start & Select / Back)
// -------------------------------------------------------------
console.log('Test 8: Pause & Instant Restart (Start & Select/Back)');
// Start button (button 9) -> Pause
mockGamepads = [createMockGamepad({ pressedButtons: [9] })];
input.update(1 / 60);
assert.strictEqual(input.isPauseJustPressed(), true, 'Start button must trigger isPauseJustPressed');

// Select / Back button (button 8) -> Instant Restart
input.clearFrameTriggers();
mockGamepads = [createMockGamepad({ pressedButtons: [8] })];
input.update(1 / 60);
assert.strictEqual(input.isRestartJustPressed(), true, 'Select/Back button must trigger isRestartJustPressed');
console.log('✓ Test 8 Passed: Pause and Instant Restart verified.');

// -------------------------------------------------------------
// Test 9: Menu Navigation (D-Pad, Stick, Buttons A/B)
// -------------------------------------------------------------
console.log('Test 9: Menu Navigation Queries');
// D-Pad Left (button 14)
mockGamepads = [createMockGamepad({ pressedButtons: [14] })];
input.update(1 / 60);
assert.strictEqual(input.isMenuPrevJustPressed(), true, 'D-Pad Left must trigger isMenuPrevJustPressed');

// D-Pad Right (button 15)
input.clearFrameTriggers();
mockGamepads = [createMockGamepad({ pressedButtons: [15] })];
input.update(1 / 60);
assert.strictEqual(input.isMenuNextJustPressed(), true, 'D-Pad Right must trigger isMenuNextJustPressed');

// Confirm with Button A (button 0)
input.clearFrameTriggers();
mockGamepads = [createMockGamepad({ pressedButtons: [0] })];
input.update(1 / 60);
assert.strictEqual(input.isMenuConfirmJustPressed(), true, 'Button A must trigger isMenuConfirmJustPressed');

// Cancel with Button B (button 1)
input.clearFrameTriggers();
mockGamepads = [createMockGamepad({ pressedButtons: [1] })];
input.update(1 / 60);
assert.strictEqual(input.isMenuCancelJustPressed(), true, 'Button B must trigger isMenuCancelJustPressed');
console.log('✓ Test 9 Passed: Menu navigation verified.');

// -------------------------------------------------------------
// Test 10: Haptic Vibration Engine
// -------------------------------------------------------------
console.log('Test 10: Haptic Dual-Rumble Vibration');
let vibrationPlayed = false;
mockGamepads = [{
    connected: true,
    vibrationActuator: {
        playEffect: (type, params) => {
            if (type === 'dual-rumble' && params.duration === 150 && params.strongMagnitude === 0.8) {
                vibrationPlayed = true;
            }
            return Promise.resolve();
        }
    }
}];
input.update(1 / 60);
input.vibrate(150, 0.8, 0.6);
assert.strictEqual(vibrationPlayed, true, 'input.vibrate must trigger vibrationActuator with dual-rumble params');
console.log('✓ Test 10 Passed: Haptic Dual-Rumble verified.');

console.log('\n======================================================');
console.log('🎉 ALL 10 GAMEPAD INTEGRATION TESTS PASSED PERFECTLY!');
console.log('======================================================\n');
