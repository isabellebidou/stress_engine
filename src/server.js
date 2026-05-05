import http from "node:http";
import { analyzeAudioStress } from "../core/analyzeAudioStress.js";
import { analyzeStress } from "./stressAnalyzer.js";

const PORT = Number(process.env.PORT ?? 4317);
const HOST = process.env.HOST ?? "127.0.0.1";

const server = http.createServer(async (request, response) => {
  setCorsHeaders(response);

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  if (request.method === "GET" && request.url === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "POST" && request.url === "/analyze-stress") {
    try {
      const body = await readJson(request);
      validateAnalyzeRequest(body);
      sendJson(response, 200, analyzeStress(body));
    } catch (error) {
      sendJson(response, error.statusCode ?? 500, {
        ok: false,
        error: error.message
      });
    }
    return;
  }

  if (request.method === "POST" && request.url === "/analyze-audio-stress") {
    const body = await readJsonSafely(request);
    const result = body.ok ? await analyzeAudioStress(body.value) : body;
    sendJson(response, result.ok ? 200 : 400, result);
    return;
  }

  sendJson(response, 404, {
    ok: false,
    error: "Route not found. Use GET /health, POST /analyze-stress, or POST /analyze-audio-stress."
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Pronunciation stress API listening on http://${HOST}:${PORT}`);
});

function setCorsHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

async function readJsonSafely(request) {
  try {
    return {
      ok: true,
      value: await readJson(request)
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Request body must be valid JSON."
    };
  }
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload, null, 2));
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let raw = "";

    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(httpError(413, "Request body is too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(httpError(400, "Request body must be valid JSON."));
      }
    });

    request.on("error", reject);
  });
}

function validateAnalyzeRequest(body) {
  if (!body || typeof body !== "object") {
    throw httpError(400, "Request body must be a JSON object.");
  }

  if (!body.expectedText || typeof body.expectedText !== "string") {
    throw httpError(400, "expectedText is required.");
  }

  const hasElevenLabsText = typeof body.elevenLabs?.text === "string" || typeof body.elevenlabs?.text === "string";

  if (body.transcript === undefined && body.text === undefined && !hasElevenLabsText) {
    body.transcript = "";
  }

  if (body.transcript !== undefined && typeof body.transcript !== "string") {
    throw httpError(400, "transcript must be a string when provided.");
  }

  if (body.words !== undefined && !Array.isArray(body.words)) {
    throw httpError(400, "words must be an array when provided.");
  }
}

function validateAnalyzeAudioRequest(body) {
  validateAnalyzeRequest(body);

  if (!body.audioBase64 || typeof body.audioBase64 !== "string") {
    throw httpError(400, "audioBase64 is required and must contain a base64-encoded WAV file.");
  }
}

function httpError(statusCode, message) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}
