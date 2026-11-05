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

// ---------- Linjer i en vinkel ----------
// Bildet deles i parallelle linjer i valgt vinkel, som skravering med linjal.
// 0° = mot høyre (rader), 90° = nedover (kolonner), 180° = mot venstre, 270° = oppover.
// Hver piksel havner i nøyaktig én linje, så ingen piksler forsvinner eller dobles.
// Svaret er en liste over alle piksler, linje for linje, i rekkefølge langs vinkelen.
let linesCache = null;

function getLines(w, h, angle) {
  if (linesCache && linesCache.w === w && linesCache.h === h && linesCache.angle === angle) {
    return linesCache;
  }
  const rad = (angle * Math.PI) / 180;
  let cos = Math.cos(rad);
  let sin = Math.sin(rad);
  if (Math.abs(cos) < 1e-9) cos = 0; // så 90° og 270° blir helt rette
  if (Math.abs(sin) < 1e-9) sin = 0;

  // Hvilken linje en piksel tilhører: avstanden på tvers av vinkelen, avrundet
  const across = (x, y) => Math.round(y * cos - x * sin);
  const corners = [across(0, 0), across(w - 1, 0), across(0, h - 1), across(w - 1, h - 1)];
  const first = Math.min(...corners);
  const lineCount = Math.max(...corners) - first + 1;

  // Tell hvor mange piksler hver linje har, og regn ut hvor hver linje begynner i lista
  const lineStarts = new Uint32Array(lineCount + 1);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) lineStarts[across(x, y) - first + 1]++;
  }
  let maxLength = 0;
  for (let l = 0; l < lineCount; l++) {
    maxLength = Math.max(maxLength, lineStarts[l + 1]);
    lineStarts[l + 1] += lineStarts[l];
  }

  // Legg pikslene inn i lista. Går vi gjennom bildet fra den siden vinkelen peker bort fra,
  // kommer pikslene i hver linje automatisk i riktig rekkefølge.
  const order = new Uint32Array(w * h);
  const next = lineStarts.slice(0, lineCount);
  const yFrom = sin >= 0 ? 0 : h - 1;
  const yStep = sin >= 0 ? 1 : -1;
  const xFrom = cos >= 0 ? 0 : w - 1;
  const xStep = cos >= 0 ? 1 : -1;
  for (let j = 0, y = yFrom; j < h; j++, y += yStep) {
    for (let i = 0, x = xFrom; i < w; i++, x += xStep) {
      order[next[across(x, y) - first]++] = y * w + x;
    }
  }

  // Posisjon langs vinkelen, avrundet. Brukes til å finne pikslene som ligger «side om side»
  // på tvers av nabolinjer når stripene er bredere enn 1 piksel.
  const along = [0, (w - 1) * cos, (h - 1) * sin, (w - 1) * cos + (h - 1) * sin].map(Math.round);
  const alongFirst = Math.min(...along);
  const alongCount = Math.max(...along) - alongFirst + 1;

  linesCache = { w, h, angle, order, lineStarts, lineCount, maxLength, cos, sin, alongFirst, alongCount };
  return linesCache;
}

// ---------- Sortering ----------
// I hver linje er det bare piksler med lysstyrke mellom nedre og øvre grense som blir sortert.
// Hver sammenhengende gruppe («segment») av slike piksler sorteres for seg, etter
// lysstyrke, nyanse eller metning. Piksler utenfor grensene blir stående der de er.
//
// Stripebredde: så mange nabolinjer danner ett «bånd». For hver posisjon langs båndet regnes
// gjennomsnittsfargen av pikslene på tvers, og sorteringen bruker dette gjennomsnittet, så alle
// linjene i båndet sorteres likt og stripen holder seg samlet. Pikslene beholder sin egen farge –
// gjennomsnittet bestemmer bare hvor de havner. Grensene bruker fortsatt hver piksels egen
// lysstyrke; ellers ville mørke kantpiksler blitt dratt med inn i lyse områder som prikker.
//
// options = { lower, upper, angle: 0–359, key: "brightness"|"hue"|"saturation",
//             order: "asc"|"desc", stripe: 1–50 }
function sortPixels(src, options) {
  const { lower, upper, angle, key, order: sortOrder, stripe = 1 } = options;
  const { width: w, height: h } = src;
  const out = new ImageData(new Uint8ClampedArray(src.data), w, h); // starter som en kopi
  const bytes = src.data;
  const srcPx = new Uint32Array(bytes.buffer); // én verdi per piksel (R, G, B og A samlet)
  const outPx = new Uint32Array(out.data.buffer);
  const { order, lineStarts, lineCount, maxLength, cos, sin, alongFirst, alongCount } =
    getLines(w, h, angle);
  const descending = sortOrder === "desc";
  const wide = stripe > 1;

  // Arbeidsbuffere for én linje om gangen
  const linePx = new Uint32Array(maxLength);
  const brightness = new Uint8Array(maxLength); // brukes til grensene
  const keys = new Uint8Array(maxLength); // det vi sorterer etter, 0–255
  const tmpPx = new Uint32Array(maxLength);
  const slots = new Uint32Array(256);

  // Arbeidsbuffere for ett bånd: summer og gjennomsnitt per posisjon langs vinkelen
  const sumR = wide ? new Uint32Array(alongCount) : null;
  const sumG = wide ? new Uint32Array(alongCount) : null;
  const sumB = wide ? new Uint32Array(alongCount) : null;
  const count = wide ? new Uint32Array(alongCount) : null;
  const seenInBand = wide ? new Int32Array(alongCount).fill(-1) : null;
  const avgValue = wide ? new Uint8Array(alongCount) : null;

  const valueOf = (r, g, b, lum) =>
    key === "hue" ? hueOf(r, g, b) : key === "saturation" ? saturationOf(r, g, b) : lum;
  const lumOf = (r, g, b) => ((r * 299 + g * 587 + b * 114 + 500) / 1000) | 0;
  // Posisjon langs vinkelen for piksel nummer p
  const alongOf = (p) => {
    const x = p % w;
    return Math.round(x * cos + ((p - x) / w) * sin) - alongFirst;
  };

  for (let band = 0; band * stripe < lineCount; band++) {
    const firstLine = band * stripe;
    const endLine = Math.min(firstLine + stripe, lineCount);

    if (wide) {
      // a) Summer fargene for hver posisjon langs båndet
      for (let n = lineStarts[firstLine]; n < lineStarts[endLine]; n++) {
        const p = order[n];
        const q = alongOf(p);
        if (seenInBand[q] !== band) {
          seenInBand[q] = band;
          sumR[q] = sumG[q] = sumB[q] = count[q] = 0;
        }
        const i = p * 4;
        sumR[q] += bytes[i];
        sumG[q] += bytes[i + 1];
        sumB[q] += bytes[i + 2];
        count[q]++;
      }
      // b) Gjør summene om til gjennomsnittsfarge, og regn ut sorteringsverdien av den
      for (let n = lineStarts[firstLine]; n < lineStarts[endLine]; n++) {
        const q = alongOf(order[n]);
        const c = count[q];
        if (c === 0) continue; // allerede regnet ut
        const r = Math.round(sumR[q] / c), g = Math.round(sumG[q] / c), b = Math.round(sumB[q] / c);
        avgValue[q] = valueOf(r, g, b, lumOf(r, g, b));
        count[q] = 0;
      }
    }

    for (let line = firstLine; line < endLine; line++) {
      const from = lineStarts[line];
      const lineLength = lineStarts[line + 1] - from;

      // 1) Hent linjen, med lysstyrke og sorteringsverdi for hver piksel
      //    (pikselens egen, eller båndets gjennomsnitt når stripene er bredere enn 1)
      for (let k = 0; k < lineLength; k++) {
        const p = order[from + k];
        let lum, value;
        if (wide) {
          // Grensene: pikselens egen lysstyrke, så skarpe kanter (f.eks. et mørkt fjell) blir stående.
          // Rekkefølgen: båndets gjennomsnitt, så linjene i båndet sorteres likt.
          const i = p * 4;
          lum = lumOf(bytes[i], bytes[i + 1], bytes[i + 2]);
          value = avgValue[alongOf(p)];
        } else {
          const i = p * 4;
          const r = bytes[i], g = bytes[i + 1], b = bytes[i + 2];
          lum = lumOf(r, g, b);
          value = valueOf(r, g, b, lum);
        }
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
      for (let k = 0; k < lineLength; k++) outPx[order[from + k]] = linePx[k];
    }
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
    angle,
    key: checkedValue("key"),
    order: checkedValue("order"),
    stripe: Number(stripeInput.value),
  };
}

function showSorted() {
  if (!original) return;
  const o = currentOptions();
  ctx.putImageData(sortPixels(original, o), 0, 0);
  isSorted = true;
  const stripeText = o.stripe > 1 ? `, striper ${o.stripe} px` : "";
  updateInfo(
    `Sortert: ${o.angle}°, ${LABELS[o.key]}, ${LABELS[o.order]}${stripeText}, lysstyrke ${o.lower}–${o.upper}`
  );
}

sortBtn.addEventListener("click", showSorted);

resetBtn.addEventListener("click", () => {
  if (!original) return;
  ctx.putImageData(original, 0, 0);
  isSorted = false;
  updateInfo("Original");
});

// Vises det sorterte bildet, oppdateres det straks et valg endres
// (maks én gang per skjermbilde, så det henger med når man drar i en glider eller hjulet)
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

// ---------- Vinkel: hjulet og tallfeltet ----------
// Hjulet er en «slider» for skjermlesere: piltastene flytter 1°, Shift+pil og Page Up/Down 15°,
// Home går til 0°, End til 359°. Tallet kan også skrives inn. Alt går rundt: 360° blir 0°, −1° blir 359°.
const dial = document.getElementById("dial");
const dialHand = document.getElementById("dial-hand");
const angleNumber = document.getElementById("angle-number");
const angleWord = document.getElementById("angle-word");
const DIRECTIONS = [
  "mot høyre", "ned mot høyre", "nedover", "ned mot venstre",
  "mot venstre", "opp mot venstre", "oppover", "opp mot høyre",
];
let angle = 0;

function wrapAngle(value) {
  return ((Math.round(value) % 360) + 360) % 360;
}

function setAngle(value, { fromInput = false } = {}) {
  const next = wrapAngle(value);
  const word = DIRECTIONS[Math.round(next / 45) % 8];
  dialHand.setAttribute("transform", `rotate(${next} 50 50)`);
  dial.setAttribute("aria-valuenow", next);
  dial.setAttribute("aria-valuetext", `${next} grader, ${word}`);
  angleWord.textContent = word;
  if (!fromInput) angleNumber.value = next; // ikke overskriv mens man skriver
  if (next !== angle) {
    angle = next;
    resortIfShowing();
  }
}

dial.addEventListener("keydown", (event) => {
  const amount = event.shiftKey ? 15 : 1;
  const moves = {
    ArrowRight: amount, ArrowUp: amount, ArrowLeft: -amount, ArrowDown: -amount,
    PageUp: 15, PageDown: -15,
  };
  if (event.key in moves) setAngle(angle + moves[event.key]);
  else if (event.key === "Home") setAngle(0);
  else if (event.key === "End") setAngle(359);
  else return;
  event.preventDefault();
});

// Dra i hjulet: vinkelen følger pekeren rundt midten. Nær 0°, 45°, 90° … «klikker» den seg fast.
function angleFromPointer(event) {
  const box = dial.getBoundingClientRect();
  const dx = event.clientX - (box.left + box.width / 2);
  const dy = event.clientY - (box.top + box.height / 2);
  const raw = (Math.atan2(dy, dx) * 180) / Math.PI;
  const snapped = Math.round(raw / 45) * 45;
  return Math.abs(raw - snapped) <= 4 ? snapped : raw;
}

dial.addEventListener("pointerdown", (event) => {
  dial.setPointerCapture(event.pointerId);
  dial.focus();
  setAngle(angleFromPointer(event));
  event.preventDefault();
});

dial.addEventListener("pointermove", (event) => {
  if (dial.hasPointerCapture(event.pointerId)) setAngle(angleFromPointer(event));
});

angleNumber.addEventListener("input", () => {
  if (angleNumber.value.trim() === "") return; // tomt felt: vent til noe er skrevet
  const value = Number(angleNumber.value);
  if (Number.isFinite(value)) setAngle(value, { fromInput: true });
});

// Når man forlater feltet eller trykker Enter, vises tallet ryddig (f.eks. 400 → 40)
angleNumber.addEventListener("change", () => {
  angleNumber.value = angle;
});

// ---------- Stripebredde ----------
const stripeInput = document.getElementById("stripe");
const stripeValue = document.getElementById("stripe-value");

stripeInput.addEventListener("input", () => {
  const width = Number(stripeInput.value);
  stripeValue.textContent = `${width} px`;
  stripeInput.setAttribute("aria-valuetext", width === 1 ? "1 piksel" : `${width} piksler`);
  resortIfShowing();
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
