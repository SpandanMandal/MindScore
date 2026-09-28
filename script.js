// ============================================================
// MindScore — Frontend logic
// Talks to the FastAPI backend at API_URL. No frameworks.
// ============================================================

const API_URL = "https://mindscore-l3s0.onrender.com";

// ---- Element references -----------------------------------
const form = document.getElementById("predictionForm");
const predictBtn = document.getElementById("predictBtn");
const predictBtnText = document.getElementById("predictBtnText");
const predictBtnSpinner = document.getElementById("predictBtnSpinner");
const apiErrorBox = document.getElementById("apiError");

const resultSection = document.getElementById("resultSection");
const scoreNumber = document.getElementById("scoreNumber");
const gaugeArc = document.getElementById("gaugeArc");
const resetBtn = document.getElementById("resetBtn");
const summaryList = document.getElementById("summaryList");

const statusIndicator = document.getElementById("statusIndicator");
const statusDot = document.getElementById("statusDot");
const statusText = document.getElementById("statusText");

// Fields that need numeric conversion before sending to the API
const NUMERIC_FIELDS = [
  "age",
  "avg_daily_usage_hours",
  "daily_unlocks",
  "study_hours",
  "physical_activity_hours",
  "sleep_hours_per_night",
];

// Per-field validation rules, matching the FastAPI Pydantic model
const VALIDATION_RULES = {
  age: { required: true, min: 10, max: 100, integer: true, label: "Age" },
  gender: { required: true, label: "Gender" },
  country: { required: true, label: "Country" },
  academic_level: { required: true, label: "Academic level" },
  most_used_platform: { required: true, label: "Most used platform" },
  purpose_of_use: { required: true, label: "Purpose of use" },
  avg_daily_usage_hours: { required: true, min: 0, max: 24, label: "Average daily usage" },
  daily_unlocks: { required: true, min: 0, integer: true, label: "Daily unlocks" },
  study_hours: { required: true, min: 0, max: 24, label: "Study hours" },
  physical_activity_hours: { required: true, min: 0, max: 24, label: "Physical activity hours" },
  sleep_hours_per_night: { required: true, min: 0, max: 24, label: "Sleep hours" },
  stress_level: { required: true, label: "Stress level" },
};

// ---- Form data collection -----------------------------------
function getFormData() {
  const data = {};
  Object.keys(VALIDATION_RULES).forEach((fieldName) => {
    const el = document.getElementById(fieldName);
    const rawValue = el.value.trim();

    if (NUMERIC_FIELDS.includes(fieldName)) {
      data[fieldName] = rawValue === "" ? NaN : Number(rawValue);
    } else {
      data[fieldName] = rawValue;
    }
  });
  return data;
}

// ---- Validation -----------------------------------
function validateForm(data) {
  let isValid = true;

  Object.entries(VALIDATION_RULES).forEach(([fieldName, rule]) => {
    const value = data[fieldName];
    const errorEl = document.getElementById(`error-${fieldName}`);
    const fieldWrapper = document.getElementById(fieldName).closest(".field");
    let message = "";

    const isEmpty =
      value === "" || value === undefined || (typeof value === "number" && Number.isNaN(value));

    if (rule.required && isEmpty) {
      message = `${rule.label} is required.`;
    } else if (!isEmpty && typeof value === "number") {
      if (rule.integer && !Number.isInteger(value)) {
        message = `${rule.label} must be a whole number.`;
      } else if (rule.min !== undefined && value < rule.min) {
        message = `${rule.label} must be at least ${rule.min}.`;
      } else if (rule.max !== undefined && value > rule.max) {
        message = `${rule.label} must be at most ${rule.max}.`;
      }
    }

    if (message) {
      isValid = false;
      errorEl.textContent = message;
      fieldWrapper.classList.add("has-error");
    } else {
      errorEl.textContent = "";
      fieldWrapper.classList.remove("has-error");
    }
  });

  return isValid;
}

function clearFieldError(fieldName) {
  const errorEl = document.getElementById(`error-${fieldName}`);
  const fieldWrapper = document.getElementById(fieldName).closest(".field");
  errorEl.textContent = "";
  fieldWrapper.classList.remove("has-error");
}

// Clear a field's error as soon as the user edits it, for immediate feedback
Object.keys(VALIDATION_RULES).forEach((fieldName) => {
  const el = document.getElementById(fieldName);
  el.addEventListener("input", () => clearFieldError(fieldName));
  el.addEventListener("change", () => clearFieldError(fieldName));
});

// ---- Loading state -----------------------------------
function setLoading(isLoading) {
  predictBtn.disabled = isLoading;
  predictBtnText.textContent = isLoading ? "Analyzing..." : "Predict mental health score";
  predictBtnSpinner.hidden = !isLoading;
}

// ---- Error display -----------------------------------
function showError(message) {
  apiErrorBox.textContent = message;
  apiErrorBox.hidden = false;
}

function hideError() {
  apiErrorBox.hidden = true;
  apiErrorBox.textContent = "";
}

// Display metadata for the "your inputs" summary card:
// nice label + optional unit suffix per field
const FIELD_DISPLAY = {
  age: { label: "Age", unit: " yrs" },
  gender: { label: "Gender" },
  country: { label: "Country" },
  academic_level: { label: "Academic level" },
  most_used_platform: { label: "Most used platform" },
  purpose_of_use: { label: "Purpose of use" },
  avg_daily_usage_hours: { label: "Avg. daily usage", unit: " hrs/day" },
  daily_unlocks: { label: "Daily unlocks", unit: "/day" },
  study_hours: { label: "Study hours", unit: " hrs/day" },
  physical_activity_hours: { label: "Physical activity", unit: " hrs/day" },
  sleep_hours_per_night: { label: "Sleep", unit: " hrs/night" },
  stress_level: { label: "Stress level" },
};

// ---- Inputs summary display -----------------------------------
function displaySummary(data) {
  summaryList.innerHTML = "";
  Object.entries(FIELD_DISPLAY).forEach(([fieldName, meta]) => {
    const value = data[fieldName];
    const displayValue =
      typeof value === "number" ? `${value}${meta.unit || ""}` : `${value}${meta.unit || ""}`;

    const dt = document.createElement("dt");
    dt.textContent = meta.label;
    const dd = document.createElement("dd");
    dd.textContent = displayValue;

    summaryList.appendChild(dt);
    summaryList.appendChild(dd);
  });
}

// ---- Result display -----------------------------------
function displayResult(score, data) {
  displaySummary(data);
  const numericScore = Number(score);
  scoreNumber.textContent = Number.isFinite(numericScore) ? numericScore.toFixed(2) : score;

  // The model's score is on a 0-10 scale, so the gauge fills as score / 10.
  // The number shown is always exactly what the API returned.
  const MAX_SCORE = 10;
  const ARC_LENGTH = 251.2; // length of the semi-circle path in the SVG
  const fraction = Math.max(0, Math.min(1, numericScore / MAX_SCORE));
  const offset = ARC_LENGTH * (1 - fraction);

  // Reset first so the fill-in transition replays each time
  gaugeArc.style.transition = "none";
  gaugeArc.setAttribute("stroke-dashoffset", ARC_LENGTH);
  // Force reflow, then animate to the target offset
  void gaugeArc.getBoundingClientRect();
  gaugeArc.style.transition = "";
  requestAnimationFrame(() => {
    gaugeArc.setAttribute("stroke-dashoffset", offset);
  });

  form.closest(".form-section").hidden = true;
  resultSection.hidden = false;
  resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- Reset -----------------------------------
function resetForm() {
  form.reset();
  Object.keys(VALIDATION_RULES).forEach(clearFieldError);
  hideError();
  resultSection.hidden = true;
  document.querySelector(".form-section").hidden = false;
  document.querySelector(".form-section").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- API call -----------------------------------
async function predictMentalHealth(data) {
  let response;
  try {
    response = await fetch(`${API_URL}/predict`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  } catch (networkErr) {
    // Backend unreachable / CORS / DNS / connection refused, etc.
    throw new Error(
      "Unable to connect to the prediction server. Please make sure FastAPI is running on port 2200."
    );
  }

  if (response.status === 422) {
    let detail = "The information provided is invalid. Please check the highlighted fields.";
    try {
      const errJson = await response.json();
      if (Array.isArray(errJson.detail) && errJson.detail.length > 0) {
        detail = errJson.detail
          .map((d) => (d.loc ? `${d.loc[d.loc.length - 1]}: ${d.msg}` : d.msg))
          .join(" ");
      }
    } catch (_) {
      // ignore parse failure, use default message
    }
    throw new Error(detail);
  }

  if (response.status >= 500) {
    throw new Error("The prediction server ran into a problem. Please try again in a moment.");
  }

  if (!response.ok) {
    throw new Error(`The prediction server returned an unexpected error (status ${response.status}).`);
  }

  let payload;
  try {
    payload = await response.json();
  } catch (_) {
    throw new Error("Received an unreadable response from the prediction server.");
  }

  if (typeof payload.predicted_mental_health_score !== "number") {
    throw new Error("The prediction server returned an unexpected response format.");
  }

  return payload.predicted_mental_health_score;
}

// ---- Form submit handler -----------------------------------
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  hideError();

  const data = getFormData();

  if (!validateForm(data)) {
    const firstError = form.querySelector(".has-error input, .has-error select");
    if (firstError) firstError.focus();
    return;
  }

  setLoading(true);
  try {
    const score = await predictMentalHealth(data);
    displayResult(score, data);
  } catch (err) {
    showError(err.message || "Something went wrong. Please try again.");
  } finally {
    setLoading(false);
  }
});

resetBtn.addEventListener("click", resetForm);

// ---- Backend availability check -----------------------------------
async function checkBackendStatus() {
  try {
    const res = await fetch(`${API_URL}/`, { method: "GET" });
    if (res.ok) {
      setStatus(true);
    } else {
      setStatus(false);
    }
  } catch (_) {
    setStatus(false);
  }
}

function setStatus(isOnline) {
  if (isOnline) {
    statusIndicator.classList.remove("offline");
    statusText.textContent = "ML Model Online";
  } else {
    statusIndicator.classList.add("offline");
    statusText.textContent = "Backend Unreachable";
  }
}

checkBackendStatus();
