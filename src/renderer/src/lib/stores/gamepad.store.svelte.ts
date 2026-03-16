import { inputRouter } from '$lib/gamepad';
import { focusManager } from '$lib/gamepad';
import type { Direction, GamepadFrame } from '$lib/gamepad';

const STICK_DEADZONE = 0.3;
const MOUSE_MOVE_THRESHOLD = 5;

function createGamepadStore() {
  let isControllerMode = $state(false);
  let connectedGamepads = $state(0);
  let activeGamepadIndex = $state<number | null>(null);
  // Not reactive — only consumed by inputRouter.processFrame() in the same polling tick.
  // Using $state with Set objects inside a deep proxy can cause issues.
  let currentFrame: GamepadFrame = {
    justPressed: new Set(),
    held: new Set(),
    leftStickDir: null,
    rightStickX: 0,
    rightStickY: 0,
  };

  // Internal state (not reactive)
  let prevButtons = new Map<number, Set<number>>();
  let prevLeftStickDir = new Map<number, Direction | null>();
  let rafId: number | null = null;
  let lowFreqTimerId: ReturnType<typeof setInterval> | null = null;
  let mouseMoveAccum = 0;
  let lastMouseX = 0;
  let lastMouseY = 0;
  let disposed = false;

  // --- Mode switching ---

  function switchToControllerMode() {
    if (isControllerMode) return;
    isControllerMode = true;
    document.body.classList.add('gamepad-active');
    mouseMoveAccum = 0;
    startHighFreqPolling();
    stopLowFreqPolling();
    // Focus first interactive element in the main content area (not the sidebar)
    const main = document.querySelector<HTMLElement>('main, [role="main"]');
    focusManager.focusFirst(main);
  }

  function switchToMouseMode() {
    if (!isControllerMode) return;
    isControllerMode = false;
    document.body.classList.remove('gamepad-active');
    focusManager.currentFocused = null;
    stopHighFreqPolling();
    startLowFreqPolling();
  }

  function handleMouseMove(e: MouseEvent) {
    if (!isControllerMode) {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      return;
    }
    mouseMoveAccum += Math.abs(e.clientX - lastMouseX) + Math.abs(e.clientY - lastMouseY);
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    if (mouseMoveAccum > MOUSE_MOVE_THRESHOLD) {
      switchToMouseMode();
    }
  }

  function handleKeyDown() {
    if (isControllerMode) {
      switchToMouseMode();
    }
  }

  // --- Gamepad connection events ---

  function handleGamepadConnected(e: GamepadEvent) {
    connectedGamepads++;
    if (activeGamepadIndex === null) {
      activeGamepadIndex = e.gamepad.index;
    }
    // Start low-freq polling to detect first button press
    if (!isControllerMode && !lowFreqTimerId) {
      startLowFreqPolling();
    }
  }

  function handleGamepadDisconnected(e: GamepadEvent) {
    connectedGamepads = Math.max(0, connectedGamepads - 1);
    prevButtons.delete(e.gamepad.index);
    prevLeftStickDir.delete(e.gamepad.index);
    if (activeGamepadIndex === e.gamepad.index) {
      // Switch to another connected gamepad or null
      const gamepads = navigator.getGamepads();
      activeGamepadIndex = null;
      for (const gp of gamepads) {
        if (gp && gp.index !== e.gamepad.index) {
          activeGamepadIndex = gp.index;
          break;
        }
      }
    }
    if (connectedGamepads === 0 && isControllerMode) {
      switchToMouseMode();
    }
  }

  // --- Polling loops ---

  function readGamepad(): GamepadFrame | null {
    const gamepads = navigator.getGamepads();
    if (!gamepads) return null;

    // Find the active gamepad, or any with activity
    let gp: Gamepad | null = null;
    if (activeGamepadIndex !== null) {
      gp = gamepads[activeGamepadIndex] ?? null;
    }

    // Check all gamepads for activity (multi-gamepad support)
    for (const pad of gamepads) {
      if (!pad) continue;
      if (pad.index === activeGamepadIndex) continue;
      // Check if this gamepad has any button pressed
      if (pad.buttons.some((b) => b.pressed)) {
        activeGamepadIndex = pad.index;
        gp = pad;
        break;
      }
    }

    if (!gp) return null;

    const prev = prevButtons.get(gp.index) ?? new Set<number>();
    const justPressed = new Set<number>();
    const held = new Set<number>();

    for (let i = 0; i < gp.buttons.length; i++) {
      if (gp.buttons[i].pressed) {
        held.add(i);
        if (!prev.has(i)) {
          justPressed.add(i);
        }
      }
    }

    // Save current button state
    prevButtons.set(gp.index, held);

    // Left stick direction with deadzone and edge detection
    let leftStickDir: Direction | null = null;
    const lx = gp.axes[0] ?? 0;
    const ly = gp.axes[1] ?? 0;
    if (Math.abs(lx) > STICK_DEADZONE || Math.abs(ly) > STICK_DEADZONE) {
      if (Math.abs(lx) > Math.abs(ly)) {
        leftStickDir = lx > 0 ? 'right' : 'left';
      } else {
        leftStickDir = ly > 0 ? 'down' : 'up';
      }
    }

    // Edge detection for stick direction (treat as repeat for the input router)
    const prevDir = prevLeftStickDir.get(gp.index) ?? null;
    prevLeftStickDir.set(gp.index, leftStickDir);

    // Right stick
    const rightStickX = gp.axes[2] ?? 0;
    const rightStickY = gp.axes[3] ?? 0;

    return {
      justPressed,
      held,
      leftStickDir,
      rightStickX,
      rightStickY,
    };
  }

  function pollFrame() {
    if (disposed) return;
    const frame = readGamepad();
    if (frame) {
      currentFrame = frame;
      inputRouter.processFrame(frame, isControllerMode);
    }
    rafId = requestAnimationFrame(pollFrame);
  }

  function startHighFreqPolling() {
    if (rafId !== null) return;
    rafId = requestAnimationFrame(pollFrame);
  }

  function stopHighFreqPolling() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  function pollLowFreq() {
    if (disposed || isControllerMode) return;
    const frame = readGamepad();
    if (frame && frame.justPressed.size > 0) {
      switchToControllerMode();
    }
  }

  function startLowFreqPolling() {
    if (lowFreqTimerId !== null) return;
    lowFreqTimerId = setInterval(pollLowFreq, 500);
  }

  function stopLowFreqPolling() {
    if (lowFreqTimerId !== null) {
      clearInterval(lowFreqTimerId);
      lowFreqTimerId = null;
    }
  }

  // --- Lifecycle ---

  function init() {
    disposed = false;

    window.addEventListener('gamepadconnected', handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', handleGamepadDisconnected);
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    window.addEventListener('keydown', handleKeyDown);

    // Check for already-connected gamepads
    const gamepads = navigator.getGamepads();
    for (const gp of gamepads) {
      if (gp) {
        connectedGamepads++;
        if (activeGamepadIndex === null) {
          activeGamepadIndex = gp.index;
        }
      }
    }

    if (connectedGamepads > 0) {
      startLowFreqPolling();
    }
  }

  function dispose() {
    disposed = true;
    stopHighFreqPolling();
    stopLowFreqPolling();

    window.removeEventListener('gamepadconnected', handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', handleGamepadDisconnected);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('keydown', handleKeyDown);

    prevButtons.clear();
    prevLeftStickDir.clear();
    focusManager.reset();
    inputRouter.reset();

    isControllerMode = false;
    connectedGamepads = 0;
    activeGamepadIndex = null;
  }

  return {
    get isControllerMode() {
      return isControllerMode;
    },
    get connectedGamepads() {
      return connectedGamepads;
    },
    get activeGamepadIndex() {
      return activeGamepadIndex;
    },
    get currentFrame() {
      return currentFrame;
    },
    init,
    dispose,
  };
}

export const gamepadStore = createGamepadStore();
