/**
 * GLASGOW & ROCKBRIDGE PSA WATER CALCULATOR
 */

// --- GLASGOW CURRENT RATES ---
const GLASGOW_RATES = {
  BASE_ALLOWANCE_K_GAL: 3.0,

  // Water Rates (In-Town Residential)
  WATER_BASE_FEE: 38.00,       // $38.00 flat rate for first 3,000 gal
  WATER_OVERAGE_PER_K: 5.40,   // $0.54 per 100 gal ($5.40 per 1,000 gal)

  // Sewer Rates (In-Town Residential)
  SEWER_BASE_FEE: 42.00,       // $42.00 flat rate for first 3,000 gal
  SEWER_OVERAGE_PER_K: 2.60    // $0.26 per 100 gal ($2.60 per 1,000 gal)
};

const PSA_RATES = {
  WATER_ACCOUNT_CHARGE: 27.12 / 2,
  SEWER_ACCOUNT_CHARGE: 41.67 / 2,
  WATER_PER_K: 8.60,
  SEWER_PER_K: 13.85
};

// --- HELPER FUNCTIONS ---
function formatCurrency(value) {
  return Number(value).toFixed(2);
}

function sanitizeDecimalInput(rawValue) {
  const input = String(rawValue || "");
  const cleaned = input.replace(/[^0-9.]/g, "");
  const parts = cleaned.split(".");

  if (parts.length <= 1) {
    return cleaned;
  }

  return `${parts[0]}.${parts.slice(1).join("")}`;
}

// --- MAIN EVENT LISTENER ---
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("water-calc-form");
  const valueInput = document.getElementById("water-calc-input");
  const status = document.getElementById("water-calc-status");
  const output = document.getElementById("water-calc-output");

  // Glasgow UI elements
  const glasgowWaterChargeEl = document.getElementById("glasgow-water-charge");
  const glasgowSewerChargeEl = document.getElementById("glasgow-sewer-charge");
  const glasgowGrandTotalEl = document.getElementById("glasgow-grand-total");

  // Rockbridge PSA UI elements
  const waterAccountChargeEl = document.getElementById("water-account-charge");
  const sewerAccountChargeEl = document.getElementById("sewer-account-charge");
  const waterTotalEl = document.getElementById("water-total");
  const sewerTotalEl = document.getElementById("sewer-total");
  const grandTotalEl = document.getElementById("grand-total");

  if (!form || !valueInput || !status || !output) {
    return;
  }

  valueInput.addEventListener("input", () => {
    const sanitized = sanitizeDecimalInput(valueInput.value);
    if (valueInput.value !== sanitized) {
      valueInput.value = sanitized;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const sanitized = sanitizeDecimalInput(valueInput.value);
    const valueEntered = Number.parseFloat(sanitized);

    if (!sanitized || Number.isNaN(valueEntered)) {
      status.textContent = "Please enter a numeric decimal value.";
      status.className = "status-text status-error";
      valueInput.setAttribute("aria-invalid", "true");
      output.classList.add("hidden");
      return;
    }

    if (valueEntered >= 100) {
      status.textContent = "Please enter usage in thousand gallons. Example: 5.9 for 5,900 gallons.";
      status.className = "status-text status-error";
      valueInput.setAttribute("aria-invalid", "true");
      output.classList.add("hidden");
      return;
    }

    valueInput.setAttribute("aria-invalid", "false");

    // --- Glasgow VA Calculations ---
    const overage = Math.max(0, valueEntered - GLASGOW_RATES.BASE_ALLOWANCE_K_GAL);
    
    const glasgowWaterCharge = GLASGOW_RATES.WATER_BASE_FEE + (overage * GLASGOW_RATES.WATER_OVERAGE_PER_K);
    const glasgowSewerCharge = GLASGOW_RATES.SEWER_BASE_FEE + (overage * GLASGOW_RATES.SEWER_OVERAGE_PER_K);
    const glasgowGrandTotal = glasgowWaterCharge + glasgowSewerCharge;

    // --- Rockbridge PSA Calculations ---
    const waterAccountCharge = PSA_RATES.WATER_ACCOUNT_CHARGE;
    const sewerAccountCharge = PSA_RATES.SEWER_ACCOUNT_CHARGE;
    const waterTotal = valueEntered * PSA_RATES.WATER_PER_K;
    const sewerTotal = valueEntered * PSA_RATES.SEWER_PER_K;
    const psaGrandTotal = waterTotal + sewerTotal + waterAccountCharge + sewerAccountCharge;

    // Output Glasgow results
    if (glasgowWaterChargeEl) glasgowWaterChargeEl.textContent = `Water Charge = $${formatCurrency(glasgowWaterCharge)}`;
    if (glasgowSewerChargeEl) glasgowSewerChargeEl.textContent = `Sewer Charge = $${formatCurrency(glasgowSewerCharge)}`;
    if (glasgowGrandTotalEl) glasgowGrandTotalEl.textContent = `Grand Total = $${formatCurrency(glasgowGrandTotal)}`;

    // Output PSA results
    if (waterAccountChargeEl) waterAccountChargeEl.textContent = `Water Account Charge = $${formatCurrency(waterAccountCharge)}`;
    if (sewerAccountChargeEl) sewerAccountChargeEl.textContent = `Sewer Account Charge = $${formatCurrency(sewerAccountCharge)}`;
    if (waterTotalEl) waterTotalEl.textContent = `Water Total = $${formatCurrency(waterTotal)}`;
    if (sewerTotalEl) sewerTotalEl.textContent = `Sewer Total = $${formatCurrency(sewerTotal)}`;
    if (grandTotalEl) grandTotalEl.textContent = `Grand Total = $${formatCurrency(psaGrandTotal)}`;

    status.textContent = "Calculation complete.";
    status.className = "status-text status-success";
    output.classList.remove("hidden");
  });
});