# Kruizly Invoice Template

## Files

- `invoiceTemplate.js` — builds the complete invoice HTML.
- `invoice.css` — A4 invoice styling.
- `../services/invoicePdfService.js` — renders the HTML to PDF with Puppeteer.

## Expected invoice object

```js
{
  invoiceNumber: "KRZ-INV-000124",
  type: "INVOICE",
  status: "PAID",
  invoiceDate: new Date(),

  bookingId: "KRZ-1024",

  customer: {
    name: "Customer Name",
    email: "customer@example.com",
    phone: "+91 XXXXX XXXXX",
    address: "Customer address"
  },

  vehicle: {
    name: "BMW 3 Series",
    registration: "MH-XX-XXXX",
    category: "Luxury"
  },

  rental: {
    pickupDate: new Date(),
    returnDate: new Date(),
    duration: "2 Days"
  },

  charges: {
    rental: 8000,
    driver: 0,
    delivery: 500,
    protection: 0,
    extraKm: 0,
    lateFee: 0,
    fuel: 0,
    cleaning: 0,
    damage: 0,
    toll: 0,
    other: 0,
    discount: 0
  },

  subtotal: 8500,
  tax: 0,
  total: 8500,
  amountPaid: 8500,
  balanceDue: 0,

  payment: {
    status: "PAID",
    method: "Razorpay",
    razorpayOrderId: "order_xxx",
    razorpayPaymentId: "pay_xxx",
    paidAt: new Date()
  },

  securityDeposit: {
    collected: 5000,
    deducted: 0,
    refunded: 5000
  },

  notes: "Thank you for choosing Kruizly."
}
```

## Environment variables

```env
COMPANY_LEGAL_NAME=Premium Self-Drive Rentals
COMPANY_ADDRESS=Mumbai, Maharashtra, India
```

## Use from an invoice route/service

```js
const { generateInvoicePdf } = require("../services/invoicePdfService");

const pdfBuffer = await generateInvoicePdf(invoice);
```

Then return the buffer as `application/pdf`, or save it using the project's existing storage layer.

## Important

This folder does not create invoice records or calculate payment amounts. Those should be done by the existing invoice/payment services using server-side booking and verified payment data.
