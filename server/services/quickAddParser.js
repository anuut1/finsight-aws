const VALID_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Shopping',
  'Travel',
  'Entertainment',
  'Bills & Utilities',
  'Healthcare',
  'Education',
  'Personal Care',
  'Investment',
  'Salary',
  'Shared',
  'Other',
];

const VALID_MOODS = ['happy', 'neutral', 'stressed'];
const VALID_SPLIT_TYPES = ['equal', 'exact', 'percentage', 'none'];

/**
 * Validates and normalizes the parsed output against the strict schema.
 */
function sanitizeParsedExpense(raw, context = {}) {
  const today = context.currentDate || new Date().toISOString().slice(0, 10);

  // 1. Amount
  let amount = Number(raw?.amount);
  if (isNaN(amount) || amount < 0) amount = 0;
  amount = Math.round((amount + Number.EPSILON) * 100) / 100;

  // 2. Type
  const type = raw?.type === 'income' ? 'income' : 'expense';

  // 3. Category matching
  let category = typeof raw?.category === 'string' ? raw.category.trim() : '';
  const matchedCategory = VALID_CATEGORIES.find(
    (c) => c.toLowerCase() === category.toLowerCase()
  );
  if (matchedCategory) {
    category = matchedCategory;
  } else if (!category) {
    category = type === 'income' ? 'Salary' : 'Other';
  }

  // 4. Date (YYYY-MM-DD)
  let date = typeof raw?.date === 'string' ? raw.date.trim() : today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) {
    date = today;
  }

  // 5. Note / Description
  const note = typeof raw?.note === 'string' && raw.note.trim() ? raw.note.trim() : 'Quick add expense';

  // 6. Split members
  let splitMembers = Array.isArray(raw?.splitMembers)
    ? raw.splitMembers
        .map((m) => String(m || '').trim())
        .filter((m) => m && !['you', 'me', 'myself', 'i', 'self'].includes(m.toLowerCase()))
    : [];
  splitMembers = Array.from(new Set(splitMembers));

  // 7. Split type & isSplit
  const isSplit = Boolean(raw?.isSplit || splitMembers.length > 0);
  let splitType = VALID_SPLIT_TYPES.includes(raw?.splitType) ? raw.splitType : isSplit ? 'equal' : 'none';
  if (!isSplit) splitType = 'none';

  // 8. Mood
  const mood = VALID_MOODS.includes(raw?.mood) ? raw.mood : 'neutral';

  return {
    type,
    amount,
    category,
    date,
    note,
    isSplit,
    splitMembers,
    splitType,
    mood,
  };
}

/**
 * Intelligent deterministic heuristic fallback parser.
 * Used when no LLM API key is present or when network to LLM times out.
 */
function parseWithHeuristics(text, context = {}) {
  const clean = text.trim();
  const lower = clean.toLowerCase();
  const today = context.currentDate || new Date().toISOString().slice(0, 10);

  // Type: income vs expense
  const incomeKeywords = ['salary', 'received', 'credited', 'refund', 'dividend', 'bonus', 'freelance', 'earned', 'deposit'];
  const isIncome = incomeKeywords.some((k) => lower.includes(k));
  const type = isIncome ? 'income' : 'expense';

  // Amount extraction (numbers, optionally preceded by ₹, $, Rs., etc.)
  const amountMatch = clean.match(/(?:(?:rs\.?|inr|₹|\$)\s*)?([0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?)/i);
  let amount = 0;
  if (amountMatch) {
    amount = parseFloat(amountMatch[1].replace(/,/g, ''));
  }

  // Split members detection (e.g. "with Riya and Aman", "between Riya, Aman and Joy")
  let splitMembers = [];
  const withMatch = clean.match(/(?:with|between)\s+([a-zA-Z0-9,\s&]+?)(?:\s*(?:,|and)?\s*(?:split|for|on|yesterday|today|at|$))/i);
  if (withMatch) {
    const rawNames = withMatch[1]
      .split(/,|&|\band\b/i)
      .map((n) => n.trim())
      .filter((n) => n && !['you', 'me', 'myself', 'i', 'all', 'equally', 'equal'].includes(n.toLowerCase()));
    splitMembers = Array.from(new Set(rawNames));
  }

  // Split type detection
  let splitType = 'none';
  const isSplit = splitMembers.length > 0 || /split|shared/i.test(lower);
  if (isSplit) {
    if (/equal|equally|50-50|even/i.test(lower)) {
      splitType = 'equal';
    } else if (/percent|percentage|%/i.test(lower)) {
      splitType = 'percentage';
    } else if (/exact|unequal/i.test(lower)) {
      splitType = 'exact';
    } else {
      splitType = 'equal';
    }
  }

  // Category detection
  let category = type === 'income' ? 'Salary' : 'Other';
  if (/dinner|lunch|breakfast|food|coffee|cafe|tea|starbucks|swiggy|zomato|burger|pizza|restaurant|snacks|drinks/i.test(lower)) {
    category = 'Food & Dining';
  } else if (/grocery|groceries|supermarket|milk|veggies|vegetables|blinkit|zepto|instamart|mart/i.test(lower)) {
    category = 'Groceries';
  } else if (/uber|ola|cab|auto|taxi|flight|train|metro|bus|petrol|fuel|diesel/i.test(lower)) {
    category = 'Travel';
  } else if (/rent|electricity|power|wifi|internet|water|bill|utility|recharge|maintenance/i.test(lower)) {
    category = 'Bills & Utilities';
  } else if (/movie|cinema|netflix|prime|spotify|concert|show|game|gaming/i.test(lower)) {
    category = 'Entertainment';
  } else if (/shopping|clothes|amazon|flipkart|myntra|shoes|dress|mall/i.test(lower)) {
    category = 'Shopping';
  } else if (/doctor|medicine|hospital|pharmacy|clinic|medical|health/i.test(lower)) {
    category = 'Healthcare';
  } else if (isSplit) {
    category = 'Shared';
  }

  // Date detection
  let date = today;
  const baseDate = context.currentDate ? new Date(context.currentDate) : new Date();
  if (/yesterday/i.test(lower)) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - 1);
    date = d.toISOString().slice(0, 10);
  } else if (/tomorrow/i.test(lower)) {
    const d = new Date(baseDate);
    d.setDate(d.getDate() + 1);
    date = d.toISOString().slice(0, 10);
  }

  // Note extraction (clean description)
  let note = clean;
  // Remove matched amount, "split equally", etc. to make a neat note
  note = note
    .replace(/(?:(?:rs\.?|inr|₹|\$)\s*)?[0-9]+(?:,[0-9]{3})*(?:\.[0-9]{1,2})?/i, '')
    .replace(/,\s*split\s+[a-z]+/i, '')
    .replace(/\bsplit\s+[a-z]+/i, '')
    .replace(/\b(yesterday|today|tomorrow)\b/i, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  if (!note || note.length < 2) {
    note = `${category} expense`;
  }

  // Mood detection
  let mood = 'neutral';
  if (/happy|great|fun|party|celebrate|celebration|yay|enjoyed/i.test(lower)) {
    mood = 'happy';
  } else if (/stressed|expensive|regret|overbudget|unplanned|sad|pain/i.test(lower)) {
    mood = 'stressed';
  }

  return sanitizeParsedExpense(
    {
      type,
      amount,
      category,
      date,
      note,
      isSplit,
      splitMembers,
      splitType,
      mood,
    },
    context
  );
}

/**
 * Call Google Gemini API with strict JSON responseSchema.
 */
async function callGemini(apiKey, text, context) {
  const today = context.currentDate || new Date().toISOString().slice(0, 10);
  const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const prompt = `You are a financial parsing assistant for FinSight.
Extract the transaction details from this text: "${text}".
Current reference date: ${today}.
Valid categories: ${VALID_CATEGORIES.join(', ')}.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              type: { type: 'STRING', enum: ['expense', 'income'] },
              amount: { type: 'NUMBER' },
              category: { type: 'STRING', enum: VALID_CATEGORIES },
              date: { type: 'STRING' },
              note: { type: 'STRING' },
              isSplit: { type: 'BOOLEAN' },
              splitMembers: { type: 'ARRAY', items: { type: 'STRING' } },
              splitType: { type: 'STRING', enum: VALID_SPLIT_TYPES },
              mood: { type: 'STRING', enum: VALID_MOODS },
            },
            required: ['type', 'amount', 'category', 'date', 'note', 'isSplit', 'splitMembers', 'splitType'],
          },
          temperature: 0.1,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Empty response from Gemini');

  return JSON.parse(rawText);
}

/**
 * Call OpenAI API (gpt-4o-mini) with JSON object response.
 */
async function callOpenAI(apiKey, text, context) {
  const today = context.currentDate || new Date().toISOString().slice(0, 10);
  const prompt = `Extract transaction details from: "${text}".
Reference date: ${today}.
Categories: ${VALID_CATEGORIES.join(', ')}.
Return strict JSON with fields: type, amount, category, date (YYYY-MM-DD), note, isSplit, splitMembers, splitType, mood.`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      temperature: 0.1,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  const rawText = result.choices?.[0]?.message?.content;
  if (!rawText) throw new Error('Empty response from OpenAI');

  return JSON.parse(rawText);
}

/**
 * Main parser entrypoint.
 * Prioritizes configured LLM API (Gemini or OpenAI) and falls back to deterministic heuristic NLP.
 */
async function parseNaturalLanguageInput(text, context = {}) {
  const geminiKey = process.env.GEMINI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (geminiKey) {
    try {
      const raw = await callGemini(geminiKey, text, context);
      return sanitizeParsedExpense(raw, context);
    } catch (err) {
      console.warn('Gemini parser failed, falling back to heuristics:', err.message);
    }
  }

  if (openaiKey) {
    try {
      const raw = await callOpenAI(openaiKey, text, context);
      return sanitizeParsedExpense(raw, context);
    } catch (err) {
      console.warn('OpenAI parser failed, falling back to heuristics:', err.message);
    }
  }

  // Graceful fallback to deterministic heuristic parser
  return parseWithHeuristics(text, context);
}

module.exports = {
  parseNaturalLanguageInput,
  sanitizeParsedExpense,
  parseWithHeuristics,
  VALID_CATEGORIES,
};
