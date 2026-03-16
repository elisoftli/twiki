import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import os from 'os';
import {
  findStepOutputMatch,
  templatizePathWithStepOutputs,
  templatizeArgsWithStepOutputs,
  containsStepOutputRef,
  resolveStepOutputRefs,
  resolveArgsWithStepOutputs,
  templatizePath,
  resolvePath,
  type StepOutputsMap,
} from '../path-template.utils';
import type { PathResolutionContext } from '../../interfaces/recipe.interface';

// Get current username for tests that depend on OS username
const currentUsername = os.userInfo().username;

// Mock Windows environment variables for cross-platform testing
const mockEnvVars = {
  LOCALAPPDATA: 'C:\\Users\\TestUser\\AppData\\Local',
  APPDATA: 'C:\\Users\\TestUser\\AppData\\Roaming',
  PROGRAMDATA: 'C:\\ProgramData',
  PUBLIC: 'C:\\Users\\Public',
  USERPROFILE: 'C:\\Users\\TestUser',
};

// Store original env vars to restore after tests
const originalEnv: Record<string, string | undefined> = {};

beforeAll(() => {
  // Save original values and set mocks
  for (const [key, value] of Object.entries(mockEnvVars)) {
    originalEnv[key] = process.env[key];
    process.env[key] = value;
  }
});

afterAll(() => {
  // Restore original values
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

// Helper to create a step outputs map
function createStepOutputs(entries: Array<[number, Record<string, unknown>]>): StepOutputsMap {
  return new Map(entries);
}

// Default path context for testing (only game-specific paths)
const defaultContext: PathResolutionContext = {
  installPath: 'D:\\Games\\MyGame',
  launcherInstallPath: 'C:\\Program Files\\Steam',
};

describe('Step Output Reference Functions', () => {
  describe('findStepOutputMatch', () => {
    it('should find exact match for downloadPath', () => {
      const stepOutputs = createStepOutputs([
        [1, { downloadPath: 'C:\\Downloads\\file-123.zip' }],
      ]);

      const result = findStepOutputMatch('C:\\Downloads\\file-123.zip', stepOutputs);

      expect(result).toEqual({
        stepNumber: 1,
        field: 'downloadPath',
        remainder: '',
      });
    });

    it('should find match with remainder path', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\file-123.zip_extracted' }],
      ]);

      const result = findStepOutputMatch(
        'C:\\Downloads\\file-123.zip_extracted\\subfolder\\file.dll',
        stepOutputs
      );

      expect(result).toEqual({
        stepNumber: 1,
        field: 'extractPath',
        remainder: '\\subfolder\\file.dll',
      });
    });

    it('should match case-insensitively', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\File-123.zip_extracted' }],
      ]);

      const result = findStepOutputMatch(
        'c:\\downloads\\file-123.zip_extracted\\data.ini',
        stepOutputs
      );

      expect(result).not.toBeNull();
      expect(result?.field).toBe('extractPath');
    });

    it('should find match in array field (extractedFiles)', () => {
      const stepOutputs = createStepOutputs([
        [1, {
          extractedFiles: [
            'C:\\Downloads\\extracted\\file1.dll',
            'C:\\Downloads\\extracted\\file2.ini',
          ],
        }],
      ]);

      const result = findStepOutputMatch('C:\\Downloads\\extracted\\file2.ini', stepOutputs);

      expect(result).toEqual({
        stepNumber: 1,
        field: 'extractedFiles[1]',
        remainder: '',
      });
    });

    it('should return null when no match found', () => {
      const stepOutputs = createStepOutputs([
        [1, { downloadPath: 'C:\\Downloads\\other-file.zip' }],
      ]);

      const result = findStepOutputMatch('D:\\Completely\\Different\\Path', stepOutputs);

      expect(result).toBeNull();
    });

    it('should match from correct step when multiple steps have outputs', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\first-123.zip_extracted' }],
        [2, { extractPath: 'C:\\Downloads\\second-456.zip_extracted' }],
      ]);

      const result = findStepOutputMatch(
        'C:\\Downloads\\second-456.zip_extracted\\file.dll',
        stepOutputs
      );

      expect(result?.stepNumber).toBe(2);
      expect(result?.field).toBe('extractPath');
    });

    it('should prefer longer/more specific matches', () => {
      const stepOutputs = createStepOutputs([
        [1, { downloadPath: 'C:\\Downloads\\file.zip' }],
        [1, { extractPath: 'C:\\Downloads\\file.zip_extracted' }],
      ]);

      const result = findStepOutputMatch(
        'C:\\Downloads\\file.zip_extracted\\data.ini',
        stepOutputs
      );

      // Should match extractPath (more specific) not downloadPath
      expect(result?.field).toBe('extractPath');
    });
  });

  describe('templatizePathWithStepOutputs', () => {
    it('should templatize path matching step output', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Users\\testuser\\AppData\\Roaming\\pcgw-client\\downloads\\patch-123.zip_extracted' }],
      ]);

      const result = templatizePathWithStepOutputs(
        'C:\\Users\\testuser\\AppData\\Roaming\\pcgw-client\\downloads\\patch-123.zip_extracted\\mod.dll',
        defaultContext,
        stepOutputs
      );

      expect(result).toBe('{STEP_1_OUTPUT.extractPath}\\mod.dll');
    });

    it('should fall back to static templates when no step output matches', () => {
      const stepOutputs = createStepOutputs([]);

      const result = templatizePathWithStepOutputs(
        'D:\\Games\\MyGame\\data\\config.ini',
        defaultContext,
        stepOutputs
      );

      expect(result).toBe('{INSTALL_PATH}\\data\\config.ini');
    });

    it('should prioritize step outputs over static templates', () => {
      // Edge case: step output happens to be inside install path
      const stepOutputs = createStepOutputs([
        [1, { downloadPath: 'D:\\Games\\MyGame\\downloads\\file.zip' }],
      ]);

      const result = templatizePathWithStepOutputs(
        'D:\\Games\\MyGame\\downloads\\file.zip',
        defaultContext,
        stepOutputs
      );

      // Should use step output reference, not INSTALL_PATH
      expect(result).toBe('{STEP_1_OUTPUT.downloadPath}');
    });

    it('should handle array index references', () => {
      const stepOutputs = createStepOutputs([
        [1, {
          extractedFiles: [
            'C:\\Downloads\\patch\\file1.dll',
            'C:\\Downloads\\patch\\file2.dll',
          ],
        }],
      ]);

      const result = templatizePathWithStepOutputs(
        'C:\\Downloads\\patch\\file2.dll',
        defaultContext,
        stepOutputs
      );

      expect(result).toBe('{STEP_1_OUTPUT.extractedFiles[1]}');
    });
  });

  describe('templatizeArgsWithStepOutputs', () => {
    it('should templatize nested path arguments', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\patch-123_extracted' }],
      ]);

      const args = {
        operations: [
          {
            sourcePath: 'C:\\Downloads\\patch-123_extracted\\mod.dll',
            destinationPath: 'D:\\Games\\MyGame\\mod.dll',
          },
          {
            sourcePath: 'C:\\Downloads\\patch-123_extracted\\config.ini',
            destinationPath: 'D:\\Games\\MyGame\\config.ini',
          },
        ],
      };

      const result = templatizeArgsWithStepOutputs(args, defaultContext, stepOutputs);

      expect(result.operations).toEqual([
        {
          sourcePath: '{STEP_1_OUTPUT.extractPath}\\mod.dll',
          destinationPath: '{INSTALL_PATH}\\mod.dll',
        },
        {
          sourcePath: '{STEP_1_OUTPUT.extractPath}\\config.ini',
          destinationPath: '{INSTALL_PATH}\\config.ini',
        },
      ]);
    });

    it('should preserve non-path values', () => {
      const stepOutputs = createStepOutputs([]);

      const args = {
        lineNumber: 42,
        content: 'some text content',
        enabled: true,
      };

      const result = templatizeArgsWithStepOutputs(args, defaultContext, stepOutputs);

      expect(result).toEqual(args);
    });

    it('should handle deeply nested structures', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\mod_extracted' }],
      ]);

      const args = {
        level1: {
          level2: {
            level3: {
              path: 'C:\\Downloads\\mod_extracted\\deep\\file.txt',
            },
          },
        },
      };

      const result = templatizeArgsWithStepOutputs(args, defaultContext, stepOutputs) as typeof args;

      expect(result.level1.level2.level3.path).toBe('{STEP_1_OUTPUT.extractPath}\\deep\\file.txt');
    });
  });

  describe('containsStepOutputRef', () => {
    it('should detect simple step output reference', () => {
      expect(containsStepOutputRef('{STEP_1_OUTPUT.extractPath}')).toBe(true);
    });

    it('should detect reference with remainder path', () => {
      expect(containsStepOutputRef('{STEP_1_OUTPUT.extractPath}\\subfolder\\file.dll')).toBe(true);
    });

    it('should detect array index reference', () => {
      expect(containsStepOutputRef('{STEP_2_OUTPUT.extractedFiles[0]}')).toBe(true);
    });

    it('should return false for non-step-output templates', () => {
      expect(containsStepOutputRef('{INSTALL_PATH}\\data')).toBe(false);
      expect(containsStepOutputRef('{CONFIG_PATH}')).toBe(false);
      expect(containsStepOutputRef('{USERNAME}')).toBe(false);
    });

    it('should return false for plain strings', () => {
      expect(containsStepOutputRef('C:\\Some\\Regular\\Path')).toBe(false);
      expect(containsStepOutputRef('just some text')).toBe(false);
    });

    it('should detect reference with multi-digit step number', () => {
      expect(containsStepOutputRef('{STEP_10_OUTPUT.downloadPath}')).toBe(true);
      expect(containsStepOutputRef('{STEP_99_OUTPUT.extractPath}')).toBe(true);
    });
  });

  describe('resolveStepOutputRefs', () => {
    it('should resolve simple step output reference', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\actual-path_extracted' }],
      ]);

      const result = resolveStepOutputRefs('{STEP_1_OUTPUT.extractPath}', stepOutputs);

      expect(result).toBe('C:\\Downloads\\actual-path_extracted');
    });

    it('should resolve reference with remainder path', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\mod_extracted' }],
      ]);

      const result = resolveStepOutputRefs(
        '{STEP_1_OUTPUT.extractPath}\\data\\config.ini',
        stepOutputs
      );

      expect(result).toBe('C:\\Downloads\\mod_extracted\\data\\config.ini');
    });

    it('should resolve array index reference', () => {
      const stepOutputs = createStepOutputs([
        [1, {
          extractedFiles: [
            'C:\\Downloads\\file0.dll',
            'C:\\Downloads\\file1.dll',
            'C:\\Downloads\\file2.dll',
          ],
        }],
      ]);

      const result = resolveStepOutputRefs('{STEP_1_OUTPUT.extractedFiles[2]}', stepOutputs);

      expect(result).toBe('C:\\Downloads\\file2.dll');
    });

    it('should resolve multiple references in one string', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\PathA' }],
        [2, { extractPath: 'C:\\PathB' }],
      ]);

      const result = resolveStepOutputRefs(
        'from {STEP_1_OUTPUT.extractPath} to {STEP_2_OUTPUT.extractPath}',
        stepOutputs
      );

      expect(result).toBe('from C:\\PathA to C:\\PathB');
    });

    it('should throw error when step not found', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\path' }],
      ]);

      expect(() => {
        resolveStepOutputRefs('{STEP_5_OUTPUT.extractPath}', stepOutputs);
      }).toThrow('Step 5 output not found');
    });

    it('should throw error when field not found', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\path' }],
      ]);

      expect(() => {
        resolveStepOutputRefs('{STEP_1_OUTPUT.nonExistentField}', stepOutputs);
      }).toThrow("Field 'nonExistentField' not found");
    });

    it('should throw error when array index out of bounds', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractedFiles: ['file1.dll', 'file2.dll'] }],
      ]);

      expect(() => {
        resolveStepOutputRefs('{STEP_1_OUTPUT.extractedFiles[10]}', stepOutputs);
      }).toThrow('Index 10 out of bounds');
    });

    it('should throw error when field value is not a string', () => {
      const stepOutputs = createStepOutputs([
        [1, { numericValue: 42 }],
      ]);

      expect(() => {
        resolveStepOutputRefs('{STEP_1_OUTPUT.numericValue}', stepOutputs);
      }).toThrow('is not a string');
    });
  });

  describe('resolveArgsWithStepOutputs', () => {
    it('should resolve step output refs and static templates', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\mod_extracted' }],
      ]);

      const args = {
        sourcePath: '{STEP_1_OUTPUT.extractPath}\\data.dll',
        destinationPath: '{INSTALL_PATH}\\mods\\data.dll',
      };

      const result = resolveArgsWithStepOutputs(args, defaultContext, stepOutputs);

      expect(result).toEqual({
        sourcePath: 'C:\\Downloads\\mod_extracted\\data.dll',
        destinationPath: 'D:\\Games\\MyGame\\mods\\data.dll',
      });
    });

    it('should resolve nested arrays of operations', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\patch_extracted' }],
      ]);

      const args = {
        operations: [
          {
            sourcePath: '{STEP_1_OUTPUT.extractPath}\\file1.dll',
            destinationPath: '{INSTALL_PATH}\\file1.dll',
          },
          {
            sourcePath: '{STEP_1_OUTPUT.extractPath}\\file2.ini',
            destinationPath: '{INSTALL_PATH}\\file2.ini',
          },
        ],
      };

      const result = resolveArgsWithStepOutputs(args, defaultContext, stepOutputs) as typeof args;

      expect(result.operations[0].sourcePath).toBe('C:\\Downloads\\patch_extracted\\file1.dll');
      expect(result.operations[0].destinationPath).toBe('D:\\Games\\MyGame\\file1.dll');
      expect(result.operations[1].sourcePath).toBe('C:\\Downloads\\patch_extracted\\file2.ini');
      expect(result.operations[1].destinationPath).toBe('D:\\Games\\MyGame\\file2.ini');
    });

    it('should preserve non-path values', () => {
      const stepOutputs = createStepOutputs([]);

      const args = {
        lineNumber: 100,
        content: 'SkipIntro=1',
        operationType: 'replaceLine',
      };

      const result = resolveArgsWithStepOutputs(args, defaultContext, stepOutputs);

      expect(result).toEqual(args);
    });

    it('should handle mixed content with refs and plain paths', () => {
      const stepOutputs = createStepOutputs([
        [1, { downloadPath: 'C:\\Downloads\\file.zip' }],
      ]);

      const args = {
        downloaded: '{STEP_1_OUTPUT.downloadPath}',
        installed: '{INSTALL_PATH}\\game.exe',
        config: '%APPDATA%\\MyGame\\settings.ini',
        plain: 'not a path',
      };

      const result = resolveArgsWithStepOutputs(args, defaultContext, stepOutputs);

      expect(result).toEqual({
        downloaded: 'C:\\Downloads\\file.zip',
        installed: 'D:\\Games\\MyGame\\game.exe',
        config: `${mockEnvVars.APPDATA}\\MyGame\\settings.ini`,
        plain: 'not a path',
      });
    });
  });

  describe('Integration: Full Round-Trip', () => {
    it('should templatize and resolve back to equivalent paths', () => {
      // Simulate recipe capture
      const captureStepOutputs = createStepOutputs([
        [1, {
          downloadPath: 'C:\\Users\\alice\\Downloads\\pcgw\\mod-999.zip',
          extractPath: 'C:\\Users\\alice\\Downloads\\pcgw\\mod-999.zip_extracted',
        }],
      ]);

      const captureContext: PathResolutionContext = {
        installPath: 'E:\\Steam\\MyGame',
        launcherInstallPath: 'C:\\Program Files\\Steam',
      };

      const originalArgs = {
        operations: [
          {
            sourcePath: 'C:\\Users\\alice\\Downloads\\pcgw\\mod-999.zip_extracted\\patch.dll',
            destinationPath: 'E:\\Steam\\MyGame\\patch.dll',
          },
        ],
      };

      // Templatize (recipe capture)
      const templatedArgs = templatizeArgsWithStepOutputs(
        originalArgs,
        captureContext,
        captureStepOutputs
      );

      expect((templatedArgs.operations as Array<{ sourcePath: string }>)[0].sourcePath).toBe(
        '{STEP_1_OUTPUT.extractPath}\\patch.dll'
      );

      // Simulate replay on different machine
      const replayStepOutputs = createStepOutputs([
        [1, {
          downloadPath: 'C:\\Users\\bob\\AppData\\Roaming\\pcgw\\mod-777.zip',
          extractPath: 'C:\\Users\\bob\\AppData\\Roaming\\pcgw\\mod-777.zip_extracted',
        }],
      ]);

      const replayContext: PathResolutionContext = {
        installPath: 'D:\\Games\\MyGame',
        launcherInstallPath: 'D:\\Steam',
      };

      // Resolve (recipe replay)
      const resolvedArgs = resolveArgsWithStepOutputs(
        templatedArgs,
        replayContext,
        replayStepOutputs
      );

      // Should resolve to bob's paths, not alice's
      expect((resolvedArgs.operations as Array<{ sourcePath: string; destinationPath: string }>)[0]).toEqual({
        sourcePath: 'C:\\Users\\bob\\AppData\\Roaming\\pcgw\\mod-777.zip_extracted\\patch.dll',
        destinationPath: 'D:\\Games\\MyGame\\patch.dll',
      });
    });

    it('should handle complex multi-step recipe', () => {
      // Simulate a recipe with multiple download steps
      const stepOutputs = createStepOutputs([
        [1, {
          downloadPath: 'C:\\Downloads\\base-mod.zip',
          extractPath: 'C:\\Downloads\\base-mod.zip_extracted',
        }],
        [3, {
          downloadPath: 'C:\\Downloads\\extra-textures.zip',
          extractPath: 'C:\\Downloads\\extra-textures.zip_extracted',
        }],
      ]);

      const args = {
        operations: [
          {
            sourcePath: '{STEP_1_OUTPUT.extractPath}\\core.dll',
            destinationPath: '{INSTALL_PATH}\\core.dll',
          },
          {
            sourcePath: '{STEP_3_OUTPUT.extractPath}\\textures\\hd.pak',
            destinationPath: '{INSTALL_PATH}\\data\\textures\\hd.pak',
          },
        ],
      };

      const result = resolveArgsWithStepOutputs(args, defaultContext, stepOutputs);

      expect((result.operations as Array<{ sourcePath: string; destinationPath: string }>)[0].sourcePath).toBe(
        'C:\\Downloads\\base-mod.zip_extracted\\core.dll'
      );
      expect((result.operations as Array<{ sourcePath: string; destinationPath: string }>)[1].sourcePath).toBe(
        'C:\\Downloads\\extra-textures.zip_extracted\\textures\\hd.pak'
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty step outputs map', () => {
      const stepOutputs = createStepOutputs([]);

      const result = findStepOutputMatch('C:\\Some\\Path', stepOutputs);
      expect(result).toBeNull();
    });

    it('should handle empty string path', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\mod' }],
      ]);

      const result = findStepOutputMatch('', stepOutputs);
      expect(result).toBeNull();
    });

    it('should handle path with forward slashes', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:/Downloads/mod_extracted' }],
      ]);

      // Input uses backslashes but stored uses forward slashes
      const result = findStepOutputMatch(
        'C:\\Downloads\\mod_extracted\\file.dll',
        stepOutputs
      );

      // Should still match after normalization
      expect(result).not.toBeNull();
      expect(result?.field).toBe('extractPath');
    });

    it('should handle step output with special characters in path', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\mod (1)_extracted' }],
      ]);

      const result = templatizePathWithStepOutputs(
        'C:\\Downloads\\mod (1)_extracted\\file.dll',
        defaultContext,
        stepOutputs
      );

      expect(result).toBe('{STEP_1_OUTPUT.extractPath}\\file.dll');
    });

    it('should not match partial path segments', () => {
      const stepOutputs = createStepOutputs([
        [1, { extractPath: 'C:\\Downloads\\mod' }],
      ]);

      // "C:\Downloads\modded" should NOT match "C:\Downloads\mod"
      const result = findStepOutputMatch('C:\\Downloads\\modded\\file.dll', stepOutputs);

      // This should be null because "modded" != "mod"
      // The path starts with "mod" but it's not a complete segment match
      expect(result).toBeNull();
    });

    it('should handle userInput field (non-path)', () => {
      const stepOutputs = createStepOutputs([
        [1, { userInput: 'ultra' }],
      ]);

      const result = resolveStepOutputRefs(
        'Setting quality to {STEP_1_OUTPUT.userInput}',
        stepOutputs
      );

      expect(result).toBe('Setting quality to ultra');
    });
  });
});

describe('Windows Environment Variable Templates', () => {
  describe('templatizePath with env vars', () => {
    it('should templatize path in %LOCALAPPDATA%', () => {
      const result = templatizePath(
        `${mockEnvVars.LOCALAPPDATA}\\MyGame\\settings.ini`,
        defaultContext
      );

      expect(result).toBe('%LOCALAPPDATA%\\MyGame\\settings.ini');
    });

    it('should templatize path in %APPDATA%', () => {
      const result = templatizePath(
        `${mockEnvVars.APPDATA}\\MyGame\\config.ini`,
        defaultContext
      );

      expect(result).toBe('%APPDATA%\\MyGame\\config.ini');
    });

    it('should prefer more specific env var (%LOCALAPPDATA% over %USERPROFILE%)', () => {
      // %LOCALAPPDATA% is more specific than %USERPROFILE%
      const result = templatizePath(
        `${mockEnvVars.LOCALAPPDATA}\\MyGame\\data.ini`,
        defaultContext
      );

      expect(result).toBe('%LOCALAPPDATA%\\MyGame\\data.ini');
      expect(result).not.toContain('%USERPROFILE%');
    });

    it('should templatize path in %USERPROFILE% when no more specific match', () => {
      const result = templatizePath(
        `${mockEnvVars.USERPROFILE}\\Desktop\\game_shortcut.lnk`,
        defaultContext
      );

      expect(result).toBe('%USERPROFILE%\\Desktop\\game_shortcut.lnk');
    });

    it('should prefer {INSTALL_PATH} over env vars for paths in game directory', () => {
      const result = templatizePath(
        'D:\\Games\\MyGame\\config\\settings.ini',
        defaultContext
      );

      expect(result).toBe('{INSTALL_PATH}\\config\\settings.ini');
    });
  });

  describe('templatizePath with launcher install path', () => {
    it('should templatize path in launcher directory', () => {
      const result = templatizePath(
        'C:\\Program Files\\Steam\\userdata\\12345\\config.vdf',
        defaultContext
      );

      expect(result).toBe('{LAUNCHER_INSTALL_PATH}\\userdata\\12345\\config.vdf');
    });

    it('should prefer {INSTALL_PATH} over {LAUNCHER_INSTALL_PATH}', () => {
      // If game is inside launcher directory, install path should win
      const context: PathResolutionContext = {
        installPath: 'C:\\Program Files\\Steam\\steamapps\\common\\MyGame',
        launcherInstallPath: 'C:\\Program Files\\Steam',
      };

      const result = templatizePath(
        'C:\\Program Files\\Steam\\steamapps\\common\\MyGame\\data.pak',
        context
      );

      expect(result).toBe('{INSTALL_PATH}\\data.pak');
    });
  });

  describe('resolvePath with env vars', () => {
    it('should resolve %LOCALAPPDATA% template', () => {
      const result = resolvePath('%LOCALAPPDATA%\\MyGame\\settings.ini', defaultContext);

      expect(result).toBe(`${mockEnvVars.LOCALAPPDATA}\\MyGame\\settings.ini`);
    });

    it('should resolve %APPDATA% template', () => {
      const result = resolvePath('%APPDATA%\\MyGame\\config.ini', defaultContext);

      expect(result).toBe(`${mockEnvVars.APPDATA}\\MyGame\\config.ini`);
    });

    it('should resolve {LAUNCHER_INSTALL_PATH} template', () => {
      const result = resolvePath('{LAUNCHER_INSTALL_PATH}\\userdata\\config.vdf', defaultContext);

      expect(result).toBe('C:\\Program Files\\Steam\\userdata\\config.vdf');
    });

    it('should resolve mixed templates', () => {
      const result = resolvePath('{INSTALL_PATH}\\game.exe', defaultContext);

      expect(result).toBe('D:\\Games\\MyGame\\game.exe');
    });
  });

  describe('Round-trip with env vars', () => {
    it('should correctly round-trip paths using env vars', () => {
      const aliceContext: PathResolutionContext = {
        installPath: 'E:\\Steam\\Games\\MyGame',
        launcherInstallPath: 'E:\\Steam',
      };

      // Templatize a path in LOCALAPPDATA
      const configPath = `${mockEnvVars.LOCALAPPDATA}\\MyGame\\config.ini`;
      const templated = templatizePath(configPath, aliceContext);

      expect(templated).toBe('%LOCALAPPDATA%\\MyGame\\config.ini');

      // Resolve on same or different machine - uses current user's env vars
      const bobContext: PathResolutionContext = {
        installPath: 'D:\\Games\\MyGame',
        launcherInstallPath: 'D:\\Steam',
      };

      const resolved = resolvePath(templated, bobContext);

      // Should resolve to current machine's LOCALAPPDATA (which is the same in tests)
      expect(resolved).toBe(`${mockEnvVars.LOCALAPPDATA}\\MyGame\\config.ini`);
    });

    it('should correctly round-trip install path and launcher path', () => {
      const context: PathResolutionContext = {
        installPath: 'D:\\Games\\MyGame',
        launcherInstallPath: 'C:\\Program Files\\Steam',
      };

      // Test install path
      const gameFile = templatizePath('D:\\Games\\MyGame\\data\\level.pak', context);
      expect(gameFile).toBe('{INSTALL_PATH}\\data\\level.pak');
      expect(resolvePath(gameFile, context)).toBe('D:\\Games\\MyGame\\data\\level.pak');

      // Test launcher path
      const launcherFile = templatizePath('C:\\Program Files\\Steam\\userdata\\123\\config.vdf', context);
      expect(launcherFile).toBe('{LAUNCHER_INSTALL_PATH}\\userdata\\123\\config.vdf');
      expect(resolvePath(launcherFile, context)).toBe('C:\\Program Files\\Steam\\userdata\\123\\config.vdf');
    });
  });

  describe('Username fallback', () => {
    it('should prefer %USERPROFILE% over {USERNAME} for paths under user profile', () => {
      const context: PathResolutionContext = {
        installPath: 'D:\\Games\\MyGame',
        launcherInstallPath: 'C:\\Program Files\\Steam',
      };

      // Paths under USERPROFILE should use %USERPROFILE%, not {USERNAME}
      const result = templatizePath(`${mockEnvVars.USERPROFILE}\\SomeRandomFolder\\file.txt`, context);

      // Should use %USERPROFILE% since it's more specific than {USERNAME}
      expect(result).toBe('%USERPROFILE%\\SomeRandomFolder\\file.txt');
    });

    it('should resolve {USERNAME} back to actual username', () => {
      const result = resolvePath('C:\\Users\\{USERNAME}\\Desktop\\file.txt', defaultContext);

      expect(result).toBe(`C:\\Users\\${currentUsername}\\Desktop\\file.txt`);
    });
  });
});
