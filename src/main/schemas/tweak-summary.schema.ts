import { z } from 'zod';

const TweakOperationStatusSchema = z.enum(['success', 'warning', 'error']).describe(`
success: Task fully completed with modifications made, OR system was already in the desired state (no changes needed because already configured correctly).
warning: Task could not be completed, was only partially completed, requires manual user steps, or is out of scope for automation.
error: Critical failure prevented any meaningful progress (required files/paths don't exist, system errors, tool failures).
`);

export const AgentResponseSchema = z.object({
  status: TweakOperationStatusSchema,
  message: z.string(),
});

export type AgentResponseSchemaType = z.infer<typeof AgentResponseSchema>;
