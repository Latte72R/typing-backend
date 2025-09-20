# syntax=docker/dockerfile:1
FROM postgres:16-alpine

ENV POSTGRES_DB=typing \
    POSTGRES_USER=typing \
    POSTGRES_PASSWORD=typing

EXPOSE 5432

HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
  CMD pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB" || exit 1
