const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL;
const productionApiBaseUrl = 'https://auraskin-api-d6wb.onrender.com';
const defaultApiBaseUrl = import.meta.env.DEV ? 'http://localhost:5000' : productionApiBaseUrl;
const rawApiBaseUrl = (configuredApiBaseUrl?.trim() || defaultApiBaseUrl).trim();

function normalizeApiBaseUrl(value) {
  try {
    const url = new URL(value);
    const supportedProtocol = url.protocol === 'http:' || url.protocol === 'https:';
    const hasNoCredentials = !url.username && !url.password;
    const hasNoExtraPath = url.pathname === '/' || url.pathname === '';
    const hasNoQueryOrHash = !url.search && !url.hash;

    if (!supportedProtocol || !url.hostname || !hasNoCredentials || !hasNoExtraPath || !hasNoQueryOrHash) {
      return '';
    }

    return url.origin;
  } catch {
    return '';
  }
}

const API_BASE_URL = normalizeApiBaseUrl(rawApiBaseUrl);
const apiBaseUrlError = API_BASE_URL
  ? ''
  : 'The support API URL is invalid. Set VITE_API_BASE_URL to https://auraskin-api-d6wb.onrender.com without extra text or a path.';

async function request(path, options = {}) {
  if (!API_BASE_URL) {
    throw new Error(apiBaseUrlError);
  }

  const requestPath = `/${path.replace(/^\/+/, '')}`;

  let response;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 30000);
  try {
    response = await fetch(`${API_BASE_URL}${requestPath}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('That request took too long. Please try again.');
    }
    throw new Error('We couldn’t connect just now. Please try again in a moment.');
  } finally {
    window.clearTimeout(timeoutId);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error?.message || 'We couldn’t complete that request. Please try again.');
    error.status = response.status;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload?.data;
}

export const getOrder = (orderId) => request(`/api/orders/${encodeURIComponent(orderId)}`);
export const getSampleOrders = (orderIds) => Promise.all(orderIds.map(getOrder));
export const checkShippingPolicy = (orderTotal) => request('/api/policies/shipping', {
  method: 'POST',
  body: JSON.stringify({ orderTotal }),
});

export const sendConversationTurn = (sessionId, text, alternatives = []) => request(`/api/conversations/${encodeURIComponent(sessionId)}/turn`, {
  method: 'POST',
  body: JSON.stringify({ text, ...(alternatives.length ? { alternatives } : {}) }),
});

export const getConversationSpeech = (sessionId) => request(`/api/conversations/${encodeURIComponent(sessionId)}/speech`, {
  method: 'POST',
});

export const endConversation = (sessionId) => request(`/api/conversations/${encodeURIComponent(sessionId)}/end`, {
  method: 'POST',
});

export const submitCallFeedback = (feedback) => request('/api/feedback', {
  method: 'POST',
  body: JSON.stringify(feedback),
});

const api = { baseUrl: API_BASE_URL, getOrder, getSampleOrders, checkShippingPolicy, sendConversationTurn, getConversationSpeech, endConversation, submitCallFeedback };

export default api;
