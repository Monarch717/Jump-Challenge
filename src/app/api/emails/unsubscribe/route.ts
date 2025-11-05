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
    console.log(`[Unsubscribe] Starting process for URL: ${url}`);
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
    await page.setViewport({ width: 1280, height: 720 });
    
    // Set user agent to avoid bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate with error handling
    try {
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    } catch (error) {
      console.log('[Unsubscribe] Navigation error, trying domcontentloaded...', error);
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (err2) {
        console.log('[Unsubscribe] Second navigation attempt failed:', err2);
      }
    }
    
    // Handle redirects
    let currentUrl = url;
    let redirectCount = 0;
    const maxRedirects = 5;
    
    while (redirectCount < maxRedirects) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      try {
        const newUrl = page.url();
        if (newUrl !== currentUrl && !newUrl.includes('about:blank')) {
          console.log(`[Unsubscribe] Redirect ${redirectCount + 1}: ${currentUrl} -> ${newUrl}`);
          currentUrl = newUrl;
          redirectCount++;
          
          // Wait for navigation to complete
          try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 10000 }).catch(() => {});
          } catch {}
        } else {
          break;
        }
      } catch (error) {
        console.log('[Unsubscribe] Error checking redirect:', error);
        break;
      }
    }
    
    // Wait for page to stabilize
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Verify page is accessible
    let pageAccessible = false;
    try {
      await page.evaluate(() => document.readyState);
      pageAccessible = true;
    } catch (error) {
      console.error('[Unsubscribe] Page context not accessible:', error);
      // Wait more and retry
      await new Promise(resolve => setTimeout(resolve, 3000));
      try {
        await page.evaluate(() => document.readyState);
        pageAccessible = true;
      } catch (retryError) {
        console.error('[Unsubscribe] Page still not accessible after retry');
        return false;
      }
    }
    
    if (!pageAccessible) {
      return false;
    }
    
    const finalUrl = page.url();
    console.log(`[Unsubscribe] Final URL: ${finalUrl}`);

    // Get comprehensive page structure with error handling
    let pageInfo: any;
    try {
      pageInfo = await page.evaluate(() => {
        const forms = Array.from(document.querySelectorAll('form'));
        const formStructure = forms.map((form, idx) => {
          const inputs = Array.from(form.querySelectorAll('input, select, textarea'));
          const fields = inputs.map((input: any) => {
            // Find associated label
            let labelText = '';
            if (input.id) {
              const label = document.querySelector(`label[for="${input.id}"]`);
              if (label) labelText = label.textContent?.trim() || '';
            }
            if (!labelText) {
              let prev = input.previousElementSibling;
              while (prev && prev.tagName !== 'LABEL') {
                prev = prev.previousElementSibling;
              }
              if (prev && prev.tagName === 'LABEL') {
                labelText = prev.textContent?.trim() || '';
              }
            }

            return {
              type: input.type || input.tagName.toLowerCase(),
              name: input.name || '',
              id: input.id || '',
              placeholder: input.placeholder || '',
              label: labelText,
              value: input.value || '',
              required: input.hasAttribute('required'),
              checked: input.checked || false,
              options: input.tagName === 'SELECT' ? Array.from(input.options || []).map((opt: any) => ({
                value: opt.value || '',
                text: (opt.text || '').trim(),
                selected: opt.selected
              })) : [],
            };
          });
          return {
            index: idx,
            action: form.action || '',
            method: form.method || 'get',
            fields: fields
          };
        });

        const buttons = Array.from(document.querySelectorAll('button, input[type="submit"], input[type="button"], a[href]'));
        const buttonInfo = buttons.map((btn: any) => ({
          tag: btn.tagName.toLowerCase(),
          text: (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').trim(),
          type: btn.type || '',
          id: btn.id || '',
          class: btn.className || '',
          href: btn.href || '',
        }));

        const pageText = document.body.innerText || '';
        const pageHtml = document.body.innerHTML || '';

        return {
          url: window.location.href,
          title: document.title || '',
          text: pageText.substring(0, 3000),
          html: pageHtml.substring(0, 5000),
          forms: formStructure,
          buttons: buttonInfo,
          hasUnsubscribeText: pageText.toLowerCase().includes('unsubscribe'),
          hasSuccessText: /unsubscribed|success|removed|opt.*out|confirmed|preferences updated/i.test(pageText),
        };
      });
    } catch (error) {
      console.error('[Unsubscribe] Error extracting page structure:', error);
      return false;
    }

    console.log('[Unsubscribe] Page structure extracted. Forms:', pageInfo.forms.length, 'Buttons:', pageInfo.buttons.length);

    // Check if already unsubscribed
    if (pageInfo.hasSuccessText) {
      console.log('[Unsubscribe] Already unsubscribed');
      return true;
    }
    
    // Check if this is actually an unsubscribe page
    const isUnsubscribePage = pageInfo.hasUnsubscribeText || 
                              pageInfo.forms.length > 0 ||
                              finalUrl.toLowerCase().includes('unsubscribe') ||
                              finalUrl.toLowerCase().includes('opt-out') ||
                              finalUrl.toLowerCase().includes('optout') ||
                              finalUrl.toLowerCase().includes('preferences') ||
                              finalUrl.toLowerCase().includes('manage') ||
                              pageInfo.text.toLowerCase().includes('email preferences') ||
                              pageInfo.text.toLowerCase().includes('manage subscription') ||
                              pageInfo.text.toLowerCase().includes('email settings');
    
    if (!isUnsubscribePage && pageInfo.forms.length === 0) {
      console.log('[Unsubscribe] Warning: Page does not appear to be an unsubscribe page');
      console.log('[Unsubscribe] URL:', finalUrl);
      console.log('[Unsubscribe] Title:', pageInfo.title);
    }

    // Use AI to determine actions
    const prompt = `You are an AI agent that needs to unsubscribe from an email list. Analyze the webpage and provide instructions.

ORIGINAL URL: ${url}
CURRENT URL: ${finalUrl}
Page Title: ${pageInfo.title}
Page Text (first 3000 chars): ${pageInfo.text}

FORM STRUCTURE:
${JSON.stringify(pageInfo.forms, null, 2)}

AVAILABLE BUTTONS/LINKS:
${JSON.stringify(pageInfo.buttons.slice(0, 20), null, 2)}

CRITICAL RULES:
1. If forms array is EMPTY, DO NOT use "fill_form" action. Use "click_button", "follow_link", or "none" instead.
2. If page doesn't look like unsubscribe page, use "none" action.
3. Only use "fill_form" if forms array has actual forms.
4. For selects: Use EXACT option "value" from the form structure above.
5. For checkboxes/radio: true to check, false to uncheck.
6. Submit selectors: Use valid CSS only (NO :contains() or other pseudo-selectors).

Respond with ONLY valid JSON:
{
  "action": "click_button" | "fill_form" | "toggle_checkbox" | "follow_link" | "none",
  "form_fields": [only if action is "fill_form" and forms exist],
  "submit_selector": "valid CSS selector",
  "button_text": "text to search",
  "reason": "why this action"
}`;

    const client = getOpenRouterClient();
    const response = await client.chat.completions.create({
      model: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an AI agent that helps unsubscribe from email lists. Respond with valid JSON only, no markdown.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.3,
      max_tokens: 2000,
    });

    const resultText = response.choices[0]?.message?.content?.trim() || '{}';
    console.log('[Unsubscribe] AI Response:', resultText.substring(0, 500));
    
    // Parse AI response
    let result: any = {};
    try {
      let cleanedText = resultText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        result = JSON.parse(cleanedText);
      }
      console.log('[Unsubscribe] Parsed result:', JSON.stringify(result, null, 2));
    } catch (parseError) {
      console.error('[Unsubscribe] Failed to parse AI response:', resultText);
      result = { action: 'click_button', button_text: 'unsubscribe' };
    }
    
    if (!result.action) {
      result.action = 'click_button';
    }

    // Helper: safe click
    const safeClick = async (selector: string, timeout = 10000): Promise<boolean> => {
      try {
        await page.waitForSelector(selector, { timeout, visible: true });
        await page.click(selector);
        await new Promise(resolve => setTimeout(resolve, 500));
        return true;
      } catch (error: any) {
        console.log(`[Unsubscribe] Failed to click "${selector}":`, error.message);
        return false;
      }
    };

    // Helper: find element by text
    const findElementByText = async (text: string, tag = 'button'): Promise<boolean> => {
      try {
        const elements = await page.$$(tag);
        for (const el of elements) {
          try {
            const elementText = await el.evaluate((e: any) => (e.textContent || e.value || '').toLowerCase());
            if (elementText.includes(text.toLowerCase())) {
              await el.click();
              await new Promise(resolve => setTimeout(resolve, 500));
              console.log(`[Unsubscribe] Clicked element with text: "${text}"`);
              return true;
            }
          } catch (err) {
            continue;
          }
        }
        return false;
      } catch (error) {
        return false;
      }
    };

    // Helper: fill form field
    const fillField = async (field: any): Promise<boolean> => {
      try {
        const selectors = [];
        if (field.selector) selectors.push(field.selector);
        if (field.field_name) {
          const name = field.field_name;
          selectors.push(`#${name}`, `[name="${name}"]`, `input[name="${name}"]`, `select[name="${name}"]`, `textarea[name="${name}"]`);
        }

        for (const selector of selectors) {
          try {
            await page.waitForSelector(selector, { timeout: 3000, visible: true });
            const element = await page.$(selector);
            if (!element) continue;

            const tagName = await element.evaluate((el: any) => el.tagName.toLowerCase());
            const type = await element.evaluate((el: any) => el.type || '');

            if (tagName === 'select') {
              const valueToSelect = String(field.value);
              const options = await element.evaluate((sel: any) => {
                return Array.from(sel.options).map((opt: any) => ({
                  value: opt.value || '',
                  text: (opt.text || '').trim(),
                }));
              });
              
              let optionFound = options.find((opt: any) => opt.value === valueToSelect);
              if (!optionFound) {
                optionFound = options.find((opt: any) => 
                  opt.value.toLowerCase() === valueToSelect.toLowerCase()
                );
              }
              if (!optionFound) {
                optionFound = options.find((opt: any) => 
                  opt.text.toLowerCase().includes(valueToSelect.toLowerCase()) ||
                  valueToSelect.toLowerCase().includes(opt.text.toLowerCase())
                );
              }
              
              if (optionFound) {
                await page.select(selector, optionFound.value);
                console.log(`[Unsubscribe] Selected "${optionFound.value}" in ${selector}`);
                return true;
              } else {
                console.log(`[Unsubscribe] Option "${valueToSelect}" not found. Available:`, options.map((o: any) => o.value));
              }
            } else if (type === 'checkbox' || type === 'radio') {
              const isChecked = await element.evaluate((el: any) => el.checked);
              const shouldCheck = Boolean(field.value);
              if (isChecked !== shouldCheck) {
                await element.click();
                console.log(`[Unsubscribe] ${shouldCheck ? 'Checked' : 'Unchecked'} ${selector}`);
              }
              return true;
            } else {
              const valueStr = String(field.value);
              await element.focus();
              await element.evaluate((el: any) => {
                el.value = '';
                el.dispatchEvent(new Event('input', { bubbles: true }));
              });
              await element.type(valueStr, { delay: 50 });
              await element.evaluate((el: any) => {
                el.dispatchEvent(new Event('change', { bubbles: true }));
                el.dispatchEvent(new Event('blur', { bubbles: true }));
              });
              console.log(`[Unsubscribe] Filled ${selector} with "${valueStr}"`);
              return true;
            }
          } catch (err: any) {
            console.log(`[Unsubscribe] Selector "${selector}" failed:`, err.message);
            continue;
          }
        }
        console.error(`[Unsubscribe] Failed to fill field:`, field);
        return false;
      } catch (error: any) {
        console.error(`[Unsubscribe] Error filling field:`, error.message);
        return false;
      }
    };

    // Execute action
    let actionExecuted = false;

    if (result.action === 'fill_form' && result.form_fields && Array.isArray(result.form_fields) && pageInfo.forms.length > 0) {
      console.log(`[Unsubscribe] Filling form with ${result.form_fields.length} fields`);
      
      let allFilled = true;
      for (const field of result.form_fields) {
        const filled = await fillField(field);
        if (!filled) allFilled = false;
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      console.log(`[Unsubscribe] Form filled. All successful: ${allFilled}`);

      await new Promise(resolve => setTimeout(resolve, 1000));

      // Submit form
      if (result.submit_selector) {
        let selector = result.submit_selector;
        if (selector.includes(':contains(')) {
          const match = selector.match(/:contains\(['"]([^'"]+)['"]\)/);
          if (match && match[1]) {
            actionExecuted = await findElementByText(match[1], 'button');
          } else {
            selector = selector.replace(/:contains\([^)]+\)/g, '');
            actionExecuted = await safeClick(selector);
          }
        } else {
          actionExecuted = await safeClick(selector);
        }
      }
      
      if (!actionExecuted && result.button_text) {
        actionExecuted = await findElementByText(result.button_text, 'button');
      }
      
      // Fallbacks
      if (!actionExecuted) {
        actionExecuted = await findElementByText('unsubscribe', 'button');
      }
      if (!actionExecuted) {
        actionExecuted = await findElementByText('submit', 'button');
      }
      if (!actionExecuted) {
        const forms = await page.$$('form');
        if (forms.length > 0) {
          await forms[0].evaluate((form: any) => form.submit());
          actionExecuted = true;
          console.log('[Unsubscribe] Submitted form programmatically');
        }
      }
      
    } else if (result.action === 'click_button') {
      if (result.submit_selector) {
        let selector = result.submit_selector;
        if (selector.includes(':contains(')) {
          const match = selector.match(/:contains\(['"]([^'"]+)['"]\)/);
          if (match && match[1]) {
            actionExecuted = await findElementByText(match[1], 'button');
          } else {
            selector = selector.replace(/:contains\([^)]+\)/g, '');
            actionExecuted = await safeClick(selector);
          }
        } else {
          actionExecuted = await safeClick(selector);
        }
      }
      if (!actionExecuted && result.button_text) {
        actionExecuted = await findElementByText(result.button_text, 'button');
      }
      if (!actionExecuted) {
        actionExecuted = await findElementByText('unsubscribe', 'button');
      }
      // Also try links
      if (!actionExecuted) {
        actionExecuted = await findElementByText('unsubscribe', 'a');
      }
    } else if (result.action === 'toggle_checkbox') {
      if (result.submit_selector) {
        await safeClick(result.submit_selector);
      }
      const checkboxes = await page.$$('input[type="checkbox"]');
      if (checkboxes.length > 0) {
        await checkboxes[0].click();
        actionExecuted = true;
      }
    } else if (result.action === 'follow_link') {
      actionExecuted = await findElementByText('unsubscribe', 'a');
      if (!actionExecuted) {
        actionExecuted = await findElementByText('confirm', 'a');
      }
    } else if (result.action === 'none') {
      actionExecuted = pageInfo.hasSuccessText;
      console.log('[Unsubscribe] AI determined action is "none"');
    }

    // Final fallback
    if (!actionExecuted) {
      console.log('[Unsubscribe] Trying final fallback - searching all clickables');
      const allClickables = await page.$$('button, a, input[type="submit"], [role="button"]');
      for (const el of allClickables) {
        try {
          const text = await el.evaluate((e) => 
            (e.textContent || e.getAttribute('value') || e.getAttribute('aria-label') || '').toLowerCase()
          );
          if (text.includes('unsubscribe') || text.includes('opt out') || 
              text.includes('opt-out') || text.includes('remove') || 
              text.includes('confirm') || text.includes('proceed') || 
              text.includes('submit')) {
            await el.click();
            actionExecuted = true;
            console.log('[Unsubscribe] Clicked fallback element:', text);
            break;
          }
        } catch {
          continue;
        }
      }
    }

    // Wait for result
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Check success
    try {
      const finalText = await page.evaluate(() => document.body.innerText);
      const checkUrl = page.url();
      
      const success = finalText.toLowerCase().includes('unsubscribed') ||
                     finalText.toLowerCase().includes('success') ||
                     finalText.toLowerCase().includes('removed') ||
                     finalText.toLowerCase().includes('opt-out') ||
                     finalText.toLowerCase().includes('opt out') ||
                     finalText.toLowerCase().includes('preferences updated') ||
                     finalText.toLowerCase().includes('confirmed') ||
                     (checkUrl.includes('unsubscribe') && checkUrl.includes('success')) ||
                     (checkUrl.includes('confirm') && !checkUrl.includes('unsubscribe'));

      if (!success && actionExecuted) {
        const urlChanged = checkUrl !== url && checkUrl !== finalUrl;
        if (urlChanged) {
          console.log('[Unsubscribe] URL changed, waiting for confirmation...');
          await new Promise(resolve => setTimeout(resolve, 2000));
          const secondCheck = await page.evaluate(() => document.body.innerText);
          const secondSuccess = secondCheck.toLowerCase().includes('unsubscribed') ||
                               secondCheck.toLowerCase().includes('success') ||
                               secondCheck.toLowerCase().includes('removed');
          console.log(`[Unsubscribe] Second check result: ${secondSuccess ? 'SUCCESS' : 'FAILED'}`);
          return secondSuccess;
        }
      }

      console.log(`[Unsubscribe] Final result: ${success ? 'SUCCESS' : 'FAILED'}`);
      return success;
    } catch (error: any) {
      console.error('[Unsubscribe] Error checking success:', error.message);
      return actionExecuted; // Return true if we executed an action, even if we can't verify
    }
  } catch (error: any) {
    console.error('[Unsubscribe] Error:', error.message);
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
    const results: Array<{ emailId: number; success: boolean; error?: string }> = [];

    for (const emailId of emailIds) {
      const email = db
        .prepare('SELECT gmail_id, body_html, from_email FROM emails WHERE id = ? AND user_id = ?')
        .get(emailId, session.userId) as { gmail_id: string; body_html: string; from_email: string } | undefined;

      if (!email || !email.body_html) {
        console.log(`[Unsubscribe] Email ${emailId} not found or has no HTML`);
        results.push({ emailId, success: false, error: 'Email not found or no HTML' });
        continue;
      }

      try {
        const unsubscribeUrl = await getUnsubscribeLink(email.body_html);

        if (!unsubscribeUrl) {
          console.log(`[Unsubscribe] No unsubscribe link found in email ${emailId} from ${email.from_email}`);
          results.push({ emailId, success: false, error: 'No unsubscribe link found' });
          continue;
        }

        console.log(`[Unsubscribe] Processing email ${emailId} from ${email.from_email}: ${unsubscribeUrl}`);
        const success = await unsubscribeFromLink(unsubscribeUrl);

        if (success) {
          unsubscribedCount++;
          results.push({ emailId, success: true });
          console.log(`[Unsubscribe] ✓ Successfully unsubscribed from email ${emailId}`);
        } else {
          results.push({ emailId, success: false, error: 'Unsubscribe process failed' });
          console.log(`[Unsubscribe] ✗ Failed to unsubscribe from email ${emailId}`);
        }
      } catch (error: any) {
        console.error(`[Unsubscribe] Error processing email ${emailId}:`, error.message);
        results.push({ emailId, success: false, error: error.message });
      }
    }

    return NextResponse.json({ 
      unsubscribed: unsubscribedCount,
      total: emailIds.length,
      results 
    });
  } catch (error: any) {
    console.error('[Unsubscribe] Error:', error.message);
    return NextResponse.json({ error: 'Failed to unsubscribe' }, { status: 500 });
  }
}
