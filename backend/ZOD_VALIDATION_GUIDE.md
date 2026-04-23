# ISSUE #6: Zod Validation on All POST/PUT Routes

## Overview
Implement reusable Zod validation middleware on all POST/PUT routes to ensure:
- Unknown fields are rejected via `.strict()`
- Wrong data types are rejected
- Controllers only receive schema-validated data
- Consistent error responses

## ✅ Implementation Status

### Core Infrastructure
- ✅ Created `middleware/validate.js` - simple, reusable validation middleware
- ✅ All schemas updated with `.strict()` to reject unknown fields:
  - `schemas/index.schema.js` - Node, Zone, Customer, Device visibility schemas
  - `schemas/tds.schema.js` - TDS device schemas
  - `schemas/zone.schema.js` - Zone schemas (already had `.strict()`)
  - `schemas/customer.schema.js` - Customer schemas (already had `.strict()`)

### Routes with Validation ✅
- ✅ Admin routes - `POST /zones`, `PUT /zones/:id`, etc.
- ✅ EvaraTDS routes - `POST /`, `PUT /:id`
- ✅ TDS routes - `PUT /:id/config`

### Routes Needing Validation ⏳
- [ ] ThingSpeak routes - `POST /fetch-fields`, `POST /save-metadata`
- [ ] Auth routes (minimal - mostly GETs)

---

## Pattern: How Validation Works

### Step 1: Define Schema with `.strict()`
```javascript
// schemas/user.schema.js
const createUserSchema = z.object({
  body: z.object({
    name: z.string().min(1).max(100),
    email: z.string().email(),
    age: z.number().optional()
  }).strict() // ✅ CRITICAL: Reject unknown fields
});
```

### Step 2: Import validate() Middleware
```javascript
// routes/users.routes.js
const validate = require('../middleware/validate');
const { createUserSchema } = require('../schemas/user.schema');
```

### Step 3: Apply to Routes
```javascript
router.post('/', validate(createUserSchema), controller.create);
router.put('/:id', validate(updateUserSchema), controller.update);
```

### Step 4: Controller Receives Clean Data
```javascript
exports.create = async (req, res, next) => {
  try {
    // ✅ req.body is already validated and cleaned
    // ✅ Unknown fields have been stripped
    const { name, email, age } = req.body;
    
    // ... create logic
    res.status(201).json({ success: true, id: doc.id });
  } catch (error) {
    next(error); // Centralized error handler
  }
};
```

---

## Key Implementation Details

### validate.js Middleware
```javascript
const validate = (schema) => (req, res, next) => {
  try {
    const result = schema.safeParse(req.body);
    
    if (!result.success) {
      const error = new Error('Validation failed');
      error.statusCode = 400;
      error.details = result.error.errors.map(e => ({
        field: e.path.join('.'),
        message: e.message,
        code: e.code
      }));
      return next(error);
    }
    
    // ✅ CRITICAL: Replace req.body with clean data
    req.body = result.data;
    next();
  } catch (err) {
    next(err);
  }
};
```

### Schema Structure
```javascript
// For validateRequest middleware (complex - body/params/query)
exports.createNodeSchema = z.object({
  body: z.object({
    name: z.string(),
    ...
  }).strict()
});

// For validate middleware (simple - body only)
const createUserSchema = z.object({
  name: z.string(),
  email: z.string(),
  ...
}).strict();
```

---

## Field Protection via `.strict()`

### Attack Example (Blocked)
```javascript
// Frontend sends:
{
  "name": "John",
  "role": "admin",           // ← Unknown field
  "customer_id": "hacked"    // ← Unknown field
}

// ❌ With .strict(): Fields rejected
// ✅ Controller receives: { name: "John" }
```

### Valid Request
```javascript
// Frontend sends:
{
  "name": "John",
  "email": "john@example.com"
}

// ✅ All fields match schema
// ✅ Controller receives exact data
```

---

## HTTP Status Codes

| Code | Scenario | Example |
|------|----------|---------|
| 400 | Validation failed | Missing required field, wrong type, unknown field |
| 401 | Authentication required | Missing token |
| 403 | Access denied | Superadmin-only endpoint |
| 404 | Resource not found | Device doesn't exist |
| 409 | Conflict | Duplicate email, constraint violation |
| 500 | Server error | Unexpected exception |

---

## Common Patterns

### Pattern 1: Simple POST with Required Fields
```javascript
// Schema
const createBlogSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(10),
  tags: z.array(z.string()).optional()
}).strict();

// Route
router.post('/', validate(createBlogSchema), controller.create);
```

### Pattern 2: Optional Update Fields
```javascript
// Schema
const updateBlogSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  content: z.string().min(10).optional(),
  tags: z.array(z.string()).optional()
}).strict();

// Route
router.put('/:id', validate(updateBlogSchema), controller.update);
```

### Pattern 3: Nested Objects
```javascript
// Schema
const createOrderSchema = z.object({
  customer_id: z.string(),
  items: z.array(z.object({
    product_id: z.string(),
    quantity: z.number().min(1),
    price: z.number().min(0)
  })),
  shipping_address: z.object({
    street: z.string(),
    city: z.string(),
    postal_code: z.string()
  }).strict()
}).strict();

// Route
router.post('/', validate(createOrderSchema), controller.create);
```

### Pattern 4: Enum Fields
```javascript
// Schema
const updateStatusSchema = z.object({
  status: z.enum(["pending", "approved", "rejected"]),
  notes: z.string().optional()
}).strict();

// Route
router.patch('/:id/status', validate(updateStatusSchema), controller.updateStatus);
```

---

## Error Response Format

### Validation Error (400)
```json
{
  "success": false,
  "error": {
    "message": "Validation failed",
    "code": "VALIDATION_ERROR",
    "statusCode": 400,
    "details": [
      {
        "field": "email",
        "message": "Invalid email",
        "code": "invalid_string"
      },
      {
        "field": "age",
        "message": "Expected number, received string",
        "code": "invalid_type"
      }
    ]
  },
  "timestamp": "2026-04-21T10:30:00Z"
}
```

### Server Error (500)
```json
{
  "success": false,
  "error": {
    "message": "Something went wrong on our end — we have been notified",
    "code": "INTERNAL_ERROR",
    "statusCode": 500
  },
  "timestamp": "2026-04-21T10:30:00Z"
}
```

---

## Testing Validation

### Test: Unknown Field (Should Reject)
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John",
    "email": "john@example.com",
    "admin": true
  }'
# Expected: 400, "Validation failed"
```

### Test: Wrong Type (Should Reject)
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John",
    "email": "john@example.com",
    "age": "thirty"
  }'
# Expected: 400, "Expected number, received string"
```

### Test: Valid Request (Should Accept)
```bash
curl -X POST http://localhost:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John",
    "email": "john@example.com",
    "age": 30
  }'
# Expected: 201, success response
```

---

## Migration Path (for existing routes)

### Step 1: Create Schema with `.strict()`
```javascript
// schemas/newResource.schema.js
exports.createNewResourceSchema = z.object({
  name: z.string().min(1),
  ...
}).strict();
```

### Step 2: Add Import
```javascript
const validate = require('../middleware/validate');
const { createNewResourceSchema } = require('../schemas/newResource.schema');
```

### Step 3: Add to Route
```javascript
router.post('/', validate(createNewResourceSchema), controller.create);
```

### Step 4: Test
```bash
npm test  # Verify no regressions
curl ... # Test with invalid data
```

---

## Compatibility Notes

### Using with validateRequest (Complex)
```javascript
// When you need to validate body + params + query
const validateRequest = require('../middleware/validateRequest');
const { createNodeSchema } = require('../schemas/node.schema');

// Schema must have nested structure:
// { body: {...}, params: {...}, query: {...} }

router.post('/', validateRequest(createNodeSchema), controller.create);
```

### Using with validate (Simple)
```javascript
// When you only need to validate request body
const validate = require('../middleware/validate');
const { createUserSchema } = require('../schemas/user.schema');

// Schema can be flat - just the fields
router.post('/', validate(createUserSchema), controller.create);
```

---

## Benefits

✅ **Security** - Rejects field injection, prototype pollution, NoSQL injection patterns
✅ **Consistency** - All POST/PUT routes validated the same way
✅ **Type Safety** - Controllers only see typed, validated data
✅ **Error Handling** - Validation errors properly serialized with details
✅ **Maintainability** - Single place to define what fields are allowed
✅ **Frontend Dev** - Clear error messages tell frontend what's wrong

---

## Checklist for Adding Validation to Routes

- [ ] Create schema in `schemas/` with `.strict()`
- [ ] Add `validate` middleware import
- [ ] Apply `validate(schema)` to POST/PUT routes
- [ ] Test with valid data (201 success)
- [ ] Test with invalid data (400 with details)
- [ ] Test with unknown fields (400 rejected)
- [ ] Verify no regressions in existing tests
