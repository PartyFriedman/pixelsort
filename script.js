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
// Lysstyrke 0–255, vektet slik øyet oppfatter farger (grønt virker lysest, blått mørkest).
// Bare piksler med lysstyrke mellom nedre og øvre grense blir sortert. I hver rad blir
// hver sammenhengende gruppe («segment») av slike piksler sortert for seg, mørkest først.
// Piksler utenfor grensene blir stående der de er, og deler raden opp i segmenter.
function sortRowsByBrightness(src, lower, upper) {
  const { width: w, height: h } = src;
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h); // starter som en kopi
  const bytes = src.data;
  const srcPx = new Uint32Array(bytes.buffer); // én verdi per piksel (R, G, B og A samlet)
  const outPx = new Uint32Array(out.data.buffer);
  const brightness = new Uint8Array(w);
  const slots = new Uint32Array(256);

  for (let y = 0; y < h; y++) {
    const row = y * w;

    // 1) Mål lysstyrken på hver piksel i raden
    for (let x = 0; x < w; x++) {
      const i = (row + x) * 4;
      brightness[x] = ((bytes[i] * 299 + bytes[i + 1] * 587 + bytes[i + 2] * 114 + 500) / 1000) | 0;
    }

    // 2) Finn segmentene og sorter hvert av dem
    let x = 0;
    while (x < w) {
      if (brightness[x] < lower || brightness[x] > upper) {
        x++; // utenfor grensene: blir stående
        continue;
      }
      const start = x;
      while (x < w && brightness[x] >= lower && brightness[x] <= upper) x++;
      sortSegment(row, start, x);
    }
  }
  return out;

  // Sorterer pikslene fra start til (men ikke med) end i én rad.
  // Like lyse piksler beholder rekkefølgen sin.
  function sortSegment(row, start, end) {
    const length = end - start;
    if (length < 2) return;

    if (length < 64) {
      // Korte segmenter: plukk én og én piksel og skyv den inn på riktig plass
      for (let i = start + 1; i < end; i++) {
        const key = brightness[i];
        const px = outPx[row + i];
        let j = i - 1;
        while (j >= start && brightness[j] > key) {
          brightness[j + 1] = brightness[j];
          outPx[row + j + 1] = outPx[row + j];
          j--;
        }
        brightness[j + 1] = key;
        outPx[row + j + 1] = px;
      }
      return;
    }

    // Lange segmenter: tell hvor mange det er av hver lysstyrke, og legg dem ut i bunker
    for (let b = lower; b <= upper; b++) slots[b] = 0;
    for (let i = start; i < end; i++) slots[brightness[i]]++;
    let pos = start;
    for (let b = lower; b <= upper; b++) {
      const count = slots[b];
      slots[b] = pos;
      pos += count;
    }
    for (let i = start; i < end; i++) {
      outPx[row + slots[brightness[i]]++] = srcPx[row + i];
    }
  }
}

function showSorted() {
  if (!original) return;
  const lower = Number(lowerInput.value);
  const upper = Number(upperInput.value);
  ctx.putImageData(sortRowsByBrightness(original, lower, upper), 0, 0);
  isSorted = true;
  updateInfo(`Sortert (${lower}–${upper})`);
}

sortBtn.addEventListener("click", showSorted);

resetBtn.addEventListener("click", () => {
  if (!original) return;
  ctx.putImageData(original, 0, 0);
  isSorted = false;
  updateInfo("Original");
});

// ---------- Terskler (gliderne) ----------
// Nedre grense kan aldri gå forbi øvre, og omvendt: gliderne stopper når de møtes.
// Gliderne er vanlige range-felt, så piltaster, Page Up/Down og Home/End virker av seg selv.
let pendingSort = 0;

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

  // Vises det sorterte bildet, oppdateres det mens man drar (maks én gang per skjermbilde)
  if (isSorted && !pendingSort) {
    pendingSort = requestAnimationFrame(() => {
      pendingSort = 0;
      showSorted();
    });
  }
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
