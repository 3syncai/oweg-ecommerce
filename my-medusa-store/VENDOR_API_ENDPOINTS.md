# Vendor API Endpoints for Categories & Collections

## Overview
Created dedicated vendor API endpoints to fetch categories and collections data from the Medusa admin, ensuring proper authentication and data access for vendors.

## New API Endpoints

### 1. Categories Endpoint
**Path**: `/vendor/categories`
**Method**: `GET`
**File**: `src/api/vendor/categories/route.ts`

**Authentication**: Requires vendor token (Bearer token)

**Query Parameters**:
- `limit` (optional, default: 100) - Number of categories to fetch
- `offset` (optional, default: 0) - Pagination offset

**Response**:
```json
{
  "product_categories": [
    {
      "id": "string",
      "name": "string",
      "handle": "string",
      "is_active": boolean,
      "is_internal": boolean,
      "parent_category_id": "string | null",
      "rank": number,
      "created_at": "string",
      "updated_at": "string"
    }
  ],
  "count": number,
  "offset": number,
  "limit": number
}
```

**Features**:
- Fetches all product categories from the database
- Uses Medusa's query graph API
- Includes parent-child relationships via `parent_category_id`
- Returns pagination metadata

### 2. Collections Endpoint
**Path**: `/vendor/collections`
**Method**: `GET`
**File**: `src/api/vendor/collections/route.ts`

**Authentication**: Requires vendor token (Bearer token)

**Query Parameters**:
- `limit` (optional, default: 100) - Number of collections to fetch
- `offset` (optional, default: 0) - Pagination offset

**Response**:
```json
{
  "collections": [
    {
      "id": "string",
      "title": "string",
      "handle": "string",
      "created_at": "string",
      "updated_at": "string",
      "products": []
    }
  ],
  "count": number,
  "offset": number,
  "limit": number
}
```

**Features**:
- Fetches all product collections from the database
- Uses Medusa's query graph API
- Includes associated products
- Returns pagination metadata

## Authentication Guard

### Updated Guard Function
**File**: `src/api/vendor/_lib/guards.ts`

Added new `requireVendorAuth` function:
```typescript
export async function requireVendorAuth(req: MedusaRequest): Promise<string | null>
```

**Features**:
- Extracts Bearer token from Authorization header
- Verifies token using `verifyVendorToken`
- Returns vendor ID if valid, null otherwise
- Simpler than `requireApprovedVendor` (doesn't check approval status)

## Frontend Integration

### Categories Page
**File**: `src/admin/routes/vendor/products/categories/page.tsx`

**Updated to**:
- Fetch from `/vendor/categories` endpoint
- Use vendor token for authentication
- Display hierarchical category tree
- Show all category details with proper UI

### Collections Page
**File**: `src/admin/routes/vendor/products/collections/page.tsx`

**Updated to**:
- Fetch from `/vendor/collections` endpoint
- Use vendor token for authentication
- Display collections in table format
- Show product counts and creation dates

## Error Handling

Both endpoints include:
- Try-catch blocks for error handling
- Console logging for debugging
- Proper HTTP status codes:
  - 200: Success
  - 401: Unauthorized (no/invalid token)
  - 500: Server error

Frontend includes:
- Loading states while fetching
- Error logging to console
- Empty states when no data
- Detailed error messages in console

## Data Flow

```
Frontend (React)
    ↓
    GET /vendor/categories or /vendor/collections
    ↓
    Bearer Token Authentication
    ↓
    requireVendorAuth() - Verify Token
    ↓
    Query Database via Medusa Query API
    ↓
    Return JSON Response
    ↓
    Frontend Renders Data
```

## Usage Example

### Fetch Categories
```typescript
const token = localStorage.getItem("vendor_token")
const response = await fetch(`${backend}/vendor/categories?limit=100&offset=0`, {
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
})
const data = await response.json()
console.log(data.product_categories)
```

### Fetch Collections
```typescript
const token = localStorage.getItem("vendor_token")
const response = await fetch(`${backend}/vendor/collections?limit=100&offset=0`, {
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
})
const data = await response.json()
console.log(data.collections)
```

## Benefits

1. **Secure**: Requires vendor authentication
2. **Efficient**: Uses Medusa's optimized query API
3. **Flexible**: Supports pagination
4. **Complete**: Returns all necessary data for UI
5. **Consistent**: Follows Medusa API patterns

## Testing

To test the endpoints:
1. Login as a vendor to get a token
2. Open browser console on categories/collections page
3. Check console logs for API responses
4. Verify data is displayed correctly in the UI

## Future Enhancements

Potential improvements:
- Add filtering by status, visibility, etc.
- Add sorting options
- Add search functionality at API level
- Cache responses for better performance
- Add rate limiting
- Add more detailed error responses

