// ------------------ LOCAL STORAGE & DATA ------------------
let profiles = JSON.parse(localStorage.getItem("profiles") || "{}");
let currentProfile = null;
let currentSession = null;
let timerInterval, startTime, pausedTime = 0;

function saveProfiles() {
  localStorage.setItem("profiles", JSON.stringify(profiles));
}

function loadProfiles() {
  profiles = JSON.parse(localStorage.getItem("profiles") || "{}");
  updateProfileSelect();
  renderSessionHistory();
}

// ------------------ PROFILE HANDLING ------------------
const profileSelect = document.getElementById("profileSelect");
const newProfileName = document.getElementById("newProfileName");
const createProfileBtn = document.getElementById("createProfileBtn");
const deleteProfileBtn = document.getElementById("deleteProfileBtn");

createProfileBtn.onclick = () => {
  const name = newProfileName.value.trim();
  if (!name) return;
  if (!profiles[name]) profiles[name] = { sessions: [] };
  currentProfile = name;
  saveProfiles();
  updateProfileSelect();
  renderSessionHistory();
  newProfileName.value = "";
};

deleteProfileBtn.onclick = () => {
  if (!currentProfile) return;
  delete profiles[currentProfile];
  currentProfile = null;
  saveProfiles();
  updateProfileSelect();
  renderSessionHistory();
};

profileSelect.onchange = () => {
  currentProfile = profileSelect.value || null;
  renderSessionHistory();
};

function updateProfileSelect() {
  profileSelect.innerHTML = "";
  Object.keys(profiles).forEach((name) => {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    if (name === currentProfile) opt.selected = true;
    profileSelect.appendChild(opt);
  });
}

// ------------------ SESSION CONTROLS ------------------
const startSessionBtn = document.getElementById("startSessionBtn");
const endSessionBtn = document.getElementById("endSessionBtn");
const pauseTimerBtn = document.getElementById("pauseTimerBtn");
const timerDisplay = document.getElementById("timer");

startSessionBtn.onclick = () => {
  if (!currentProfile) return alert("Select or create a profile first.");
  currentSession = { date: new Date().toISOString(), questions: [], duration: 0 };
  profiles[currentProfile].sessions.push(currentSession);
  saveProfiles();
  startTimer();
  updateQuestionGrid();
};

endSessionBtn.onclick = () => {
  if (!currentSession) return;
  stopTimer();
  saveProfiles();
  renderSessionHistory();
  currentSession = null;
};

function startTimer() {
  startTime = Date.now();
  pausedTime = 0;
  endSessionBtn.disabled = false;
  pauseTimerBtn.disabled = false;
  timerInterval = setInterval(updateTimerDisplay, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  if (currentSession) currentSession.duration += Date.now() - startTime - pausedTime;
}

function updateTimerDisplay() {
  let elapsed = Date.now() - startTime - pausedTime;
  let hrs = String(Math.floor(elapsed / 3600000)).padStart(2, "0");
  let mins = String(Math.floor((elapsed % 3600000) / 60000)).padStart(2, "0");
  let secs = String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0");
  timerDisplay.textContent = `${hrs}:${mins}:${secs}`;
}

// ------------------ QUESTIONS ------------------
const correctBtn = document.getElementById("correctBtn");
const wrongBtn = document.getElementById("wrongBtn");
const skippedBtn = document.getElementById("skippedBtn");
const questionGrid = document.getElementById("questionGrid");

correctBtn.onclick = () => addQuestion("correct");
wrongBtn.onclick = () => addQuestion("wrong");
skippedBtn.onclick = () => addQuestion("skipped");

function addQuestion(status) {
  if (!currentSession) return;
  currentSession.questions.push(status);
  saveProfiles();
  updateQuestionGrid();
}

function updateQuestionGrid() {
  questionGrid.innerHTML = "";
  if (!currentSession) return;
  currentSession.questions.forEach((status, i) => {
    const box = document.createElement("div");
    box.textContent = i + 1;
    box.classList.add(status);
    questionGrid.appendChild(box);
  });
}

// ------------------ SESSION HISTORY ------------------
const sessionHistory = document.getElementById("sessionHistory");

function renderSessionHistory() {
  sessionHistory.innerHTML = "";
  if (!currentProfile) return;
  profiles[currentProfile].sessions.forEach((s, idx) => {
    const li = document.createElement("li");
    const dur = new Date(s.duration).toISOString().substr(11, 8);
    li.textContent = `Session ${idx + 1} | Date: ${new Date(s.date).toLocaleString()} | Duration: ${dur}`;
    sessionHistory.appendChild(li);
  });
}

// ------------------ DARK MODE ------------------
document.getElementById("darkModeToggle").onclick = () => {
  document.body.classList.toggle("dark");
};

// ------------------ JSON EXPORT/IMPORT ------------------
const exportJsonBtn = document.getElementById("exportJsonBtn");
const importJsonBtn = document.getElementById("importJsonBtn");
const importJsonInput = document.getElementById("importJsonInput");

exportJsonBtn.onclick = () => {
  const blob = new Blob([JSON.stringify(profiles)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "profiles.json";
  a.click();
  URL.revokeObjectURL(url);
};

importJsonBtn.onclick = () => importJsonInput.click();

importJsonInput.onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  Object.assign(profiles, data);
  saveProfiles();
  updateProfileSelect();
  renderSessionHistory();
};

// ------------------ FIREBASE SYNC EXTENSION ------------------
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyC3WNbrFbbugzlDCpkfFowBjXVaz1pszRM",
  authDomain: "studybydn.firebaseapp.com",
  projectId: "studybydn",
  storageBucket: "studybydn.firebasestorage.app",
  messagingSenderId: "895430657662",
  appId: "1:895430657662:web:7ad2dfe38d2c114a76ba2f",
  measurementId: "G-LENP3MD41K"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

async function uploadToCloud() {
  try {
    await setDoc(doc(db, "sync", "profiles"), { data: profiles });
    alert("✅ Data uploaded to cloud successfully!");
  } catch (err) {
    console.error(err);
    alert("❌ Upload failed. Check console.");
  }
}

async function downloadFromCloud() {
  try {
    const snap = await getDoc(doc(db, "sync", "profiles"));
    if (snap.exists()) {
      profiles = snap.data().data || {};
      saveProfiles();
      updateProfileSelect();
      renderSessionHistory();
      alert("✅ Data downloaded and applied locally!");
    } else {
      alert("⚠️ No cloud data found yet.");
    }
  } catch (err) {
    console.error(err);
    alert("❌ Download failed. Check console.");
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const uploadBtn = document.getElementById("uploadCloudBtn");
  const downloadBtn = document.getElementById("downloadCloudBtn");

  if (uploadBtn) uploadBtn.onclick = uploadToCloud;
  if (downloadBtn) downloadBtn.onclick = downloadFromCloud;
});

// ------------------ INIT ------------------
loadProfiles();
