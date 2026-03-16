/** Directional input from D-pad or left stick */
export type Direction = 'up' | 'down' | 'left' | 'right';

/** Standard gamepad button indices (Xbox layout) */
export const GamepadButton = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  LT: 6,
  RT: 7,
  Select: 8,
  Start: 9,
  LeftStick: 10,
  RightStick: 11,
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;

/** Per-frame snapshot of gamepad state with edge detection */
export interface GamepadFrame {
  /** Buttons that transitioned from released to pressed this frame */
  justPressed: Set<number>;
  /** Buttons currently held down */
  held: Set<number>;
  /** Directional input from left stick (coerced to D-pad) */
  leftStickDir: Direction | null;
  /** Right stick X axis value (-1 to 1) */
  rightStickX: number;
  /** Right stick Y axis value (-1 to 1) */
  rightStickY: number;
}
