import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUnsubscribeLink } from '@/lib/gmail';
import { getDb } from '@/lib/db';
import puppeteer from 'puppeteer';
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

async function unsubscribeFromLink(url: string): Promise<boolean> {
  let browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--disable-gpu',
      ],
    });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

    // Get page content
    const content = await page.content();
    const text = await page.evaluate(() => document.body.innerText);

    // Use AI to determine what actions to take
    const prompt = `You are an AI agent that needs to unsubscribe from an email list. Analyze the following webpage and determine what actions to take.

URL: ${url}
Page Text: ${text.substring(0, 2000)}

IMPORTANT: Respond with ONLY a valid JSON object, no other text. The JSON must contain:
1. "action": one of ["click_button", "fill_form", "toggle_checkbox", "follow_link", "none"]
2. "selector": CSS selector for the element to interact with (ONLY if you can identify a reliable CSS selector from the page)
3. "form_data": object with field names and values to fill (if action is "fill_form")
4. "button_text": exact text of button to click (if available)
5. "instructions": brief description (optional)

CRITICAL RULES:
- If selector might not exist, set "selector" to null or omit it
- Prefer "button_text" over "selector" when possible
- Use "none" action if page already shows success/unsubscribed message
- Selectors must be valid CSS (use id, class, or attribute selectors)

Example response:
{
  "action": "click_button",
  "selector": null,
  "button_text": "Unsubscribe",
  "instructions": "Click the unsubscribe button"
}`;

    const client = getOpenRouterClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an AI agent that helps unsubscribe from email lists. Respond with valid JSON only.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const resultText = response.choices[0]?.message?.content?.trim() || '{}';
    
    // Try to extract JSON from the response (in case AI adds extra text)
    let result: any = {};
    try {
      // Try to find JSON object in the response
      const jsonMatch = resultText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(resultText);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', resultText);
      // Default action: try to find unsubscribe button by text
      result = { action: 'click_button', button_text: 'unsubscribe' };
    }
    
    // Validate result has required fields
    if (!result.action) {
      result.action = 'click_button';
    }

    // Helper function to safely find and click an element
    const safeClick = async (selector: string, timeout = 5000): Promise<boolean> => {
      try {
        await page.waitForSelector(selector, { timeout, visible: true });
        await page.click(selector);
        return true;
      } catch (error) {
        return false;
      }
    };

    // Helper function to find element by text
    const findElementByText = async (text: string, tag = 'button'): Promise<boolean> => {
      try {
        const elements = await page.$$(tag);
        for (const el of elements) {
          const elementText = await el.evaluate((e) => e.textContent?.toLowerCase() || '');
          if (elementText.includes(text.toLowerCase())) {
            await el.click();
            return true;
          }
        }
        return false;
      } catch (error) {
        return false;
      }
    };

    // Execute the action with error handling
    let actionExecuted = false;

    if (result.action === 'click_button') {
      if (result.selector) {
        // Try the exact selector first
        actionExecuted = await safeClick(result.selector);
        
        // If that fails, try finding by button text
        if (!actionExecuted && result.button_text) {
          actionExecuted = await findElementByText(result.button_text, 'button');
        }
        
        // If still fails, try finding any button with unsubscribe text
        if (!actionExecuted) {
          actionExecuted = await findElementByText('unsubscribe', 'button');
        }
      } else if (result.button_text) {
        actionExecuted = await findElementByText(result.button_text, 'button');
        if (!actionExecuted) {
          actionExecuted = await findElementByText('unsubscribe', 'button');
        }
      }
    } else if (result.action === 'fill_form') {
      if (result.form_data) {
        let formFilled = true;
        for (const [field, value] of Object.entries(result.form_data)) {
          try {
            // Try different selector patterns
            const selectors = [`#${field}`, `input[name="${field}"]`, `input[type="email"]`, `input[type="text"]`];
            let filled = false;
            
            for (const sel of selectors) {
              try {
                await page.waitForSelector(sel, { timeout: 2000 });
                await page.type(sel, value as string);
                filled = true;
                break;
              } catch {
                continue;
              }
            }
            
            if (!filled) {
              formFilled = false;
            }
          } catch (error) {
            formFilled = false;
          }
        }
        
        if (formFilled) {
          // Try to find and click submit/unsubscribe button
          actionExecuted = await findElementByText('unsubscribe', 'button');
          if (!actionExecuted) {
            actionExecuted = await findElementByText('submit', 'button');
          }
          if (!actionExecuted) {
            // Try clicking submit inputs
            const submitInputs = await page.$$('input[type="submit"]');
            if (submitInputs.length > 0) {
              await submitInputs[0].click();
              actionExecuted = true;
            }
          }
        }
      }
    } else if (result.action === 'toggle_checkbox') {
      if (result.selector) {
        actionExecuted = await safeClick(result.selector);
      } else {
        // Try to find checkbox
        const checkboxes = await page.$$('input[type="checkbox"]');
        if (checkboxes.length > 0) {
          await checkboxes[0].click();
          actionExecuted = true;
        }
      }
    } else if (result.action === 'follow_link') {
      actionExecuted = await findElementByText('unsubscribe', 'a');
      if (!actionExecuted) {
        actionExecuted = await findElementByText('confirm', 'a');
      }
    } else if (result.action === 'none') {
      // Maybe it's already a direct unsubscribe link, check if we're on a success page
      const pageText = await page.evaluate(() => document.body.innerText);
      actionExecuted = pageText.toLowerCase().includes('unsubscribed') ||
                      pageText.toLowerCase().includes('success') ||
                      pageText.toLowerCase().includes('removed');
    }

    // Fallback: If no specific action worked, try common patterns
    if (!actionExecuted) {
      // Look for any button or link with unsubscribe-related text
      const allClickables = await page.$$('button, a, input[type="submit"], [onclick]');
      for (const el of allClickables) {
        try {
          const text = await el.evaluate((e) => {
            return (e.textContent || e.getAttribute('value') || e.getAttribute('aria-label') || '').toLowerCase();
          });
          
          if (text.includes('unsubscribe') || text.includes('opt out') || text.includes('remove') || 
              text.includes('confirm') || text.includes('proceed')) {
            await el.click();
            actionExecuted = true;
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // Wait a bit for any redirects or confirmations
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check if we got a success message
    const finalText = await page.evaluate(() => document.body.innerText);
    const finalUrl = page.url();
    
    const success = finalText.toLowerCase().includes('unsubscribed') ||
                   finalText.toLowerCase().includes('success') ||
                   finalText.toLowerCase().includes('removed') ||
                   finalText.toLowerCase().includes('opt-out') ||
                   finalText.toLowerCase().includes('preferences updated') ||
                   (finalUrl.includes('unsubscribe') || finalUrl.includes('confirm') || finalUrl.includes('success'));

    if (!success && actionExecuted) {
      // If we executed an action but aren't sure if it succeeded, 
      // check if URL changed (which might indicate success)
      const urlChanged = finalUrl !== url;
      if (urlChanged) {
        // Give it a bit more time and check again
        await new Promise(resolve => setTimeout(resolve, 2000));
        const secondCheck = await page.evaluate(() => document.body.innerText);
        return secondCheck.toLowerCase().includes('unsubscribed') ||
               secondCheck.toLowerCase().includes('success') ||
               secondCheck.toLowerCase().includes('removed');
      }
    }

    return success;
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return false;
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { emailIds } = await request.json();

    if (!Array.isArray(emailIds) || emailIds.length === 0) {
      return NextResponse.json({ error: 'Invalid email IDs' }, { status: 400 });
    }

    const db = getDb();
    let unsubscribedCount = 0;

    for (const emailId of emailIds) {
      // Get email info
      const email = db
        .prepare('SELECT gmail_id, body_html FROM emails WHERE id = ? AND user_id = ?')
        .get(emailId, session.userId) as { gmail_id: string; body_html: string } | undefined;

      if (!email || !email.body_html) {
        continue;
      }

      try {
        // Find unsubscribe link
        const unsubscribeUrl = await getUnsubscribeLink(email.body_html);

        if (!unsubscribeUrl) {
          continue;
        }

        // Use AI agent to unsubscribe
        const success = await unsubscribeFromLink(unsubscribeUrl);

        if (success) {
          // Mark as unsubscribed (we could add a field for this)
          unsubscribedCount++;
        }
      } catch (error) {
        console.error(`Error unsubscribing from email ${emailId}:`, error);
      }
    }

    return NextResponse.json({ unsubscribed: unsubscribedCount });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}

