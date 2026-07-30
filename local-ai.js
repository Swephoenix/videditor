'use strict';

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 20_000;
const MAX_CHAT_LENGTH = 100_000;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

const AUDIO_TOOL_DEFINITIONS = [
  {
    type: 'function',
    function: {
      name: 'analyze_audio',
      description: 'Analysera ett uppladdat ljud via media_id. Börja här när ingen aktuell analys finns.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          media_id: { type: 'string' },
          window_ms: { type: 'number', minimum: 10, maximum: 1000 },
          detect: {
            type: 'array',
            items: {
              type: 'string',
              enum: ['speech', 'silence', 'noise', 'background_noise', 'music', 'laughter', 'cough', 'clipping', 'loudness']
            }
          }
        },
        required: ['media_id']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'align_transcript',
      description: 'Koppla en transkription till befintliga Whisper-ordtidskoder för ett media_id.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          media_id: { type: 'string' },
          transcript: { type: 'string' },
          language: { type: 'string' }
        },
        required: ['media_id', 'transcript']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'search_audio',
      description: 'Sök efter ord eller ljudhändelser i en sparad analys.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          analysis_id: { type: 'string' },
          query: {
            type: 'object',
            additionalProperties: false,
            properties: {
              words: { type: 'array', items: { type: 'string' } },
              sounds: { type: 'array', items: { type: 'string' } },
              minimum_confidence: { type: 'number', minimum: 0, maximum: 1 }
            }
          }
        },
        required: ['analysis_id', 'query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'process_audio_range',
      description: 'Skapa en förbättrad kopia av ett specifikt tidsintervall. Originalet ändras inte.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          media_id: { type: 'string' },
          start: { type: 'number', minimum: 0 },
          end: { type: 'number', minimum: 0 },
          operations: {
            type: 'array',
            minItems: 1,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                type: {
                  type: 'string',
                  enum: ['noise_reduction', 'voice_enhancement', 'declick', 'declip', 'deesser', 'remove_hum', 'remove_reverb', 'normalize', 'compress', 'equalize']
                },
                strength: { type: 'number', minimum: 0, maximum: 1 }
              },
              required: ['type']
            }
          }
        },
        required: ['media_id', 'start', 'end', 'operations']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'master_podcast',
      description: 'Skapa en masterad kopia av hela podden med spoken_podcast-preset.',
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {
          media_id: { type: 'string' },
          analysis_id: { type: 'string' },
          preset: { type: 'string', enum: ['spoken_podcast'] },
          settings: {
            type: 'object',
            additionalProperties: false,
            properties: {
              reduce_background_noise: { type: 'boolean' },
              enhance_voices: { type: 'boolean' },
              remove_clicks: { type: 'boolean' },
              repair_clipping: { type: 'boolean' },
              target_lufs: { type: 'number', minimum: -36, maximum: -8 },
              true_peak_limit_db: { type: 'number', minimum: -6, maximum: -0.1 }
            }
          }
        },
        required: ['media_id']
      }
    }
  }
];

const SYSTEM_PROMPT = [
  'Du är AI-redigeraren i en lokal video- och poddeditor.',
  'Använd verktygen när användaren ber om analys eller ljudändringar.',
  'När ingen aktuell analys finns ska du börja med analyze_audio.',
  'Använd endast media_id och analysis_id; hitta aldrig på ID:n och använd aldrig filsökvägar.',
  'Ett ogiltigt eller omvänt tidsintervall ska förklaras utan verktygsanrop.',
  'process_audio_range och master_podcast skapar nya kopior och ändrar inte originalet.',
  'Brusart, musik, skratt och hosta kan sakna installerad detektor; var tydlig när unsupported_detect rapporterar detta.',
  'Svara kort på svenska och sammanfatta varje utfört verktygsresultat.'
].join(' ');

function validateAiChatRequest(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw badRequest('Request måste vara ett objekt.');
  const unknown = Object.keys(raw).filter((key) => key !== 'messages');
  if (unknown.length) throw badRequest(`Fältet ${unknown[0]} får inte skickas; modell och ctx styrs av det lokala API:t.`);
  if (!Array.isArray(raw.messages) || raw.messages.length < 1 || raw.messages.length > MAX_MESSAGES) {
    throw badRequest(`messages måste innehålla 1–${MAX_MESSAGES} meddelanden.`);
  }
  let totalLength = 0;
  const messages = raw.messages.map((message, index) => {
    if (!message || typeof message !== 'object' || Array.isArray(message)) throw badRequest(`messages[${index}] är ogiltigt.`);
    if (!['user', 'assistant'].includes(message.role)) throw badRequest(`messages[${index}].role är inte tillåten.`);
    if (typeof message.content !== 'string' || !message.content.trim() || message.content.length > MAX_MESSAGE_LENGTH) {
      throw badRequest(`messages[${index}].content är ogiltigt.`);
    }
    totalLength += message.content.length;
    return { role: message.role, content: message.content.trim() };
  });
  if (totalLength > MAX_CHAT_LENGTH) throw badRequest('Chatthistoriken är för stor.');
  if (messages.at(-1).role !== 'user') throw badRequest('Det sista meddelandet måste komma från användaren.');
  return { messages };
}

function buildModelRequest(messages) {
  return {
    messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
    tools: AUDIO_TOOL_DEFINITIONS,
    tool_choice: 'auto',
    stream: false,
    temperature: 0.1,
    max_tokens: 1536
  };
}

module.exports = {
  AUDIO_TOOL_DEFINITIONS,
  SYSTEM_PROMPT,
  validateAiChatRequest,
  buildModelRequest
};
