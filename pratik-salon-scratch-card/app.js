import { createFormStore } from "/js/wix/form-store.js";

const FORM_ID = "f54c6568-5ec2-4eef-bd1c-bec8a9814d2e";
const store = createFormStore({ formId: FORM_ID });
const formEl = document.getElementById("entry-form");
const fieldsEl = document.getElementById("form-fields");
const errorEl = document.getElementById("form-error");
const entryPanel = document.getElementById("entry-panel");
const scratchPanel = document.getElementById("scratch-panel");
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let lastState = null;
let resultReady = false;

function renderFields(state) {
  const activeName = document.activeElement && document.activeElement.name;
  const selectionStart = activeName && typeof document.activeElement.selectionStart === "number" ? document.activeElement.selectionStart : null;
  const selectionEnd = activeName && typeof document.activeElement.selectionEnd === "number" ? document.activeElement.selectionEnd : null;
  lastState = state;
  if (!state.form) {
    fieldsEl.innerHTML = state.loading ? '<div class="loading">Preparing your entry form…</div>' : '<div class="loading">The entry form is temporarily unavailable. Please try again shortly.</div>';
    return;
  }
  if (state.closed) {
    fieldsEl.innerHTML = '<div class="loading">This scratch-card offer is currently closed.</div>';
    return;
  }
  const visible = state.form.fields.filter(field => !field.hidden);
  fieldsEl.innerHTML = visible.map(field => {
    const value = state.values[field.target] ?? "";
    const invalid = state.errors[field.target];
    const inputType = field.control === "phone" ? "tel" : "text";
    return '<div class="field"><label for="' + esc(field.target) + '">' + esc(field.label) + (field.required ? ' *' : '') + '</label>' +
      '<input id="' + esc(field.target) + '" name="' + esc(field.target) + '" type="' + inputType + '" value="' + esc(value) + '" placeholder="' + esc(field.placeholder || "") + '" ' +
      (field.required ? 'required ' : '') + (invalid ? 'aria-invalid="true" aria-describedby="' + esc(field.target + "-error") + '"' : '') +
      (field.control === "phone" ? 'inputmode="numeric" maxlength="10" autocomplete="tel-national"' : 'autocomplete="name"') + '>' +
      (invalid ? '<p class="field-error" id="' + esc(field.target + "-error") + '" aria-live="polite">' + esc(invalid) + '</p>' : '') + '</div>';
  }).join("") + '<button class="submit-button" type="submit" ' + (state.loading ? 'disabled' : '') + '>Continue to Scratch</button>';
  visible.forEach(field => {
    const input = document.getElementById(field.target);
    if (!input) return;
    input.addEventListener("input", () => store.setValue(field.target, input.value));
    input.addEventListener("blur", () => store.validate(field.target));
  });
  if (activeName) {
    const restored = Array.from(formEl.elements).find(element => element.name === activeName);
    if (restored) {
      restored.focus();
      if (selectionStart !== null && restored.setSelectionRange) restored.setSelectionRange(selectionStart, selectionEnd);
    }
  }
}

function render(state) {
  renderFields(state);
  errorEl.textContent = state.errors && state.errors["@form"] ? state.errors["@form"] : "";
  if (state.outcome && !resultReady) {
    resultReady = true;
    const nameField = state.form.fields.find(f => /full.?name|name/i.test(f.label));
    const phoneField = state.form.fields.find(f => f.control === "phone");
    const name = String(nameField ? state.values[nameField.target] : "Guest").trim() || "Guest";
    const phone = String(phoneField ? state.values[phoneField.target] : "").replace(/\D/g, "");
    revealScratch(name, phone);
  }
}
store.subscribe(render);
render(store.getState());
store.start();

formEl.addEventListener("submit", async event => {
  event.preventDefault();
  if (!lastState || !lastState.form) return;
  errorEl.textContent = "";
  const button = formEl.querySelector("button[type=submit]");
  if (button) { button.disabled = true; button.textContent = "SAVING YOUR ENTRY…"; }
  try {
    const outcome = await store.submit(event);
    if (!outcome && button) { button.disabled = false; button.textContent = "Continue to Scratch"; }
  } catch (error) {
    errorEl.textContent = error?.message || "We couldn't save your entry. Please try again.";
    if (button) { button.disabled = false; button.textContent = "Continue to Scratch"; }
  }
});

function revealScratch(name, phone) {
  const key = "pratik-salon-reward-" + phone;
  let prize = Number(localStorage.getItem(key));
  if (!(prize >= 1 && prize <= 10)) {
    prize = Math.floor(Math.random() * 10) + 1;
    if (phone) localStorage.setItem(key, String(prize));
  }
  document.getElementById("winner-name").textContent = name;
  document.getElementById("discount-number").textContent = prize + "%";
  document.getElementById("personal-heading").textContent = "This one’s for you, " + name + ".";
  entryPanel.hidden = true;
  scratchPanel.hidden = false;
  setupScratch();
  window.scrollTo({ top: scratchPanel.offsetTop - 20, behavior: "smooth" });
}

function setupScratch() {
  const canvas = document.getElementById("scratch-canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const ratio = Math.max(1, window.devicePixelRatio || 1);
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.round(rect.width * ratio);
  canvas.height = Math.round(rect.height * ratio);
  ctx.scale(ratio, ratio);
  const width = rect.width, height = rect.height;
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#d9d7d2");
  gradient.addColorStop(.45, "#aaa8a2");
  gradient.addColorStop(1, "#e8e5de");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#8f8c84";
  ctx.lineWidth = 1;
  for (let x = -height; x < width + height; x += 15) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + height, height); ctx.stroke();
  }
  ctx.fillStyle = "#4a4945";
  ctx.font = "700 13px DM Sans, Arial";
  ctx.textAlign = "center";
  ctx.fillText("SCRATCH TO REVEAL YOUR DISCOUNT", width / 2, height / 2 - 3);
  ctx.font = "11px DM Sans, Arial";
  ctx.fillText("✦  PRATIK SALON  ✦", width / 2, height / 2 + 22);
  let drawing = false, revealed = false;
  const revealButton = document.getElementById("reveal-accessible");
  function finishReveal() {
    if (revealed) return;
    revealed = true;
    canvas.style.transition = "opacity .45s";
    canvas.style.opacity = "0";
    canvas.style.pointerEvents = "none";
    document.getElementById("scratch-result").setAttribute("aria-hidden", "false");
    document.getElementById("scratch-hint").textContent = "🎉 Your discount is revealed! Show this screen at Pratik Salon.";
    if (revealButton) revealButton.hidden = true;
    setTimeout(() => { canvas.style.display = "none"; }, 500);
  }
  function scratch(event) {
    if (!drawing || revealed) return;
    const box = canvas.getBoundingClientRect();
    const x = event.clientX - box.left, y = event.clientY - box.top;
    ctx.globalCompositeOperation = "destination-out";
    ctx.beginPath(); ctx.arc(x, y, 23, 0, Math.PI * 2); ctx.fill();
    if (Math.random() < .18) {
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] < 30) transparent++;
      if (transparent / (pixels.length / 4) > .42) finishReveal();
    }
  }
  if (revealButton) revealButton.addEventListener("click", finishReveal);
  canvas.addEventListener("pointerdown", event => { drawing = true; canvas.setPointerCapture(event.pointerId); scratch(event); });
  canvas.addEventListener("pointermove", scratch);
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(name => canvas.addEventListener(name, () => { drawing = false; }));
}

document.getElementById("start-again").addEventListener("click", () => {
  resultReady = false;
  store.reset();
  scratchPanel.hidden = true;
  entryPanel.hidden = false;
  const canvas = document.getElementById("scratch-canvas");
  canvas.style.display = "block";
  canvas.style.opacity = "1";
  fieldsEl.scrollIntoView({ behavior: "smooth", block: "center" });
});
document.getElementById("year").textContent = new Date().getFullYear();