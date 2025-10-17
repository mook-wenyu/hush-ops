// Vitest stub for @fastify/multipart
// Provides a no-op Fastify plugin to satisfy server.ts registration in tests.
export default function multipartStub(instance: any, _opts?: any, done?: (err?: Error) => void) {
  // no-op: do not modify instance in unit tests
  if (typeof done === 'function') done();
}
