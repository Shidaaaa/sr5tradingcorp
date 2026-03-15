# Installment Payment UAT Checklist

This checklist verifies the full vehicle payment flow with reservation fee fixed at 5%.

## Prerequisites

1. Backend running at http://localhost:5000.
2. Frontend running at http://localhost:5173.
3. Admin account available.
4. Customer account available.
5. At least one vehicle product with known price.

## Test Data (Target Scenario)

- Vehicle Price: PHP 500,000
- Reservation Fee (5%): PHP 25,000
- Remaining Balance: PHP 475,000
- Down Payment (50% of remaining): PHP 237,500
- Financed Amount: PHP 237,500
- Installments: 12
- Monthly Interest: 1%
- Monthly Amount from current formula: (237,500 / 12) * 1.01 = PHP 19,989.58

## Phase A: Reservation Fee Verification

1. Customer opens checkout with a vehicle in cart.
2. Verify UI shows reservation fee equal to 5% of vehicle price.
3. Customer pays reservation fee online via Stripe.
4. Open customer order detail and confirm:
- reservation fee is marked paid
- message says to visit store for payment arrangement

Expected:
- Order has `reservation_fee_paid = true`
- Remaining balance is total minus paid reservation amount

## Phase B: Admin Setup Payment

1. Admin opens order in Orders Management.
2. Confirm Setup Payment button appears only when:
- order has vehicle
- reservation is paid
- remaining balance is greater than 0
3. Click Setup Payment.
4. Choose Setup Installment Plan and confirm creation.

Expected:
- Installment plan created
- 12 schedule rows exist
- Order status becomes `installment_active`

## Phase C: Down Payment Recording

1. On admin order detail, find Record Down Payment section.
2. Record exact down payment amount PHP 237,500.
3. Use non-cash method and include reference number.

Expected:
- Down payment accepted
- Plan status changes to `active`
- Plan `start_date` is set
- Schedule due dates are anchored from down payment date

Negative checks:
- amount not equal to exact down payment should fail
- missing reference for non-cash should fail
- duplicate reference for down payment should fail

## Phase D: Monthly Installments

1. Record installment #1 with exact due amount.
2. Attempt to record installment #3 before #2.
3. Record partial payment for #2.
4. Record remaining amount for #2.

Expected:
- Out-of-order installment payment is rejected
- Partial payment sets status partially_paid or overdue depending on due date
- Completing due amount changes row to paid

Negative checks:
- payment greater than row's remaining due should fail
- duplicate reference for same installment should fail

## Phase E: Completion

1. Continue until all 12 rows are paid.
2. Verify final statuses.

Expected:
- Installment plan status becomes `completed`
- Order status becomes `completed`
- Customer order detail shows all schedule rows as paid

## Phase F: API Endpoint Smoke List

Admin endpoints to verify manually:

1. POST /api/admin/orders/:id/setup-installment
2. POST /api/admin/orders/:id/record-payment
3. POST /api/admin/installments/:planId/record-payment
4. GET /api/admin/installments/:orderId

Customer endpoint:

1. GET /api/orders/:id

Expected:
- customer response includes `installment_plan` with schedule data when plan exists
- order totals and remaining values update after each payment
