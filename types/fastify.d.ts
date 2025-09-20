import type { FastifyReply, FastifyRequest } from 'fastify';
import type { ServerDependencies } from '../src/server/dependencies.js';
import type { ServerConfig } from '../src/server/config.js';

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDependencies;
    config: ServerConfig;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
    authorizeAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<void | FastifyReply>;
  }
}
