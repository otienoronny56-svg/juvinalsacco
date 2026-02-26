# Loan Repayment Flow - Complete Implementation

## Overview
The loan repayment system is fully automated with three integrated components:
1. **Frontend (dashboard.html)** - User interface for payment initiation
2. **Edge Function (mpesa-push)** - Sends STK push prompts to user phone
3. **Webhook (mpesa-callback)** - Confirms payment and updates loan balance

---

## Step-by-Step Flow

### 1. Member Initiates Repayment (Dashboard)
```
User Action: Views "Active Loans" section → Clicks "Pay Now" button
Function Called: openRepaymentModal(loanId, principal, totalRepaid)
- Modal displays: Loan ID, Principal, Interest, Total Due, Remaining Balance
- User enters repayment amount (minimum KES 10)
- User clicks "Send STK Push"
```

### 2. Frontend Creates Repayment Record & Sends STK
```
Function: submitRepayment(evt)

Step A: Validate Input
- ✅ Check amount ≥ KES 10
- ✅ Check phone exists in userProfile
- ✅ Get session access token

Step B: Create Repayment Record (Database)
INSERT INTO repayments (
  loan_id, user_id, amount, phone, 
  status='pending', payment_method='mpesa'
)

Step C: Send STK Push (Edge Function Call)
POST /functions/v1/mpesa-push?phone={phone}&amount={amount}
Headers: Authorization: Bearer {access_token}
Response: { request_id, stk_response, etc. }

Step D: Show Success Message
Alert: "✅ STK Push sent! Check your phone for M-Pesa prompt."
Auto-reload: Refresh loans view after 2 seconds

Result: User sees repayment created with status='pending'
```

### 3. M-Pesa STK Prompt & User Payment
```
Action: M-Pesa sends STK push to user's phone
User Action: Enters PIN to complete payment
M-Pesa Action: Confirms transaction
```

### 4. Callback Webhook Processes Payment
```
Webhook Triggered: POST /functions/v1/mpesa-callback (from M-Pesa)
Payload Contains:
- Amount: Payment amount
- MpesaReceiptNumber: Receipt code
- PhoneNumber: User's phone
- CheckoutRequestID: Transaction reference

Process:

Step A: Extract Payment Details
- receipt = Receipt code (e.g., "ABC123XYZ")
- amount = Payment amount
- phone = Normalized to last 9 digits

Step B: Find User
SELECT id FROM profiles WHERE phone ILIKE %{corePhone}%

Step C: Detect Transaction Type
- Check for pending repayment matching amount
- SELECT FROM repayments WHERE status='pending' AND amount={amount}

Step D: if REPAYMENT found:
  
  D1: Update Repayment Status
  UPDATE repayments SET
    status='confirmed',
    mpesa_code='{receipt}',
    confirmed_at=NOW()
  
  D2: Update Loan Balance
  SELECT total_repaid FROM loans WHERE id={loan_id}
  new_total = total_repaid + amount
  
  D3: Check Loan Status
  IF new_total >= (principal + 10% interest):
    UPDATE loans SET status='closed'
  ELSE:
    UPDATE loans SET status='active'
    new_total with 10% interest
  
  Result: Loan balance updated, repayment confirmed

Step E: else (No repayment match):
  Treat as DEPOSIT - create transaction record
  INSERT INTO transactions (type='deposit', amount, mpesa_code)
```

### 5. Dashboard Updates
```
When callback completes successfully:
- Dashboard shows updated loan balance
- Repayment marked as "confirmed"
- If loan fully repaid: Status changes to "closed"
- Recent transactions list updated

Real-time Updates (via Supabase Realtime subscriptions):
- Balance updates appear instantly
- No page refresh needed
```

---

## Database Schema

### repayments Table
```sql
CREATE TABLE repayments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  loan_id UUID REFERENCES loans(id),
  user_id UUID REFERENCES profiles(id),
  amount DECIMAL,
  phone VARCHAR(20),
  status VARCHAR(20) DEFAULT 'pending', -- pending | confirmed | failed | cancelled
  mpesa_code VARCHAR(20),
  payment_method VARCHAR(20) DEFAULT 'mpesa',
  created_at TIMESTAMP DEFAULT NOW(),
  confirmed_at TIMESTAMP,
  
  UNIQUE(loan_id, mpesa_code) -- Prevent duplicate confirmations
);
```

### Updated loans Table
```sql
ALTER TABLE loans ADD total_repaid DECIMAL DEFAULT 0;
-- Tracks cumulative repayments against loan principal
```

### loan_status_view (for Dashboard)
```sql
SELECT
  id, user_id, amount as principal,
  (amount * 0.10) as interest,
  (amount * 1.10) as total_due,
  COALESCE(total_repaid, 0) as repaid,
  ((amount * 1.10) - COALESCE(total_repaid, 0)) as remaining_balance,
  status
FROM loans
```

---

## Error Handling

### Frontend Validation
- Phone field validation: "Please update your phone number in profile settings"
- Amount validation: "Repayment must be at least KES 10"
- Session validation: Auto-fetches current auth session
- Network errors: Catch and display error message to user

### Callback Validation
- User matching: "User not found for {phone}" → logs but doesn't error
- Repayment update: Catches DB errors and logs
- Loan update: Catches DB errors and logs
- Gracefully degrades: Returns 200 status even on errors (M-Pesa polling)

### Edge Function Error Log Format
```
Console Output:
✅ Repayment record created: {repayment_id}
📱 Sending STK push to {phone}
✅ STK push sent successfully: {response}
```

---

## Testing Checklist

### Phase 1: Database Setup ✅
- [x] repayments table created
- [x] total_repaid column added to loans
- [x] RLS policies configured for users to insert/read own repayments
- [x] Service role can update repayments/loans

### Phase 2: Frontend Integration ✅
- [x] openRepaymentModal() displays loan breakdown
- [x] submitRepayment() creates repayment record
- [x] submitRepayment() calls edge function with correct params
- [x] Phone field sourced from userProfile, not loan object
- [x] Success message displayed after STK sent
- [x] Error handling for missing phone or invalid amount

### Phase 3: Edge Function
- [ ] Test: Submit repayment from dashboard
- [ ] Check: Console logs show "STK push sent"
- [ ] Check: Repayment created with status='pending' in database

### Phase 4: M-Pesa Integration
- [ ] Test: Receive M-Pesa STK prompt on phone
- [ ] Test: Complete payment with M-Pesa PIN
- [ ] Check: M-Pesa confirmation received

### Phase 5: Callback & Balance Update
- [ ] Check: Callback received and processed (logs)
- [ ] Check: Repayment status changed to 'confirmed'
- [ ] Check: Loan total_repaid incremented correctly
- [ ] Check: Dashboard balance updated
- [ ] Check: If loan fully repaid, status changed to 'closed'

### Phase 6: Error Scenarios
- [ ] Test: Submit repayment without phone set (should show alert)
- [ ] Test: Submit repayment < KES 10 (should show alert)
- [ ] Test: Network error during edge function call (should show error message)
- [ ] Test: M-Pesa transaction timeout (repayment stays 'pending')

---

## Key Features

### ✅ Already Implemented
- Database tables and triggers for j_number assignment
- Loan eligibility checks (6 months, KES 500 avg)
- Guarantor selection and amount locking
- KYC document uploads
- Admin KYC verification interface
- Deposit/withdrawal with admin approval
- **Complete repayment system** (Phase 1-5 above)

### 🔄 In Progress / Planned
- Supabase Realtime subscriptions for live balance updates
- Database trigger for automatic STK push (alternative to frontend call)
- Admin repayment queue/confirmation UI
- Phone number deduplication and validation

---

## Code References

### Dashboard Repayment Functions
- `openRepaymentModal(loanId, principal, totalRepaid)` - Line ~878
- `submitRepayment(evt)` - Line ~910 (complete implementation)
- `closeModal(modalId)` - Utility function

### Edge Functions
- `/functions/mpesa-push/index.ts` - STK push sender
- `/functions/mpesa-callback/index.ts` - Payment confirmation handler
- `/functions/mpesa-disburse/index.ts` - Loan disbursement (existing)

### Database
- `supabase/sql/fix_repayments_with_role.sql` - Schema creation
- RLS policies configured in Supabase dashboard

---

## Quick Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| "Please update your phone number" | userProfile.phone is empty | Go to Settings, add phone number |
| "MISSING DATA. Phone: null, Amount: null" | Query params not sent correctly | Check submitRepayment() urlSearchParams format |
| Repayment not appearing in dashboard | Modal not refreshing loans | Check loadLoansView() is being called |
| Callback not updating balance | RLS policy blocking service role | Verify service role can update loans table |
| STK push not arriving | Phone format incorrect | Ensure phone is normalized (e.g., 754806488 not 254754806488) |

---

## Next Steps (Recommended)

1. **Test full flow** with real M-Pesa test credentials
2. **Implement Supabase Realtime** for live balance updates
3. **Add admin queue UI** for viewing pending repayments
4. **Create phone validation rules** at signup
5. **Switch to signed URLs** for document storage security
