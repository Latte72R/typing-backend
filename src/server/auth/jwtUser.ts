import type { FastifyReply, FastifyRequest } from 'fastify';

export type JwtUser = {
  userId: string;
  role: 'user' | 'admin';
};

export function isJwtUser(user: FastifyRequest['user']): user is JwtUser {
  if (!user || typeof user !== 'object') {
    return false;
  }
  if (Buffer.isBuffer(user)) {
    return false;
  }
  const candidate = user as Partial<JwtUser>;
  if (typeof candidate.userId !== 'string' || candidate.userId.length === 0) {
    return false;
  }
  return candidate.role === 'admin' || candidate.role === 'user';
}

export function getJwtUser(request: FastifyRequest): JwtUser | null {
  return isJwtUser(request.user) ? request.user : null;
}

export function ensureJwtUser(request: FastifyRequest, reply: FastifyReply, message = '認証に失敗しました。'): JwtUser | null {
  const user = getJwtUser(request);
  if (!user) {
    request.log.error('JWT user payload is missing on an authenticated request.');
    void reply.code(401).send({ message });
    return null;
  }
  return user;
}
