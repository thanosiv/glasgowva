/**
 * GLASGOW & ROCKBRIDGE PSA WATER CALCULATOR
 */

// --- GLASGOW CURRENT RATES ---
const GLASGOW_RATES = {
  BASE_ALLOWANCE_K_GAL: 3.0,

  // Water Rates (In-Town Residential)
  // Source: News-Gazette, May 20, 2026 edition
  WATER_BASE_FEE: 38.00,       // $38.00 flat rate for first 3,000 gal
  WATER_OVERAGE_PER_K: 5.40,   // $0.54 per 100 gal ($5.40 per 1,000 gal)

  // Sewer Rates (In-Town Residential)
  // Source: News-Gazette, May 20, 2026 edition
  SEWER_BASE_FEE: 42.00,       // $42.00 flat rate for first 3,000 gal
  SEWER_OVERAGE_PER_K: 2.80    // $0.28 per 100 gal ($2.80 per 1,000 gal)
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

function getUsageFromGlasgowBill(monthlyBillAmount) {
  const baseTotal = GLASGOW_RATES.WATER_BASE_FEE + GLASGOW_RATES.SEWER_BASE_FEE;
  const combinedOveragePerK = GLASGOW_RATES.WATER_OVERAGE_PER_K + GLASGOW_RATES.SEWER_OVERAGE_PER_K;

  if (monthlyBillAmount < baseTotal) {
    return null;
  }

  if (monthlyBillAmount === baseTotal) {
    return GLASGOW_RATES.BASE_ALLOWANCE_K_GAL;
  }

  const overageKGal = (monthlyBillAmount - baseTotal) / combinedOveragePerK;
  return GLASGOW_RATES.BASE_ALLOWANCE_K_GAL + overageKGal;
}

// --- MAIN EVENT LISTENER ---
document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("water-calc-form");
  const valueInput = document.getElementById("water-calc-input");
  const billInput = document.getElementById("water-calc-bill-input");
  const fullYearCheckbox = document.getElementById("water-calc-full-year");
  const twoMonthsCheckbox = document.getElementById("water-calc-two-months");
  const includeTrashCheckbox = document.getElementById("water-calc-include-trash");
  const excludeSewerCheckbox = document.getElementById("water-calc-exclude-sewer");
  const trashSlider = document.getElementById("water-calc-trash-slider");
  const trashSliderValue = document.getElementById("water-calc-trash-slider-value");
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
  const trashPickupChargeEl = document.getElementById("trash-pickup-charge");
  const grandTotalEl = document.getElementById("grand-total");

  if (!form || !valueInput || !billInput || !fullYearCheckbox || !twoMonthsCheckbox || !includeTrashCheckbox || !excludeSewerCheckbox || !trashSlider || !trashSliderValue || !status || !output) {
    return;
  }

  function getSelectedTrashAmount() {
    const parsed = Number.parseFloat(String(trashSlider.value || ""));
    if (Number.isNaN(parsed)) {
      return 30;
    }

    return parsed;
  }

  function updateTrashSliderLabel() {
    trashSliderValue.textContent = `Selected: $${formatCurrency(getSelectedTrashAmount())}`;
  }

  updateTrashSliderLabel();

  trashSlider.addEventListener("input", () => {
    updateTrashSliderLabel();
  });

  valueInput.addEventListener("input", () => {
    const sanitized = sanitizeDecimalInput(valueInput.value);
    if (valueInput.value !== sanitized) {
      valueInput.value = sanitized;
    }
  });

  billInput.addEventListener("input", () => {
    const sanitized = sanitizeDecimalInput(billInput.value);
    if (billInput.value !== sanitized) {
      billInput.value = sanitized;
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    const usageSanitized = sanitizeDecimalInput(valueInput.value);
    const billSanitized = sanitizeDecimalInput(billInput.value);

    const usageEntered = Number.parseFloat(usageSanitized);
    const billEntered = Number.parseFloat(billSanitized);
    const hasUsage = usageSanitized && !Number.isNaN(usageEntered);
    const hasBill = billSanitized && !Number.isNaN(billEntered);
    const simulateFullYear = Boolean(fullYearCheckbox.checked);
    const simulateTwoMonths = Boolean(twoMonthsCheckbox.checked);
    const includeTrashPickup = Boolean(includeTrashCheckbox.checked);
    const excludeSewerCharges = Boolean(excludeSewerCheckbox.checked);
    const inputMultiplier = simulateTwoMonths ? 2 : 1;
    const periodMultiplier = simulateFullYear ? 12 : inputMultiplier;
    const periodLabel = simulateFullYear ? "Yearly" : (simulateTwoMonths ? "2-Month" : "Monthly");
    const selectedTrashAmount = getSelectedTrashAmount();
    let valueEntered = usageEntered;

    if (!hasUsage && !hasBill) {
      status.textContent = "Enter either usage (in thousand gallons) or your Glasgow monthly bill amount.";
      status.className = "status-text status-error";
      valueInput.setAttribute("aria-invalid", "true");
      billInput.setAttribute("aria-invalid", "true");
      output.classList.add("hidden");
      return;
    }

    if (hasUsage) {
      valueEntered = usageEntered / inputMultiplier;
      billInput.setAttribute("aria-invalid", "false");
    } else {
      const monthlyBillEquivalent = billEntered / inputMultiplier;
      valueEntered = getUsageFromGlasgowBill(monthlyBillEquivalent);
      if (valueEntered === null) {
        const baseTotal = GLASGOW_RATES.WATER_BASE_FEE + GLASGOW_RATES.SEWER_BASE_FEE;
        const requiredBaseForEnteredPeriod = baseTotal * inputMultiplier;
        const billPeriodText = simulateTwoMonths ? "2-month" : "monthly";
        status.textContent = `Glasgow ${billPeriodText} bill must be at least $${formatCurrency(requiredBaseForEnteredPeriod)} based on current published base rates.`;
        status.className = "status-text status-error";
        valueInput.setAttribute("aria-invalid", "true");
        billInput.setAttribute("aria-invalid", "true");
        output.classList.add("hidden");
        return;
      }
      valueInput.setAttribute("aria-invalid", "false");
    }

    const usageValidationValue = hasUsage ? usageEntered : valueEntered;
    if (usageValidationValue >= 100) {
      const thousandGallonsExample = (usageValidationValue / 1000).toFixed(1);
      const gallonsText = new Intl.NumberFormat("en-US").format(usageValidationValue);
      status.textContent = `Please enter usage in thousand gallons. Example: ${thousandGallonsExample} for ${gallonsText} gallons.`;
      status.className = "status-text status-error";
      valueInput.setAttribute("aria-invalid", "true");
      billInput.setAttribute("aria-invalid", "false");
      output.classList.add("hidden");
      return;
    }

    valueInput.setAttribute("aria-invalid", "false");
    billInput.setAttribute("aria-invalid", "false");

    // --- Glasgow VA Calculations ---
    const overage = Math.max(0, valueEntered - GLASGOW_RATES.BASE_ALLOWANCE_K_GAL);
    
    const glasgowWaterCharge = GLASGOW_RATES.WATER_BASE_FEE + (overage * GLASGOW_RATES.WATER_OVERAGE_PER_K);
    const glasgowSewerCharge = GLASGOW_RATES.SEWER_BASE_FEE + (overage * GLASGOW_RATES.SEWER_OVERAGE_PER_K);
    const glasgowSewerChargeIncluded = excludeSewerCharges ? 0 : glasgowSewerCharge;
    const glasgowGrandTotal = glasgowWaterCharge + glasgowSewerChargeIncluded;
    const glasgowWaterChargeForPeriod = glasgowWaterCharge * periodMultiplier;
    const glasgowSewerChargeForPeriod = glasgowSewerChargeIncluded * periodMultiplier;
    const glasgowGrandTotalForPeriod = glasgowGrandTotal * periodMultiplier;

    // --- Rockbridge PSA Calculations ---
    const waterAccountCharge = PSA_RATES.WATER_ACCOUNT_CHARGE;
    const sewerAccountCharge = PSA_RATES.SEWER_ACCOUNT_CHARGE;
    const waterTotal = valueEntered * PSA_RATES.WATER_PER_K;
    const sewerTotal = valueEntered * PSA_RATES.SEWER_PER_K;
    const sewerAccountChargeIncluded = excludeSewerCharges ? 0 : sewerAccountCharge;
    const sewerTotalIncluded = excludeSewerCharges ? 0 : sewerTotal;
    const psaGrandTotal = waterTotal + sewerTotalIncluded + waterAccountCharge + sewerAccountChargeIncluded;
    const waterAccountChargeForPeriod = waterAccountCharge * periodMultiplier;
    const sewerAccountChargeForPeriod = sewerAccountChargeIncluded * periodMultiplier;
    const waterTotalForPeriod = waterTotal * periodMultiplier;
    const sewerTotalForPeriod = sewerTotalIncluded * periodMultiplier;
    const trashPickupForPeriod = includeTrashPickup ? (selectedTrashAmount * periodMultiplier) : 0;
    const psaGrandTotalForPeriod = (psaGrandTotal * periodMultiplier) + trashPickupForPeriod;

    // Output Glasgow results
    if (glasgowWaterChargeEl) glasgowWaterChargeEl.textContent = `${periodLabel} Water Charge = $${formatCurrency(glasgowWaterChargeForPeriod)}`;
    if (glasgowSewerChargeEl) {
      glasgowSewerChargeEl.textContent = excludeSewerCharges
        ? `${periodLabel} Sewer Charge = $0.00 (excluded)`
        : `${periodLabel} Sewer Charge = $${formatCurrency(glasgowSewerChargeForPeriod)}`;
    }
    if (glasgowGrandTotalEl) glasgowGrandTotalEl.textContent = `${periodLabel} Grand Total = $${formatCurrency(glasgowGrandTotalForPeriod)}`;

    // Output PSA results
    if (waterAccountChargeEl) waterAccountChargeEl.textContent = `${periodLabel} Water Account Charge = $${formatCurrency(waterAccountChargeForPeriod)}`;
    if (sewerAccountChargeEl) {
      sewerAccountChargeEl.textContent = excludeSewerCharges
        ? `${periodLabel} Sewer Account Charge = $0.00 (excluded)`
        : `${periodLabel} Sewer Account Charge = $${formatCurrency(sewerAccountChargeForPeriod)}`;
    }
    if (waterTotalEl) waterTotalEl.textContent = `${periodLabel} Water Total = $${formatCurrency(waterTotalForPeriod)}`;
    if (sewerTotalEl) {
      sewerTotalEl.textContent = excludeSewerCharges
        ? `${periodLabel} Sewer Total = $0.00 (excluded)`
        : `${periodLabel} Sewer Total = $${formatCurrency(sewerTotalForPeriod)}`;
    }
    if (trashPickupChargeEl) {
      trashPickupChargeEl.textContent = includeTrashPickup
        ? `${periodLabel} Trash Pickup = $${formatCurrency(trashPickupForPeriod)}`
        : "";
    }
    if (grandTotalEl) grandTotalEl.textContent = `${periodLabel} Grand Total = $${formatCurrency(psaGrandTotalForPeriod)}`;

    const usagePeriodText = simulateTwoMonths ? " per month (derived from 2-month input)" : "";
    if (hasUsage) {
      if (simulateFullYear) {
        status.textContent = simulateTwoMonths
          ? "Calculation complete. Input treated as 2-month usage. Showing simulated yearly totals."
          : "Calculation complete. Showing simulated yearly totals.";
      } else if (simulateTwoMonths) {
        status.textContent = "Calculation complete. Showing simulated 2-month totals.";
      } else {
        status.textContent = "Calculation complete.";
      }
    } else {
      if (simulateFullYear) {
        status.textContent = simulateTwoMonths
          ? `Calculation complete. Estimated usage: ${valueEntered.toFixed(2)} thousand gallons${usagePeriodText}. Showing simulated yearly totals.`
          : `Calculation complete. Estimated usage from Glasgow bill: ${valueEntered.toFixed(2)} thousand gallons. Showing simulated yearly totals.`;
      } else if (simulateTwoMonths) {
        status.textContent = `Calculation complete. Estimated usage: ${valueEntered.toFixed(2)} thousand gallons${usagePeriodText}. Showing simulated 2-month totals.`;
      } else {
        status.textContent = `Calculation complete. Estimated usage from Glasgow bill: ${valueEntered.toFixed(2)} thousand gallons.`;
      }
    }
    status.className = "status-text status-success";
    output.classList.remove("hidden");
  });
});