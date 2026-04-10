# OpenAI API Auth Proxy

Runs an nginx reverse proxy that transparently injects an API key into every request forwarded to an OpenAI API-compatible endpoint. Clients talk to `localhost:11434` without needing to supply credentials.

## How it works

```
client -> localhost:11434 (nginx) -> $OPENAI_API_URL
                                     + Authorization: Bearer $OPENAI_API_KEY
```

nginx strips any `Authorization` header from the client and replaces it with the configured API key before forwarding.

## Setup

1. Copy the example env file and fill in your values:

    ```bash
    cp .env.example .env
    ```

    Edit `.env`:

    ```env
    OPENAI_API_URL=https://your.ollama.com:11434
    OPENAI_API_KEY=your-actual-api-key
    ```

2. Start the proxy:

    ```bash
    docker compose up -d --build
    ```

3. Use it like a normal OpenAI API:

    ```bash
    # List models
    curl http://localhost:11434/v1/models

    # Chat completion
    curl http://localhost:11434/v1/chat/completions \
      -H "Content-Type: application/json" \
      -d '{"model":"llama3","messages":[{"role":"user","content":"Hello!"}]}'
    ```

    No `Authorization` header needed from the client - **nginx handles it**.

## Configuration

| Variable | Description |
|---|---|
| `OPENAI_API_URL` | Base URL of the OpenAI API-compatible backend, e.g. Ollama |
| `OPENAI_API_KEY` | API key injected by nginx into every request |
| `DEBUG` | Set to `true` to log request/response headers and body to the nginx error log (default: `false`) |

## Stop

```bash
docker compose down
```

## Debug logging

Set `DEBUG=true` in `.env` and restart to log full request/response headers and body to the nginx error log:

```bash
docker compose up -d --build
docker compose logs -f
```

Each proxied request will emit `[DEBUG]` lines like:

```
[DEBUG] >>> POST /v1/chat/completions HTTP/1.1
[DEBUG] > content-type: application/json
[DEBUG] > body: {"model":"llama3","messages":[...]}
[DEBUG] <<< 200
[DEBUG] < content-type: application/json
[DEBUG] < body chunk: {"id":"...","choices":[...]}
```
