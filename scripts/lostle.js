let characterData = [];
let lostItemData = [];

// DOM Elements
const itemNameDisplay = document.getElementById("item-name");
const guessInput = document.getElementById("guess-input");
const submitBtn = document.getElementById("submit-btn");
const guessCountDisplay = document.getElementById("guess-count-display");
const errorTextDisplay = document.getElementById("input-error");
const guessesTbody = document.getElementById("guesses-tbody");
const suggestionsList = document.getElementById("suggestions-list");

// Popup Elements
const modalOverlay = document.getElementById('endgame-popup');
const popup = document.getElementById('popup');
const headline = document.getElementById('headline');
const ownerName = document.getElementById('owner-name');
const ownerImage = document.getElementById('owner-image');
const closeBtn = document.getElementById('close-btn');

// Hint Buttons
const hintButtons = {
  desc: document.getElementById("hint-desc-btn"),
  app: document.getElementById("hint-app-btn"),
  loc: document.getElementById("hint-loc-btn"),
  fac: document.getElementById("hint-fac-btn"),
};

const HINT_THRESHOLDS = { desc: 2, app: 0, loc: 2, fac: 4 };

// Game State Variables
let secretCharacter = null;
let secretItem = "";
let secretItemDetails = null;
const MAX_GUESSES = 5;
let currentMatches = [];
let selectedIndex = -1;

const FACTION_NAMES = [
  "Black Eagles",
  "Blue Lions",
  "Golden Deer",
  "Church of Seiros",
  "Ashen Wolves",
];

// 24-Hour UTC Date Helper
function getTodayKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${now.getUTCMonth() + 1}-${now.getUTCDate()}`;
}

// Local Storage Manager
let gameState = {
  date: getTodayKey(),
  guesses: [],
  revealedHints: { desc: false, app: false, loc: false, fac: false },
  isGameOver: false,
};

function loadSavedState(currentItem) {
  const saved = localStorage.getItem("lostle_daily_state");
  if (saved) {
    const parsed = JSON.parse(saved);
    if (parsed.date === getTodayKey() && parsed.item === currentItem) {
      gameState = parsed;
      return;
    }
  }


  localStorage.removeItem("lostle_daily_state");
  gameState = {
    date: getTodayKey(),
    item: currentItem,
    guesses: [],
    revealedHints: { desc: false, app: false, loc: false, fac: false },
    isGameOver: false,
  };
  saveState();
}

function saveState() {
  localStorage.setItem("lostle_daily_state", JSON.stringify(gameState));
}

function getDailyItem(itemsList) {
  const epoch = new Date("2026-01-01T00:00:00Z").getTime();
  const now = new Date();
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const dayIndex = Math.floor((today - epoch) / (1000 * 60 * 60 * 24));

  let hash = (Math.abs(dayIndex) + 1) * 2654435760;
  hash = Math.abs((hash ^ (hash >> 16)) >>> 0);

  return itemsList[hash % itemsList.length];
}

// Initialize Game
async function initGame() {
  try {
    const [charResponse, itemResponse] = await Promise.all([
      fetch("data/fe3h_characters.json"),
      fetch("data/fe3h_lostitem.json"),
    ]);

    if (!charResponse.ok || !itemResponse.ok) {
      throw new Error("Failed to load game data files!");
    }

    characterData = await charResponse.json();
    lostItemData = await itemResponse.json();

    // Pick 24-hour deterministic item
    secretItemDetails = getDailyItem(lostItemData);
    secretItem = secretItemDetails.lostItem;

    loadSavedState(secretItem);

    // Reverse lookup item
    secretCharacter = characterData.find(
      (c) => c.items && c.items.includes(secretItem),
    );

    if (!secretCharacter) {
      console.error(
        `Error: Could not find owner for item "${secretItem}" in character data.`,
      );
      itemNameDisplay.textContent = "Data Error: Owner not found";
      return;
    }

    itemNameDisplay.textContent = secretItem;

    // Restore saved progress on page load
    guessInput.disabled = false;
    submitBtn.disabled = false;
    modalOverlay.classList.remove("show", "dismissed");
    popup.classList.remove("shake");
    guessesTbody.innerHTML = "";


    gameState.guesses.forEach((charName) => {
      const charObj = characterData.find(
        (c) => c.character.toLowerCase() === charName.toLowerCase(),
      );
      if (charObj) addGuessToTable(charObj, false);
    });

    updateGuessCountUI();
    updateHintsUI();

    if (gameState.isGameOver) {
      endGame(false);
      const lastGuess = gameState.guesses[gameState.guesses.length - 1];
      const isWin =
        lastGuess &&
        lastGuess.toLowerCase() === secretCharacter.character.toLowerCase();
      showEndGameModal(isWin);
      modalOverlay.classList.remove("show");
      modalOverlay.classList.add("dismissed");
    }
  } catch (error) {
    console.error("Failed to load character or lost item data:", error);
    itemNameDisplay.textContent = "Error loading item!";
  }
}

// Hint Button Logic
function updateHintsUI() {
  Object.keys(HINT_THRESHOLDS).forEach((key) => {
    const btn = hintButtons[key];
    if (!btn) return;

    const threshold = HINT_THRESHOLDS[key];
    const isUnlocked = gameState.guesses.length >= threshold;
    const isRevealed = gameState.revealedHints[key];

    if (isRevealed) {
      btn.textContent = getHintText(key);
      btn.className = "hint-btn revealed";
      btn.disabled = true;
    } else if (isUnlocked) {
      btn.textContent = "Click to reveal";
      btn.className = "hint-btn ready";
      btn.disabled = false;
    } else {
      btn.textContent = `Unlocks after ${threshold} guess${threshold > 1 ? "es" : ""}`;
      btn.className = "hint-btn locked";
      btn.disabled = true;
    }
  });
}

function getHintText(key) {
  if (!secretItemDetails) return "Unknown";
  switch (key) {
    case "desc":
      return secretItemDetails.description || "No description available.";
    case "app":
      return secretItemDetails.appearance || "Unknown";
    case "loc":
      return secretItemDetails.location || "Unknown";
    case "fac":
      return secretCharacter && secretCharacter.faction !== undefined
        ? FACTION_NAMES[secretCharacter.faction]
        : "Unknown";
    default:
      return "";
  }
}

// Click listener for hint buttons
Object.keys(hintButtons).forEach((key) => {
  if (hintButtons[key]) {
    hintButtons[key].addEventListener("click", () => {
      if (gameState.guesses.length >= HINT_THRESHOLDS[key]) {
        gameState.revealedHints[key] = true;
        saveState();
        updateHintsUI();
      }
    });
  }
});

// UI Updates
function updateGuessCountUI() {
  guessCountDisplay.textContent = `Guess Count (${gameState.guesses.length}/${MAX_GUESSES})`;
}

// Filter and sort characters
function getFilteredCharacters(query) {
  if (!query) return [];
  const q = query.toLowerCase();

  return characterData
    .filter((entry) => entry.character.toLowerCase().includes(q))
    .sort((a, b) => {
      const nameA = a.character.toLowerCase();
      const nameB = b.character.toLowerCase();
      const aStartsWith = nameA.startsWith(q);
      const bStartsWith = nameB.startsWith(q);
      if (aStartsWith && !bStartsWith) return -1;
      if (!aStartsWith && bStartsWith) return 1;
      return nameA.localeCompare(nameB);
    });
}

// Dropdown Suggestions
function renderSuggestions(matches) {
  suggestionsList.innerHTML = "";
  currentMatches = matches;
  selectedIndex = -1;

  if (matches.length === 0) {
    suggestionsList.style.display = "none";
    return;
  }

  matches.forEach((entry) => {
    const li = document.createElement("li");
    li.classList.add("suggestion-item");
    li.textContent = entry.character;

    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      submitGuess(entry.character);
    });

    suggestionsList.appendChild(li);
  });

  suggestionsList.style.display = "block";
}

function updateSelectionHighlight() {
  const items = suggestionsList.querySelectorAll(".suggestion-item");
  items.forEach((item, index) => {
    if (index === selectedIndex) {
      item.classList.add("selected");
      item.scrollIntoView({ block: "nearest" });
    } else {
      item.classList.remove("selected");
    }
  });
}

function normalizeCrests(char) {
  if (!char || !char.crest) return ["None"];
  if (Array.isArray(char.crest)) {
    if (char.crest.length === 0) return ["None"];
    const cleaned = char.crest.map((c) => (c.trim() === "" ? "None" : c));
    return cleaned.includes("None") && cleaned.length === 1
      ? ["None"]
      : cleaned;
  }
  if (typeof char.crest === "string") {
    const trimmed = char.crest.trim();
    if (trimmed === "" || trimmed === "None") return ["None"];
    return [trimmed];
  }
  return ["None"];
}

// Submit Guess
function submitGuess(characterName) {
  if (gameState.isGameOver) return;
  errorTextDisplay.textContent = "";

  const guessedChar = characterData.find(
    (entry) => entry.character.toLowerCase() === characterName.toLowerCase(),
  );

  if (!guessedChar) {
    errorTextDisplay.textContent = `"${characterName}" is not a valid character!`;
    return;
  }

  if (
    gameState.guesses
      .map((g) => g.toLowerCase())
      .includes(characterName.toLowerCase())
  ) {
    errorTextDisplay.textContent = `You already guessed "${characterName}"!`;
    return;
  }

  gameState.guesses.push(guessedChar.character);
  saveState();

  updateGuessCountUI();
  updateHintsUI();
  addGuessToTable(guessedChar, true);

  // Check Win / Loss condition
  const isCorrect = guessedChar.character.toLowerCase() === secretCharacter.character.toLowerCase();
  
  if (isCorrect) {
    gameState.isGameOver = true;
    saveState();
    endGame(true, true); 
  } else if (gameState.guesses.length >= MAX_GUESSES) {
    gameState.isGameOver = true;
    saveState();
    endGame(true, false); 
  }

  // Clear inputs and dropdown
  guessInput.value = "";
  suggestionsList.innerHTML = "";
  suggestionsList.style.display = "none";
  currentMatches = [];
  selectedIndex = -1;
}

// Render guess row into table
function addGuessToTable(guessedChar, shouldAnimate = true) {
  const tr = document.createElement("tr");
  let delayCounter = 0;
  const delayIncrement = 0.2;

  const createBadge = (text, isMatch) => {
    const span = document.createElement("span");
    span.className = `badge ${isMatch ? "badge-correct" : "badge-incorrect"}`;
    span.textContent = text;
    if (shouldAnimate) {
      span.style.animationDelay = `${delayCounter}s`;
      delayCounter += delayIncrement;
    } else {
      span.style.opacity = "1";
      span.style.transform = "none";
      span.style.animation = "none";
    }
    return span;
  };

  // 1. Name Cell
  const isNameMatch =
    guessedChar.character.toLowerCase() ===
    secretCharacter.character.toLowerCase();
  const nameTd = document.createElement("td");
  nameTd.appendChild(createBadge(guessedChar.character, isNameMatch));

  // 2. Crest Cell
  const crestTd = document.createElement("td");
  const guessedCrests = normalizeCrests(guessedChar);
  const secretCrests = normalizeCrests(secretCharacter);
  guessedCrests.forEach((crest) => {
    crestTd.appendChild(createBadge(crest, secretCrests.includes(crest)));
  });

  // 3. Favorite Gifts Cell
  const giftsTd = document.createElement("td");
  const giftsContainer = document.createElement("div");
  giftsContainer.className = "gifts-grid";

  if (guessedChar.favoriteGifts && guessedChar.favoriteGifts.length > 0) {
    guessedChar.favoriteGifts.forEach((gift) => {
      const isGiftMatch =
        secretCharacter.favoriteGifts &&
        secretCharacter.favoriteGifts.includes(gift);
      giftsContainer.appendChild(createBadge(gift, isGiftMatch));
    });
  } else {
    giftsContainer.appendChild(createBadge("None", false));
  }

  giftsTd.appendChild(giftsContainer);
  tr.appendChild(nameTd);
  tr.appendChild(crestTd);
  tr.appendChild(giftsTd);

  guessesTbody.insertBefore(tr, guessesTbody.firstChild);
}

function endGame(shouldRevealHints = false, isWin = null) {
  guessInput.disabled = true;
  submitBtn.disabled = true;

  if (shouldRevealHints) {
    Object.keys(gameState.revealedHints).forEach(
      (k) => (gameState.revealedHints[k] = true),
    );
    saveState();
    updateHintsUI();
  }

  if (isWin !== null) {
    setTimeout(() => showEndGameModal(isWin), 600);
  }
}


// Popup display logic
function showEndGameModal(isWin) {
  ownerName.textContent = secretCharacter.character;
  
  const imageName = secretCharacter.character.replace(/\s+/g, '_');
  ownerImage.src = `images/${imageName}.png`;

  popup.classList.remove('shake');

  if (isWin) {
      headline.textContent = "Item Returned!";
      headline.style.color = "#1a1a1a"; 
      
      confetti({
          particleCount: 150,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#bfa873', '#f1c40f', '#ffffff'] 
      });
  } else {
      headline.textContent = "Item forgotten...";
      headline.style.color = "#1a1a1a"; 
      popup.classList.add('shake');
  }

  modalOverlay.classList.add('show');
}


// Event Listeners
guessInput.addEventListener("input", (e) => {
  const query = e.target.value.trim();
  renderSuggestions(getFilteredCharacters(query));
});

guessInput.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    if (currentMatches.length > 0) {
      selectedIndex = (selectedIndex + 1) % currentMatches.length;
      updateSelectionHighlight();
    }
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    if (currentMatches.length > 0) {
      selectedIndex =
        (selectedIndex - 1 + currentMatches.length) % currentMatches.length;
      updateSelectionHighlight();
    }
  } else if (e.key === "Enter") {
    e.preventDefault();
    if (selectedIndex >= 0 && selectedIndex < currentMatches.length) {
      submitGuess(currentMatches[selectedIndex].character);
    } else if (currentMatches.length > 0) {
      submitGuess(currentMatches[0].character);
    } else if (guessInput.value.trim() !== "") {
      submitGuess(guessInput.value.trim());
    }
  }
});

submitBtn.addEventListener("click", () => {
  if (selectedIndex >= 0 && selectedIndex < currentMatches.length) {
    submitGuess(currentMatches[selectedIndex].character);
  } else if (currentMatches.length > 0) {
    submitGuess(currentMatches[0].character);
  } else if (guessInput.value.trim() !== "") {
    submitGuess(guessInput.value.trim());
  }
});

document.addEventListener("click", (e) => {
  if (!e.target.closest(".search-wrapper")) {
    suggestionsList.style.display = "none";
  }
});

closeBtn.addEventListener('click', () => {
  modalOverlay.classList.remove('show');
  modalOverlay.classList.add('dismissed');
});
initGame();
