const { ZodError } = require("zod");

const validateRequest = (schema) => (req, res, next) => {
  try {
    const parsed = schema.parse({
      body: req.body,
      params: req.params,
      query: req.query
    });
    // ✅ AUDIT FIX C7: Replace req data with Zod-stripped output
    // Without this, unknown/injected fields bypass validation and reach Firestore
    if (parsed.body) req.body = parsed.body;
    if (parsed.params) req.params = parsed.params;
    if (parsed.query) req.query = parsed.query;
    next();
  } catch (error) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: "Validation failed",
        details: error.errors
      });
    }
    next(error);
  }
};

module.exports = validateRequest;
