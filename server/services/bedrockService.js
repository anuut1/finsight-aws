const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { VALID_CATEGORIES } = require('./quickAddParser');
const { logAwsCall } = require('../utils/logger');

const region = process.env.AWS_REGION || 'ap-south-1';
const defaultModelId = process.env.BEDROCK_MODEL_ID || 'amazon.titan-text-express-v1';

const clientConfig = { region };
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };
}

const bedrockClient = new BedrockRuntimeClient(clientConfig);

/**
 * Fallback heuristics when Bedrock is unavailable, times out, or fails.
 */
function fallbackRuleBasedClean(rawString = '') {
  let clean = rawString
    .replace(/(?:UPI|VPA|P2A|P2M|IMPS|NEFT|Ref|Txn|ID|No|Auth)[\s/:#-]*[a-zA-Z0-9_-]+/gi, '')
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+/g, '') // remove UPI VPA addresses
    .replace(/paid to|debited for|spent at|towards/gi, '')
    .replace(/[^a-zA-Z0-9\s&'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean || clean.length < 2) {
    clean = rawString.trim() || 'UPI Transaction';
  }

  // Basic category inference
  const lower = clean.toLowerCase();
  let category = 'Uncategorized';
  if (/swiggy|zomato|starbucks|mcdonald|burger|pizza|cafe|restaurant|food/i.test(lower)) {
    category = 'Food & Dining';
  } else if (/blinkit|zepto|instamart|grocery|supermarket|mart|dmart/i.test(lower)) {
    category = 'Groceries';
  } else if (/uber|ola|rapido|fuel|petrol|shell|metro|irctc|flight/i.test(lower)) {
    category = 'Travel';
  } else if (/amazon|flipkart|myntra|zara|h&m|clothing|retail/i.test(lower)) {
    category = 'Shopping';
  } else if (/airtel|jio|vi|electricity|water|bescom|broadband|bill/i.test(lower)) {
    category = 'Bills & Utilities';
  } else if (/pvr|inox|movie|cinema|netflix|spotify/i.test(lower)) {
    category = 'Entertainment';
  }

  return {
    cleanMerchant: clean,
    category,
    confidence: 0.5,
    source: 'rule-fallback',
  };
}

/**
 * Cleans messy merchant strings (e.g. "UPI/4289192837/SWIGGY5281/swiggy@icici/Bengaluru")
 * and categorizes the expense with Amazon Bedrock.
 *
 * @param {object} param0
 * @param {string} param0.rawString - Raw UPI, SMS, or receipt description
 * @param {number} [param0.amount]
 * @param {string} [param0.modelId]
 * @param {number} [param0.timeoutMs=3000] - Hard timeout (default 3 seconds)
 * @returns {Promise<{ cleanMerchant: string, category: string, confidence: number, source: string }>}
 */
async function cleanAndCategorizeExpense({ rawString, amount = 0, modelId = defaultModelId, timeoutMs = 3000 }) {
  if (!rawString || typeof rawString !== 'string') {
    return {
      cleanMerchant: 'Unknown Merchant',
      category: 'Uncategorized',
      confidence: 0,
      source: 'fallback',
    };
  }

  const startTime = Date.now();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), timeoutMs);

  const categoriesList = VALID_CATEGORIES.join(', ');
  const prompt = `You are a financial transaction parser. Clean this messy raw Indian UPI/banking text into a clean merchant brand name and assign the most appropriate category.
Allowed categories: ${categoriesList}, Uncategorized.
Respond strictly with valid JSON without markdown wrapping:
{"cleanMerchant": "Name", "category": "Category", "confidence": 0.95}

Raw text: "${rawString}"`;

  try {
    const payload = {
      inputText: prompt,
      textGenerationConfig: {
        maxTokenCount: 150,
        temperature: 0.1,
        topP: 0.9,
        stopSequences: [],
      },
    };

    const command = new InvokeModelCommand({
      modelId,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify(payload),
    });

    const response = await bedrockClient.send(command, { abortSignal: controller.signal });
    clearTimeout(timeoutHandle);

    const durationMs = Date.now() - startTime;
    logAwsCall({
      service: 'Bedrock',
      operation: 'InvokeModel',
      durationMs,
      success: true,
      metadata: { modelId, rawStringLength: rawString.length },
    });

    const responseBody = JSON.parse(new TextDecoder().decode(response.body));
    const outputText = responseBody.results?.[0]?.outputText || responseBody.completion || '';

    // Extract JSON block
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      let category = parsed.category || 'Uncategorized';
      if (!VALID_CATEGORIES.includes(category)) {
        category = 'Uncategorized';
      }

      return {
        cleanMerchant: parsed.cleanMerchant?.trim() || rawString.trim(),
        category,
        confidence: Number(parsed.confidence) || 0.85,
        source: 'bedrock-ai',
      };
    }

    return fallbackRuleBasedClean(rawString);
  } catch (err) {
    clearTimeout(timeoutHandle);
    const durationMs = Date.now() - startTime;

    logAwsCall({
      service: 'Bedrock',
      operation: 'InvokeModel',
      durationMs,
      success: false,
      error: err,
      metadata: { modelId },
    });

    // Graceful fallback to rule-based cleaner
    return fallbackRuleBasedClean(rawString);
  }
}

module.exports = {
  cleanAndCategorizeExpense,
  fallbackRuleBasedClean,
};
