/**
 * Types for tool formatter system.
 */

import type { ToolIconType, ToolOperation } from '../../interfaces/tool-display.interface';

/**
 * Context passed to formatters with shared utilities and operations array.
 */
export interface FormatterContext {
  /** The operations array to populate */
  operations: ToolOperation[];
}

/**
 * A structured formatter function that produces operations for rich UI display.
 */
export type StructuredFormatter = (
  args: Record<string, unknown>,
  context: FormatterContext
) => void;

/**
 * A simple formatter function that produces a text description.
 */
export type SimpleFormatter = (args: Record<string, unknown>) => string;

/**
 * Tool display configuration.
 */
export interface ToolConfig {
  displayName: string;
  iconType: ToolIconType;
}

/**
 * Registry entry for a tool formatter.
 */
export interface FormatterEntry {
  config: ToolConfig;
  formatSimple: SimpleFormatter;
  formatStructured: StructuredFormatter;
}

/**
 * Registry of tool formatters.
 */
export type FormatterRegistry = Record<string, FormatterEntry>;
