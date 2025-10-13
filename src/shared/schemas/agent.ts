import { z } from "zod";

export const RegisterBlockSchema = z
  .object({
    export: z.string().min(1).default("registerAgentPlugin"),
    options: z.record(z.unknown()).optional()
  })
  .default({ export: "registerAgentPlugin" });

export const EnsureBlockSchema = z
  .object({
    export: z.string().min(1)
  })
  .optional();

export const AgentMetadataSchema = z
  .object({
    label: z.string().optional(),
    description: z.string().optional(),
    tags: z.array(z.string()).optional()
  })
  .optional();

export const AgentConfigSchema = z.object({
  id: z.string().min(1, "id 不能为空"),
  module: z.string().min(1, "module 不能为空"),
  register: RegisterBlockSchema,
  ensure: EnsureBlockSchema,
  defaultAgentOptions: z.record(z.unknown()).optional(),
  defaultRunOptions: z.record(z.unknown()).optional(),
  metadata: AgentMetadataSchema,
  configVersion: z.string().regex(/^v\d+(?:\.\d+)*$/, "configVersion 应为 vN 格式").optional()
});

export type AgentConfigSchemaType = typeof AgentConfigSchema;
export type AgentConfig = z.infer<typeof AgentConfigSchema>;
