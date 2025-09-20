import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const promptResponseSchema = z.object({
  id: z.string().uuid(),
  language: z.enum(['romaji', 'english', 'kana']),
  displayText: z.string(),
  typingTarget: z.string(),
  tags: z.array(z.string()),
  isActive: z.boolean(),
  createdAt: z.string()
});

const createPromptBodySchema = z.object({
  language: z.enum(['romaji', 'english', 'kana']),
  displayText: z.string().min(1),
  typingTarget: z.string().min(1),
  tags: z.array(z.string()).optional()
});

const updatePromptBodySchema = createPromptBodySchema.partial().extend({
  isActive: z.boolean().optional()
});

const listPromptQuerySchema = z.object({
  language: z.enum(['romaji', 'english', 'kana']).optional(),
  active: z.coerce.boolean().optional()
});

function toPrismaLanguage(language: 'romaji' | 'english' | 'kana') {
  if (language === 'english') return 'ENGLISH';
  if (language === 'kana') return 'KANA';
  return 'ROMAJI';
}

function toPromptResponse(prompt: { id: string; language: string; displayText: string; typingTarget: string; tags: string[]; isActive: boolean; createdAt: Date }) {
  return {
    id: prompt.id,
    language: prompt.language.toLowerCase() as 'romaji' | 'english' | 'kana',
    displayText: prompt.displayText,
    typingTarget: prompt.typingTarget,
    tags: prompt.tags ?? [],
    isActive: prompt.isActive,
    createdAt: prompt.createdAt.toISOString()
  };
}

export const registerPromptRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/prompts', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      body: createPromptBodySchema,
      response: {
        201: z.object({ prompt: promptResponseSchema })
      }
    }
  }, async (request, reply) => {
    const { prisma } = fastify.deps;
    const body = request.body;
    const prompt = await prisma.prompt.create({
      data: {
        language: toPrismaLanguage(body.language),
        displayText: body.displayText,
        typingTarget: body.typingTarget,
        tags: body.tags ?? []
      }
    });
    return reply.code(201).send({ prompt: toPromptResponse(prompt) });
  });

  fastify.get('/prompts', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      querystring: listPromptQuerySchema,
      response: {
        200: z.object({ prompts: z.array(promptResponseSchema) })
      }
    }
  }, async (request) => {
    const { prisma } = fastify.deps;
    const prompts = await prisma.prompt.findMany({
      where: {
        language: request.query.language ? toPrismaLanguage(request.query.language) : undefined,
        isActive: request.query.active
      },
      orderBy: { createdAt: 'desc' }
    });
    return {
      prompts: prompts.map(toPromptResponse)
    };
  });

  fastify.patch('/prompts/:promptId', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: z.object({ promptId: z.string().uuid() }),
      body: updatePromptBodySchema,
      response: {
        200: z.object({ prompt: promptResponseSchema })
      }
    }
  }, async (request, reply) => {
    const { prisma } = fastify.deps;
    const { promptId } = request.params;
    const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
    if (!prompt) {
      return reply.code(404).send({ message: 'プロンプトが見つかりません。' });
    }
    const updated = await prisma.prompt.update({
      where: { id: promptId },
      data: {
        language: request.body.language ? toPrismaLanguage(request.body.language) : prompt.language,
        displayText: request.body.displayText ?? prompt.displayText,
        typingTarget: request.body.typingTarget ?? prompt.typingTarget,
        tags: request.body.tags ?? prompt.tags,
        isActive: request.body.isActive ?? prompt.isActive
      }
    });
    return reply.send({ prompt: toPromptResponse(updated) });
  });

  fastify.delete('/prompts/:promptId', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: z.object({ promptId: z.string().uuid() }),
      response: {
        204: z.null()
      }
    }
  }, async (request, reply) => {
    const { prisma } = fastify.deps;
    const { promptId } = request.params;
    await prisma.prompt.delete({ where: { id: promptId } }).catch(() => {
      // ignore missing rows to keep idempotent
    });
    return reply.code(204).send();
  });
};
