/******************************
 * EASY GO – Script Principale
 ******************************/

// URL della tua Web App (ultimo /exec pubblicato)
const endpoint = "https://script.google.com/macros/s/AKfycbyXVNJLkQhZ4lhiXSGJlXadTQIMakxOHyQbgztfXBEqORDzJhstv3PcjjFCzAmu3UhUXg/exec";

// % di acconto
const DEPOSIT_PCT = 0.30;

// Listino e dati gommoni (immagini: metti i tuoi file in /img)
const BOATS = [
  { id: "g50-40cv",  nome: "Gommone 5.0 m - 40CV",  prezzo: 90,  capienza: 4,  img: "img/g1.jpg" },
  { id: "g55-70cv",  nome: "Gommone 5.50 m - 70CV", prezzo: 120, capienza: 6,  img: "img/g2.jpg" },
  { id: "g65-115cv", nome: "Gommone 6.20 m - 115CV",prezzo: 160, capienza: 8,  img: "img/g3.jpg" },
  { id: "g70-150cv", nome: "Gommone 7.50 m - 150CV",prezzo: 350, capienza: 12, img: "img/g4.jpg" }
];

// Stato
let selectedBoatId = null;
let DATE_MAP_BY_BOAT = {}; // { boatId: [YYYY-MM-DD, ...] }
let fpInstance = null;     // istanza flatpickr

// Utils
const q = (sel) => document.querySelector(sel);
const euros = (n) => `€${Number(n).toFixed(2).replace('.', ',')}`;

/* -------------------- RENDER GOMMONI -------------------- */
function renderBoats() {
  const grid = q("#boatsGrid");
  grid.innerHTML = "";
  BOATS.forEach(b => {
    const card = document.createElement("div");
    card.className = "card glass";
    card.innerHTML = `
      <img src="${b.img}" alt="${b.nome}">
      <div class="card-body">
        <h3>${b.nome}</h3>
        <p>${b.capienza} persone – ${b.prezzo}€/giorno</p>
        <button class="btn seleziona" data-id="${b.id}">Seleziona</button>
      </div>`;
    grid.appendChild(card);
  });

  grid.querySelectorAll(".seleziona").forEach(btn => {
    btn.addEventListener("click", e => {
      selectedBoatId = e.currentTarget.dataset.id;
      const boat = BOATS.find(x => x.id === selectedBoatId);
      q("#selezioneBanner").hidden = false;
      q("#selezioneNome").textContent = `${boat.nome} – €${boat.prezzo}/giorno`;
      q("#gommoneSelezionato").value = boat.id;
      aggiornaDisabledPerGommone();
      updateAmountPreview();
      q("#contatti").scrollIntoView({ behavior: "smooth" });
    });
  });
}

/* -------------------- CALENDARIO -------------------- */
async function caricaDatePrenotate() {
  try {
    const res = await fetch(endpoint + "?action=map");
    const data = await res.json();
    if (data.ok && data.map) {
      DATE_MAP_BY_BOAT = data.map; // { boatId: ['2025-10-09', ...], ... }
    }
  } catch (err) {
    console.error("Errore caricamento mappa date:", err);
  } finally {
    // Inizializza comunque il calendario (senza disabled finché non selezioni il gommone)
    fpInstance = flatpickr("#data", {
      dateFormat: "Y-m-d", // ISO
      disable: [],
      minDate: "today",
      locale: "it"
    });
  }
}

function aggiornaDisabledPerGommone() {
  if (!fpInstance) return;
  const boatId = q("#gommoneSelezionato").value;
  const disabled = boatId ? (DATE_MAP_BY_BOAT[boatId] || []) : [];
  fpInstance.set("disable", disabled);
}

/* -------------------- PAGAMENTO -------------------- */
function getSelectedMode() {
  return document.querySelector('input[name="paymode"]:checked')?.value || 'deposit';
}
function updateAmountPreview() {
  const preview = q('#amountPreview');
  if (!preview) return;
  const boatId = q("#gommoneSelezionato").value;
  const mode = getSelectedMode();
  if (!boatId) { preview.textContent = "Importo: —"; return; }
  const boat = BOATS.find(b => b.id === boatId);
  if (!boat) { preview.textContent = "Importo: —"; return; }
  const amount = (mode === 'deposit') ? (boat.prezzo * DEPOSIT_PCT) : boat.prezzo;
  preview.textContent = `Importo: ${euros(amount)} (${mode === 'deposit' ? 'acconto 30%' : 'saldo totale'})`;
}

/* -------------------- API -------------------- */
async function salvaPrenotazione({ data_iso, boat, nome, email, messaggio }) {
  const payload = { data_iso, boat_id: boat.id, boat_nome: boat.nome, nome, email, messaggio };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "text/plain", "Accept": "application/json" }, // evita preflight
    body: JSON.stringify(payload)
  });
  const out = await res.json();
  console.log("DEBUG salvaPrenotazione ->", out);
  return out;
}

async function creaCheckoutStripe({ boat, data_iso, nome, email, mode }) {
  const payload = { action: 'create_checkout', boat_id: boat.id, data_iso, nome, email, mode };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain', 'Accept': 'application/json' }, // evita preflight
    body: JSON.stringify(payload)
  });
  const out = await res.json();
  console.log("DEBUG create_checkout ->", out);
  return out;
}

/* -------------------- AVVIO -------------------- */
document.addEventListener("DOMContentLoaded", () => {
  renderBoats();
  caricaDatePrenotate();

  // cambio modalità pagamento aggiorna l’anteprima importo
  document.querySelectorAll('input[name="paymode"]').forEach(r => {
    r.addEventListener('change', updateAmountPreview);
  });

  // pulsante "Cambia" gommone
  q("#cambiaGommone").addEventListener("click", () => {
    selectedBoatId = null;
    q("#selezioneBanner").hidden = true;
    q("#gommoneSelezionato").value = "";
    aggiornaDisabledPerGommone();
    updateAmountPreview();
  });

  // Invio richiesta (solo salvataggio, senza Stripe)
  q("#bookingForm").addEventListener("submit", async (e) => {
    e.preventDefault();

    const boatId = q("#gommoneSelezionato").value;
    const data_iso = q("#data").value.trim();  // flatpickr -> Y-m-d
    const nome = q("#nome").value.trim();
    const email = q("#email").value.trim();
    const messaggio = q("#messaggio").value.trim();
    const boat = BOATS.find(b => b.id === boatId);

    if (!boat || !data_iso || !nome || !email) {
      alert("Compila tutti i campi e seleziona un gommone.");
      return;
    }

    try {
      const out = await salvaPrenotazione({ data_iso, boat, nome, email, messaggio });
      if (!out.ok) {
        alert(out.error || "Errore nel salvataggio.");
        return;
      }
      alert("Richiesta inviata! Ti contatteremo a breve.");
    } catch (err) {
      console.error(err);
      alert("Errore di connessione.");
    }
  });

  // Paga ora (salva + cassa Stripe)
  const pagaBtn = q("#btnPagaOra");
  pagaBtn.addEventListener("click", async () => {
    // anti-doppio click
    if (pagaBtn.dataset.loading === "1") return;
    pagaBtn.dataset.loading = "1";
    pagaBtn.disabled = true;
    const restore = () => { pagaBtn.dataset.loading = "0"; pagaBtn.disabled = false; pagaBtn.textContent = "💳 Paga ora con carta (Stripe)"; };
    pagaBtn.textContent = "Attendere...";

    const boatId = q("#gommoneSelezionato").value;
    const data_iso = q("#data").value.trim();
    const nome = q("#nome").value.trim();
    const email = q("#email").value.trim();
    const messaggio = q("#messaggio").value.trim();
    const mode = getSelectedMode();

    const boat = BOATS.find(b => b.id === boatId);
    if (!boat || !data_iso || !nome || !email) {
      alert("Compila tutti i campi e seleziona un gommone.");
      restore(); return;
    }

    try {
      // 1) salva sul foglio
      const out = await salvaPrenotazione({ data_iso, boat, nome, email, messaggio });

      if (!out.ok) {
        const msg = String(out.error || "").toLowerCase();
        // Se è il classico messaggio “data già prenotata”, proviamo COMUNQUE a creare la cassa.
        // (il server bloccherà davvero solo se c'è un altro cliente su quella data+gommone)
        if (!msg.includes("data già prenotata")) {
          alert(out.error || "Errore nel salvataggio.");
          restore(); return;
        }
      }

      // 2) vai alla cassa Stripe
      const pay = await creaCheckoutStripe({ boat, data_iso, nome, email, mode });
      if (pay.ok && pay.url) {
        window.location.href = pay.url;
      } else {
        alert("Errore pagamento: " + (pay.error || "Impossibile creare sessione Stripe."));
        restore();
      }
    } catch (err) {
      console.error(err);
      alert("Errore di connessione.");
      restore();
    }
  });

  updateAmountPreview();
});