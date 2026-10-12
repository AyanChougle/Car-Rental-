// Fleet catalog, generated from official Kruizly Excel Fleet Master
// Categories: economy (sedans & hatchbacks), suv, mpv, luxury.
// All driver rates: ₹2,000 / day.
// Loaded as a plain classic script (no bundler) so fleet.js, booking.js,
// and vehicle-gallery.js can reference fleetVehicles directly.

const DEFAULT_FLEET_VEHICLES = [
  { id: 1, carId: "CRP-002", regNo: "MH03EL1025", brand: "Suzuki", model: "Fronx", year: 2026, category: "compact-suv", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 3500, priceHour: 146, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 2, carId: "CRP-003", regNo: "MH05GJ4711", brand: "Suzuki", model: "Ertiga", year: 2026, category: "mpv", transmission: "Manual", fuel: "Petrol + CNG", seats: 7, priceDay: 4000, priceHour: 167, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 3, carId: "CRP-005", regNo: "MH48CJ4153", brand: "Toyota", model: "Glanza", year: 2026, category: "hatchback", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3000, priceHour: 125, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 4, carId: "CRP-006", regNo: "MH04MU1178", brand: "Toyota", model: "Glanza", year: 2026, category: "hatchback", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3000, priceHour: 125, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 5, carId: "CRP-007", regNo: "MH05FV3454", brand: "Tata", model: "Punch", year: 2026, category: "compact-suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3000, priceHour: 125, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 6, carId: "CRP-008", regNo: "MH43CY1632", brand: "Suzuki", model: "Fronx", year: 2026, category: "compact-suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3200, priceHour: 133, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 7, carId: "CRP-009", regNo: "MH02FU6808", brand: "Mahindra", model: "XUV 700", year: 2026, category: "suv", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 5500, priceHour: 229, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 8, carId: "CAT-001", regNo: "MH04KR0101", brand: "BMW", model: "520D", year: 2017, category: "luxury", transmission: "Automatic", fuel: "Diesel", seats: 5, priceDay: 18000, priceHour: 750, securityDeposit: 15000, freeKm: 250, extraKm: 60, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 9, carId: "CAT-002", regNo: "MH04KR0102", brand: "Mahindra", model: "7XO", year: 2026, category: "suv", transmission: "AMT", fuel: "Diesel", seats: 7, priceDay: 9000, priceHour: 375, securityDeposit: 7000, freeKm: 250, extraKm: 28, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 10, carId: "CAT-003", regNo: "MH04KR0103", brand: "Tata", model: "Altroz", year: 2024, category: "economy", transmission: "Manual", fuel: "Petrol", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 11, carId: "CAT-004", regNo: "MH04KR0104", brand: "Tata", model: "Altroz", year: 2024, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 12, carId: "CAT-005", regNo: "MH04KR0105", brand: "Hyundai", model: "Aura", year: 2024, category: "economy", transmission: "AMT", fuel: "Petrol", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 13, carId: "CAT-006", regNo: "MH04KR0106", brand: "Hyundai", model: "Aura", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 14, carId: "CAT-007", regNo: "MH04KR0107", brand: "Maruti Suzuki", model: "Baleno", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2500, priceHour: 104, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 15, carId: "CAT-008", regNo: "MH04KR0108", brand: "Maruti Suzuki", model: "Brezza", year: 2025, category: "suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3500, priceHour: 146, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 16, carId: "CAT-009", regNo: "MH04KR0109", brand: "Maruti Suzuki", model: "Brezza", year: 2018, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 5, priceDay: 4000, priceHour: 167, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 17, carId: "CAT-010", regNo: "MH04KR0110", brand: "Kia", model: "Carens", year: 2025, category: "mpv", transmission: "Manual", fuel: "Diesel", seats: 7, priceDay: 4500, priceHour: 188, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 18, carId: "CAT-011", regNo: "MH04KR0111", brand: "Jeep", model: "Compass", year: 2020, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 5, priceDay: 5500, priceHour: 229, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 19, carId: "CAT-012", regNo: "MH04KR0112", brand: "Hyundai", model: "Creta", year: 2024, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 5, priceDay: 4500, priceHour: 188, securityDeposit: 3500, freeKm: 250, extraKm: 14, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 20, carId: "CAT-013", regNo: "MH04KR0113", brand: "Maruti Suzuki", model: "Dzire", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 21, carId: "CAT-014", regNo: "MH04KR0114", brand: "Maruti Suzuki", model: "Ertiga", year: 2025, category: "mpv", transmission: "Manual", fuel: "Petrol + CNG", seats: 7, priceDay: 3300, priceHour: 138, securityDeposit: 3500, freeKm: 250, extraKm: 14, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 22, carId: "CAT-015", regNo: "MH04KR0115", brand: "Hyundai", model: "Exter", year: 2025, category: "suv", transmission: "AMT", fuel: "Petrol", seats: 5, priceDay: 3500, priceHour: 146, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 23, carId: "CAT-016", regNo: "MH04KR0116", brand: "Hyundai", model: "Exter", year: 2025, category: "suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2800, priceHour: 117, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 24, carId: "CAT-017", regNo: "MH04KR0117", brand: "Maruti Suzuki", model: "Fronx", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 25, carId: "CAT-018", regNo: "MH04KR0118", brand: "Maruti Suzuki", model: "Fronx", year: 2025, category: "economy", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 2700, priceHour: 113, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 26, carId: "CAT-019", regNo: "MH04KR0119", brand: "Toyota", model: "Glanza", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 27, carId: "CAT-020", regNo: "MH04KR0120", brand: "Maruti Suzuki", model: "Grand Vitara", year: 2025, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 5, priceDay: 4000, priceHour: 167, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 28, carId: "CAT-021", regNo: "MH04KR0121", brand: "Hyundai", model: "i20", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 29, carId: "CAT-022", regNo: "MH04KR0122", brand: "Hyundai", model: "i20", year: 2018, category: "economy", transmission: "Manual", fuel: "Diesel", seats: 5, priceDay: 3000, priceHour: 125, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 30, carId: "CAT-023", regNo: "MH04KR0123", brand: "Maruti Suzuki", model: "Ignis", year: 2024, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2500, priceHour: 104, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 31, carId: "CAT-024", regNo: "MH04KR0124", brand: "Toyota", model: "Innova Crysta", year: 2017, category: "mpv", transmission: "Manual", fuel: "Diesel", seats: 7, priceDay: 5500, priceHour: 229, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 32, carId: "CAT-025", regNo: "MH04KR0125", brand: "Toyota", model: "Innova Crysta", year: 2018, category: "mpv", transmission: "Automatic", fuel: "Diesel", seats: 7, priceDay: 6000, priceHour: 250, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 33, carId: "CAT-026", regNo: "MH04KR0126", brand: "Tata", model: "Nexon", year: 2025, category: "suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 3000, priceHour: 125, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 34, carId: "CAT-027", regNo: "MH04KR0127", brand: "Tata", model: "Punch", year: 2025, category: "suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2700, priceHour: 113, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 35, carId: "CAT-028", regNo: "MH04KR0128", brand: "Tata", model: "Safari", year: 2024, category: "suv", transmission: "Automatic", fuel: "Diesel", seats: 7, priceDay: 9000, priceHour: 375, securityDeposit: 7000, freeKm: 250, extraKm: 28, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 36, carId: "CAT-029", regNo: "MH04KR0129", brand: "Mahindra", model: "Scorpio N", year: 2025, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 7, priceDay: 6000, priceHour: 250, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 37, carId: "CAT-030", regNo: "MH04KR0130", brand: "Maruti Suzuki", model: "Swift", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2500, priceHour: 104, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 38, carId: "CAT-031", regNo: "MH04KR0131", brand: "Maruti Suzuki", model: "Swift", year: 2021, category: "economy", transmission: "AMT", fuel: "Petrol", seats: 5, priceDay: 2500, priceHour: 104, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 39, carId: "CAT-032", regNo: "MH04KR0132", brand: "Mahindra", model: "Thar", year: 2025, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 4, priceDay: 5500, priceHour: 229, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 40, carId: "CAT-033", regNo: "MH04KR0133", brand: "Mahindra", model: "Thar", year: 2024, category: "suv", transmission: "Automatic", fuel: "Diesel", seats: 4, priceDay: 5500, priceHour: 229, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 41, carId: "CAT-034", regNo: "MH04KR0134", brand: "Mahindra", model: "Thar Roxx", year: 2025, category: "suv", transmission: "Automatic", fuel: "Diesel", seats: 5, priceDay: 7000, priceHour: 292, securityDeposit: 5000, freeKm: 250, extraKm: 20, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 42, carId: "CAT-035", regNo: "MH04KR0135", brand: "Maruti Suzuki", model: "WagonR", year: 2023, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2300, priceHour: 96, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 43, carId: "CAT-036", regNo: "MH04KR0136", brand: "Maruti Suzuki", model: "XL6", year: 2023, category: "mpv", transmission: "Manual", fuel: "Petrol + CNG", seats: 7, priceDay: 3500, priceHour: 146, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 44, carId: "CAT-037", regNo: "MH04KR0137", brand: "Mahindra", model: "XUV500", year: 2022, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 7, priceDay: 4500, priceHour: 188, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 45, carId: "CAT-038", regNo: "MH04KR0138", brand: "Mahindra", model: "XUV700", year: 2025, category: "suv", transmission: "Manual", fuel: "Diesel", seats: 7, priceDay: 6000, priceHour: 250, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },
  { id: 46, carId: "CAT-039", regNo: "MH04KR0139", brand: "Toyota", model: "Urban Cruiser Taisor", year: 2025, category: "compact-suv", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 3500, priceHour: 146, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 1, hubName: "Gavson Business Park, Ghansoli", hub: "Gavson Business Park, Ghansoli", available: 1, status: "available" },

  // HUB 2: KANDIVALI HUB, MUMBAI (Exact Segment Fleet)
  // 🔹 COMPACT & 5-SEATER SEGMENT:
  { id: 101, carId: "KND-001", regNo: "MH02EX1001", brand: "Hyundai", model: "Exter", year: 2025, category: "compact-suv", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2800, priceHour: 117, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 102, carId: "KND-002", regNo: "MH02SW1002", brand: "Maruti Suzuki", model: "Swift VXI (O)", year: 2025, category: "economy", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 103, carId: "KND-003", regNo: "MH02TG1003", brand: "Tata", model: "Tigor", year: 2025, category: "economy", transmission: "Automatic", fuel: "Petrol + CNG", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 104, carId: "KND-004", regNo: "MH02DZ1004", brand: "Maruti Suzuki", model: "Dzire ZXI+ Sunroof", year: 2025, category: "economy", transmission: "Automatic", fuel: "Petrol", seats: 5, priceDay: 2800, priceHour: 117, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 105, carId: "KND-005", regNo: "MH02AL1005", brand: "Tata", model: "Altroz", year: 2025, category: "economy", transmission: "Manual", fuel: "Petrol + CNG", seats: 5, priceDay: 2600, priceHour: 108, securityDeposit: 3000, freeKm: 250, extraKm: 12, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 106, carId: "KND-006", regNo: "MH02SL1006", brand: "Kia", model: "Seltos Sunroof", year: 2025, category: "suv", transmission: "Manual", fuel: "Petrol", seats: 5, priceDay: 4500, priceHour: 188, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },

  // 🔹 7 & 8-SEATER MPV SEGMENT:
  { id: 107, carId: "KND-007", regNo: "MH02ER1007", brand: "Maruti Suzuki", model: "Ertiga (2023 Unit)", year: 2023, category: "mpv", transmission: "Manual", fuel: "Petrol + CNG", seats: 7, priceDay: 3500, priceHour: 146, securityDeposit: 3500, freeKm: 250, extraKm: 14, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 108, carId: "KND-008", regNo: "MH02ER1008", brand: "Maruti Suzuki", model: "Ertiga (2025 Unit)", year: 2025, category: "mpv", transmission: "Manual", fuel: "Petrol + CNG", seats: 7, priceDay: 3800, priceHour: 158, securityDeposit: 3500, freeKm: 250, extraKm: 14, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 109, carId: "KND-009", regNo: "MH02EH1009", brand: "Maruti Suzuki", model: "Ertiga Hybrid", year: 2025, category: "mpv", transmission: "Automatic", fuel: "Petrol", seats: 7, priceDay: 4000, priceHour: 167, securityDeposit: 3500, freeKm: 250, extraKm: 14, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 110, carId: "KND-010", regNo: "MH02CR1010", brand: "Kia", model: "Carens", year: 2025, category: "mpv", transmission: "Manual", fuel: "Diesel", seats: 7, priceDay: 4500, priceHour: 188, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 111, carId: "KND-011", regNo: "MH02CR1011", brand: "Kia", model: "Carens", year: 2025, category: "mpv", transmission: "Automatic", fuel: "Petrol", seats: 7, priceDay: 4800, priceHour: 200, securityDeposit: 4000, freeKm: 250, extraKm: 16, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 112, carId: "KND-012", regNo: "MH02XO1012", brand: "Mahindra", model: "7XO", year: 2026, category: "suv", transmission: "AMT", fuel: "Diesel", seats: 7, priceDay: 9000, priceHour: 375, securityDeposit: 7000, freeKm: 250, extraKm: 28, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },

  // 🔹 PREMIUM & LUXURY SEGMENT:
  { id: 113, carId: "KND-013", regNo: "MH02CP1013", brand: "Jeep", model: "Compass 4x4 Sunroof", year: 2024, category: "suv", transmission: "Automatic", fuel: "Diesel", seats: 5, priceDay: 6000, priceHour: 250, securityDeposit: 5000, freeKm: 250, extraKm: 18, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 114, carId: "KND-014", regNo: "MH02TR1014", brand: "Mahindra", model: "Thar Roxx Sunroof", year: 2025, category: "suv", transmission: "Automatic", fuel: "Diesel", seats: 5, priceDay: 7000, priceHour: 292, securityDeposit: 5000, freeKm: 250, extraKm: 20, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" },
  { id: 115, carId: "KND-015", regNo: "MH02BM1015", brand: "BMW", model: "M5 Modified Sunroof", year: 2022, category: "luxury", transmission: "Automatic", fuel: "Diesel", seats: 5, priceDay: 18000, priceHour: 750, securityDeposit: 15000, freeKm: 250, extraKm: 60, hubId: 2, hubName: "Kandivali Hub, Mumbai", hub: "Kandivali Hub, Mumbai", available: 1, status: "available" }
];

let fleetVehicles = [...DEFAULT_FLEET_VEHICLES];
window.fleetVehicles = fleetVehicles;
window.DEFAULT_FLEET_VEHICLES = DEFAULT_FLEET_VEHICLES;

async function loadGlobalFleet() {
  try {
    const hubId = (typeof localStorage !== "undefined" && localStorage.getItem("kruizly_selected_hub_id")) || "";
    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    const apiBase = (typeof localStorage !== "undefined" && localStorage.getItem("kruizly_api_url")) || (isLocal ? "https://kruizly.com/api" : "/api");
    const url = apiBase + "/vehicles" + (hubId ? "?hub_id=" + hubId : "");
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json();
      if (json.success && Array.isArray(json.vehicles) && json.vehicles.length > 0) {
        fleetVehicles.length = 0;
        json.vehicles.forEach(v => fleetVehicles.push(v));
        if (typeof window !== "undefined") {
          window.fleetVehicles = fleetVehicles;
        }
        return fleetVehicles;
      }
    }
  } catch (err) {
    console.warn("API fleet fetch fallback:", err);
  }

  // Fallback to DEFAULT_FLEET_VEHICLES (filtered by selected hub if active)
  const selectedHub = (typeof localStorage !== "undefined" && localStorage.getItem("kruizly_selected_hub_id")) || "";
  fleetVehicles.length = 0;
  if (selectedHub) {
    DEFAULT_FLEET_VEHICLES.filter(v => String(v.hubId || v.hub_id) === String(selectedHub)).forEach(v => fleetVehicles.push(v));
  } else {
    DEFAULT_FLEET_VEHICLES.forEach(v => fleetVehicles.push(v));
  }
  if (typeof window !== "undefined") {
    window.fleetVehicles = fleetVehicles;
  }
  return fleetVehicles;
}

if (typeof window !== "undefined") {
  window.loadGlobalFleet = loadGlobalFleet;
  window.fleetLoadingPromise = loadGlobalFleet();
}



// Image path resolution: map vehicle brand + model to asset files.
const fleetImageOverrides = {
  // Maruti models
  "maruti swift": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti suzuki swift": "assets/fleet/Maruti Suzuki Swift.png",
  "swift": "assets/fleet/Maruti Suzuki Swift.png",
  "swift vxi": "assets/fleet/Maruti Suzuki Swift.png",
  "swift vxi (o)": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti swift vxi (o)": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti suzuki swift vxi (o)": "assets/fleet/Maruti Suzuki Swift.png",
  "maruti baleno": "assets/fleet/Maruti Suzuki Baleno.png",
  "maruti suzuki baleno": "assets/fleet/Maruti Suzuki Baleno.png",
  "baleno": "assets/fleet/Maruti Suzuki Baleno.png",
  "maruti brezza": "assets/fleet/Maruti Suzuki Brezza.png",
  "maruti suzuki brezza": "assets/fleet/Maruti Suzuki Brezza.png",
  "brezza": "assets/fleet/Maruti Suzuki Brezza.png",
  "maruti dzire": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti suzuki dzire": "assets/fleet/Maruti Suzuki Dzire.png",
  "dzire": "assets/fleet/Maruti Suzuki Dzire.png",
  "dzire zxi+": "assets/fleet/Maruti Suzuki Dzire.png",
  "dzire zxi+ sunroof": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti dzire zxi+": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti suzuki dzire zxi+": "assets/fleet/Maruti Suzuki Dzire.png",
  "maruti ertiga": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti suzuki ertiga": "assets/fleet/Maruti Suzuki Ertiga.png",
  "ertiga": "assets/fleet/Maruti Suzuki Ertiga.png",
  "ertiga hybrid": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti ertiga hybrid": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti suzuki ertiga hybrid": "assets/fleet/Maruti Suzuki Ertiga.png",
  "maruti fronx": "assets/fleet/Maruti Suzuki Fronx.png",
  "maruti suzuki fronx": "assets/fleet/Maruti Suzuki Fronx.png",
  "fronx": "assets/fleet/Maruti Suzuki Fronx.png",
  "maruti grand vitara": "assets/fleet/Maruti Suzuki Grand Vitara.png",
  "maruti suzuki grand vitara": "assets/fleet/Maruti Suzuki Grand Vitara.png",
  "grand vitara": "assets/fleet/Maruti Suzuki Grand Vitara.png",
  "maruti ignis": "assets/fleet/Maruti Suzuki Ignis.png",
  "maruti suzuki ignis": "assets/fleet/Maruti Suzuki Ignis.png",
  "ignis": "assets/fleet/Maruti Suzuki Ignis.png",
  "maruti wagon r": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti wagonr": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti suzuki wagon r": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti suzuki wagonr": "assets/fleet/Maruti Suzuki WagonR.png",
  "wagon r": "assets/fleet/Maruti Suzuki WagonR.png",
  "wagonr": "assets/fleet/Maruti Suzuki WagonR.png",
  "maruti xl6": "assets/fleet/Maruti Suzuki XL6.png",
  "maruti suzuki xl6": "assets/fleet/Maruti Suzuki XL6.png",
  "xl6": "assets/fleet/Maruti Suzuki XL6.png",

  // Hyundai models
  "hyundai exter": "assets/fleet/Hyundai Exter.png",
  "exter": "assets/fleet/Hyundai Exter.png",
  "hyundai aura": "assets/fleet/Hyundai Aura.png",
  "aura": "assets/fleet/Hyundai Aura.png",
  "hyundai creta": "assets/fleet/Hyundai Creta.png",
  "creta": "assets/fleet/Hyundai Creta.png",
  "hyundai i20": "assets/fleet/Hyundai i20.png",
  "i20": "assets/fleet/Hyundai i20.png",
  "hyundai verna": "assets/fleet/Hyundai Aura.png",
  "verna": "assets/fleet/Hyundai Aura.png",
  "hyundai venue": "assets/fleet/Hyundai Creta.png",
  "venue": "assets/fleet/Hyundai Creta.png",

  // Tata models
  "tata altroz": "assets/fleet/Tata Altroz.png",
  "altroz": "assets/fleet/Tata Altroz.png",
  "tata tigor": "assets/fleet/Tigor.jpg",
  "tigor": "assets/fleet/Tigor.jpg",
  "tata nexon": "assets/fleet/Tata Nexon.png",
  "nexon": "assets/fleet/Tata Nexon.png",
  "tata punch": "assets/fleet/Tata Punch.png",
  "punch": "assets/fleet/Tata Punch.png",
  "tata safari": "assets/fleet/Tata Safari.png",
  "safari": "assets/fleet/Tata Safari.png",
  "tata harrier": "assets/fleet/Tata Safari.png",
  "harrier": "assets/fleet/Tata Safari.png",

  // Mahindra models
  "mahindra 7xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv 7xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv7xo": "assets/fleet/Mahindra 7XO.png",
  "7xo": "assets/fleet/Mahindra 7XO.png",
  "xuv 7xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra 3xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv 3xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv3xo": "assets/fleet/Mahindra 7XO.png",
  "3xo": "assets/fleet/Mahindra 7XO.png",
  "xuv 3xo": "assets/fleet/Mahindra 7XO.png",
  "mahindra xuv700": "assets/fleet/Mahindra XUV700.png",
  "xuv700": "assets/fleet/Mahindra XUV700.png",
  "mahindra xuv 700": "assets/fleet/Mahindra XUV700.png",
  "mahindra scorpio n": "assets/fleet/Mahindra Scorpio N.png",
  "scorpio n": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra scorpio": "assets/fleet/Mahindra Scorpio N.png",
  "scorpio": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra bolero neo": "assets/fleet/Mahindra Scorpio N.png",
  "bolero neo": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra bolero": "assets/fleet/Mahindra Scorpio N.png",
  "bolero": "assets/fleet/Mahindra Scorpio N.png",
  "mahindra thar": "assets/fleet/Mahindra Thar.png",
  "thar": "assets/fleet/Mahindra Thar.png",
  "mahindra thar roxx": "assets/fleet/thar roxx.png",
  "thar roxx": "assets/fleet/thar roxx.png",
  "thar roxx sunroof": "assets/fleet/thar roxx.png",
  "mahindra xuv500": "assets/fleet/Mahindra XUV500.png",
  "xuv500": "assets/fleet/Mahindra XUV500.png",
  "mahindra xuv 500": "assets/fleet/Mahindra XUV500.png",

  // Toyota models
  "toyota glanza": "assets/fleet/Toyota Glanza.png",
  "glanza": "assets/fleet/Toyota Glanza.png",
  "toyota innova crysta": "assets/fleet/Toyota Innova Crysta.png",
  "innova crysta": "assets/fleet/Toyota Innova Crysta.png",
  "toyota innova hycross": "assets/fleet/Toyota Innova Crysta.png",
  "innova hycross": "assets/fleet/Toyota Innova Crysta.png",
  "toyota innova": "assets/fleet/Toyota Innova Crysta.png",
  "innova": "assets/fleet/Toyota Innova Crysta.png",
  "toyota rumion": "assets/fleet/Toyota Rumion.png",
  "rumion": "assets/fleet/Toyota Rumion.png",
  "toyota urban cruiser": "assets/fleet/Toyota Taisor.png",
  "toyota urban cruiser taisor": "assets/fleet/Toyota Taisor.png",
  "urban cruiser taisor": "assets/fleet/Toyota Taisor.png",
  "urban cruiser": "assets/fleet/Toyota Taisor.png",
  "toyota taisor": "assets/fleet/Toyota Taisor.png",
  "taisor": "assets/fleet/Toyota Taisor.png",
  "toyota fortuner legender": "assets/fleet/Toyota Innova Crysta.png",
  "fortuner legender": "assets/fleet/Toyota Innova Crysta.png",
  "toyota fortuner": "assets/fleet/Toyota Innova Crysta.png",
  "fortuner": "assets/fleet/Toyota Innova Crysta.png",

  // Kia models
  "kia seltos": "assets/fleet/Seltos.png",
  "seltos": "assets/fleet/Seltos.png",
  "seltos sunroof": "assets/fleet/Seltos.png",
  "kia seltos sunroof": "assets/fleet/Seltos.png",
  "kia sonet": "assets/fleet/Hyundai Creta.png",
  "sonet": "assets/fleet/Hyundai Creta.png",
  "kia carens": "assets/fleet/Kia Carens.png",
  "carens": "assets/fleet/Kia Carens.png",

  // Jeep models
  "jeep compass": "assets/fleet/Jeep Compass.png",
  "compass": "assets/fleet/Jeep Compass.png",
  "compass 4x4": "assets/fleet/Jeep Compass.png",
  "compass 4x4 sunroof": "assets/fleet/Jeep Compass.png",
  "jeep compass 4x4 sunroof": "assets/fleet/Jeep Compass.png",

  // BMW models
  "bmw 520d": "assets/fleet/BMW 520D.png",
  "520d": "assets/fleet/BMW 520D.png",
  "bmw m5": "assets/fleet/BMW.png",
  "m5": "assets/fleet/BMW.png",
  "bmw m5 modified": "assets/fleet/BMW.png",
  "m5 modified": "assets/fleet/BMW.png",
  "m5 modified sunroof": "assets/fleet/BMW.png",
  "bmw m5 modified sunroof": "assets/fleet/BMW.png",
  "bmw": "assets/fleet/BMW 520D.png",

  // MG models
  "mg hector": "assets/fleet/MG hector.jpg",
  "mg hector plus": "assets/fleet/MG hector.jpg",
  "hector": "assets/fleet/MG hector.jpg",
  "mg": "assets/fleet/MG hector.jpg",

  // Honda, Skoda, VW, Mercedes
  "honda amaze": "assets/fleet/Hyundai Aura.png",
  "amaze": "assets/fleet/Hyundai Aura.png",
  "honda city": "assets/fleet/Hyundai Aura.png",
  "city": "assets/fleet/Hyundai Aura.png",
  "skoda slavia": "assets/fleet/BMW 520D.png",
  "slavia": "assets/fleet/BMW 520D.png",
  "volkswagen virtus": "assets/fleet/BMW 520D.png",
  "virtus": "assets/fleet/BMW 520D.png",
  "mercedes": "assets/fleet/BMW 520D.png",
  "mercedes-benz": "assets/fleet/BMW 520D.png"
};

function findFleetImageOverride(key) {
  if (!key) return null;
  const clean = String(key).trim().toLowerCase().replace(/\s+/g, " ");
  if (fleetImageOverrides[clean]) return fleetImageOverrides[clean];
  const noSpace = clean.replace(/[\s\-_]+/g, "");
  for (const [k, v] of Object.entries(fleetImageOverrides)) {
    if (k.replace(/[\s\-_]+/g, "") === noSpace) return v;
  }
  return null;
}

function normalizeCustomUrl(url) {
  if (!url || typeof url !== "string") return null;
  const s = url.trim();
  if (!s) return null;
  if (
    s.startsWith("http://") ||
    s.startsWith("https://") ||
    s.startsWith("data:") ||
    s.startsWith("blob:")
  ) {
    return s;
  }
  if (s.startsWith("api/") || s.startsWith("/api/")) {
    return s.startsWith("/") ? s : `/${s}`;
  }
  if (s.startsWith("uploads/") || s.startsWith("/uploads/")) {
    return s.startsWith("/") ? s : `/${s}`;
  }
  if (s.startsWith("assets/")) {
    return encodeURI(s);
  }
  return null;
}

function fleetImagePath(vehicle) {
  if (!vehicle) return "assets/fleet/BMW 520D.png";

  if (typeof vehicle === "string") {
    if (vehicle.startsWith("assets/fleet/")) {
      const baseName = vehicle.replace(/^assets\/fleet\//, "").replace(/\.(png|jpg|jpeg|webp|avif)$/i, "").trim();
      const ov = findFleetImageOverride(baseName);
      if (ov) return encodeURI(ov);
      return encodeURI(vehicle);
    }
    const custom = normalizeCustomUrl(vehicle);
    if (custom && !custom.includes("MED-") && !custom.includes("/api/media/")) return custom;
    const ov = findFleetImageOverride(vehicle);
    if (ov) return encodeURI(ov);
    return "assets/fleet/BMW 520D.png";
  }

  // 1. Check catalog asset override first by brand & model (studio transparent cutouts)
  const brand = (vehicle.brand || "").trim();
  const model = (vehicle.model || "").trim();
  const fullName = `${brand} ${model}`.trim();

  const ov =
    findFleetImageOverride(fullName) ||
    findFleetImageOverride(model) ||
    (brand.toLowerCase() === "maruti" ? findFleetImageOverride(`Maruti Suzuki ${model}`) : null) ||
    (brand.toLowerCase() === "mg" ? findFleetImageOverride("mg hector") : null);

  if (ov) return encodeURI(ov);

  // 2. Check for real user-uploaded car photos (http, uploads, data, blob)
  // Skip protected media document IDs (MED- / /api/media/) that return SVG document placeholders
  const candidateImages = [
    Array.isArray(vehicle.gallery) ? vehicle.gallery[0] : null,
    vehicle.imageUrl,
    vehicle.image,
    vehicle.photo,
  ];

  for (const candidate of candidateImages) {
    if (!candidate || typeof candidate !== "string") continue;
    const s = candidate.trim();
    if (s.includes("MED-") || s.includes("/api/media/")) continue;
    if (
      s.startsWith("http://") ||
      s.startsWith("https://") ||
      s.startsWith("data:") ||
      s.startsWith("blob:") ||
      s.startsWith("uploads/") ||
      s.startsWith("/uploads/")
    ) {
      const custom = normalizeCustomUrl(s);
      if (custom) return custom;
    }
  }

  // 3. Fallback to candidate if it starts with assets/
  for (const candidate of candidateImages) {
    if (candidate && typeof candidate === "string" && candidate.trim().startsWith("assets/")) {
      return encodeURI(candidate.trim());
    }
  }

  return "assets/fleet/BMW 520D.png";
}

function getFleetVehicle(query) {
  if (!query || query === "undefined" || query === "null") return null;
  const q = String(query).trim().toLowerCase();
  
  const direct = fleetVehicles.find(
    (v) =>
      (v.id && (String(v.id).toLowerCase() === q || String(v.id).replace(/\D/g, "") === q)) ||
      (v.slug && v.slug.toLowerCase() === q) ||
      (v.regNo && v.regNo.toLowerCase() === q) ||
      `${v.brand} ${v.model}`.toLowerCase() === q ||
      `${v.brand}-${v.model}`.toLowerCase().replace(/\s+/g, "-") === q ||
      v.brand.toLowerCase() === q ||
      v.model.toLowerCase() === q
  );
  if (direct) return direct;

  const num = parseInt(q, 10);
  if (!isNaN(num)) {
    if (fleetVehicles[num - 1]) return fleetVehicles[num - 1];
    const byNum = fleetVehicles.find(v => v.id === `krz-${String(num).padStart(2, "0")}` || v.id === String(num));
    if (byNum) return byNum;
  }
  return null;
}

if (typeof window !== "undefined") {
  window.fleetImagePath = fleetImagePath;
  window.fleetVehicles = fleetVehicles;
  window.getFleetVehicle = getFleetVehicle;
}
if (typeof module !== "undefined" && module.exports) {
  module.exports = { fleetVehicles, fleetImagePath, getFleetVehicle };
}
