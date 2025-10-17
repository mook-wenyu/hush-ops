declare module "@fastify/multipart" {
  import type { FastifyPluginCallback } from "fastify";
  const multipart: FastifyPluginCallback;
  export default multipart;
}

declare module "fastify" {
  interface FastifyRequest {
    parts: () => AsyncIterable<{ type: string; file?: NodeJS.ReadableStream; filename?: string; fieldname?: string; encoding?: string; mimetype?: string; value?: string | Buffer }>;
  }
}
