/**
 * Pre-flight Configuration Checks
 *
 * Defines configuration requirements for tools and provides utilities
 * to check if those requirements are satisfied before tool execution.
 */

import type { Settings } from '../../../../main/interfaces';

// =============================================================================
// Types
// =============================================================================

/** Types of configurations that tools may require */
export type ConfigurationType = 'reshade-installer' | 'nexusmods-api-key';

/** Information about a missing configuration */
export interface MissingConfiguration {
  type: ConfigurationType;
  toolName: string;
  toolId: string;
}

/** Configuration metadata for UI display */
export interface ConfigurationInfo {
  title: string;
  description: string;
}

// =============================================================================
// Registry
// =============================================================================

/**
 * Registry mapping tool names to their configuration requirements.
 * Add entries here when new tools require pre-configuration.
 */
export const TOOL_CONFIG_REQUIREMENTS: Record<string, ConfigurationType[]> = {
  'install-reshade-tool': ['reshade-installer'],
};

/**
 * Display information for each configuration type.
 */
export const CONFIGURATION_INFO: Record<ConfigurationType, ConfigurationInfo> = {
  'reshade-installer': {
    title: 'ReShade Installer Required',
    description:
      'This tool requires the ReShade installer to be configured. ' +
      'Please select the path to ReShade_Setup_Addon.exe to continue.',
  },
  'nexusmods-api-key': {
    title: 'NexusMods API Key Required',
    description:
      'A NexusMods Premium API key is required for direct mod downloads. ' +
      'Please enter your API key to continue.',
  },
};

// =============================================================================
// Check Functions
// =============================================================================

/**
 * Check if a specific configuration type is satisfied.
 */
export function isConfigurationSatisfied(
  type: ConfigurationType,
  settings: Settings | null | undefined
): boolean {
  if (!settings) return false;

  switch (type) {
    case 'reshade-installer':
      return !!settings.graphicsMods?.reshadeInstallerPath;
    case 'nexusmods-api-key':
      return !!settings.integrations?.nexusMods?.apiKey;
    default:
      return true;
  }
}

/**
 * Get missing configurations for a specific tool.
 * Returns an array of configuration types that are not satisfied.
 */
export function getMissingConfigurations(
  toolName: string,
  settings: Settings | null | undefined
): ConfigurationType[] {
  const requirements = TOOL_CONFIG_REQUIREMENTS[toolName];
  if (!requirements || requirements.length === 0) {
    return [];
  }

  return requirements.filter((req) => !isConfigurationSatisfied(req, settings));
}

/**
 * Check if a tool has all its configuration requirements satisfied.
 */
export function isToolConfigured(
  toolName: string,
  settings: Settings | null | undefined
): boolean {
  return getMissingConfigurations(toolName, settings).length === 0;
}

/**
 * Get the display info for a configuration type.
 */
export function getConfigurationInfo(type: ConfigurationType): ConfigurationInfo {
  return CONFIGURATION_INFO[type];
}
