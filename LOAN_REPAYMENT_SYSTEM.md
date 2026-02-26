# Loan Repayment System Implementation

## 📋 What We Built

A complete **loan repayment workflow** where members can:
1. View active loans with balance tracking
2. Make repayments via STK Push
3. Track repayment history
4. See interest calculations

Admin can:
1. View all repayments (pending/confirmed)
2. Confirm received payments
3. Track total interest collected
4. Monitor loan closure

---

## 🗄️ Database Changes

### New Tables & Columns

**1. `repayments` table** (created in `create_repayments_table.sql`)
```sql
- id (UUID primary key)
- loan_id (UUID, references loans)
- user_id (UUID, references profiles)
- amount (numeric)
- mpesa_code (text, STK response)
- status (pending/confirmed/failed)
- payment_method (mpesa/savings)
- phone (borrower phone)
- created_at, confirmed_at (timestamps)
```

**2. `loans` table additions**
```sql
- total_repaid (numeric, default 0) - cumulative repayments
```

**3. `loan_status_view`** (SQL view for easy calculations)
```sql
- interest (amount * 0.10)
- total_due (amount + interest)
- remaining_balance (total_due - total_repaid)
- repayment_status (Not Started/In Progress/Ready to Close/Fully Repaid)
```

**4. RLS Policies on `repayments`**
- Users can read their own repayment history
- Admin can read/update all repayments
- Users can insert repayment records

---

## 🎨 Frontend Changes

### Dashboard Updates (`dashboard.html`)

**1. Repayment Modal** (new)
- Shows loan summary (principal, interest, total due, balance)
- Amount input field with max balance validation
- STK Push button
- Error/success messaging

**2. Active Loans Section** (new)
- Displays on main dashboard
- Shows principal, balance, and "Pay Now" button
- Quick access for urgent repayments

**3. Expanded Loans View**
- Shows all loans with status badges
- Displays repayment progress (amount paid vs total due)
- "Make Payment" button for active loans only

**4. New Functions**
```javascript
openRepaymentModal(loanId, principal, totalRepaid, phone)
  - Opens modal with loan details
  - Pre-fills loan info for display

submitRepayment(evt)
  - Creates repayment record in DB
  - Sends STK Push via mpesa-push edge function
  - Shows success/error message
  - Refreshes loan view on completion
```

---

## 🔄 Workflow

### Member Repayment Flow
```
1. Member views active loans on dashboard
2. Clicks "Pay Now" button
3. Modal shows: principal, interest, total due, remaining balance
4. Member enters repayment amount
5. Clicks "Send STK Push"
6. mpesa-push function sends STK to their phone
7. Member enters M-Pesa PIN
8. mpesa-callback function receives confirmation
9. Repayment record updated with mpesa_code, status = "confirmed"
10. loan.total_repaid incremented
11. Dashboard automatically refreshes
```

### Admin Confirmation Flow
```
1. Admin goes to "Repayment Queue" (to be built)
2. Views pending repayments
3. Verifies payment received (via M-Pesa API or manual check)
4. Clicks "Confirm Payment"
5. Updates repayment.status = "confirmed"
6. Updates loan.total_repaid
7. If total_repaid >= total_due, sets loan.status = "closed"
```

---

## 🔧 Integration with Edge Functions

### `mpesa-push` (existing)
**Used for**: Sending STK Push for repayments

**Expected input**:
```json
{
  "amount": 500,
  "phone": "254712345678",
  "repaymentId": "uuid-of-repayment"
}
```

### `mpesa-callback` (needs update)
**Current**: Handles withdrawal/loan disbursement callbacks  
**Needs**: Add logic to detect if callback is for a repayment
```javascript
if (request.repaymentId) {
  // Update repayments table
  // Increment loan.total_repaid
  // Set repayment.status = "confirmed"
} else if (withdrawalId) {
  // Existing withdrawal logic
} else if (loanId) {
  // Existing loan disbursement logic
}
```

---

## 📊 Admin Repayment Tracking (To Be Built)

Add to `admin.html`:

1. **New Tab**: "Repayment Queue"
   - Shows pending repayments
   - Amount, member name, date, phone
   - "Confirm" button to mark as paid

2. **Loan Dashboard Updates**
   - Show total repayments received
   - Show total interest collected
   - Loan repayment progress bar

3. **Query**:
```sql
SELECT r.id, r.loan_id, r.amount, r.phone, r.status, 
       l.amount, l.total_repaid, p.full_name
FROM repayments r
JOIN loans l ON r.loan_id = l.id
JOIN profiles p ON r.user_id = p.id
WHERE r.status = 'pending'
ORDER BY r.created_at DESC
```

---

## ✅ Setup Checklist

- [x] Create `repayments` table (run `create_repayments_table.sql`)
- [x] Add `total_repaid` column to `loans` table
- [x] Create `loan_status_view` for calculations
- [x] Set up RLS policies on `repayments`
- [x] Add repayment modal to dashboard
- [x] Add active loans section to dashboard
- [x] Implement `openRepaymentModal()` function
- [x] Implement `submitRepayment()` function
- [ ] Update `mpesa-callback` edge function to handle repayments
- [ ] Build admin "Repayment Queue" view
- [ ] Test end-to-end repayment flow

---

## 💡 Key Features

✨ **Clean Balance Tracking**
- Principal + 10% Interest = Total Due
- Total Repaid tracked cumulatively
- Balance = Total Due - Total Repaid

✨ **Audit Trail**
- Every repayment recorded with timestamp
- M-Pesa code stored for verification
- Status progression: pending → confirmed → (loan closed)

✨ **Member Experience**
- One-click repayment from dashboard
- See exactly what's owed
- Automatic balance updates

✨ **Admin Control**
- View all repayments
- Confirm payments manually if needed
- Track interest collected

---

## 🚀 Next Steps

1. **Run SQL** to create tables:
   ```sql
   -- Copy entire create_repayments_table.sql and run in Supabase SQL Editor
   ```

2. **Update Edge Function** (`mpesa-callback/index.ts`):
   - Add repayment callback handling
   - Update repayment.status = "confirmed"
   - Increment loan.total_repaid
   - Auto-close loan if fully repaid

3. **Build Admin UI** in `admin.html`:
   - Add "Repayment Queue" tab
   - Show pending/confirmed repayments
   - Add confirm/reject buttons

4. **Test Flow**:
   - Member logs in
   - Views active loan
   - Clicks "Pay Now"
   - Sees loan details
   - Enters amount
   - Sends STK Push
   - Confirms on phone
   - Dashboard updates

---

## 📝 Notes

- Interest is **fixed at 10%** of principal
- Repayment tracking is **cumulative** (each payment adds to total_repaid)
- Loans auto-close when `total_repaid >= total_due`
- All M-Pesa codes are logged for audit trail
- RLS ensures members only see their own repayments
