import express from 'express';
import cors from 'cors';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { execSync } from 'node:child_process';
import { WebSocketServer, type RawData } from 'ws';

const app = express();
app.use(cors());
app.use(express.json());

const KIMI_BASE_URL = 'https://api.kimi.com/coding/v1';
const KIMI_API_KEY = process.env.KIMI_API_KEY || '';
const AZURE_OPENAI_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT?.trim() || '';
const AZURE_OPENAI_API_KEY = process.env.AZURE_OPENAI_API_KEY?.trim() || '';
const AZURE_OPENAI_DEPLOYMENT_NAME =
  process.env.AZURE_OPENAI_CHAT_DEPLOYMENT_NAME?.trim() ||
  process.env.AZURE_OPENAI_DEPLOYMENT_NAME?.trim() ||
  '';
const AZURE_OPENAI_API_VERSION =
  process.env.AZURE_OPENAI_API_VERSION?.trim() || '2025-01-01-preview';
const AZURE_MAX_TOKENS = 4096;

type KimiHttpResponse = {
  status: number;
  bodyText: string;
};

type UpstreamTarget =
  | {
      provider: 'kimi';
      url: string;
      headers: string[];
      body: Record<string, unknown>;
      model: string;
    }
  | {
      provider: 'azure-openai';
      url: string;
      headers: string[];
      body: Record<string, unknown>;
      model: string;
    };

type KimiToolMapping = {
  originalToSanitized: Map<string, string>;
  sanitizedToOriginal: Map<string, string>;
};

function ensurePortFree(port: number): void {
  try {
    const pid = execSync(`lsof -ti:${port}`, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
    if (!pid) {
      return;
    }

    console.log(`[proxy] killing process ${pid} on port ${port}`);
    try {
      execSync(`kill -9 ${pid}`, { stdio: 'ignore' });
    } catch {
      // Ignore kill failures and let listen surface the real error if needed.
    }

    let attempts = 0;
    while (attempts < 10) {
      try {
        execSync(`lsof -i:${port}`, { stdio: 'ignore' });
        attempts += 1;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
      } catch {
        break;
      }
    }
  } catch {
    // Port is already free.
  }
}

function normalizeChatRole(role: unknown): 'system' | 'user' | 'assistant' | 'tool' {
  if (typeof role !== 'string') {
    return 'user';
  }

  const normalized = role.trim().toLowerCase();
  if (normalized === 'developer') {
    return 'system';
  }
  if (
    normalized === 'system' ||
    normalized === 'user' ||
    normalized === 'assistant' ||
    normalized === 'tool'
  ) {
    return normalized;
  }
  return 'user';
}

function toPlainTextContent(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }

      if (!item || typeof item !== 'object') {
        return '';
      }

      const record = item as Record<string, unknown>;
      if (record.type === 'input_text' || record.type === 'output_text' || record.type === 'text') {
        return typeof record.text === 'string' ? record.text : '';
      }

      return '';
    })
    .filter(Boolean)
    .join('\n');
}

function sanitizeToolName(name: string, usedNames: Set<string>): string {
  const normalized = name.replace(/[^A-Za-z0-9_-]/g, '_');
  let sanitized = /^[A-Za-z]/.test(normalized) ? normalized : `tool_${normalized}`;

  if (!sanitized) {
    sanitized = 'tool';
  }

  let candidate = sanitized;
  let index = 1;
  while (usedNames.has(candidate)) {
    candidate = `${sanitized}_${index}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

function createToolMapping(tools: unknown[]): KimiToolMapping {
  const originalToSanitized = new Map<string, string>();
  const sanitizedToOriginal = new Map<string, string>();
  const usedNames = new Set<string>();

  for (const tool of tools) {
    if (!tool || typeof tool !== 'object') continue;
    const record = tool as Record<string, unknown>;
    const originalName =
      typeof record.name === 'string'
        ? record.name
        : record.function && typeof record.function === 'object'
          ? typeof (record.function as Record<string, unknown>).name === 'string'
            ? ((record.function as Record<string, unknown>).name as string)
            : ''
          : '';

    if (!originalName) continue;

    const sanitizedName = sanitizeToolName(originalName, usedNames);
    originalToSanitized.set(originalName, sanitizedName);
    sanitizedToOriginal.set(sanitizedName, originalName);
  }

  return { originalToSanitized, sanitizedToOriginal };
}

function convertTools(tools: unknown, mapping: KimiToolMapping): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(tools) || tools.length === 0) {
    return undefined;
  }

  const converted = tools
    .map((tool) => {
      if (!tool || typeof tool !== 'object') return null;
      const record = tool as Record<string, unknown>;
      const type = typeof record.type === 'string' ? record.type : 'function';
      if (type !== 'function') return null;

      const originalName =
        typeof record.name === 'string'
          ? record.name
          : record.function && typeof record.function === 'object'
            ? typeof (record.function as Record<string, unknown>).name === 'string'
              ? ((record.function as Record<string, unknown>).name as string)
              : ''
            : '';

      if (!originalName) return null;

      const description =
        typeof record.description === 'string'
          ? record.description
          : record.function && typeof record.function === 'object'
            ? typeof (record.function as Record<string, unknown>).description === 'string'
              ? ((record.function as Record<string, unknown>).description as string)
              : undefined
            : undefined;

      const parameters =
        record.parameters ??
        (record.function && typeof record.function === 'object'
          ? (record.function as Record<string, unknown>).parameters
          : undefined);

      return {
        type: 'function',
        function: {
          name: mapping.originalToSanitized.get(originalName) || originalName,
          ...(description ? { description } : {}),
          ...(parameters !== undefined ? { parameters } : {}),
        },
      };
    })
    .filter(Boolean);

  return converted.length > 0 ? (converted as Array<Record<string, unknown>>) : undefined;
}

function convertToolChoice(
  toolChoice: unknown,
  mapping: KimiToolMapping
): string | Record<string, unknown> | undefined {
  if (!toolChoice) {
    return undefined;
  }

  if (typeof toolChoice === 'string') {
    return toolChoice;
  }

  if (typeof toolChoice !== 'object') {
    return undefined;
  }

  const record = toolChoice as Record<string, unknown>;
  const type = typeof record.type === 'string' ? record.type : '';
  if (type !== 'function') {
    return undefined;
  }

  const originalName =
    typeof record.name === 'string'
      ? record.name
      : record.function && typeof record.function === 'object'
        ? typeof (record.function as Record<string, unknown>).name === 'string'
          ? ((record.function as Record<string, unknown>).name as string)
          : ''
        : '';

  if (!originalName) {
    return undefined;
  }

  return {
    type: 'function',
    function: {
      name: mapping.originalToSanitized.get(originalName) || originalName,
    },
  };
}

// Convert OpenAI Responses API request to Chat Completions format
function convertToChatFormat(body: any) {
  const messages = [];
  const toolMapping = createToolMapping(Array.isArray(body.tools) ? body.tools : []);

  // Add system message if present
  if (body.instructions) {
    messages.push({ role: 'system', content: body.instructions });
  }

  // Convert input to messages format
  if (typeof body.input === 'string') {
    messages.push({ role: 'user', content: body.input });
  } else if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (item.type === 'message') {
        const content = toPlainTextContent(item.content);
        if (!content) {
          continue;
        }
        messages.push({
          role: normalizeChatRole(item.role),
          content,
        });
      }
    }
  }

  return {
    chatBody: {
      model: body.model || 'kimi-for-coding',
      messages,
      temperature: body.temperature ?? 0.0,
      max_tokens: body.max_tokens || 32768,
      stream: body.stream !== false,
      tools: convertTools(body.tools, toolMapping),
      tool_choice: convertToolChoice(body.tool_choice, toolMapping),
    },
    toolMapping,
  };
}

function isAzureModel(model: string): boolean {
  if (!AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_API_KEY) {
    return false;
  }
  return model === 'gpt-4o' || model === AZURE_OPENAI_DEPLOYMENT_NAME;
}

function buildAzureUrl(model: string): string {
  const deployment = AZURE_OPENAI_DEPLOYMENT_NAME || model;
  const endpoint = AZURE_OPENAI_ENDPOINT.replace(/\/+$/, '');
  return `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${encodeURIComponent(AZURE_OPENAI_API_VERSION)}`;
}

function buildUpstreamTarget(chatBody: Record<string, unknown>): UpstreamTarget {
  const model = typeof chatBody.model === 'string' ? chatBody.model : 'kimi-for-coding';

  if (isAzureModel(model)) {
    const requestedMaxTokens =
      typeof chatBody.max_tokens === 'number' && Number.isFinite(chatBody.max_tokens)
        ? chatBody.max_tokens
        : AZURE_MAX_TOKENS;
    const azureBody = {
      messages: chatBody.messages,
      temperature: chatBody.temperature,
      max_tokens: Math.min(requestedMaxTokens, AZURE_MAX_TOKENS),
      stream: false,
      tools: chatBody.tools,
      tool_choice: chatBody.tool_choice,
    };

    return {
      provider: 'azure-openai',
      model,
      url: buildAzureUrl(model),
      headers: [
        'Content-Type: application/json',
        `api-key: ${AZURE_OPENAI_API_KEY}`,
      ],
      body: azureBody,
    };
  }

  return {
    provider: 'kimi',
    model,
    url: `${KIMI_BASE_URL}/chat/completions`,
    headers: [
      'Content-Type: application/json',
      `Authorization: Bearer ${KIMI_API_KEY}`,
      'User-Agent: RooCode/1.0.0',
      'X-Client-Name: roo-code',
    ],
    body: {
      ...chatBody,
      stream: false,
    },
  };
}

// Handle streaming response from Kimi
function buildResponseOutput(message: any, requestId: string, toolMapping: KimiToolMapping) {
  const output = [];

  if (typeof message?.content === 'string' && message.content.length > 0) {
    output.push({
      type: 'message',
      id: `msg_${requestId}`,
      status: 'completed',
      role: message?.role || 'assistant',
      content: [{ type: 'output_text', text: message.content, annotations: [] }],
    });
  }

  const toolCalls = Array.isArray(message?.tool_calls) ? message.tool_calls : [];
  for (const toolCall of toolCalls) {
    const functionCall = toolCall?.function;
    const sanitizedName = typeof functionCall?.name === 'string' ? functionCall.name : '';
    const originalName = toolMapping.sanitizedToOriginal.get(sanitizedName) || sanitizedName;
    const argumentsText =
      typeof functionCall?.arguments === 'string'
        ? functionCall.arguments
        : JSON.stringify(functionCall?.arguments ?? {});
    const callId =
      typeof toolCall?.id === 'string' && toolCall.id.length > 0
        ? toolCall.id
        : `call_${requestId}_${output.length}`;

    output.push({
      type: 'function_call',
      name: originalName,
      arguments: argumentsText,
      call_id: callId,
    });
  }

  return output;
}

function emitStreamingResponseFromChatData(
  chatResponse: any,
  sink: {
    websocketMode?: boolean;
    writeEvent: (payload: Record<string, unknown>) => void;
    close: () => void;
  },
  toolMapping: KimiToolMapping
) {
  const requestId = Date.now().toString();
  const responseId = `resp_${requestId}`;
  const messageId = `msg_${requestId}`;
  const choice = chatResponse.choices?.[0];
  const message = choice?.message;
  const fullContent = typeof message?.content === 'string' ? message.content : '';
  const finalMessageRole = typeof message?.role === 'string' ? message.role : 'assistant';
  const hasMessageContent = fullContent.length > 0;
  const completedResponse = convertToResponseFormat(chatResponse, requestId, toolMapping);
  completedResponse.id = responseId;
  const inProgressResponse = {
    ...completedResponse,
    status: 'in_progress',
    output: [],
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  };

  const writeEvent = (payload: Record<string, unknown>) => {
    if (!sink.websocketMode) {
      sink.writeEvent(payload);
      return;
    }

    const realtimePayload: Record<string, unknown> = {
      event_id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      ...payload,
    };

    if ('response' in payload || payload.type === 'response.done') {
      sink.writeEvent(realtimePayload);
      return;
    }

    realtimePayload.response_id = responseId;
    sink.writeEvent(realtimePayload);
  };

  writeEvent({
    type: 'response.created',
    response: inProgressResponse,
  });

  writeEvent({
    type: 'response.in_progress',
    response: inProgressResponse,
  });

  if (hasMessageContent) {
    writeEvent({
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'message',
        id: messageId,
        status: 'in_progress',
        role: finalMessageRole,
        content: [],
      },
    });
    writeEvent({
      type: 'response.content_part.added',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: '',
        annotations: [],
      },
    });
    writeEvent({
      type: 'response.output_text.delta',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      delta: fullContent,
    });
    writeEvent({
      type: 'response.output_text.done',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      text: fullContent,
    });
    writeEvent({
      type: 'response.content_part.done',
      item_id: messageId,
      output_index: 0,
      content_index: 0,
      part: {
        type: 'output_text',
        text: fullContent,
        annotations: [],
      },
    });
    writeEvent({
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'message',
        id: messageId,
        status: 'completed',
        role: finalMessageRole,
        content: [{ type: 'output_text', text: fullContent, annotations: [] }],
      },
    });
  }

  writeEvent({
    type: 'response.completed',
    response: completedResponse,
  });

  if (sink.websocketMode) {
    sink.writeEvent({
      event_id: `event_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type: 'response.done',
      response: completedResponse,
    });
  }
}

// Convert Chat Completions response to Responses API format
function convertToResponseFormat(chatResponse: any, requestId: string, toolMapping: KimiToolMapping) {
  const choice = chatResponse.choices?.[0];
  const message = choice?.message;

  return {
    id: `resp_${requestId}`,
    object: 'response',
    created_at: Math.floor(Date.now() / 1000),
    status: 'completed',
    error: null,
    incomplete_details: null,
    instructions: null,
    max_output_tokens: null,
    model: chatResponse.model,
    output: buildResponseOutput(message, requestId, toolMapping),
    parallel_tool_calls: true,
    previous_response_id: null,
    reasoning: { effort: 'medium', generate_summary: null },
    store: true,
    temperature: chatResponse.temperature,
    text: { format: { type: 'text' } },
    tool_choice: 'auto',
    tools: [],
    truncation: 'disabled',
    usage: {
      input_tokens: chatResponse.usage?.prompt_tokens || 0,
      output_tokens: chatResponse.usage?.completion_tokens || 0,
      total_tokens: chatResponse.usage?.total_tokens || 0,
    },
    user: null,
    metadata: {},
  };
}

async function postToUpstream(chatBody: Record<string, unknown>): Promise<KimiHttpResponse> {
  const target = buildUpstreamTarget(chatBody);
  console.log('[proxy] upstream request', {
    provider: target.provider,
    model: target.model,
    url: target.url,
    hasTools: Array.isArray(target.body.tools) && target.body.tools.length > 0,
  });
  return new Promise((resolve, reject) => {
    const args = [
      '--silent',
      '--show-error',
      '--location',
      '--max-time',
      '120',
      '--write-out',
      '\n%{http_code}',
      '-X',
      'POST',
      target.url,
      '--data',
      JSON.stringify(target.body),
    ];

    for (const header of target.headers) {
      args.splice(args.length - 2, 0, '-H', header);
    }

    const child = spawn('curl', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `curl exited with code ${code}`));
        return;
      }

      const lastNewlineIndex = stdout.lastIndexOf('\n');
      if (lastNewlineIndex === -1) {
        reject(new Error('Invalid Kimi response: missing HTTP status'));
        return;
      }

      const bodyText = stdout.slice(0, lastNewlineIndex);
      const statusText = stdout.slice(lastNewlineIndex + 1).trim();
      const status = Number.parseInt(statusText, 10);
      if (!Number.isFinite(status)) {
        reject(new Error(`Invalid Kimi response status: ${statusText}`));
        return;
      }

      resolve({ status, bodyText });
    });
  });
}

// Handle /responses endpoint
app.post('/v1/responses', async (req, res) => {
  try {
    console.log('[proxy] /v1/responses request', {
      model: req.body?.model,
      stream: req.body?.stream,
      inputType: Array.isArray(req.body?.input) ? 'array' : typeof req.body?.input,
      toolCount: Array.isArray(req.body?.tools) ? req.body.tools.length : 0,
    });
    const { chatBody, toolMapping } = convertToChatFormat(req.body);
    const { status, bodyText } = await postToUpstream(chatBody);
    console.log('[proxy] upstream response', {
      status,
      bodyLength: bodyText.length,
      stream: chatBody.stream,
    });

    if (status < 200 || status >= 300) {
      console.error('Upstream API error:', bodyText);
      res.status(status).json({ error: bodyText });
      return;
    }

    const chatData = JSON.parse(bodyText);
    if (chatBody.stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      emitStreamingResponseFromChatData(
        chatData,
        {
          websocketMode: false,
          writeEvent: (payload) => {
            res.write(`data: ${JSON.stringify(payload)}\n\n`);
          },
          close: () => {
            res.write('data: [DONE]\n\n');
            res.end();
          },
        },
        toolMapping
      );
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const requestId = Date.now().toString();
    const responseData = convertToResponseFormat(chatData, requestId, toolMapping);

    res.json(responseData);
  } catch (error) {
    console.error('Proxy error:', error);
    res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
  }
});

async function handleWebSocketResponsesMessage(ws: InstanceType<typeof import('ws').WebSocket>, raw: RawData) {
  try {
    const body = JSON.parse(raw.toString());
    console.log('[proxy] ws /v1/responses request', {
      type: body?.type,
      model: body?.model,
      stream: body?.stream,
      inputType: Array.isArray(body?.input) ? 'array' : typeof body?.input,
      toolCount: Array.isArray(body?.tools) ? body.tools.length : 0,
    });

    const { chatBody, toolMapping } = convertToChatFormat(body);
    const { status, bodyText } = await postToUpstream(chatBody);
    console.log('[proxy] ws upstream response', {
      status,
      bodyLength: bodyText.length,
      stream: chatBody.stream,
    });

    if (status < 200 || status >= 300) {
      console.error('[proxy] ws upstream error body', bodyText);
      ws.send(
        JSON.stringify({
          type: 'response.failed',
          error: {
            message: bodyText,
          },
        })
      );
      return;
    }

    const chatData = JSON.parse(bodyText);
    if (chatBody.stream) {
      emitStreamingResponseFromChatData(
        chatData,
        {
          websocketMode: true,
          writeEvent: (payload) => {
            ws.send(JSON.stringify(payload));
          },
          close: () => {},
        },
        toolMapping
      );
      return;
    }

    const requestId = Date.now().toString();
    ws.send(JSON.stringify(convertToResponseFormat(chatData, requestId, toolMapping)));
  } catch (error) {
    console.error('[proxy] ws error', error);
    ws.send(
      JSON.stringify({
        type: 'response.failed',
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    );
  }
}

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

const server = createServer(app);
const wsServer = new WebSocketServer({ noServer: true });

server.on('upgrade', (req, socket, head) => {
  const url = req.url || '';
  if (!url.startsWith('/v1/responses')) {
    socket.destroy();
    return;
  }

  console.log('[proxy] websocket upgrade', { url });
  wsServer.handleUpgrade(req, socket, head, (ws) => {
    wsServer.emit('connection', ws, req);
  });
});

wsServer.on('connection', (ws, req) => {
  console.log('[proxy] websocket connected', { url: req.url });
  ws.on('message', async (raw) => {
    await handleWebSocketResponsesMessage(ws, raw);
  });
});

const PORT = Number(process.env.PROXY_PORT || 3456);
ensurePortFree(PORT);
server.listen(PORT, () => {
  console.log(`Kimi proxy server running on http://localhost:${PORT}`);
  console.log(`Proxying /v1/responses to Kimi /chat/completions`);
});
