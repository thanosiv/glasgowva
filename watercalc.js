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

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("water-calc-form");
  const valueInput = document.getElementById("water-calc-input");
  const status = document.getElementById("water-calc-status");
  const output = document.getElementById("water-calc-output");

  // Glasgow elements
  const glasgowWaterChargeEl = document.getElementById("glasgow-water-charge");
  const glasgowSewerChargeEl = document.getElementById("glasgow-sewer-charge");
  const glasgowGrandTotalEl = document.getElementById("glasgow-grand-total");

  // Rockbridge PSA elements
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
      output.classList.add("hidden");
      return;
    }

    // --- Glasgow VA In-Town Residential Calculations ---
    const overage = Math.max(0, valueEntered - 3.0);
    
    // Water: $35.00 base (first 3,000 gal) + $0.54 / 100 gal ($5.40 / 1,000 gal) overage
    const glasgowWaterCharge = 35.00 + (overage * 5.40);
    
    // Sewer: $36.50 base (first 3,000 gal) + $0.26 / 100 gal ($2.60 / 1,000 gal) overage
    const glasgowSewerCharge = 36.50 + (overage * 2.60);
    
    const glasgowGrandTotal = glasgowWaterCharge + glasgowSewerCharge;

    // --- Rockbridge PSA Calculations ---
    const waterAccountCharge = 27.12 / 2;
    const sewerAccountCharge = 41.67 / 2;
    const waterTotal = valueEntered * 8.6;
    const sewerTotal = valueEntered * 13.85;
    const psaGrandTotal = (valueEntered * 22.45) + waterAccountCharge + sewerAccountCharge;

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