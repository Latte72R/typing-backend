import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';
import type { FastifyZodPlugin } from '../fastifyTypes.js';

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

const messageResponseSchema = z.object({ message: z.string() });
const promptIdParamSchema = z.object({ promptId: z.string().uuid() });

type CreatePromptBody = z.infer<typeof createPromptBodySchema>;
type UpdatePromptBody = z.infer<typeof updatePromptBodySchema>;
type ListPromptQuery = z.infer<typeof listPromptQuerySchema>;
type PromptIdParams = z.infer<typeof promptIdParamSchema>;

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

export const registerPromptRoutes: FastifyZodPlugin = async (fastify) => {
  const app = fastify.withTypeProvider<ZodTypeProvider>();

  app.post('/prompts', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      body: createPromptBodySchema,
      response: {
        201: z.object({ prompt: promptResponseSchema })
      }
    }
  }, async (request, reply) => {
    const { prisma } = fastify.deps;
    const body = request.body as CreatePromptBody;
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

  app.get('/prompts', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      querystring: listPromptQuerySchema,
      response: {
        200: z.object({ prompts: z.array(promptResponseSchema) })
      }
    }
  }, async (request) => {
    const { prisma } = fastify.deps;
    const query = request.query as ListPromptQuery;
    const prompts = await prisma.prompt.findMany({
      where: {
        language: query.language ? toPrismaLanguage(query.language) : undefined,
        isActive: query.active
      },
      orderBy: { createdAt: 'desc' }
    });
    return {
      prompts: prompts.map(toPromptResponse)
    };
  });

  app.patch('/prompts/:promptId', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: promptIdParamSchema,
      body: updatePromptBodySchema,
      response: {
        200: z.object({ prompt: promptResponseSchema }),
        404: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const { prisma } = fastify.deps;
    const { promptId } = request.params as PromptIdParams;
    const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
    if (!prompt) {
      return reply.code(404).send({ message: 'プロンプトが見つかりません。' });
    }
    const body = request.body as UpdatePromptBody;
    const updated = await prisma.prompt.update({
      where: { id: promptId },
      data: {
        language: body.language ? toPrismaLanguage(body.language) : prompt.language,
        displayText: body.displayText ?? prompt.displayText,
        typingTarget: body.typingTarget ?? prompt.typingTarget,
        tags: body.tags ?? prompt.tags,
        isActive: body.isActive ?? prompt.isActive
      }
    });
    return reply.send({ prompt: toPromptResponse(updated) });
  });

  app.delete('/prompts/:promptId', {
    preHandler: fastify.authorizeAdmin,
    schema: {
      params: promptIdParamSchema,
      response: {
        204: z.null(),
        404: messageResponseSchema,
        409: messageResponseSchema
      }
    }
  }, async (request, reply) => {
    const { prisma } = fastify.deps;
    const { promptId } = request.params as PromptIdParams;
    const prompt = await prisma.prompt.findUnique({ where: { id: promptId } });
    if (!prompt) {
      return reply.code(404).send({ message: 'プロンプトが見つかりません。' });
    }
    const sessionCount = await prisma.session.count({ where: { promptId } });
    if (sessionCount > 0) {
      return reply.code(409).send({ message: 'このプロンプトは既存のセッションで使用されているため削除できません。' });
    }
    await prisma.$transaction(async (tx) => {
      await tx.contestPrompt.deleteMany({ where: { promptId } });
      await tx.prompt.delete({ where: { id: promptId } });
    });
    return reply.code(204).send();
  });
};
