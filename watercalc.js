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

    const waterAccountCharge = 27.12 / 2;
    const sewerAccountCharge = 41.67 / 2;
    const waterTotal = valueEntered * 8.6;
    const sewerTotal = valueEntered * 13.85;
    const grandTotal = (valueEntered * 22.45) + waterAccountCharge + sewerAccountCharge;

    waterAccountChargeEl.textContent = `Water Account Charge = $${formatCurrency(waterAccountCharge)}`;
    sewerAccountChargeEl.textContent = `Sewer Account Charge = $${formatCurrency(sewerAccountCharge)}`;
    waterTotalEl.textContent = `Water Total = $${formatCurrency(waterTotal)}`;
    sewerTotalEl.textContent = `Sewer Total = $${formatCurrency(sewerTotal)}`;
    grandTotalEl.textContent = `Grand Total = $${formatCurrency(grandTotal)}`;

    status.textContent = "Calculation complete.";
    status.className = "status-text status-success";
    output.classList.remove("hidden");
  });
});
