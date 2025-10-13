import { z } from "zod";

export const pluginCapabilitySchema = z.enum([
  "overlay",
  "side-panel",
  "command-launcher",
  "mcp-tool-invoke",
  "approval-helper",
  "metrics-consumer"
]);

export type PluginCapability = z.infer<typeof pluginCapabilitySchema>;

const pluginTargetSchema = z.enum(["web-ui", "mcp-ui", "headless"]);

const pluginManifestSchema = z
  .object({
    id: z.string().min(1),
    displayName: z.string().min(1),
    version: z.string().min(1),
    entry: z.string().min(1),
    style: z.string().optional(),
    capabilities: z.array(pluginCapabilitySchema).default([]),
    requiredMcpTools: z.array(z.string().min(1)).default([]),
    requiredEvents: z.array(z.string().min(1)).default([]),
    permissions: z
      .object({
        allowPlanMutation: z.boolean().optional(),
        allowTaskExecution: z.boolean().optional()
      })
      .partial()
      .default({}),
    targets: z.array(pluginTargetSchema).nonempty().default(["web-ui"]),
    environment: z
      .object({
        minUiVersion: z.string().optional(),
        minCoreVersion: z.string().optional()
      })
      .partial()
      .optional(),
    requirements: z
      .object({
        streamableHttp: z.boolean().optional()
      })
      .partial()
      .optional()
  })
  .passthrough();

export type PluginManifest = z.infer<typeof pluginManifestSchema>;

export function parsePluginManifest(input: unknown): PluginManifest {
  return pluginManifestSchema.parse(input);
}
