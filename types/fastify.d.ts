import type {
  FastifyReply,
  FastifyRequest,
  FastifyPluginAsync,
  FastifyPluginOptions,
  RawServerDefault
} from 'fastify';
import type { Server as SocketIOServer } from 'socket.io';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { ServerDependencies } from '../src/server/dependencies.js';
import type { ServerConfig } from '../src/server/config.js';

export type FastifyZodPlugin<Options extends FastifyPluginOptions = Record<never, never>> =
  FastifyPluginAsync<Options, RawServerDefault, ZodTypeProvider>;

declare module 'fastify' {
  interface FastifyInstance {
    deps: ServerDependencies;
    config: ServerConfig;
    io: SocketIOServer;
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
    authorizeAdmin: (request: FastifyRequest, reply: FastifyReply) => Promise<FastifyReply | undefined>;
  }
}
