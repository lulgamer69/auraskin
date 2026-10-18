import { checkCashOnDelivery, checkDamagedProduct, checkReturn, checkShipping } from './policyService.js';
import { createOrderService } from './orderService.js';
import { HttpError } from '../utils/httpError.js';

const MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';
const TTS_MODEL = process.env.GROQ_TTS_MODEL || 'canopylabs/orpheus-v1-english';
const TTS_VOICE = process.env.GROQ_TTS_VOICE || 'hannah';
const GROQ_API_BASE_URL = process.env.GROQ_API_BASE_URL || 'https://api.groq.com/openai/v1';
const MAX_INPUT_LENGTH = 1200;
const MAX_HISTORY_TURNS = 5;
const MAX_TRANSCRIPT_MESSAGES = 50;
const SESSION_TTL_MS = 60 * 60 * 1000;
const MAX_SESSIONS = 500;
const MAX_TTS_INPUT_LENGTH = 180;

function splitSpeechText(text) {
  const segments = [];
  let remaining = text.trim();

  while (remaining.length > MAX_TTS_INPUT_LENGTH) {
    let splitAt = -1;
    for (const punctuation of ['.', '!', '?', ';']) {
      const position = remaining.lastIndexOf(punctuation, MAX_TTS_INPUT_LENGTH - 1);
      if (position >= Math.floor(MAX_TTS_INPUT_LENGTH * 0.55)) {
        splitAt = Math.max(splitAt, position + 1);
      }
    }

    if (splitAt < 0) splitAt = remaining.lastIndexOf(' ', MAX_TTS_INPUT_LENGTH);
    if (splitAt <= 0) splitAt = MAX_TTS_INPUT_LENGTH;

    segments.push(remaining.slice(0, splitAt).trim());
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) segments.push(remaining);
  return segments;
}

// Keep the schemas in ordinary JSON Schema so the backend has no provider SDK dependency.
const Type = { OBJECT: 'object', STRING: 'string', NUMBER: 'number', BOOLEAN: 'boolean', ARRAY: 'array' };

const SYSTEM_INSTRUCTION = `You are Aria, Aura Skincare's friendly, concise Indian customer-support specialist.
Only help with Aura Skincare products, orders, and the policies below. Politely decline unrelated requests.
Speak like a warm, capable person, not a scripted call centre. Answer directly in one or two short sentences, usually under 35 words. Avoid filler, repeated greetings, and announcing that you are an AI.
For order lookups, recognize shorthand such as “101”, “order 101”, and “my order ID is 101” as ORD-101. Do the same for 102 and 103. Use the order tool without asking the customer to repeat the ORD- prefix. If the order number is missing or genuinely unclear, ask one brief question.
Voice messages may include lower-ranked speech-recognition alternatives. Treat them as uncertain hypotheses, not extra words the customer definitely said. If an alternative changes the meaning or the request is unclear, ask one short clarification instead of guessing.
Feedback about Aria or the support experience is in scope. Acknowledge praise or frustration directly; if the customer says the help was poor, apologize and offer to correct the answer or continue by chat. Do not deflect to a generic skincare-support greeting.
If the customer asks whether you know their name (including a speech transcript such as “you know my name”), answer naturally: “I don’t know your name yet—what should I call you?” If they correct you with something like “no, my name,” understand they mean they were asking about their name; clarify warmly instead of refusing or changing the subject. Never claim to know their name unless they have told you during this conversation, and never use names from sample order records as the caller’s identity.
Use get_order_details for every order-specific lookup; never invent an order, customer, tracking ID, status, or delivery time.
Use the matching policy function for policy eligibility. If information needed by a policy is missing or ambiguous, ask a short clarifying question first.
Shipping is free only above ₹499; below ₹499 it costs ₹50. The exact ₹499 boundary is unspecified: say so and never guess.
Returns are accepted within 7 days of delivery only for unopened, unused items in original packaging.
Damaged or defective items must be reported within 48 hours of delivery with photos to request replacement.
Cancellation is allowed only while an order is Processing. Shipped or Out for Delivery orders cannot be cancelled; the customer may refuse delivery at the doorstep.
COD is available up to and including ₹2,500, payable by cash or UPI at the doorstep.
Policy checks report eligibility only; never say a refund or replacement has been processed. Be transparent when you lack information.
Do not end just because you answered one question. Ask if the customer needs anything else unless they have clearly said they are done, said goodbye, or declined more help. When they clearly signal they are done, call end_call and give a brief, warm goodbye.`;

const tools = [{ functionDeclarations: [
  {
    name: 'get_order_details',
    description: 'Look up an Aura Skincare order. Accept IDs such as ORD-101 or spoken shorthand such as 101.',
    parameters: {
      type: Type.OBJECT,
      properties: { orderId: { type: Type.STRING, description: 'Order ID such as ORD-101, or its spoken numeric part such as 101.' } },
      required: ['orderId'],
    },
  },
  {
    name: 'check_shipping_policy',
    description: 'Check delivery fee and delivery window for an order total in rupees.',
    parameters: {
      type: Type.OBJECT,
      properties: { orderTotal: { type: Type.NUMBER, description: 'Order amount in rupees.' } },
      required: ['orderTotal'],
    },
  },
  {
    name: 'check_return_policy',
    description: 'Check return eligibility using days since delivery and all product-condition requirements.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        daysSinceDelivery: { type: Type.NUMBER },
        opened: { type: Type.BOOLEAN },
        used: { type: Type.BOOLEAN },
        originalPackaging: { type: Type.BOOLEAN },
      },
      required: ['daysSinceDelivery', 'opened', 'used', 'originalPackaging'],
    },
  },
  {
    name: 'check_damaged_product_policy',
    description: 'Check whether a damaged or defective item was reported within the allowed window with photos.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        hoursSinceDelivery: { type: Type.NUMBER },
        photosProvided: { type: Type.BOOLEAN },
      },
      required: ['hoursSinceDelivery', 'photosProvided'],
    },
  },
  {
    name: 'check_cash_on_delivery_policy',
    description: 'Check COD eligibility for an order amount and doorstep payment method.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        orderTotal: { type: Type.NUMBER },
        paymentMethod: { type: Type.STRING, enum: ['cash', 'upi'] },
      },
      required: ['orderTotal', 'paymentMethod'],
    },
  },
  {
    name: 'cancel_order',
    description: 'Cancel an order only when the customer explicitly asks and the order is still Processing. Accept spoken shorthand such as 103 for ORD-103.',
    parameters: {
      type: Type.OBJECT,
      properties: { orderId: { type: Type.STRING, description: 'Order ID such as ORD-103, or its spoken numeric part such as 103.' } },
      required: ['orderId'],
    },
  },
  {
    name: 'end_call',
    description: 'Finish the support conversation when the customer clearly says they are done, says goodbye, or declines further help.',
    parameters: { type: Type.OBJECT, properties: {} },
  },
] }];

const summarySchema = {
  type: Type.OBJECT,
  properties: {
    customer_intent: { type: Type.STRING, description: 'Short uppercase intent label.' },
    order_id: { type: Type.STRING, description: 'Verified order ID, or an empty string if none.' },
    resolution_status: { type: Type.STRING, enum: ['RESOLVED', 'UNRESOLVED', 'ESCALATED'] },
    call_summary: { type: Type.STRING },
    next_steps: { type: Type.ARRAY, items: { type: Type.STRING } },
  },
  required: ['customer_intent', 'order_id', 'resolution_status', 'call_summary', 'next_steps'],
};

function makeConversationError(message = 'The assistant is temporarily unavailable. Please try again.', code = 'AI_UNAVAILABLE') {
  return new HttpError(502, code, message);
}

function explainGroqFailure(error) {
  const status = Number(error?.status ?? error?.response?.status);
  const details = `${error?.status ?? ''} ${error?.code ?? ''} ${error?.message ?? ''}`.toLowerCase();
  if (status === 401 || status === 403 || /invalid_api_key|unauthenticated|permission_denied/.test(details)) {
    return makeConversationError('Groq rejected the server API key or access. Check GROQ_API_KEY and the model in server/.env, then restart the backend.', 'GROQ_ACCESS_ERROR');
  }
  if (status === 429 || /resource_exhausted|quota|rate.?limit/.test(details)) {
    return makeConversationError('Groq is rate-limiting this request or the available quota is used. Wait for the quota to reset, then try again.', 'GROQ_RATE_LIMITED');
  }
  if (status === 404 || /model.*not found|not found.*model/.test(details)) {
    return makeConversationError('The configured Groq model is unavailable for this API key. Check GROQ_MODEL in server/.env.', 'GROQ_MODEL_UNAVAILABLE');
  }
  return makeConversationError();
}

function getCallParts(response) {
  const content = response?.candidates?.[0]?.content;
  const calls = response?.functionCalls ?? content?.parts?.map((part) => part.functionCall).filter(Boolean) ?? [];
  return { content, calls };
}

function extractText(response) {
  if (typeof response?.text === 'string' && response.text.trim()) return response.text.trim();
  return response?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join(' ')
    .trim() || '';
}

function toGroqMessages(contents, systemInstruction, responseSchema) {
  const messages = [];
  let systemText = systemInstruction || '';
  if (responseSchema) {
    systemText += `\nReturn valid JSON matching this schema, with no markdown fences:\n${JSON.stringify(responseSchema)}`;
  }
  if (systemText) messages.push({ role: 'system', content: systemText });

  for (const item of contents ?? []) {
    const parts = item.parts ?? [];
    const text = parts.map((part) => part.text).filter(Boolean).join('\n');
    const calls = parts.map((part) => part.functionCall).filter(Boolean);
    const results = parts.map((part) => part.functionResponse).filter(Boolean);
    const role = item.role === 'model' ? 'assistant' : 'user';

    if (text || calls.length) {
      const message = { role, content: text || null };
      if (calls.length) {
        message.tool_calls = calls.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.args ?? {}) },
        }));
      }
      messages.push(message);
    }
    for (const result of results) {
      messages.push({
        role: 'tool',
        tool_call_id: result.id,
        name: result.name,
        content: JSON.stringify(result.response?.result ?? result.response ?? {}),
      });
    }
  }
  return messages;
}

function toGroqTools(toolDefinitions = []) {
  return toolDefinitions.flatMap((group) => (group.functionDeclarations ?? []).map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  })));
}

async function generateGroqContent(request, apiKey, model, fetchImpl) {
  const config = request.config ?? {};
  const body = {
    model: request.model || model,
    messages: toGroqMessages(request.contents, config.systemInstruction, config.responseSchema),
    temperature: config.temperature ?? 0.2,
    max_completion_tokens: config.maxOutputTokens ?? 512,
  };
  // GPT-OSS spends part of its completion budget on reasoning. Keep that effort
  // low for this short customer-support agent so the budget remains for a reply.
  if (body.model.startsWith('openai/gpt-oss-')) body.reasoning_effort = config.reasoningEffort ?? 'low';
  const tools = toGroqTools(config.tools);
  if (tools.length) body.tools = tools;
  if (config.responseMimeType === 'application/json') body.response_format = { type: 'json_object' };

  const response = await fetchImpl(`${GROQ_API_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload?.error?.message || `Groq request failed with status ${response.status}.`);
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }

  const choice = payload?.choices?.[0];
  const message = choice?.message;
  if (!message) throw new Error('Groq returned an empty response.');
  const contentText = typeof message.content === 'string'
    ? message.content.trim()
    : Array.isArray(message.content)
      ? message.content.map((part) => part?.text).filter(Boolean).join('\n').trim()
      : '';
  const calls = (message.tool_calls ?? []).map((call) => {
    let args = {};
    try { args = JSON.parse(call.function?.arguments || '{}'); } catch { throw new Error('Groq returned invalid tool arguments.'); }
    return { id: call.id, name: call.function?.name, args };
  });
  const parts = [];
  if (contentText) parts.push({ text: contentText });
  for (const call of calls) parts.push({ functionCall: call });
  if (!contentText && calls.length === 0) {
    throw new Error(`Groq returned no user-facing text (finish_reason: ${choice?.finish_reason ?? 'unknown'}).`);
  }
  const content = { role: 'model', parts };
  return { text: contentText, functionCalls: calls, candidates: [{ content }] };
}

function isClosingMessage(text) {
  const normalized = text.normalize('NFKC').toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return /^(?:(?:ok|okay|alright|great|perfect|cool|no|nope)\s+)*(?:that(?:'s| is) all|that(?:'s| is) it|that(?:'s| is) everything|i(?:'m| am) done|i(?:'m| am) good|all good|nothing else|no more questions|no thanks|not anymore|thank you(?: so much)?(?: for your (?:help|assistance))?|thanks(?: so much)?(?: for your (?:help|assistance))?|bye|goodbye|see you)(?:\s+(?:thanks|thank you|bye|goodbye))?$/.test(normalized);
}

function isAssistantClosingMessage(text) {
  return /\b(?:goodbye|bye for now|take care|have a (?:wonderful|lovely|great|nice) day|enjoy your day|thanks for (?:calling|reaching out))\b/i.test(text);
}

function normalizeOrderReference(value) {
  if (typeof value !== 'string') return value;
  const input = value.trim();
  const fullId = input.match(/^ORD\s*-?\s*(\d{3})$/i);
  if (fullId) return `ORD-${fullId[1]}`;

  const spokenId = input.match(/^(?:(?:my\s+)?order(?:\s+(?:id|number))?(?:\s+is)?\s+)(?:ORD\s*-?\s*)?(\d{3})$/i)
    ?? input.match(/^(\d{3})$/);
  return spokenId ? `ORD-${spokenId[1]}` : input;
}

function normalizeSpokenOrderReferences(text, transcript) {
  const withOrderPrefix = text.replace(
    /\b((?:my\s+)?order(?:\s+(?:id|number))?(?:\s+is)?\s+)(?:ORD\s*-?\s*)?(\d{3})\b/gi,
    (_match, prefix, number) => `${prefix}ORD-${number}`,
  );
  const shortId = text.trim().match(/^(?:ORD\s*-?\s*)?(\d{3})$/i);
  if (!shortId) return withOrderPrefix;

  const lastAgentMessage = [...transcript].reverse().find((message) => message.role === 'agent');
  if (/\border\s*(?:id|number)\b/i.test(lastAgentMessage?.text ?? '')) {
    return `The customer provided order reference ORD-${shortId[1]}. Use it without asking for the ORD prefix. The customer said: “${text}”.`;
  }
  return withOrderPrefix;
}

export function createConversationService({
  apiKey = process.env.GROQ_API_KEY,
  model = MODEL,
  orderService = createOrderService(),
  generateContent,
  synthesizeSpeech: speechGenerator,
  fetchImpl = fetch,
} = {}) {
  const invokeModel = generateContent ?? ((request) => generateGroqContent(request, apiKey, model, fetchImpl));
  const makeSpeech = speechGenerator ?? (async (text) => {
    if (!apiKey || generateContent) return null;
    const chunks = splitSpeechText(text);
    return Promise.all(chunks.map(async (input) => {
      const response = await fetchImpl(`${GROQ_API_BASE_URL}/audio/speech`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: TTS_MODEL, voice: TTS_VOICE, input, response_format: 'wav', speed: 1.08 }),
      });
      if (!response.ok) {
        const error = new Error('Groq speech generation failed.');
        error.status = response.status;
        throw error;
      }
      return Buffer.from(await response.arrayBuffer()).toString('base64');
    }));
  });
  const sessions = new Map();

  function getSession(sessionId) {
    const now = Date.now();
    for (const [id, session] of sessions) {
      if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(id);
    }
    let session = sessions.get(sessionId);
    if (!session) {
      if (sessions.size >= MAX_SESSIONS) {
        const oldestId = sessions.keys().next().value;
        if (oldestId) sessions.delete(oldestId);
      }
      session = { historyTurns: [], transcript: [], updatedAt: now, ended: false, summary: null };
      sessions.set(sessionId, session);
    }
    session.updatedAt = now;
    return session;
  }

  function executeTool(name, args = {}) {
    switch (name) {
      case 'get_order_details': return orderService.get_order_details(normalizeOrderReference(args.orderId));
      case 'check_shipping_policy': return checkShipping(args.orderTotal);
      case 'check_return_policy': return checkReturn(args);
      case 'check_damaged_product_policy': return checkDamagedProduct(args);
      case 'check_cash_on_delivery_policy': return checkCashOnDelivery(args);
      case 'cancel_order': return orderService.cancel_order(normalizeOrderReference(args.orderId));
      default: return { kind: 'unsupported_tool' };
    }
  }

  async function sendTurn(sessionId, rawText, rawAlternatives = []) {
    if (typeof rawText !== 'string' || !rawText.trim()) {
      throw new HttpError(400, 'MISSING_MESSAGE', 'Send a non-empty message.');
    }
    const text = rawText.trim();
    if (text.length > MAX_INPUT_LENGTH) {
      throw new HttpError(413, 'MESSAGE_TOO_LONG', `Messages must be ${MAX_INPUT_LENGTH} characters or fewer.`);
    }
    if (!Array.isArray(rawAlternatives) || rawAlternatives.length > 3
        || rawAlternatives.some((alternative) => typeof alternative !== 'string'
          || !alternative.trim() || alternative.trim().length > 250)) {
      throw new HttpError(400, 'INVALID_SPEECH_ALTERNATIVES', 'Speech alternatives must be up to three short text options.');
    }
    const seenAlternatives = new Set([text.toLocaleLowerCase()]);
    const alternatives = rawAlternatives
      .map((alternative) => alternative.trim())
      .filter((alternative) => {
        const normalized = alternative.toLocaleLowerCase();
        if (seenAlternatives.has(normalized)) return false;
        seenAlternatives.add(normalized);
        return true;
      });
    if (!apiKey && !generateContent) {
      throw new HttpError(503, 'GROQ_NOT_CONFIGURED', 'Groq is not configured. Add GROQ_API_KEY to server/.env and restart the server.');
    }

    const session = getSession(sessionId);
    if (session.ended) throw new HttpError(409, 'CONVERSATION_ENDED', 'This call has already ended. Start a new call to continue.');
    if (session.transcript.length >= MAX_TRANSCRIPT_MESSAGES) {
      throw new HttpError(409, 'CONVERSATION_LIMIT_REACHED', 'This call has reached its conversation limit. End it and start a new call.');
    }

    const customerIsClosing = isClosingMessage(text);
    const orderAwareText = normalizeSpokenOrderReferences(text, session.transcript);
    const modelText = customerIsClosing
      ? `${text}\n\nThe customer is clearly finished. Give a brief, warm goodbye and do not ask another question.`
      : alternatives.length
        ? `The most likely transcription of the customer's spoken message is: "${orderAwareText}".\nLower-ranked speech-recognition alternatives (uncertain): ${alternatives.map((alternative) => `"${alternative}"`).join(', ')}.\nDo not treat alternatives as confirmed words or merge them together. If an alternative changes the meaning and you cannot tell what the customer intended, ask one brief clarification before answering or taking action.`
        : orderAwareText;
    const turnContents = [
      ...session.historyTurns.slice(-MAX_HISTORY_TURNS).flat(),
      { role: 'user', parts: [{ text: modelText }] },
    ];
    const currentTurn = [turnContents.at(-1)];
    const calledTools = [];
    let finalReply = '';
    let shouldEndCall = customerIsClosing;

    try {
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const response = await invokeModel({
          model,
          contents: turnContents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            tools,
            temperature: 0.2,
            reasoningEffort: 'low',
            maxOutputTokens: 512,
          },
        });
        const { content, calls } = getCallParts(response);
        if (calls.length === 0) {
          finalReply = extractText(response);
          if (!finalReply) throw new Error('Groq returned no text response.');
          const modelContent = content ?? { role: 'model', parts: [{ text: finalReply }] };
          turnContents.push(modelContent);
          currentTurn.push(modelContent);
          break;
        }

        if (!content) throw new Error('Groq returned a function call without message content.');
        turnContents.push(content);
        currentTurn.push(content);
        const functionResults = calls.map((call) => {
          if (call.name === 'end_call') {
            shouldEndCall = true;
            calledTools.push(call.name);
            return { functionResponse: { name: call.name, response: { result: 'The customer is finished. Give a short, warm goodbye now.' }, ...(call.id ? { id: call.id } : {}) } };
          }
          const result = executeTool(call.name, call.args);
          calledTools.push(call.name);
          return { functionResponse: { name: call.name, response: { result }, ...(call.id ? { id: call.id } : {}) } };
        });
        const resultContent = { role: 'user', parts: functionResults };
        turnContents.push(resultContent);
        currentTurn.push(resultContent);
      }
      if (!finalReply) throw new Error('Groq exceeded the tool-call limit for this turn.');
      if (isAssistantClosingMessage(finalReply)) shouldEndCall = true;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Groq turn failed:', error?.message ?? 'Unknown Groq error');
      throw explainGroqFailure(error);
    }

    session.historyTurns.push(currentTurn);
    session.historyTurns = session.historyTurns.slice(-MAX_HISTORY_TURNS);
    session.transcript.push(
      { role: 'customer', text, timestamp: new Date().toISOString() },
      { role: 'agent', text: finalReply, timestamp: new Date().toISOString() },
    );
    session.transcript = session.transcript.slice(-MAX_TRANSCRIPT_MESSAGES);
    if (shouldEndCall) session.ended = true;
    return { sessionId, reply: finalReply, transcript: session.transcript, toolsUsed: calledTools, callEnded: shouldEndCall };
  }

  async function synthesizeSpeech(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || Date.now() - session.updatedAt > SESSION_TTL_MS) {
      throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'No conversation was found for this call.');
    }
    const latestAgentMessage = [...session.transcript].reverse().find((message) => message.role === 'agent');
    if (!latestAgentMessage) throw new HttpError(400, 'NO_REPLY_TO_SPEAK', 'There is no assistant reply to read aloud.');
    if (!apiKey && !generateContent) {
      throw new HttpError(503, 'GROQ_NOT_CONFIGURED', 'Groq is not configured. Add GROQ_API_KEY to server/.env and restart the server.');
    }
    try {
      const generatedSpeech = await makeSpeech(latestAgentMessage.text);
      if (Array.isArray(generatedSpeech)) {
        return generatedSpeech.length === 1
          ? { audioData: generatedSpeech[0] }
          : { audioSegments: generatedSpeech };
      }
      return { audioData: generatedSpeech };
    } catch {
      console.error('Groq speech generation failed; the browser voice will be used instead.');
      return { audioData: null };
    }
  }

  async function endConversation(sessionId) {
    const session = sessions.get(sessionId);
    if (!session || Date.now() - session.updatedAt > SESSION_TTL_MS) {
      sessions.delete(sessionId);
      throw new HttpError(404, 'CONVERSATION_NOT_FOUND', 'No conversation was found for this call.');
    }
    if (session.summary) return { summary: session.summary, transcript: session.transcript };
    if (session.transcript.length === 0) throw new HttpError(400, 'EMPTY_CONVERSATION', 'There is no conversation to summarize yet.');
    if (!apiKey && !generateContent) {
      throw new HttpError(503, 'GROQ_NOT_CONFIGURED', 'Groq is not configured. Add GROQ_API_KEY to server/.env and restart the server.');
    }

    const transcriptText = session.transcript.map(({ role, text }) => `${role === 'customer' ? 'Customer' : 'Aria'}: ${text}`).join('\n');
    try {
      const response = await invokeModel({
        model,
        contents: [{ role: 'user', parts: [{ text: `Summarize this Aura Skincare support call using only the transcript. Do not invent order IDs or outcomes.\n\n${transcriptText}` }] }],
        config: {
          systemInstruction: 'Return only a concise, factual structured call outcome. Mark the call unresolved if the customer request was not completed or remains unclear.',
          responseMimeType: 'application/json',
          responseSchema: summarySchema,
          temperature: 0.1,
          reasoningEffort: 'low',
          maxOutputTokens: 768,
        },
      });
      const summary = JSON.parse(extractText(response));
      if (!summary.customer_intent || !summary.resolution_status || !summary.call_summary || !Array.isArray(summary.next_steps)) {
        throw new Error('Groq returned an incomplete call summary.');
      }
      if (typeof summary.order_id !== 'string') summary.order_id = '';
      session.summary = summary;
      session.ended = true;
      session.updatedAt = Date.now();
      return { summary, transcript: session.transcript };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error('Groq summary failed:', error?.message ?? 'Unknown Groq error');
      throw makeConversationError('We couldn’t prepare the call summary just now. The conversation is still saved; please try ending the call again.');
    }
  }

  function hasEndedSession(sessionId) {
    const session = sessions.get(sessionId);
    return Boolean(session?.ended && Date.now() - session.updatedAt <= SESSION_TTL_MS);
  }

  return { sendTurn, synthesizeSpeech, endConversation, hasEndedSession };
}
