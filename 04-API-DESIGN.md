# 04 — API Design

## Internal API (Hono Server)

The FireAPI server is built on [Hono](https://hono.dev) v4.12.x running on Node.js via [@hono/node-server](https://www.npmjs.com/package/@hono/node-server). It serves two categories of routes: **management routes** (fixed) and **workflow routes** (dynamic, generated from workflow configs).

### Base URL & Versioning
- Local dev: `http://localhost:3000`
- No API versioning in URL path — this is a self-hosted tool, not a SaaS
- OpenAPI spec always at `/openapi.json`
- Interactive docs at `/docs`

---

### Management Routes (Fixed)

#### System
| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Server health + workflow status summary |
| `GET` | `/openapi.json` | Full OpenAPI 3.1 specification |
| `GET` | `/docs` | Interactive API documentation (Scalar UI) |

#### Workflows CRUD
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/_workflows` | List all workflows with status |
| `GET` | `/api/_workflows/:id` | Get workflow details + graph + schemas |
| `POST` | `/api/_workflows` | Create workflow from config |
| `PUT` | `/api/_workflows/:id` | Update workflow graph/config |
| `DELETE` | `/api/_workflows/:id` | Delete workflow + remove route |
| `POST` | `/api/_workflows/:id/test` | Execute workflow with test inputs |
| `POST` | `/api/_workflows/:id/heal` | Trigger self-healing for workflow |
| `GET` | `/api/_workflows/:id/schema` | Get input/output schemas |
| `GET` | `/api/_workflows/:id/changelog` | Get modification history |

#### Executions
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/_executions` | List recent executions (paginated) |
| `GET` | `/api/_executions/:id` | Get execution details + logs |

#### Discovery
| Method | Path | Description |
|---|---|---|
| `POST` | `/api/_discover` | Discover elements at a URL |
| `POST` | `/api/_init` | Full init: discover + generate workflow + infer schemas |

#### Health
| Method | Path | Description |
|---|---|---|
| `GET` | `/api/_health` | Detailed health per workflow |
| `POST` | `/api/_health/check` | Trigger health check for all workflows |

---

### Workflow Routes (Dynamic)

Each workflow generates a REST endpoint. The path is configurable per workflow (default: kebab-case of workflow name).

**Example**: A workflow named "Property Search" targeting `county-records.gov/search`:

```
GET /api/property-search?county=harris&property_type=residential&owner_name=smith
```

#### Request
- Query parameters validated against workflow's input Zod schema
- POST body supported for complex inputs (configurable per workflow)
- Content-Type: `application/json` for POST

#### Response

**Success (200)**
```json
{
  "success": true,
  "data": [
    {
      "parcel_id": "1234567",
      "owner": "SMITH, JOHN",
      "address": "123 Main St",
      "property_type": "Residential",
      "assessed_value": 285000,
      "year_built": 1995
    }
  ],
  "metadata": {
    "workflow": "property-search",
    "executionId": "01HY...",
    "cached": false,
    "durationMs": 4523,
    "resultCount": 15
  }
}
```

**Validation Error (400)**
```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request parameters",
    "details": [
      { "field": "county", "message": "Required" },
      { "field": "property_type", "message": "Must be one of: residential, commercial, land, all" }
    ]
  }
}
```

**Workflow Error (502)**
```json
{
  "success": false,
  "error": {
    "code": "WORKFLOW_EXECUTION_FAILED",
    "message": "Workflow failed at step 'click_submit'",
    "details": {
      "failedStep": "click_submit",
      "stepIndex": 4,
      "selectorsTried": ["#submit-btn", "button[type=submit]", "[aria-label='Search']"],
      "lastError": "Element not found within 10000ms timeout"
    }
  }
}
```

**Workflow Broken (503)**
```json
{
  "success": false,
  "error": {
    "code": "WORKFLOW_BROKEN",
    "message": "This workflow is currently broken and needs repair",
    "details": {
      "lastHealthCheck": "2026-02-26T10:00:00Z",
      "brokenSince": "2026-02-25T15:30:00Z"
    }
  }
}
```

---

### OpenAPI 3.1 Generation

Each workflow dynamically contributes to the OpenAPI spec:

```yaml
openapi: 3.1.0
info:
  title: FireAPI
  version: 1.0.0
  description: Auto-generated REST API from web page workflows

paths:
  /api/property-search:
    get:
      operationId: propertySearch
      summary: Search property records
      description: Auto-generated from workflow targeting county-records.gov/search
      parameters:
        - name: county
          in: query
          required: true
          schema:
            type: string
            enum: [harris, dallas, travis, bexar]
        - name: property_type
          in: query
          required: false
          schema:
            type: string
            enum: [residential, commercial, land, all]
            default: all
        - name: owner_name
          in: query
          required: false
          schema:
            type: string
      responses:
        '200':
          description: Successful search results
          content:
            application/json:
              schema:
                type: object
                properties:
                  success:
                    type: boolean
                  data:
                    type: array
                    items:
                      type: object
                      properties:
                        parcel_id:
                          type: string
                        owner:
                          type: string
                        address:
                          type: string
                        assessed_value:
                          type: number
                          nullable: true
              example:
                success: true
                data:
                  - parcel_id: "1234567"
                    owner: "SMITH, JOHN"
                    address: "123 Main St"
                    assessed_value: 285000
```

### Response Headers

All responses include:
```
X-FireAPI-Workflow: property-search
X-FireAPI-Execution-Id: 01HY...
X-FireAPI-Cached: true|false
X-FireAPI-Duration-Ms: 4523
```

### Rate Limiting

No built-in rate limiting (self-hosted tool). Users can add reverse proxy rate limiting (nginx, Caddy) or use Hono middleware. The server does enforce **concurrent execution limits** per workflow to prevent session exhaustion.

### Authentication

No built-in auth for the API server. Dashboard and management routes can be protected via:
- Reverse proxy auth (recommended for production)
- Optional `FIREAPI_API_KEY` env var for simple bearer token auth
- Hono middleware for custom auth strategies
