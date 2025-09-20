import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PrismaClient } from '@prisma/client';

type HashFn = (token: string) => string;

const DEFAULT_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 14; // 14日
const BCRYPT_ROUNDS = 12;

function sha256(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface RefreshTokenIssueResult {
  token: string;
  expiresAt: Date;
}

export class AuthService {
  private readonly hashToken: HashFn;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly refreshTokenTtlSeconds: number = DEFAULT_TOKEN_TTL_SECONDS,
    hashFn: HashFn = sha256
  ) {
    this.hashToken = hashFn;
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, BCRYPT_ROUNDS);
  }

  async verifyPassword(password: string, passwordHash: string): Promise<boolean> {
    return bcrypt.compare(password, passwordHash);
  }

  async issueRefreshToken(userId: string): Promise<RefreshTokenIssueResult> {
    const token = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + this.refreshTokenTtlSeconds * 1000);
    const tokenHash = this.hashToken(token);
    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt
      }
    });
    return { token, expiresAt };
  }

  async rotateRefreshToken(token: string): Promise<{ userId: string; newToken: string; expiresAt: Date } | null> {
    const tokenHash = this.hashToken(token);
    const existing = await this.prisma.refreshToken.findFirst({ where: { tokenHash } });
    if (!existing) return null;
    if (existing.expiresAt.getTime() < Date.now()) {
      await this.prisma.refreshToken.delete({ where: { id: existing.id } }).catch(() => {});
      return null;
    }
    await this.prisma.refreshToken.delete({ where: { id: existing.id } });
    const issued = await this.issueRefreshToken(existing.userId);
    return { userId: existing.userId, newToken: issued.token, expiresAt: issued.expiresAt };
  }

  async revokeRefreshToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { userId } });
  }
}
