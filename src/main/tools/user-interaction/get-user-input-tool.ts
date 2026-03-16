import { createTool } from '../tool.factory';
import { z } from 'zod';
import { getUserInput } from './utils/get-user-input.utils';
import { getUserInputToolSchema } from '@twiki/shared';

type Input = z.infer<typeof getUserInputToolSchema.inputSchema>;

export const getUserInputTool = createTool({
  ...getUserInputToolSchema,
  execute: async (inputData) => {
    try {
      const { title, message, options } = inputData as unknown as Input;

      const result = await getUserInput({
        title,
        message,
        options,
      });

      return {
        success: true,
        message: `Received user input: "${result.userInput}"`,
        timestamp: result.timestamp,
        isRevertible: false,
        userInput: result.userInput,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to get user input: ${error instanceof Error ? error.message : String(error)}`,
        timestamp: new Date(),
        userInput: '',
      };
    }
  },
});
