// =====================================================
// Accounts API Types and Interfaces
// =====================================================

/**
 * Account Classification Type
 * Represents the type/category of an account
 */
export interface AccountClassificationType {
  id: number
  name: string
  description?: string
  displayOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Account Nature Enum
 * Represents the nature of an account (debit/credit)
 */
export type AccountNature = 'مدين' | 'دائن' | 'حيادي'

/**
 * Account Status Enum
 * Represents the status of an account
 */
export type AccountStatus = 'نشط' | 'موقوف'

/**
 * Main Account Item
 * Represents a single account in the ledger
 */
export interface Account {
  id: number
  accountCode: string
  accountName: string
  classificationTypeId: number
  classificationTypeName?: string
  accountNature?: AccountNature
  parentAccountId?: number
  parentAccountName?: string
  openingBalance: number
  debitAmount: number
  creditAmount: number
  balance: number
  allowedRatio?: number
  status: AccountStatus
  description?: string
  createdAt?: string
  updatedAt?: string
  createdBy?: number
  updatedBy?: number
}

/**
 * Related Account
 * Represents an account that is related to another account
 */
export interface RelatedAccount {
  id: number
  accountId: number
  relatedAccountId: number
  relationshipType?: string
  ratio: number
  priority?: number
  description?: string
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * Account Hierarchy
 * Represents the parent-child relationship between accounts
 */
export interface AccountHierarchy {
  id: number
  parentAccountId: number
  childAccountId: number
  hierarchyLevel: number
  createdAt?: string
  updatedAt?: string
}

/**
 * Account Movement (Journal Entry)
 * Represents a debit/credit transaction
 */
export interface AccountMovement {
  id: number
  accountId: number
  documentType?: string
  documentId?: number
  movementType: 'مدين' | 'دائن'
  amount: number
  description?: string
  referenceNumber?: string
  movementDate: string
  createdAt?: string
  updatedAt?: string
  createdBy?: number
}

/**
 * Account Balance History
 * Historical record of account balances
 */
export interface AccountBalanceHistory {
  id: number
  accountId: number
  balanceDate: string
  openingBalance: number
  debitAmount: number
  creditAmount: number
  closingBalance: number
  createdAt?: string
  updatedAt?: string
}

/**
 * Account Restriction
 * Rules and restrictions for account usage
 */
export interface AccountRestriction {
  id: number
  accountId: number
  restrictionType?: string
  maxAmount?: number
  minAmount?: number
  isLocked: boolean
  lockReason?: string
  allowedDocumentTypes?: string[]
  createdAt?: string
  updatedAt?: string
}

/**
 * Account Audit Log
 * Audit trail for all account changes
 */
export interface AccountAuditLog {
  id: number
  accountId: number
  action: string
  oldValues?: Record<string, any>
  newValues?: Record<string, any>
  changedBy?: number
  changeReason?: string
  createdAt?: string
}

/**
 * Account Segment
 * Analytical segment for an account
 */
export interface AccountSegment {
  id: number
  accountId: number
  segmentCode?: string
  segmentType: string
  segmentValue: string
  isMandatory: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * Account Cost Center Link
 * Links an account to a cost center
 */
export interface AccountCostCenter {
  id: number
  accountId: number
  costCenterId?: number
  costCenterName: string
  percentage: number
  isActive: boolean
  createdAt?: string
  updatedAt?: string
}

/**
 * Create Account Request
 * Data required to create a new account
 */
export interface CreateAccountRequest {
  accountCode: string
  accountName: string
  classificationTypeId: number
  accountNature?: AccountNature
  parentAccountId?: number
  openingBalance?: number
  allowedRatio?: number
  status: AccountStatus
  description?: string
}

/**
 * Update Account Request
 * Data required to update an existing account
 */
export interface UpdateAccountRequest extends Partial<CreateAccountRequest> {
  id: number
}

/**
 * Account Summary View
 * Used for displaying account information with all details
 */
export interface AccountSummary extends Account {
  parentAccountCode?: string
  balance: number
  balanceStatus?: 'مدين' | 'دائن' | 'متوازن'
}

/**
 * Account List Response
 * Response when fetching multiple accounts
 */
export interface AccountListResponse {
  data: Account[]
  total: number
  page: number
  pageSize: number
}

/**
 * Account Detail Response
 * Complete account information response
 */
export interface AccountDetailResponse extends Account {
  relatedAccounts: RelatedAccount[]
  hierarchy?: AccountHierarchy[]
  balanceHistory?: AccountBalanceHistory[]
  restrictions?: AccountRestriction[]
  segments?: AccountSegment[]
  costCenters?: AccountCostCenter[]
}

/**
 * Account Query Filters
 * Used for searching and filtering accounts
 */
export interface AccountQueryFilters {
  search?: string
  classificationTypeId?: number
  accountNature?: AccountNature
  status?: AccountStatus
  parentAccountId?: number
  page?: number
  pageSize?: number
  sortBy?: 'code' | 'name' | 'balance' | 'createdAt'
  sortOrder?: 'asc' | 'desc'
}

/**
 * Account Statistics
 * Statistics about accounts
 */
export interface AccountStatistics {
  totalAccounts: number
  activeAccounts: number
  inactiveAccounts: number
  totalDebit: number
  totalCredit: number
  totalBalance: number
  byClassification: {
    classificationTypeId: number
    classificationTypeName: string
    count: number
    totalBalance: number
  }[]
}

/**
 * API Error Response
 * Standard error response format
 */
export interface ApiErrorResponse {
  error: string
  message: string
  statusCode: number
  details?: Record<string, any>
}

/**
 * API Success Response
 * Standard success response format
 */
export interface ApiSuccessResponse<T> {
  data: T
  message?: string
  statusCode: number
}

// =====================================================
// Database Response DTOs
// =====================================================

/**
 * Account DTO from database
 */
export interface AccountDTO {
  id: number
  account_code: string
  account_name: string
  classification_type_id: number
  classification_type_name?: string
  account_nature?: AccountNature
  parent_account_id?: number
  parent_account_name?: string
  opening_balance: number
  debit_amount: number
  credit_amount: number
  balance: number
  allowed_ratio?: number
  status: AccountStatus
  description?: string
  created_at?: string
  updated_at?: string
  created_by?: number
  updated_by?: number
}

// =====================================================
// API Endpoints Documentation
// =====================================================

/**
 * ACCOUNTS API ENDPOINTS
 * 
 * 1. GET /api/accounts
 *    - Fetch all accounts with optional filtering
 *    - Query params: search, type, status, page, pageSize, sortBy, sortOrder
 *    - Response: AccountListResponse
 * 
 * 2. GET /api/accounts/{id}
 *    - Fetch a single account with all details
 *    - Response: AccountDetailResponse
 * 
 * 3. POST /api/accounts
 *    - Create a new account
 *    - Body: CreateAccountRequest
 *    - Response: Account
 * 
 * 4. PATCH /api/accounts/{id}
 *    - Update an existing account
 *    - Body: UpdateAccountRequest
 *    - Response: Account
 * 
 * 5. DELETE /api/accounts/{id}
 *    - Delete an account
 *    - Response: { success: boolean }
 * 
 * 6. GET /api/accounts/{id}/related
 *    - Fetch related accounts
 *    - Response: RelatedAccount[]
 * 
 * 7. GET /api/accounts/{id}/history
 *    - Fetch balance history
 *    - Response: AccountBalanceHistory[]
 * 
 * 8. GET /api/accounts/statistics
 *    - Fetch account statistics
 *    - Response: AccountStatistics
 * 
 * 9. POST /api/accounts/{id}/movements
 *    - Add a movement/transaction to account
 *    - Body: AccountMovement (without id)
 *    - Response: AccountMovement
 * 
 * 10. GET /api/account-classification-types
 *     - Fetch all classification types
 *     - Response: AccountClassificationType[]
 */

// =====================================================
// Component Props Types
// =====================================================

export interface AccountsComponentProps {
  mode?: 'view' | 'edit' | 'create'
  accountId?: number
  onSave?: (account: Account) => Promise<void>
  onDelete?: (accountId: number) => Promise<void>
  onCancel?: () => void
}

export interface AccountFormProps {
  account?: Account
  types: AccountClassificationType[]
  parentAccounts: Account[]
  isLoading?: boolean
  onSubmit: (account: CreateAccountRequest) => Promise<void>
  onCancel?: () => void
}

export interface AccountListProps {
  accounts: Account[]
  onSelect: (account: Account) => void
  selectedAccountId?: number
  isLoading?: boolean
}

export interface AccountDetailProps {
  account: Account
  relatedAccounts?: RelatedAccount[]
  balanceHistory?: AccountBalanceHistory[]
  isLoading?: boolean
}
