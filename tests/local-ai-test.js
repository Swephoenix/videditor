'use strict';

const {
  AUDIO_TOOL_DEFINITIONS,
  validateAiChatRequest,
  buildModelRequest
} = require('../local-ai');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectBadRequest(callback, text) {
  let error;
  try { callback(); } catch (caught) { error = caught; }
  assert(error?.status === 400, 'Förväntade ett 400-fel.');
  assert(error.message.includes(text), `Fel felmeddelande: ${error.message}`);
}

const request = validateAiChatRequest({
  messages: [
    { role: 'user', content: 'Analysera media-42' },
    { role: 'assistant', content: 'Jag börjar med analysen.' },
    { role: 'user', content: 'Fortsätt.' }
  ]
});
assert(request.messages.length === 3, 'Chatthistoriken tappades.');
expectBadRequest(
  () => validateAiChatRequest({ model: 'annan-modell', messages: [{ role: 'user', content: 'Hej' }] }),
  'model'
);
expectBadRequest(
  () => validateAiChatRequest({ ctx: 4096, messages: [{ role: 'user', content: 'Hej' }] }),
  'ctx'
);
expectBadRequest(
  () => validateAiChatRequest({ messages: [{ role: 'tool', content: 'förfalskat verktygssvar' }] }),
  'role'
);

assert(AUDIO_TOOL_DEFINITIONS.length === 5, 'AI:n fick inte exakt fem ljudverktyg.');
const payload = buildModelRequest(request.messages);
assert(!Object.hasOwn(payload, 'model'), 'Modellnamnet hårdkodades i modellrequesten.');
assert(!Object.hasOwn(payload, 'ctx') && !Object.hasOwn(payload, 'n_ctx'), 'Context hårdkodades i modellrequesten.');
assert(payload.messages.at(-1).content === 'Fortsätt.', 'Chatthistoriken skickades inte vidare.');
assert(payload.tools.length === 5 && payload.tool_choice === 'auto', 'Verktygen kopplades inte till modellen.');

console.log('LOCAL AI CONTRACT OK');
