/**
 * Format Tool Call Utils Tests
 *
 * Tests for tool call formatting utilities:
 * - formatToolCall - simple text formatting
 * - formatToolCallStructured - structured display info
 * - Default formatting for unknown tools
 * - Formatter utils (truncate, extractFileName, etc.)
 */

import { describe, it, expect } from 'vitest';
import { formatToolCall, formatToolCallStructured } from '../format-tool-call.utils';
import {
  truncate,
  extractFileName,
  extractKeyName,
  shortenUrl,
  detectHoster,
  createEditable,
} from '../tool-formatters/formatter-utils';

// =============================================================================
// Formatter Utils Tests
// =============================================================================

describe('Formatter Utils', () => {
  describe('truncate', () => {
    it('should return string as-is if under max length', () => {
      expect(truncate('short', 10)).toBe('short');
    });

    it('should return string as-is if exactly max length', () => {
      expect(truncate('exactly10c', 10)).toBe('exactly10c');
    });

    it('should truncate and add ellipsis if over max length', () => {
      expect(truncate('this is a long string', 10)).toBe('this is...');
    });

    it('should handle empty string', () => {
      expect(truncate('', 10)).toBe('');
    });

    it('should handle max length of 3 (minimum for ellipsis)', () => {
      expect(truncate('hello', 3)).toBe('...');
    });
  });

  describe('extractFileName', () => {
    it('should extract filename from Unix path', () => {
      expect(extractFileName('/home/user/documents/file.txt')).toBe('file.txt');
    });

    it('should extract filename from Windows path', () => {
      expect(extractFileName('C:\\Users\\Admin\\Documents\\file.txt')).toBe('file.txt');
    });

    it('should handle mixed separators', () => {
      expect(extractFileName('C:/Users/Admin\\Documents/file.txt')).toBe('file.txt');
    });

    it('should return the path if no separators', () => {
      expect(extractFileName('file.txt')).toBe('file.txt');
    });

    it('should handle empty string', () => {
      expect(extractFileName('')).toBe('');
    });

    it('should handle path ending with separator', () => {
      // When path ends with separator, last element after split is empty string
      // The function returns the full path in this edge case
      expect(extractFileName('/path/to/dir/')).toBe('/path/to/dir/');
    });
  });

  describe('extractKeyName', () => {
    it('should extract last segment from registry path', () => {
      expect(extractKeyName('HKEY_CURRENT_USER\\Software\\MyApp\\Settings')).toBe('Settings');
    });

    it('should handle single segment', () => {
      expect(extractKeyName('HKEY_CURRENT_USER')).toBe('HKEY_CURRENT_USER');
    });

    it('should handle empty string', () => {
      expect(extractKeyName('')).toBe('');
    });
  });

  describe('shortenUrl', () => {
    it('should shorten GitHub repo URLs', () => {
      expect(shortenUrl('https://github.com/user/repo/releases/tag/v1.0')).toBe('user/repo/...');
    });

    it('should shorten GitHub repo URLs without extra path', () => {
      expect(shortenUrl('https://github.com/user/repo')).toBe('user/repo');
    });

    it('should strip www prefix', () => {
      expect(shortenUrl('https://www.example.com/page')).toBe('example.com/page');
    });

    it('should show host and last path segment for regular URLs', () => {
      expect(shortenUrl('https://nexusmods.com/skyrim/mods/12345')).toBe('nexusmods.com/12345');
    });

    it('should return just host for root URLs', () => {
      expect(shortenUrl('https://example.com')).toBe('example.com');
    });

    it('should return invalid URLs as-is when under max length', () => {
      // String is only 38 chars, under truncate limit of 40
      expect(shortenUrl('not a valid url but a long string here')).toBe('not a valid url but a long string here');
    });

    it('should truncate very long invalid URLs', () => {
      const longInvalidUrl = 'this is not a valid url and its a very long string that exceeds the maximum length';
      expect(shortenUrl(longInvalidUrl)).toBe('this is not a valid url and its a ver...');
    });
  });

  describe('detectHoster', () => {
    it('should detect GitHub', () => {
      expect(detectHoster('https://github.com/user/repo')).toBe('GitHub');
    });

    it('should detect Nexus Mods', () => {
      expect(detectHoster('https://www.nexusmods.com/skyrim/mods/123')).toBe('Nexus Mods');
    });

    it('should default to Direct for other URLs', () => {
      expect(detectHoster('https://example.com/download.zip')).toBe('Direct');
    });

    it('should return Direct for invalid URLs', () => {
      expect(detectHoster('not a url')).toBe('Direct');
    });
  });

  describe('createEditable', () => {
    it('should create editable content with default mode', () => {
      const result = createEditable('content');
      expect(result).toEqual({ value: 'content', mode: 'code', startLine: undefined });
    });

    it('should create editable content with text mode', () => {
      const result = createEditable('content', 'text');
      expect(result).toEqual({ value: 'content', mode: 'text', startLine: undefined });
    });

    it('should include start line when provided', () => {
      const result = createEditable('content', 'code', 42);
      expect(result).toEqual({ value: 'content', mode: 'code', startLine: 42 });
    });
  });
});

// =============================================================================
// Format Tool Call Tests
// =============================================================================

describe('formatToolCall', () => {
  it('should format known tool calls', () => {
    const result = formatToolCall('edit-ini-value', {
      path: 'C:\\Game\\config.ini',
      section: 'Graphics',
      key: 'Resolution',
      value: '1920x1080',
    });

    expect(result).toContain('config.ini');
  });

  it('should format unknown tools with default formatting', () => {
    const result = formatToolCall('unknown-custom-tool', {
      path: '/some/path',
      option: 'value',
    });

    expect(result).toContain('unknown custom tool');
    expect(result).toContain('path');
    expect(result).toContain('/some/path');
  });

  it('should handle empty args for unknown tools', () => {
    const result = formatToolCall('myTool', {});

    // With empty args, just the formatted name is returned
    // "myTool" becomes "my" (Tool suffix removed, camelCase converted)
    expect(result).toBe('my');
  });

  it('should filter out null/undefined args', () => {
    const result = formatToolCall('test-tool', {
      valid: 'value',
      nullValue: null,
      undefinedValue: undefined,
      emptyString: '',
    });

    expect(result).toContain('valid');
    expect(result).not.toContain('nullValue');
    expect(result).not.toContain('undefinedValue');
    expect(result).not.toContain('emptyString');
  });

  it('should truncate long argument values', () => {
    const longValue = 'a'.repeat(100);
    const result = formatToolCall('test-tool', { arg: longValue });

    expect(result.length).toBeLessThan(longValue.length + 50);
    expect(result).toContain('...');
  });

  it('should stringify object arguments', () => {
    const result = formatToolCall('test-tool', {
      config: { nested: true, value: 42 },
    });

    expect(result).toContain('config');
    expect(result).toContain('nested');
  });
});

// =============================================================================
// Format Tool Call Structured Tests
// =============================================================================

describe('formatToolCallStructured', () => {
  it('should return structured display info for known tools', () => {
    const result = formatToolCallStructured('edit-ini-value', {
      path: 'C:\\Game\\config.ini',
      section: 'Graphics',
      key: 'Resolution',
      value: '1920x1080',
    });

    expect(result.displayName).toBeDefined();
    expect(result.iconType).toBeDefined();
    expect(result.summary).toBeDefined();
    expect(result.operations).toBeDefined();
  });

  it('should create default structure for unknown tools', () => {
    const result = formatToolCallStructured('unknown-tool', {
      path: '/some/file.txt',
    });

    expect(result.displayName).toBe('unknown');
    expect(result.iconType).toBe('file');
    expect(result.operations).toHaveLength(1);
    expect(result.operations[0].type).toBe('path');
  });

  it('should handle unknown tools without path argument', () => {
    const result = formatToolCallStructured('unknown-tool', {
      option: 'value',
    });

    expect(result.displayName).toBe('unknown');
    expect(result.operations).toHaveLength(0);
  });

  it('should extract filename for path operations', () => {
    const result = formatToolCallStructured('unknown-tool', {
      path: 'C:\\Games\\MyGame\\config.ini',
    });

    const pathOp = result.operations[0] as { type: 'path'; fileName: string };
    expect(pathOp.fileName).toBe('config.ini');
  });

  it('should build summary from operations', () => {
    const result = formatToolCallStructured('edit-ini-value', {
      path: 'C:\\Game\\config.ini',
      section: 'Graphics',
      key: 'Resolution',
      value: '1920x1080',
    });

    expect(result.summary).toBeDefined();
    expect(typeof result.summary).toBe('string');
  });

  it('should handle registry tools', () => {
    const result = formatToolCallStructured('set-registry-value', {
      keyPath: 'HKEY_CURRENT_USER\\Software\\MyApp',
      valueName: 'Setting',
      value: 123,
      valueType: 'REG_DWORD',
    });

    expect(result.displayName).toBeDefined();
    expect(result.iconType).toBeDefined();
  });

  it('should format tool name by removing -tool suffix and converting dashes', () => {
    const result = formatToolCallStructured('my-custom-tool', {
      path: '/path/file.txt',
    });

    expect(result.displayName).toBe('my custom');
  });
});
