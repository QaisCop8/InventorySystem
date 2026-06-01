# Accounts API Implementation Guide

## Overview
Complete API endpoints for the accounting module covering account management, classifications, movements, and hierarchies.

## Base URL
```
/api
```

## Database Tables
See `docs/ACCOUNTS_SCHEMA.sql` for complete database schema with all tables, fields, and relationships.

---

## Endpoints

### 1. Get All Accounts
**Endpoint:** `GET /api/accounts`

**Query Parameters:**
```typescript
{
  search?: string              // Search by code or name
  typeId?: number              // Filter by classification type
  status?: 'نشط' | 'موقوف'     // Filter by status
  page?: number                // Page number (default: 1)
  pageSize?: number            // Items per page (default: 20)
  sortBy?: 'code'|'name'|'balance'  // Sort field
  sortOrder?: 'asc' | 'desc'   // Sort direction
}
```

**Response:**
```json
{
  "data": [
    {
      "id": 1,
      "account_code": "1000",
      "account_name": "الأصول الثابتة",
      "classification_type_id": 1,
      "classification_type_name": "الأصول",
      "account_nature": "مدين",
      "opening_balance": 50000,
      "debit_amount": 100000,
      "credit_amount": 20000,
      "balance": 130000,
      "status": "نشط",
      "allowed_ratio": 80,
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-05-28T15:45:00Z"
    }
  ],
  "total": 150,
  "page": 1,
  "pageSize": 20
}
```

---

### 2. Get Single Account
**Endpoint:** `GET /api/accounts/:id`

**Response:**
```json
{
  "id": 1,
  "account_code": "1000",
  "account_name": "الأصول الثابتة",
  "classification_type_id": 1,
  "classification_type_name": "الأصول",
  "account_nature": "مدين",
  "parent_account_id": null,
  "parent_account_name": null,
  "opening_balance": 50000,
  "debit_amount": 100000,
  "credit_amount": 20000,
  "balance": 130000,
  "status": "نشط",
  "allowed_ratio": 80,
  "description": "حساب الأصول الثابتة للشركة",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-05-28T15:45:00Z",
  "relatedAccounts": [
    {
      "id": 10,
      "account_id": 1,
      "related_account_id": 5,
      "relationship_type": "linked",
      "ratio": 50,
      "account_code": "5000",
      "account_name": "الالتزامات المتعلقة"
    }
  ],
  "balanceHistory": [
    {
      "balance_date": "2024-05-28",
      "opening_balance": 50000,
      "debit_amount": 5000,
      "credit_amount": 1000,
      "closing_balance": 54000
    }
  ]
}
```

---

### 3. Create Account
**Endpoint:** `POST /api/accounts`

**Request Body:**
```json
{
  "account_code": "1001",
  "account_name": "الأصول المتداولة",
  "classification_type_id": 1,
  "account_nature": "مدين",
  "parent_account_id": 1,
  "opening_balance": 25000,
  "status": "نشط",
  "allowed_ratio": 75,
  "description": "الأصول المتداولة للشركة"
}
```

**Response:**
```json
{
  "id": 2,
  "account_code": "1001",
  "account_name": "الأصول المتداولة",
  "classification_type_id": 1,
  "account_nature": "مدين",
  "parent_account_id": 1,
  "opening_balance": 25000,
  "debit_amount": 0,
  "credit_amount": 0,
  "balance": 25000,
  "status": "نشط",
  "allowed_ratio": 75,
  "created_at": "2024-05-28T16:00:00Z",
  "updated_at": "2024-05-28T16:00:00Z"
}
```

---

### 4. Update Account
**Endpoint:** `PATCH /api/accounts/:id`

**Request Body:**
```json
{
  "account_name": "الأصول المتداولة - تحديث",
  "status": "نشط",
  "allowed_ratio": 80,
  "description": "تحديث البيانات"
}
```

**Response:**
```json
{
  "id": 2,
  "account_code": "1001",
  "account_name": "الأصول المتداولة - تحديث",
  "classification_type_id": 1,
  "account_nature": "مدين",
  "status": "نشط",
  "allowed_ratio": 80,
  "updated_at": "2024-05-28T16:15:00Z"
}
```

---

### 5. Delete Account
**Endpoint:** `DELETE /api/accounts/:id`

**Response:**
```json
{
  "success": true,
  "message": "تم حذف الحساب بنجاح",
  "id": 2
}
```

---

### 6. Get Related Accounts
**Endpoint:** `GET /api/accounts/:id/related`

**Query Parameters:**
```typescript
{
  relationshipType?: string  // Filter by relationship type
}
```

**Response:**
```json
{
  "data": [
    {
      "id": 10,
      "account_id": 1,
      "related_account_id": 5,
      "relationship_type": "linked",
      "ratio": 50,
      "priority": 1,
      "description": "ارتباط مباشر"
    }
  ],
  "total": 3
}
```

---

### 7. Get Account Hierarchy
**Endpoint:** `GET /api/accounts/:id/hierarchy`

**Response:**
```json
{
  "parent": {
    "id": 1,
    "account_code": "1000",
    "account_name": "الأصول الثابتة"
  },
  "children": [
    {
      "id": 2,
      "account_code": "1001",
      "account_name": "الأصول المتداولة"
    },
    {
      "id": 3,
      "account_code": "1002",
      "account_name": "الأصول غير الملموسة"
    }
  ]
}
```

---

### 8. Get Account Balance History
**Endpoint:** `GET /api/accounts/:id/history`

**Query Parameters:**
```typescript
{
  startDate?: string    // YYYY-MM-DD
  endDate?: string      // YYYY-MM-DD
  page?: number
  pageSize?: number
}
```

**Response:**
```json
{
  "data": [
    {
      "id": 100,
      "account_id": 1,
      "balance_date": "2024-05-28",
      "opening_balance": 50000,
      "debit_amount": 5000,
      "credit_amount": 1000,
      "closing_balance": 54000
    },
    {
      "id": 99,
      "account_id": 1,
      "balance_date": "2024-05-27",
      "opening_balance": 48000,
      "debit_amount": 3000,
      "credit_amount": 500,
      "closing_balance": 50000
    }
  ],
  "total": 45
}
```

---

### 9. Get Account Movements
**Endpoint:** `GET /api/accounts/:id/movements`

**Query Parameters:**
```typescript
{
  startDate?: string    // YYYY-MM-DD
  endDate?: string      // YYYY-MM-DD
  documentType?: string
  page?: number
  pageSize?: number
}
```

**Response:**
```json
{
  "data": [
    {
      "id": 1001,
      "account_id": 1,
      "document_type": "invoice",
      "document_id": 50,
      "movement_type": "مدين",
      "amount": 5000,
      "description": "فاتورة مبيعات",
      "reference_number": "INV-001",
      "movement_date": "2024-05-28",
      "created_at": "2024-05-28T10:00:00Z"
    }
  ],
  "total": 150
}
```

---

### 10. Add Account Movement
**Endpoint:** `POST /api/accounts/:id/movements`

**Request Body:**
```json
{
  "movement_type": "مدين",
  "amount": 5000,
  "description": "فاتورة مبيعات",
  "document_type": "invoice",
  "document_id": 50,
  "reference_number": "INV-001",
  "movement_date": "2024-05-28"
}
```

**Response:**
```json
{
  "id": 1001,
  "account_id": 1,
  "movement_type": "مدين",
  "amount": 5000,
  "description": "فاتورة مبيعات",
  "document_type": "invoice",
  "document_id": 50,
  "reference_number": "INV-001",
  "movement_date": "2024-05-28",
  "created_at": "2024-05-28T10:00:00Z"
}
```

---

### 11. Get Account Statistics
**Endpoint:** `GET /api/accounts/statistics`

**Query Parameters:**
```typescript
{
  startDate?: string    // YYYY-MM-DD
  endDate?: string      // YYYY-MM-DD
}
```

**Response:**
```json
{
  "totalAccounts": 150,
  "activeAccounts": 145,
  "inactiveAccounts": 5,
  "totalDebit": 5000000,
  "totalCredit": 3500000,
  "totalBalance": 1500000,
  "byClassification": [
    {
      "classificationTypeId": 1,
      "classificationTypeName": "الأصول",
      "count": 35,
      "totalBalance": 1200000
    },
    {
      "classificationTypeId": 2,
      "classificationTypeName": "الخصوم",
      "count": 25,
      "totalBalance": -500000
    }
  ]
}
```

---

### 12. Get Classification Types
**Endpoint:** `GET /api/account-classification-types`

**Response:**
```json
[
  {
    "id": 1,
    "name": "الأصول",
    "description": "الأصول والممتلكات",
    "displayOrder": 1,
    "isActive": true
  },
  {
    "id": 2,
    "name": "الخصوم",
    "description": "الخصوم والالتزامات",
    "displayOrder": 2,
    "isActive": true
  },
  {
    "id": 3,
    "name": "حقوق الملكية",
    "description": "حقوق الملكية وراس المال",
    "displayOrder": 3,
    "isActive": true
  },
  {
    "id": 4,
    "name": "الإيرادات",
    "description": "الإيرادات والمبيعات",
    "displayOrder": 4,
    "isActive": true
  },
  {
    "id": 5,
    "name": "المصروفات",
    "description": "المصروفات والتكاليف",
    "displayOrder": 5,
    "isActive": true
  },
  {
    "id": 6,
    "name": "الأرباح والخسائر",
    "description": "الأرباح والخسائر المتنوعة",
    "displayOrder": 6,
    "isActive": true
  }
]
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": "VALIDATION_ERROR",
  "message": "يرجى إدخال كود الحساب واسم الحساب",
  "statusCode": 400,
  "details": {
    "accountCode": "required",
    "accountName": "required"
  }
}
```

### 404 Not Found
```json
{
  "error": "NOT_FOUND",
  "message": "الحساب غير موجود",
  "statusCode": 404
}
```

### 409 Conflict
```json
{
  "error": "DUPLICATE_CODE",
  "message": "كود الحساب موجود بالفعل",
  "statusCode": 409
}
```

### 500 Internal Server Error
```json
{
  "error": "INTERNAL_ERROR",
  "message": "حدث خطأ أثناء معالجة الطلب",
  "statusCode": 500
}
```

---

## Implementation Notes

### Field Validation
- **account_code**: Required, unique, max 50 characters
- **account_name**: Required, max 255 characters
- **classification_type_id**: Required, must exist in `account_classification_types`
- **opening_balance**: Optional, numeric, default 0
- **allowed_ratio**: Optional, numeric (percentage), default 0
- **status**: Required, enum: 'نشط', 'موقوف'

### Calculations
- **balance** = opening_balance + debit_amount - credit_amount
- When movement_type is 'مدين': debit_amount += amount
- When movement_type is 'دائن': credit_amount += amount
- balance recalculates automatically

### Audit Trail
All account changes are logged to `account_audit_logs` table including:
- Changed fields (old_values, new_values)
- User who made the change
- Timestamp of change
- Reason for change (optional)

### Restrictions
- Cannot delete an account with movements (must archive instead)
- Cannot modify account_code after creation
- Cannot modify classification_type_id if account has movements
- Parent account must exist and must be of same or parent type

---

## Example Usage

### Create Account with Complete Data
```bash
curl -X POST http://localhost:3000/api/accounts \
  -H "Content-Type: application/json" \
  -d '{
    "account_code": "1001",
    "account_name": "الأصول المتداولة",
    "classification_type_id": 1,
    "account_nature": "مدين",
    "parent_account_id": 1,
    "opening_balance": 25000,
    "allowed_ratio": 80,
    "status": "نشط",
    "description": "الأصول المتداولة للشركة"
  }'
```

### Update Account Status
```bash
curl -X PATCH http://localhost:3000/api/accounts/2 \
  -H "Content-Type: application/json" \
  -d '{
    "status": "موقوف"
  }'
```

### Search Accounts
```bash
curl "http://localhost:3000/api/accounts?search=أصول&typeId=1&status=نشط&page=1&pageSize=20"
```

---

## Related Files
- Schema: `docs/ACCOUNTS_SCHEMA.sql`
- Types: `lib/types/accounts.ts`
- Component: `components/customer/unified-accounts.tsx`
- Main Accounts Page: `components/accounts.tsx`
