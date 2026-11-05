// Pixelsort – all oppførsel for siden.
// Lastes med en vanlig <script>-tagg nederst i index.html, så elementene finnes allerede.

// ---------- Elementer på siden ----------
const drop = document.getElementById("drop");
const empty = document.getElementById("empty");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const fileInput = document.getElementById("file");
const errorBox = document.getElementById("error");
const info = document.getElementById("info");
const pickTop = document.getElementById("pick-top");
const sortBtn = document.getElementById("sort");
const resetBtn = document.getElementById("reset");

// ---------- Tilstand ----------
// Originalbildet lagres her som en egen kopi av pikslene.
// Den blir aldri endret – sorteringen jobber alltid på en ny kopi.
let original = null;
let fileName = "";

// ---------- Statuslinjen øverst ----------
function updateInfo(state) {
  info.textContent = `${fileName} · ${canvas.width} × ${canvas.height} px · ${state}`;
}

// ---------- Åpne filvelgeren ----------
function openPicker() {
  fileInput.value = ""; // så samme fil kan velges på nytt
  fileInput.click();
}

drop.addEventListener("click", () => {
  if (!drop.classList.contains("has-image")) openPicker();
});

drop.addEventListener("keydown", (event) => {
  // Når et bilde vises, er slippsonen ikke lenger en knapp
  if (drop.classList.contains("has-image")) return;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    openPicker();
  }
});

pickTop.addEventListener("click", openPicker);

fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) loadFile(fileInput.files[0]);
});

// ---------- Dra og slipp ----------
// Lytter på hele vinduet, så man kan slippe hvor som helst
let dragDepth = 0;

window.addEventListener("dragenter", (event) => {
  event.preventDefault();
  dragDepth++;
  drop.classList.add("dragging");
});

window.addEventListener("dragover", (event) => {
  event.preventDefault(); // nødvendig for at "drop" skal virke
});

window.addEventListener("dragleave", () => {
  dragDepth--;
  if (dragDepth <= 0) {
    dragDepth = 0;
    drop.classList.remove("dragging");
  }
});

window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  drop.classList.remove("dragging");
  const file = event.dataTransfer.files[0];
  if (file) loadFile(file);
  else showError("Det du slapp var ikke en fil. Prøv å dra et bilde fra maskinen din.");
});

// ---------- Lim inn (Ctrl+V) ----------
window.addEventListener("paste", (event) => {
  const file = [...event.clipboardData.files][0];
  if (file) loadFile(file);
});

// ---------- Last inn og tegn bildet ----------
function loadFile(file) {
  if (!file.type.startsWith("image/")) {
    showError(
      `«${file.name}» er ikke et bilde. Velg en bildefil, for eksempel PNG, JPG, GIF eller WebP.`
    );
    return;
  }

  const url = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    // Full oppløsning: canvas får bildets egne mål i piksler
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);

    try {
      original = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      original = null;
      sortBtn.disabled = true;
      resetBtn.disabled = true;
      showError(`Klarte ikke å lese pikslene i «${file.name}». Bildet kan være for stort.`);
      return;
    }
    fileName = file.name;

    hideError();
    empty.hidden = true;
    canvas.hidden = false;
    drop.classList.add("has-image");
    drop.setAttribute("tabindex", "-1");
    drop.removeAttribute("role");
    drop.setAttribute("aria-label", "Bilde: " + file.name);
    pickTop.hidden = false;
    sortBtn.disabled = false;
    resetBtn.disabled = false;
    updateInfo("Original");
    sortBtn.focus(); // neste naturlige steg
  };

  img.onerror = () => {
    URL.revokeObjectURL(url);
    showError(`Klarte ikke å åpne «${file.name}». Filen kan være skadet, eller formatet støttes ikke av nettleseren.`);
  };

  img.src = url;
}

// ---------- Sortering ----------
// Lysstyrke 0–255, vektet slik øyet oppfatter farger (grønt virker lysest, blått mørkest)
function sortRowsByBrightness(src) {
  const { width: w, height: h } = src;
  const out = new ImageData(w, h);
  const bytes = src.data;
  const srcPx = new Uint32Array(bytes.buffer); // én verdi per piksel (R, G, B og A samlet)
  const outPx = new Uint32Array(out.data.buffer);
  const brightness = new Uint8Array(w);
  const slots = new Uint32Array(256);

  for (let y = 0; y < h; y++) {
    const row = y * w;
    slots.fill(0);

    // 1) Mål lysstyrken på hver piksel i raden, og tell hvor mange det er av hver
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      const b = ((bytes[i] * 299 + bytes[i + 1] * 587 + bytes[i + 2] * 114 + 500) / 1000) | 0;
      brightness[x] = b;
      slots[b]++;
    }

    // 2) Regn ut hvor hver lysstyrke-gruppe skal begynne i raden
    let pos = 0;
    for (let b = 0; b < 256; b++) {
      const count = slots[b];
      slots[b] = pos;
      pos += count;
    }

    // 3) Plasser pikslene, mørkeste først. Like lyse beholder rekkefølgen sin.
    for (let x = 0; x < w; x++) {
      outPx[row + slots[brightness[x]]++] = srcPx[row + x];
    }
  }
  return out;
}

sortBtn.addEventListener("click", () => {
  if (!original) return;
  ctx.putImageData(sortRowsByBrightness(original), 0, 0);
  updateInfo("Sortert");
});

resetBtn.addEventListener("click", () => {
  if (!original) return;
  ctx.putImageData(original, 0, 0);
  updateInfo("Original");
});

// ---------- Feilmeldinger ----------
function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}
