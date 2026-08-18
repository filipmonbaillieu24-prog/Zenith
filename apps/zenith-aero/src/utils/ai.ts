export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AISettings {
  provider: 'disabled' | 'ollama' | 'openai';
  ollamaUrl: string;
  ollamaModel: string;
  openaiKey: string;
  openaiModel: string;
}

export function getAISettings(): AISettings {
  return {
    provider: (localStorage.getItem('cyclo_ai_provider') as any) || 'disabled',
    ollamaUrl: localStorage.getItem('cyclo_ai_ollama_url') || 'http://localhost:11434',
    ollamaModel: localStorage.getItem('cyclo_ai_ollama_model') || 'qwen2',
    openaiKey: localStorage.getItem('cyclo_ai_openai_key') || '',
    openaiModel: localStorage.getItem('cyclo_ai_openai_model') || 'gpt-4o-mini',
  };
}

export function saveAISettings(settings: AISettings) {
  localStorage.setItem('cyclo_ai_provider', settings.provider);
  localStorage.setItem('cyclo_ai_ollama_url', settings.ollamaUrl);
  localStorage.setItem('cyclo_ai_ollama_model', settings.ollamaModel);
  localStorage.setItem('cyclo_ai_openai_key', settings.openaiKey);
  localStorage.setItem('cyclo_ai_openai_model', settings.openaiModel);
}

export async function sendAIChat(
  messages: AIChatMessage[],
  systemContext: string
): Promise<string> {
  const settings = getAISettings();

  if (settings.provider === 'disabled') {
    throw new Error('AI assistent is uitgeschakeld in de instellingen.');
  }

  const systemMessage: AIChatMessage = {
    role: 'system',
    content: `${systemContext}\nJe bent een professionele wielercoach genaamd Zenith AI Coach. Geef korte, duidelijke en wetenschappelijk onderbouwde antwoorden in het Nederlands. Gebruik none emojis in je antwoord.`,
  };

  const fullMessages = [systemMessage, ...messages];

  if (settings.provider === 'ollama') {
    const url = `${settings.ollamaUrl.replace(/\/$/, '')}/api/chat`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: settings.ollamaModel,
        messages: fullMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama fout: ${response.statusText}. Controleer of Ollama lokaal actief is.`);
    }

    const data = await response.json();
    return data.message?.content || '';
  } else {
    // OpenAI provider
    if (!settings.openaiKey) {
      throw new Error('OpenAI API-sleutel ontbreekt.');
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${settings.openaiKey}`,
      },
      body: JSON.stringify({
        model: settings.openaiModel,
        messages: fullMessages,
      }),
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error?.message || `OpenAI API fout: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  }
}
