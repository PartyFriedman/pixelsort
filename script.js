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
const lowerInput = document.getElementById("lower");
const upperInput = document.getElementById("upper");
const lowerValue = document.getElementById("lower-value");
const upperValue = document.getElementById("upper-value");

// ---------- Tilstand ----------
// Originalbildet lagres her som en egen kopi av pikslene.
// Den blir aldri endret – sorteringen jobber alltid på en ny kopi.
let original = null;
let fileName = "";
let isSorted = false; // vises det sorterte bildet akkurat nå?

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
    pickTop.textContent = "Velg nytt bilde";
    sortBtn.disabled = false;
    resetBtn.disabled = false;
    isSorted = false;
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
// Bildet behandles som «linjer»: rader (venstre → høyre) eller kolonner (topp → bunn).
// I hver linje er det bare piksler med lysstyrke mellom nedre og øvre grense som blir sortert.
// Hver sammenhengende gruppe («segment») av slike piksler sorteres for seg, etter
// lysstyrke, nyanse eller metning. Piksler utenfor grensene blir stående der de er.
//
// options = { lower, upper, direction: "rows"|"columns", key: "brightness"|"hue"|"saturation", order: "asc"|"desc" }
function sortPixels(src, options) {
  const { lower, upper, direction, key, order } = options;
  const { width: w, height: h } = src;
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h); // starter som en kopi
  const bytes = src.data;
  const srcPx = new Uint32Array(bytes.buffer); // én verdi per piksel (R, G, B og A samlet)
  const outPx = new Uint32Array(out.data.buffer);

  // Hvordan vi går gjennom bildet: antall linjer, lengden på hver, og avstanden mellom pikslene
  const byColumns = direction === "columns";
  const lineCount = byColumns ? w : h;
  const lineLength = byColumns ? h : w;
  const lineStart = byColumns ? 1 : w; // flytt til neste linje
  const step = byColumns ? w : 1; // flytt til neste piksel i linjen
  const descending = order === "desc";

  // Arbeidsbuffere for én linje om gangen
  const linePx = new Uint32Array(lineLength);
  const brightness = new Uint8Array(lineLength); // brukes til grensene
  const keys = new Uint8Array(lineLength); // det vi sorterer etter, 0–255
  const tmpPx = new Uint32Array(lineLength);
  const slots = new Uint32Array(256);

  for (let line = 0; line < lineCount; line++) {
    const base = line * lineStart;

    // 1) Hent linjen, og regn ut lysstyrke og sorteringsverdi for hver piksel
    for (let k = 0; k < lineLength; k++) {
      const p = base + k * step;
      const i = p * 4;
      const r = bytes[i], g = bytes[i + 1], b = bytes[i + 2];
      const lum = ((r * 299 + g * 587 + b * 114 + 500) / 1000) | 0;
      let value = lum;
      if (key === "hue") value = hueOf(r, g, b);
      else if (key === "saturation") value = saturationOf(r, g, b);
      brightness[k] = lum;
      keys[k] = descending ? 255 - value : value;
      linePx[k] = srcPx[p];
    }

    // 2) Finn segmentene og sorter hvert av dem
    let k = 0;
    while (k < lineLength) {
      if (brightness[k] < lower || brightness[k] > upper) {
        k++; // utenfor grensene: blir stående
        continue;
      }
      const start = k;
      while (k < lineLength && brightness[k] >= lower && brightness[k] <= upper) k++;
      sortSegment(start, k);
    }

    // 3) Legg linjen tilbake i bildet
    for (let k = 0; k < lineLength; k++) outPx[base + k * step] = linePx[k];
  }
  return out;

  // Sorterer linjen fra start til (men ikke med) end, minst sorteringsverdi først.
  // Piksler med lik verdi beholder rekkefølgen sin.
  function sortSegment(start, end) {
    const length = end - start;
    if (length < 2) return;

    if (length < 64) {
      // Korte segmenter: plukk én og én piksel og skyv den inn på riktig plass
      for (let i = start + 1; i < end; i++) {
        const value = keys[i];
        const px = linePx[i];
        let j = i - 1;
        while (j >= start && keys[j] > value) {
          keys[j + 1] = keys[j];
          linePx[j + 1] = linePx[j];
          j--;
        }
        keys[j + 1] = value;
        linePx[j + 1] = px;
      }
      return;
    }

    // Lange segmenter: tell hvor mange det er av hver verdi, og legg dem ut i bunker
    slots.fill(0);
    for (let i = start; i < end; i++) slots[keys[i]]++;
    let pos = start;
    for (let v = 0; v < 256; v++) {
      const count = slots[v];
      slots[v] = pos;
      pos += count;
    }
    for (let i = start; i < end; i++) tmpPx[slots[keys[i]]++] = linePx[i];
    linePx.set(tmpPx.subarray(start, end), start);
  }
}

// Nyanse: hvor på fargesirkelen fargen ligger (rød → gul → grønn → blå → lilla → tilbake mot rød),
// skalert til 0–255. Grå, hvite og svarte piksler har ingen nyanse og får 0.
function hueOf(r, g, b) {
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d === 0) return 0;
  let hue;
  if (max === r) hue = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) hue = (b - r) / d + 2;
  else hue = (r - g) / d + 4;
  return Math.min(255, ((hue / 6) * 256) | 0);
}

// Metning: hvor sterk og ren fargen er, fra grå (0) til helt mettet (255)
function saturationOf(r, g, b) {
  const max = Math.max(r, g, b);
  if (max === 0) return 0;
  return (((max - Math.min(r, g, b)) * 255) / max + 0.5) | 0;
}

// ---------- Valgene i panelet ----------
const LABELS = {
  rows: "rader", columns: "kolonner",
  brightness: "lysstyrke", hue: "nyanse", saturation: "metning",
  asc: "stigende", desc: "synkende",
};

function checkedValue(name) {
  return document.querySelector(`input[name="${name}"]:checked`).value;
}

function currentOptions() {
  return {
    lower: Number(lowerInput.value),
    upper: Number(upperInput.value),
    direction: checkedValue("direction"),
    key: checkedValue("key"),
    order: checkedValue("order"),
  };
}

function showSorted() {
  if (!original) return;
  const o = currentOptions();
  ctx.putImageData(sortPixels(original, o), 0, 0);
  isSorted = true;
  updateInfo(`Sortert: ${LABELS[o.direction]}, ${LABELS[o.key]}, ${LABELS[o.order]}, lysstyrke ${o.lower}–${o.upper}`);
}

sortBtn.addEventListener("click", showSorted);

resetBtn.addEventListener("click", () => {
  if (!original) return;
  ctx.putImageData(original, 0, 0);
  isSorted = false;
  updateInfo("Original");
});

// Vises det sorterte bildet, oppdateres det straks et valg endres
// (maks én gang per skjermbilde, så det henger med når man drar i en glider)
let pendingSort = 0;

function resortIfShowing() {
  if (isSorted && !pendingSort) {
    pendingSort = requestAnimationFrame(() => {
      pendingSort = 0;
      showSorted();
    });
  }
}

document.querySelectorAll('.segmented input[type="radio"]').forEach((input) => {
  input.addEventListener("change", resortIfShowing);
});

// ---------- Terskler (gliderne) ----------
// Nedre grense kan aldri gå forbi øvre, og omvendt: gliderne stopper når de møtes.
// Gliderne er vanlige range-felt, så piltaster, Page Up/Down og Home/End virker av seg selv.
function onThresholdInput(event) {
  let lower = Number(lowerInput.value);
  let upper = Number(upperInput.value);
  if (lower > upper) {
    if (event.target === lowerInput) lower = upper;
    else upper = lower;
    lowerInput.value = lower;
    upperInput.value = upper;
  }
  lowerValue.textContent = lower;
  upperValue.textContent = upper;
  resortIfShowing();
}

lowerInput.addEventListener("input", onThresholdInput);
upperInput.addEventListener("input", onThresholdInput);

// ---------- Feilmeldinger ----------
function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}
