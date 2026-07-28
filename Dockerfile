FROM denoland/deno:2.9.2

WORKDIR /app

# Cache dependencies first so source edits don't re-resolve the module graph.
COPY deno.json deno.lock ./
COPY src ./src
COPY web ./web
RUN deno cache src/main.ts

RUN deno task build:web

EXPOSE 8080

CMD ["run", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "src/main.ts"]
