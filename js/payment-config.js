// Business payment details for the UPI checkout QR code and deep links.
// A UPI ID is meant to be shown to customers so they can pay you, so it's
// fine for this to be a plain, un-authenticated file loaded by the browser
// — it is not a secret the way an API key would be.
export const PAYMENT_CONFIG = {
  upi: {
    id: "svcmerc00314092@svcbank",
    payeeName: "CARRENTPE",
  },
  bank: {
    accountName: "CARRENTPE",
    accountNumber: "0000000000000", // TODO: replace with your real account number
    ifsc: "XXXX0000000", // TODO: replace with your real IFSC code
    bankName: "Bank Name", // TODO
  },
};
 