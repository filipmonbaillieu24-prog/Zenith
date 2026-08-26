import { supabase } from '@zenith/shared';

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AISettings {
  provider: 'disabled' | 'ollama' | 'openai';
  ollamaUrl: string;
  ollamaModel: string;
  /**
   * Write-only. The saved key is never read back into the browser - this is
   * whatever the user has typed into the field right now, and is empty when
   * settings are loaded. Use `hasOpenAIKey()` to tell whether one is stored.
   */
  openaiKey: string;
  openaiModel: string;
}

export function getAISettings(): AISettings {
  return {
    provider: (localStorage.getItem('cyclo_ai_provider') as any) || 'disabled',
    ollamaUrl: localStorage.getItem('cyclo_ai_ollama_url') || 'http://localhost:11434',
    ollamaModel: localStorage.getItem('cyclo_ai_ollama_model') || 'qwen2',
    // Never read back - the key lives server-side (see saveAISettings).
    openaiKey: '',
    openaiModel: localStorage.getItem('cyclo_ai_openai_model') || 'gpt-4o-mini',
  };
}

/** Whether an OpenAI key is stored server-side for this user. */
export async function hasOpenAIKey(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('has_openai_key');
    if (error) return false;
    return !!data;
  } catch {
    return false;
  }
}

export async function saveAISettings(settings: AISettings): Promise<void> {
  localStorage.setItem('cyclo_ai_provider', settings.provider);
  localStorage.setItem('cyclo_ai_ollama_url', settings.ollamaUrl);
  localStorage.setItem('cyclo_ai_ollama_model', settings.ollamaModel);
  localStorage.setItem('cyclo_ai_openai_model', settings.openaiModel);

  // The OpenAI key is deliberately NOT written to localStorage: it used to sit
  // there in plaintext on disk, readable by any script on the origin. It goes
  // to user_ai_credentials instead, a table the client can write but has no
  // SELECT policy on, and is used only by the ai-chat Edge Function.
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return;

  const row: Record<string, unknown> = {
    user_id: userId,
    openai_model: settings.openaiModel,
    updated_at: new Date().toISOString(),
  };
  // An empty field means "leave what's stored alone", so a user editing other
  // settings doesn't wipe their key just because the box renders blank.
  if (settings.openaiKey.trim()) {
    row.openai_key = settings.openaiKey.trim();
  }

  const { error } = await supabase
    .from('user_ai_credentials')
    .upsert(row, { onConflict: 'user_id' });
  if (error) throw error;
}

/** Removes the stored OpenAI key for this user. */
export async function clearOpenAIKey(): Promise<void> {
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData?.user?.id;
  if (!userId) return;
  const { error } = await supabase
    .from('user_ai_credentials')
    .update({ openai_key: null })
    .eq('user_id', userId);
  if (error) throw error;
}

export async function sendAIChat(
  messages: AIChatMessage[],
  systemContext: string
): Promise<string> {
  const settings = getAISettings();

  if (settings.provider === 'disabled') {
    throw new Error('AI assistant is disabled in settings.');
  }

  const systemMessage: AIChatMessage = {
    role: 'system',
    content: `${systemContext}\nYou are a professional cycling coach named Zenith AI Coach. Give short, clear, scientifically grounded answers in English. Do not use emojis in your answer.`,
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
      throw new Error(`Ollama error: ${response.statusText}. Make sure Ollama is running locally.`);
    }

    const data = await response.json();
    return data.message?.content || '';
  } else {
    // OpenAI provider. Routed through the ai-chat Edge Function so the key
    // stays server-side; the browser only ever sends the conversation.
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: { messages: fullMessages, model: settings.openaiModel },
    });

    if (error) {
      // Supabase wraps a non-2xx as a FunctionsHttpError whose response body
      // carries our own message - surface that rather than "Edge Function
      // returned a non-2xx status code".
      let detail = '';
      try {
        const ctx = (error as any)?.context;
        if (ctx && typeof ctx.json === 'function') {
          detail = (await ctx.json())?.error ?? '';
        }
      } catch {
        // fall through to the generic message
      }
      throw new Error(detail || error.message || 'AI request failed.');
    }
    if (data?.error) throw new Error(data.error);
    return data?.content ?? '';
  }
}
