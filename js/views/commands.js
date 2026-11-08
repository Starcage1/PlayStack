const escapeHtml = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);

const SHORTCUTS = [
  ["k / Space", "Play or pause"], ["j / l", "Seek back / forward 10 seconds"], ["← / →", "Seek back / forward 5 seconds"],
  ["↑ / ↓", "Volume up / down 5%"], ["m", "Mute or unmute"], ["f", "Fullscreen"], ["t", "Theater mode"],
  ["i", "Minimize player"], ["c", "Captions"], ["Shift + N / P", "Next / previous video"], ["0–9", "Jump to 0–90%"],
  ["?", "Commands page"], ["/", "Search"], ["v", "Start or stop voice input"]
];

// Draw the searchable command catalog and the keyboard shortcut table.
export function renderCommands(commands, { query = "", category = "", tab = "voice" } = {}) {
  const filtered = commands.filter((item) => (!category || item.category === category)
    && (!query || `${item.title} ${item.description} ${item.keywords.join(" ")} ${item.examples.en.map(example => example.text).join(" ")} ${item.examples.hi.map(example => example.text).join(" ")}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const categories = ["all", ...new Set(commands.map((item) => item.category))];
  const categoryButtons = categories.map((name) => `<button class="command-category ${category === name || (!category && name === "all") ? "active" : ""}" data-action="commands-category" data-category="${escapeHtml(name === "all" ? "" : name)}">${escapeHtml(name === "all" ? "All commands" : titleCase(name))}</button>`).join("");
  const cards = filtered.map((item) => {
    const english = item.examples.en[0]?.text || "";
    const hinglish = item.examples.hi[0]?.text || "";
    return `<article class="command-card"><div class="command-card-heading"><span class="command-category-label">${escapeHtml(titleCase(item.category))}</span><h3>${escapeHtml(item.title)}</h3></div>
      <p>${escapeHtml(item.description)}</p><div class="command-examples"><p><b>English</b> “${escapeHtml(english)}”</p><p><b>Hinglish</b> “${escapeHtml(hinglish)}”</p></div>
      <button class="secondary" data-action="commands-try" data-example="${escapeHtml(english)}">Try it</button></article>`;
  }).join("");
  const voicePanel = `<div class="commands-browser"><aside class="command-categories" aria-label="Command categories">${categoryButtons}</aside>
      <section class="command-results"><label class="sr-only" for="commandSearch">Search commands</label><input id="commandSearch" type="search" value="${escapeHtml(query)}" placeholder="Search commands">
        <p class="muted">${filtered.length} of ${commands.length} commands</p>${cards ? `<div class="command-grid">${cards}</div>` : `<div class="empty-state"><h2>No matching commands</h2><p>Try a shorter search.</p></div>`}</section></div>`;
  const keyboardPanel = `<section class="keyboard-panel"><h2>Keyboard shortcuts</h2><p class="muted">Shortcuts are ignored while you type in a field.</p><div class="shortcut-list">${SHORTCUTS.map(([key, action]) => `<div><kbd>${escapeHtml(key)}</kbd><span>${escapeHtml(action)}</span></div>`).join("")}</div></section>`;
  return `<section class="screen-heading commands-heading"><div><h1>Commands</h1><p class="muted">Voice and keyboard controls for your library and player.</p></div><a class="secondary back-button" href="#/home">Home</a></section>
    <div class="command-tabs" role="tablist"><button role="tab" aria-selected="${tab === "voice"}" class="${tab === "voice" ? "active" : ""}" data-action="commands-tab" data-tab="voice">Voice commands</button><button role="tab" aria-selected="${tab === "keyboard"}" class="${tab === "keyboard" ? "active" : ""}" data-action="commands-tab" data-tab="keyboard">Keyboard</button></div>
    ${tab === "keyboard" ? keyboardPanel : voicePanel}`;
}

function titleCase(value) { return String(value).replace(/\b\w/g, (letter) => letter.toLocaleUpperCase()); }
