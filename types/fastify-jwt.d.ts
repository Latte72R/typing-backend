import '@fastify/jwt';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    user: {
      userId: string;
      role: 'user' | 'admin';
    };
  }
}
