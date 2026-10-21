const { z } = require('zod');

/**
 * Universal Zod validation middleware for Express routes.
 * Validates req.body, req.query, or req.params against a given Zod schema.
 * Responds with standard 400 Bad Request error payload if validation fails.
 */
const validate = (schema, source = 'body') => (req, res, next) => {
  try {
    const dataToValidate = req[source];
    const parsed = schema.parse(dataToValidate);
    // Replace source with validated & sanitized data
    req[source] = parsed;
    next();
  } catch (err) {
    if (err instanceof z.ZodError) {
      const firstIssue = err.issues[0];
      const message = firstIssue?.message || 'Validation failed';
      return res.status(400).json({
        success: false,
        message,
        errors: err.issues.map((i) => ({
          path: i.path.join('.'),
          message: i.message,
        })),
      });
    }
    return res.status(400).json({ success: false, message: 'Invalid request data' });
  }
};

module.exports = { validate, z };
