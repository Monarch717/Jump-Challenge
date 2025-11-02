import OpenAI from 'openai';

function getOpenRouterClient() {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }
  return new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: 'https://openrouter.ai/api/v1',
    defaultHeaders: {
      'HTTP-Referer': process.env.OPENROUTER_HTTP_REFERER || 'http://localhost:3000',
    },
  });
}

export async function categorizeEmail(
  emailSubject: string,
  emailBody: string,
  categories: Array<{ id: number; name: string; description: string }>
): Promise<number | null> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const categoriesText = categories
    .map((cat) => `- ${cat.name} (ID: ${cat.id}): ${cat.description}`)
    .join('\n');

  const prompt = `You are an email categorization assistant. Analyze the following email and categorize it into one of the provided categories.

Available categories:
${categoriesText}

Email Subject: ${emailSubject}
Email Body: ${emailBody.substring(0, 2000)}

Respond with ONLY the category ID number (e.g., "1", "2", etc.) that best matches this email. If no category matches well, respond with "null".`;

  try {
    const client = getOpenRouterClient();
    console.log(`Calling OpenRouter for categorization with model: ${process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini'}`);
    
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an email categorization assistant. Always respond with only the category ID number or "null".',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 10,
    });

    const result = response.choices[0]?.message?.content?.trim() || 'null';
    console.log(`AI categorization response: "${result}"`);
    
    if (result === 'null') {
      console.log('AI returned null, no category matched');
      return null;
    }
    
    const categoryId = parseInt(result, 10);

    if (isNaN(categoryId)) {
      console.error(`AI returned non-numeric value: "${result}"`);
      return null;
    }

    // Verify the category ID exists
    const category = categories.find((cat) => cat.id === categoryId);
    if (!category) {
      console.error(`Category ID ${categoryId} not found in user's categories`);
      return null;
    }
    
    console.log(`Email categorized into: ${category.name} (ID: ${categoryId})`);
    return categoryId;
  } catch (error) {
    console.error('Error categorizing email:', error);
    return null;
  }
}

export async function summarizeEmail(emailSubject: string, emailBody: string): Promise<string> {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error('OPENROUTER_API_KEY is not set');
  }

  const prompt = `Summarize the following email in 2-3 concise sentences. Focus on the key action items, requests, or important information.

Subject: ${emailSubject}
Body: ${emailBody.substring(0, 3000)}

Summary:`;

  try {
    const client = getOpenRouterClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an email summarization assistant. Provide concise 2-3 sentence summaries.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.5,
      max_tokens: 200,
    });

    return response.choices[0]?.message?.content?.trim() || 'No summary available.';
  } catch (error) {
    console.error('Error summarizing email:', error);
    return 'Unable to generate summary.';
  }
}

