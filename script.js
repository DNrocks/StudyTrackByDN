// Import Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, doc, setDoc, getDoc, getDocs, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC3WNbrFbbugzlDCpkfFowBjXVaz1pszRM",
  authDomain: "studybydn.firebaseapp.com",
  projectId: "studybydn",
  storageBucket: "studybydn.firebasestorage.app",
  messagingSenderId: "895430657662",
  appId: "1:895430657662:web:7ad2dfe38d2c114a76ba2f",
  measurementId: "G-LENP3MD41K"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ------------------ LOCAL DATA CACHE ------------------
let profiles = {};
let currentProfile = null;
let currentSession = null;
let timerInterval, startTime, pausedTime = 0;

// ------------------ FIREBASE HELPERS ------------------
async function syncProfilesToFirebase() {
  for (let profileName in profiles) {
    await setDoc(doc(db, "profiles", profileName), { data: profiles[profileName] });
  }
}

async function loadProfilesFromFirebase() {
  const querySnapshot = await getDocs(collection(db, "profiles"));
  querySnapshot.forEach((docSnap) => {
    profiles[docSnap.id] = docSnap.data().data;
  });
  updateProfileSelect();
}

// ------------------ PROFILE MANAGEMENT ------------------
document.getElementById("createProfileBtn").onclick = async () => {
  const name = document.getElementById("newProfileName").value.trim();
  if (!name) return;
  if (!profiles[name]) profiles[name] = { sessions: [] };
  currentProfile = name;
  await syncProfilesToFirebase();
  updateProfileSelect();
};

document.getElementById("deleteProfileBtn").onclick = async () => {
  if (!currentProfile) return;
  await deleteDoc(doc(db, "profiles", currentProfile));
  delete profiles[currentProfile];
  currentProfile = null;
  updateProfileSelect();
};

function updateProfileSelect() {
  const select = document.getElementById("profileSelect");
  select.innerHTML = "";
  for (let name in profiles) {
    const opt = document.createElement("option");
    opt.value = name; opt.textContent = name;
    if (name === currentProfile) opt.selected = true;
    select.appendChild(opt);
  }
}

// ------------------ SESSION CONTROLS ------------------
document.getElementById("startSessionBtn").onclick = () => {
  if (!currentProfile) return alert("Select or create a profile first.");
  currentSession = { date: new Date().toISOString(), questions: [], duration: 0 };
  profiles[currentProfile].sessions.push(currentSession);
  startTimer();
  updateQuestionGrid();
};

document.getElementById("endSessionBtn").onclick = async () => {
  stopTimer();
  await syncProfilesToFirebase();
  renderSessionHistory();
  currentSession = null;
};

function startTimer() {
  startTime = Date.now();
  pausedTime = 0;
  document.getElementById("pauseTimerBtn").disabled = false;
  document.getElementById("endSessionBtn").disabled = false;
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
  document.getElementById("timer").textContent = `${hrs}:${mins}:${secs}`;
}

// ------------------ QUESTIONS ------------------
function addQuestion(status) {
  if (!currentSession) return;
  currentSession.questions.push(status);
  updateQuestionGrid();
}

document.getElementById("correctBtn").onclick = () => addQuestion("correct");
document.getElementById("wrongBtn").onclick = () => addQuestion("wrong");
document.getElementById("skippedBtn").onclick = () => addQuestion("skipped");

function updateQuestionGrid() {
  const grid = document.getElementById("questionGrid");
  grid.innerHTML = "";
  if (!currentSession) return;
  currentSession.questions.forEach((status, i) => {
    const box = document.createElement("div");
    box.textContent = i + 1;
    box.classList.add(status);
    grid.appendChild(box);
  });
}

// ------------------ SESSION HISTORY ------------------
function renderSessionHistory() {
  const history = document.getElementById("sessionHistory");
  history.innerHTML = "";
  if (!currentProfile) return;
  profiles[currentProfile].sessions.forEach((s, idx) => {
    const li = document.createElement("li");
    const dur = new Date(s.duration).toISOString().substr(11, 8);
    li.textContent = `Session ${idx+1} | Date: ${new Date(s.date).toLocaleString()} | Duration: ${dur}`;
    history.appendChild(li);
  });
}

// ------------------ JSON IMPORT/EXPORT ------------------
document.getElementById("exportJsonBtn").onclick = async () => {
  const snapshot = await getDocs(collection(db, "profiles"));
  let data = {};
  snapshot.forEach(docSnap => { data[docSnap.id] = docSnap.data().data; });
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "profiles.json"; a.click();
  URL.revokeObjectURL(url);
};

document.getElementById("importJsonBtn").onclick = () => document.getElementById("importJsonInput").click();

document.getElementById("importJsonInput").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  Object.assign(profiles, data);
  await syncProfilesToFirebase();
  updateProfileSelect();
  renderSessionHistory();
};

// ------------------ DARK MODE ------------------
document.getElementById("darkModeToggle").onclick = () => {
  document.body.classList.toggle("dark");
};

// ------------------ INIT ------------------
loadProfilesFromFirebase();
