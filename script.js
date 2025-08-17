/* ========= Firebase (Compat) ========= */
// Using compat builds avoids ES module pitfalls on GitHub Pages and works in more browsers.
const firebaseConfig = {
  apiKey: "AIzaSyC3WNbrFbbugzlDCpkfFowBjXVaz1pszRM",
  authDomain: "studybydn.firebaseapp.com",
  projectId: "studybydn",
  storageBucket: "studybydn.firebasestorage.app",
  messagingSenderId: "895430657662",
  appId: "1:895430657662:web:7ad2dfe38d2c114a76ba2f",
  measurementId: "G-LENP3MD41K"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

/* ========= Local Storage helpers ========= */
function getStored(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) ?? def; }
  catch { return def; }
}
function setStored(key, val) { localStorage.setItem(key, JSON.stringify(val)); }

/* ========= Data Model ========= */
let profiles = getStored("profiles", []);        // array of profile names
let sessions = getStored("sessions", {});        // map profile -> sessions[]
let currentProfile = null;
let currentSession = null;

let timerInterval = null;
let elapsedMs = 0;
let paused = false;

/* ========= DOM ========= */
const profileSelect = document.getElementById("profileSelect");
const newProfileInput = document.getElementById("newProfileInput");
const createProfileBtn = document.getElementById("createProfileBtn");
const deleteProfileBtn = document.getElementById("deleteProfileBtn");
const currentProfileView = document.getElementById("currentProfile");

const exNameInput = document.getElementById("exName");
const startBtn = document.getElementById("startSessionBtn");
const pauseBtn = document.getElementById("pauseResumeBtn");
const endBtn = document.getElementById("endSessionBtn");

const timerDisplay = document.getElementById("timerDisplay");
const correctBtn = document.getElementById("correctBtn");
const wrongBtn = document.getElementById("wrongBtn");
const skippedBtn = document.getElementById("skippedBtn");
const questionGrid = document.getElementById("questionGrid");
const sessionsList = document.getElementById("sessions");

const darkModeBtn = document.getElementById("darkModeBtn");
const exportPdfBtn = document.getElementById("exportPdfBtn");
const exportJsonBtn = document.getElementById("exportJsonBtn");
const importJsonBtn = document.getElementById("importJsonBtn");
const importJsonInput = document.getElementById("importJsonInput");
const showStatsBtn = document.getElementById("showStatsBtn");
const statsPanel = document.getElementById("statsPanel");
const statsContent = document.getElementById("statsContent");

const showGraphsBtn = document.getElementById("showGraphsBtn");
const graphModal = document.getElementById("graphModal");
const closeGraphModal = document.getElementById("closeGraphModal");
const weeklyCanvas = document.getElementById("weeklyChart");
const monthlyCanvas = document.getElementById("monthlyChart");

const syncStatus = document.getElementById("syncStatus");
let weeklyChart = null;
let monthlyChart = null;

/* ========= Utils ========= */
function setSyncStatus(text, ok = true) {
  syncStatus.textContent = `Sync: ${text}`;
  syncStatus.style.color = ok ? "inherit" : "#e67e22";
}
function ensureProfileBucket(p) {
  if (!sessions[p]) sessions[p] = [];
}
function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const h = String(Math.floor(s / 3600)).padStart(2, "0");
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return `${h}:${m}:${sec}`;
}
function percent(n, d) {
  if (!d) return "0%";
  return Math.round((n / d) * 100) + "%";
}
function setStudyControlsEnabled(running) {
  exNameInput.disabled = running;
  startBtn.disabled = running || !exNameInput.value.trim() || !currentProfile;

  pauseBtn.disabled = !running;
  endBtn.disabled = !running;

  correctBtn.disabled = !running;
  wrongBtn.disabled = !running;
  skippedBtn.disabled = !running;
}

/* ========= Firebase Sync (Cloud First, Local Fallback) ========= */
function profileDoc(profileName) {
  // Firestore document id cannot contain slashes. Replace them defensively.
  const id = String(profileName).replace(/\//g, "_");
  return db.collection("profiles").doc(id);
}

async function cloudLoadAll() {
  try {
    const snap = await db.collection("profiles").get();
    const names = [];
    const map = {};
    snap.forEach(doc => {
      const name = doc.id;
      names.push(name);
      const data = doc.data() || {};
      map[name] = Array.isArray(data.sessions) ? data.sessions : [];
    });
    profiles = names;
    sessions = map;
    setStored("profiles", profiles);
    setStored("sessions", sessions);
    setSyncStatus("Cloud OK", true);
  } catch (e) {
    setSyncStatus("Offline (using local cache)", false);
  }
}

async function cloudSaveProfile(p) {
  try {
    await profileDoc(p).set({ sessions: sessions[p] || [] }, { merge: true });
    setSyncStatus("Saved", true);
  } catch (e) {
    setSyncStatus("Save failed (offline?)", false);
  }
}

async function cloudDeleteProfile(p) {
  try {
    await profileDoc(p).delete();
    setSyncStatus(`Deleted "${p}"`, true);
  } catch (e) {
    setSyncStatus("Delete failed (offline?)", false);
  }
}

/* ========= Profiles UI ========= */
function renderProfiles() {
  profileSelect.innerHTML = "";
  profiles.forEach(p => {
    const opt = document.createElement("option");
    opt.value = p;
    opt.textContent = p;
    profileSelect.appendChild(opt);
  });

  if (profiles.length && !currentProfile) {
    profileSelect.value = profiles[0];
    selectProfile(profiles[0]);
  } else if (currentProfile) {
    profileSelect.value = currentProfile;
  }
}

function selectProfile(name) {
  currentProfile = name || null;
  if (currentProfile) {
    currentProfileView.textContent = `Profile: ${currentProfile}`;
    ensureProfileBucket(currentProfile);
    setStored("sessions", sessions);
    renderSessions();
    renderStatsPanel();
  } else {
    currentProfileView.textContent = "";
    sessionsList.innerHTML = "";
    statsContent.innerHTML = "";
  }
  setStudyControlsEnabled(!!currentSession);
}

createProfileBtn.onclick = async () => {
  const name = newProfileInput.value.trim();
  if (!name) return alert("Enter a profile name.");
  if (profiles.includes(name)) return alert("Profile already exists.");
  profiles.push(name);
  ensureProfileBucket(name);
  setStored("profiles", profiles);
  setStored("sessions", sessions);
  await cloudSaveProfile(name);
  newProfileInput.value = "";
  selectProfile(name);
  renderProfiles();
};

deleteProfileBtn.onclick = async () => {
  if (!currentProfile) return alert("Select a profile first.");
  const name = currentProfile;
  if (!confirm(`Delete profile "${name}" and all its sessions? This cannot be undone.`)) return;
  await cloudDeleteProfile(name);
  // local
  profiles = profiles.filter(p => p !== name);
  delete sessions[name];
  setStored("profiles", profiles);
  setStored("sessions", sessions);
  currentProfile = null;
  renderProfiles();
  selectProfile(null);
};

profileSelect.onchange = () => selectProfile(profileSelect.value);

/* ========= Session Lifecycle ========= */
exNameInput.addEventListener("input", () => setStudyControlsEnabled(!!currentSession));

function startTimer() {
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    if (!paused) {
      elapsedMs += 1000;
      timerDisplay.textContent = formatTime(elapsedMs);
    }
  }, 1000);
}

startBtn.onclick = () => {
  if (!currentProfile) return alert("Select a profile first");
  if (currentSession) return alert("A session is already running");
  const name = exNameInput.value.trim();
  if (!name) return alert("Enter a session name");

  currentSession = {
    name,
    start: Date.now(),
    durationMs: 0,
    boxes: [],
    correct: 0,
    wrong: 0,
    skipped: 0
  };
  elapsedMs = 0;
  paused = false;
  questionGrid.innerHTML = "";
  timerDisplay.textContent = "00:00:00";
  startTimer();
  setStudyControlsEnabled(true);
};

pauseBtn.onclick = () => {
  if (!currentSession) return;
  paused = !paused;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
};

endBtn.onclick = async () => {
  if (!currentSession) return;
  clearInterval(timerInterval);
  currentSession.durationMs = elapsedMs;
  currentSession.end = Date.now();
  currentSession.total = currentSession.correct + currentSession.wrong + currentSession.skipped;

  ensureProfileBucket(currentProfile);
  sessions[currentProfile].push(currentSession);
  setStored("sessions", sessions);
  await cloudSaveProfile(currentProfile);

  // Reset UI
  currentSession = null;
  elapsedMs = 0;
  timerDisplay.textContent = "00:00:00";
  pauseBtn.textContent = "Pause";
  setStudyControlsEnabled(false);

  // Refresh lists/charts/stats
  renderSessions();
  renderStatsPanel();
  if (graphModal.style.display === "block") renderGraphs();
};

function addBox(type) {
  if (!currentSession) return alert("Start a session first");
  const n = currentSession.boxes.length + 1;
  const div = document.createElement("div");
  div.className = `square ${type}`;
  div.textContent = n;
  questionGrid.appendChild(div);

  currentSession.boxes.push(type);
  currentSession[type] += 1;
}

correctBtn.onclick = () => addBox("correct");
wrongBtn.onclick   = () => addBox("wrong");
skippedBtn.onclick = () => addBox("skipped");

/* ========= History ========= */
async function deleteSession(profile, idx) {
  sessions[profile].splice(idx, 1);
  setStored("sessions", sessions);
  await cloudSaveProfile(profile);
  renderSessions();
  renderStatsPanel();
  if (graphModal.style.display === "block") renderGraphs();
}
window.deleteSession = deleteSession; // used by inline onclick

function renderSessions() {
  sessionsList.innerHTML = "";
  if (!currentProfile) return;

  const list = sessions[currentProfile] || [];
  if (!list.length) {
    const empty = document.createElement("li");
    empty.className = "muted";
    empty.textContent = "No sessions yet.";
    sessionsList.appendChild(empty);
    return;
  }

  list.slice().reverse().forEach((s, revIndex) => {
    const idx = list.length - 1 - revIndex; // actual index

    const li = document.createElement("li");

    const total = s.correct + s.wrong + s.skipped;
    const head = document.createElement("div");
    head.className = "session-head";
    head.innerHTML = `
      <span>${s.name}</span>
      <button class="danger" onclick="deleteSession('${currentProfile.replace(/'/g,"\\'")}', ${idx})">Delete</button>
    `;

    const meta = document.createElement("div");
    meta.className = "session-meta";
    const startStr = new Date(s.start).toLocaleString();
    meta.textContent = `${startStr} • Duration: ${formatTime(s.durationMs)} • Questions: ${total}`;

    const bd = document.createElement("div");
    bd.className = "session-breakdown";
    bd.innerHTML = `
      ✔ ${s.correct} (${percent(s.correct, total)}) &nbsp;|&nbsp;
      ❌ ${s.wrong} (${percent(s.wrong, total)}) &nbsp;|&nbsp;
      ⏭ ${s.skipped} (${percent(s.skipped, total)})
      <div class="small-legend">Legend: ✔ Correct • ❌ Wrong • ⏭ Skipped</div>
    `;

    li.appendChild(head);
    li.appendChild(meta);
    li.appendChild(bd);
    sessionsList.appendChild(li);
  });
}

/* ========= Stats ========= */
function renderStatsPanel() {
  if (!currentProfile) {
    statsContent.innerHTML = "";
    return;
  }
  const list = sessions[currentProfile] || [];
  const totalSessions = list.length;
  let totalQs = 0;
  let totalDur = 0;
  let sumCorrect = 0, sumWrong = 0, sumSkipped = 0;

  list.forEach(s => {
    const t = s.correct + s.wrong + s.skipped;
    totalQs += t;
    totalDur += (s.durationMs || 0);
    sumCorrect += s.correct;
    sumWrong += s.wrong;
    sumSkipped += s.skipped;
  });

  const avgDur = totalSessions ? formatTime(Math.round(totalDur / totalSessions)) : "00:00:00";

  statsContent.innerHTML = `
    <div><strong>Profile:</strong> ${currentProfile}</div>
    <div><strong>Sessions:</strong> ${totalSessions}</div>
    <div><strong>Total Questions:</strong> ${totalQs}</div>
    <div><strong>Average Duration:</strong> ${avgDur}</div>
    <div style="margin-top:6px;"><strong>Overall Breakdown:</strong>
      ✔ ${sumCorrect} (${percent(sumCorrect, totalQs)}) &nbsp;|&nbsp;
      ❌ ${sumWrong} (${percent(sumWrong, totalQs)}) &nbsp;|&nbsp;
      ⏭ ${sumSkipped} (${percent(sumSkipped, totalQs)})
    </div>
  `;
}

/* ========= Graphs (Chart.js) ========= */
function groupDailyLast7Days(list) {
  const today = new Date();
  today.setHours(0,0,0,0);
  const dayMs = 86400000;

  const labels = [];
  const map = {};
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today.getTime() - i * dayMs);
    const key = d.toDateString();
    labels.push(d.toLocaleDateString());
    map[key] = 0;
  }

  list.forEach(s => {
    const d = new Date(s.start);
    d.setHours(0,0,0,0);
    const key = d.toDateString();
    const total = (s.correct + s.wrong + s.skipped);
    if (key in map) map[key] += total;
  });

  const values = Object.keys(map).sort((a,b)=>new Date(a)-new Date(b)).map(k => map[k]);
  return { labels, values };
}

function groupWeeklyLast8Weeks(list) {
  function isoWeek(d) {
    const date = new Date(d.getTime());
    date.setHours(0,0,0,0);
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    const week1 = new Date(date.getFullYear(), 0, 4);
    return 1 + Math.round(((date - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  }
  function isoYear(d) {
    const date = new Date(d.getTime());
    date.setDate(date.getDate() + 3 - ((date.getDay() + 6) % 7));
    return date.getFullYear();
  }

  const now = new Date();
  const buckets = [];
  for (let i = 7; i >= 0; i--) {
    const ref = new Date(now.getTime() - i * 7 * 86400000);
    buckets.push({ y: isoYear(ref), w: isoWeek(ref), label: `W${isoWeek(ref)} ${isoYear(ref)}`, total: 0 });
  }

  list.forEach(s => {
    const d = new Date(s.start);
    const y = isoYear(d);
    const w = isoWeek(d);
    const idx = buckets.findIndex(b => b.y === y && b.w === w);
    if (idx >= 0) {
      buckets[idx].total += (s.correct + s.wrong + s.skipped);
    }
  });

  return {
    labels: buckets.map(b => b.label),
    values: buckets.map(b => b.total)
  };
}

function renderGraphs() {
  if (!currentProfile) return;
  const list = sessions[currentProfile] || [];

  const daily = groupDailyLast7Days(list);
  const weekly = groupWeeklyLast8Weeks(list);

  if (weeklyChart) weeklyChart.destroy();
  if (monthlyChart) monthlyChart.destroy();

  weeklyChart = new Chart(weeklyCanvas.getContext("2d"), {
    type: "bar",
    data: { labels: daily.labels, datasets: [{ label: "Questions/day (7d)", data: daily.values }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision:0 } } } }
  });

  monthlyChart = new Chart(monthlyCanvas.getContext("2d"), {
    type: "line",
    data: { labels: weekly.labels, datasets: [{ label: "Questions/week (8w)", data: weekly.values }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision:0 } } } }
  });
}

/* ========= Sidebar Actions ========= */
// Dark mode
function applyDarkModeFromStorage() {
  const dark = getStored("darkMode", false);
  document.body.classList.toggle("dark", !!dark);
}
applyDarkModeFromStorage();

darkModeBtn.onclick = () => {
  const isDark = !document.body.classList.contains("dark");
  document.body.classList.toggle("dark", isDark);
  setStored("darkMode", isDark);
};

// Export JSON (current profile from CLOUD)
exportJsonBtn.onclick = async () => {
  if (!currentProfile) return alert("Select a profile first");
  try {
    // Refresh from cloud so export is up-to-date
    const docSnap = await profileDoc(currentProfile).get();
    const payload = {
      schema: "study-tracker.v1",
      profile: currentProfile,
      sessions: (docSnap.exists ? (docSnap.data().sessions || []) : (sessions[currentProfile] || []))
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${currentProfile}_backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSyncStatus("Exported JSON", true);
  } catch (e) {
    setSyncStatus("Export failed", false);
  }
};

// Import JSON (merge into current profile & SYNC to CLOUD)
importJsonBtn.onclick = () => importJsonInput.click();
importJsonInput.onchange = async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (!currentProfile) { alert("Select a profile first"); importJsonInput.value=""; return; }
  const text = await file.text();
  try {
    const data = JSON.parse(text);
    const imported = Array.isArray(data) ? data : (data.sessions || []);
    ensureProfileBucket(currentProfile);
    sessions[currentProfile].push(...imported);
    setStored("sessions", sessions);
    await cloudSaveProfile(currentProfile);
    renderSessions();
    renderStatsPanel();
    if (graphModal.style.display === "block") renderGraphs();
    alert(`Imported ${imported.length} sessions into "${currentProfile}". (Synced)`);
    importJsonInput.value = "";
  } catch (err) {
    alert("Invalid JSON file.");
    importJsonInput.value = "";
  }
};

// Export PDF
exportPdfBtn.onclick = async () => {
  if (!currentProfile) return alert("Select a profile first");
  // Use local (already synced) data
  const list = sessions[currentProfile] || [];
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });

  let y = 40;
  doc.setFontSize(16);
  doc.text(`Study Report — ${currentProfile}`, 40, y);
  y += 16;

  let totalQs = 0, totalDur = 0;
  let sumC=0,sumW=0,sumS=0;
  list.forEach(s=>{
    const t = s.correct + s.wrong + s.skipped;
    totalQs += t;
    totalDur += (s.durationMs||0);
    sumC += s.correct; sumW += s.wrong; sumS += s.skipped;
  });
  y += 10;
  doc.setFontSize(11);
  doc.text(`Sessions: ${list.length}`, 40, y); y += 14;
  doc.text(`Total Questions: ${totalQs}`, 40, y); y += 14;
  doc.text(`Avg Duration: ${list.length ? formatTime(Math.round(totalDur/list.length)) : "00:00:00"}`, 40, y); y += 20;
  doc.text(`Overall: ✔ ${sumC} (${percent(sumC,totalQs)}) | ❌ ${sumW} (${percent(sumW,totalQs)}) | ⏭ ${sumS} (${percent(sumS,totalQs)})`, 40, y);
  y += 24;

  doc.setFontSize(12);
  list.forEach((s, i) => {
    const t = s.correct + s.wrong + s.skipped;
    const line1 = `${i+1}. ${s.name}`;
    const line2 = `${new Date(s.start).toLocaleString()} • Duration ${formatTime(s.durationMs)} • Qs ${t}`;
    const line3 = `✔ ${s.correct} (${percent(s.correct,t)}) | ❌ ${s.wrong} (${percent(s.wrong,t)}) | ⏭ ${s.skipped} (${percent(s.skipped,t)})`;

    if (y > 760) { doc.addPage(); y = 40; }
    doc.text(line1, 40, y); y += 14;
    doc.setFontSize(11);
    doc.text(line2, 40, y); y += 14;
    doc.text(line3, 40, y); y += 18;
    doc.setFontSize(12);
  });

  doc.save(`${currentProfile}_report.pdf`);
};

// Stats toggle
showStatsBtn.onclick = () => {
  const willShow = statsPanel.classList.contains("hidden");
  if (willShow) renderStatsPanel();
  statsPanel.classList.toggle("hidden");
};

// Graphs modal
showGraphsBtn.onclick = () => {
  if (!currentProfile) return alert("Select a profile first");
  renderGraphs();
  graphModal.style.display = "block";
  graphModal.setAttribute("aria-hidden", "false");
};
closeGraphModal.onclick = () => {
  graphModal.style.display = "none";
  graphModal.setAttribute("aria-hidden", "true");
};
window.addEventListener("click", (e) => {
  if (e.target === graphModal) {
    graphModal.style.display = "none";
    graphModal.setAttribute("aria-hidden", "true");
  }
});

/* ========= Dark mode on load ========= */
(function initialDarkMode() {
  const dark = getStored("darkMode", false);
  document.body.classList.toggle("dark", !!dark);
})();

/* ========= Boot ========= */
async function boot() {
  // Try to load from cloud, else local cache remains.
  await cloudLoadAll();

  // If no cloud profiles and we have local cached ones, optionally push them up (first-time bootstrap)
  if ((!profiles || profiles.length === 0) && Object.keys(getStored("sessions", {})).length) {
    profiles = getStored("profiles", []);
    sessions = getStored("sessions", {});
    // Push each to cloud
    for (const p of profiles) {
      await cloudSaveProfile(p);
    }
    setSyncStatus("Bootstrapped local → cloud", true);
  }

  renderProfiles();
  if (profiles.length) selectProfile(profiles[0]);
  setStudyControlsEnabled(false);
}
// Ready…
boot();

