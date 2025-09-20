import type {
  FastifyBaseLogger,
  FastifyInstance,
  FastifyPluginAsync,
  FastifyPluginOptions,
  RawReplyDefaultExpression,
  RawRequestDefaultExpression,
  RawServerDefault
} from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';

export type FastifyZodPlugin<Options extends FastifyPluginOptions = Record<never, never>> =
  FastifyPluginAsync<Options, RawServerDefault, ZodTypeProvider>;

export type FastifyZodInstance = FastifyInstance<
  RawServerDefault,
  RawRequestDefaultExpression<RawServerDefault>,
  RawReplyDefaultExpression<RawServerDefault>,
  FastifyBaseLogger,
  ZodTypeProvider
>;
