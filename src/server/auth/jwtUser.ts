import type { FastifyReply, FastifyRequest } from 'fastify';

export type JwtUser = {
  userId: string;
  role: 'user' | 'admin';
};

export function normalizeJwtUser(raw: unknown): JwtUser | null {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  if (Buffer.isBuffer(raw)) {
    return null;
  }
  const source = raw as Record<string, unknown>;
  const userIdCandidate = [source.userId, source.id, source.sub].find(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  const roleCandidate = source.role;
  if (!userIdCandidate) {
    return null;
  }
  let role: JwtUser['role'] | null = null;
  if (typeof roleCandidate === 'string') {
    const normalizedRole = roleCandidate.toLowerCase();
    if (normalizedRole === 'admin' || normalizedRole === 'user') {
      role = normalizedRole;
    }
  }
  if (!role) {
    return null;
  }
  return { userId: userIdCandidate, role } satisfies JwtUser;
}

export function isJwtUser(user: FastifyRequest['user']): user is JwtUser {
  return normalizeJwtUser(user) !== null;
}

export function getJwtUser(request: FastifyRequest): JwtUser | null {
  const normalized = normalizeJwtUser(request.user);
  if (!normalized) {
    return null;
  }
  request.user = normalized as FastifyRequest['user'];
  return normalized;
}

function summarizeAuthHeader(header: string | undefined): { scheme?: string; tokenLength?: number } {
  if (!header) return {};
  const [scheme] = header.split(' ');
  return { scheme: scheme?.toLowerCase(), tokenLength: header.length };
}

export async function ensureJwtUser(
  request: FastifyRequest,
  reply: FastifyReply,
  message = '認証に失敗しました。'
): Promise<JwtUser | null> {
  const authSummary = summarizeAuthHeader(typeof request.headers.authorization === 'string' ? request.headers.authorization : undefined);
  request.log.info({
    msg: 'ensureJwtUser:start',
    authSummary,
    userType: typeof request.user,
    isBufferUser: Buffer.isBuffer(request.user),
    userKeys: request.user && typeof request.user === 'object' && !Buffer.isBuffer(request.user)
      ? Object.keys(request.user as Record<string, unknown>)
      : undefined
  });
  const existingUser = getJwtUser(request);
  if (existingUser) {
    request.log.info({
      msg: 'ensureJwtUser:reuse-existing',
      userId: existingUser.userId,
      role: existingUser.role
    });
    return existingUser;
  }

  try {
    const payload = await request.jwtVerify();
    request.log.info({
      msg: 'ensureJwtUser:jwtVerify-fallback',
      payloadKeys: payload && typeof payload === 'object' && !Buffer.isBuffer(payload)
        ? Object.keys(payload as Record<string, unknown>)
        : undefined
    });
    const normalized = normalizeJwtUser(payload);
    if (!normalized) {
      throw new Error('Invalid JWT payload');
    }
    request.user = normalized as FastifyRequest['user'];
    request.log.info({
      msg: 'ensureJwtUser:normalized-user',
      userId: normalized.userId,
      role: normalized.role
    });
    return normalized;
  } catch (error) {
    const payloadSource = request.user;
    const payloadKeys = payloadSource && typeof payloadSource === 'object' && !Buffer.isBuffer(payloadSource)
      ? Object.keys(payloadSource as Record<string, unknown>)
      : undefined;
    request.log.error({
      msg: 'JWT user payload is missing on an authenticated request.',
      payloadKeys,
      cause: error instanceof Error ? error.message : error
    });
    if (!reply.sent) {
      await reply.code(401).send({ message });
    }
    request.log.warn({ msg: 'ensureJwtUser:sent-401', authSummary });
    return null;
  }
}
