/* --- GLOBAALIT MUUTTUJAT JA ASETUKSET --- */
const STORAGE_KEY = 'multistream_pro_v2';
let favorites = [];
const players = {};
const OFFLINE_DELAY = 1 * 60 * 1000; // 1 minuutti ennen kuin offline-striimi suljetaan
const offlineTrackers = {};

const svgIcons = {
    mute: `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"/></svg>`,
    unmute: `<svg viewBox="0 0 24 24"><path d="M3.63 3.63L2.36 4.91 7.45 10H3v4h4l5 5v-6.03l4.29 4.29c-.39.24-.81.44-1.29.56v2.02c1.01-.21 1.94-.62 2.75-1.17l2.35 2.35 1.27-1.27L3.63 3.63zM10 15.17L7.83 13H5v-2h2.83l.88-.88L10 11.41v3.76zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-7-8l-2.04 2.04L12 8.08V4zM14 7.97v2.06c.48.24.9.59 1.22.99l1.45-1.45c-.71-.84-1.63-1.46-2.67-1.6z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    chat: `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>`
};

/* --- ALUSTUS --- */
function loadInitialData() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) { try { favorites = JSON.parse(raw); } catch (e) { favorites = []; } }
    
    // Tarkistetaan sivupalkin tallennettu tila
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        const sidebar = document.getElementById('main-sidebar');
        const main = document.querySelector('main');
        const btn = sidebar.querySelector('.toggle-sidebar-btn');
        sidebar.classList.add('collapsed');
        if (main) main.classList.add('expanded');
        btn.textContent = '▶';
    }

    renderFavorites();
    updateAllStatuses();
}

/* --- TILAN PÄIVITYS JA API-KUTSUT --- */
async function updateAllStatuses() {
    await Promise.all(favorites.map(async f => {
        try {
            if (f.platform === 'kick') {
                const res = await fetch(`https://kick.com/api/v1/channels/${f.name.toLowerCase()}`);
                const d = await res.json();
                f.isLive = !!(d.livestream);
                f.viewers = f.isLive ? d.livestream.viewer_count : 0;
                f.statusText = f.isLive ? `${f.viewers.toLocaleString()} katsojaa` : 'Offline';
            } else {
                const res = await fetch(`https://decapi.me/twitch/uptime/${f.name}`);
                const ut = await res.text();
                f.isLive = !ut.includes('offline');
                if (f.isLive) {
                    const vRes = await fetch(`https://decapi.me/twitch/viewercount/${f.name}`);
                    const vText = await vRes.text();
                    f.viewers = parseInt(vText.replace(/,/g, '')) || 0;
                    f.statusText = `${f.viewers.toLocaleString()} katsojaa`;
                } else { f.viewers = 0; f.statusText = 'Offline'; }
            }

            // Automaattinen sulkeminen offline-tilassa
            const streamId = `s-${f.platform}-${f.name.toLowerCase()}`;
            const wrapper = document.getElementById(streamId);
            
            if (wrapper) {
                if (!f.isLive) {
                    if (!offlineTrackers[streamId]) {
                        offlineTrackers[streamId] = Date.now();
                    } else {
                        const elapsed = Date.now() - offlineTrackers[streamId];
                        if (elapsed >= OFFLINE_DELAY) {
                            closeStream(streamId);
                            delete offlineTrackers[streamId];
                        }
                    }
                } else {
                    delete offlineTrackers[streamId];
                }
            }
            checkAutoOpen(f);
        } catch (e) { f.isLive = false; f.viewers = 0; f.statusText = 'Virhe'; }
    }));

    // Lajitellaan livenä olevat ensin
    favorites.sort((a, b) => {
        if (a.isLive !== b.isLive) return b.isLive ? 1 : -1;
        return b.viewers - a.viewers;
    });
    renderFavorites();
}

/* --- KÄYTTÖLIITTYMÄN RENDERÖINTI --- */
function renderFavorites() {
    const list = document.getElementById('favorites-list');
    list.innerHTML = favorites.map((fav, i) => {
        const statusClass = fav.isLive ? 'live-text' : 'offline-text';
        const iconSrc = fav.platform === 'kick' ? 'https://kick.com/favicon.ico' : 'https://www.twitch.tv/favicon.ico';
        
        return `
        <div class="favorite-item">
            <div class="fav-info" onclick="openStream('${fav.name}', '${fav.platform}')">
                <div class="icon-group">
                    <div class="platform-icon-wrapper">
                        <span class="status-dot ${fav.isLive ? 'live' : ''}"></span>
                        <img src="${iconSrc}" class="platform-icon">
                    </div>
                    <input type="checkbox" class="fav-auto" title="Auto-open" 
                        ${fav.autoOpen ? 'checked' : ''} 
                        onchange="toggleAutoOpen(${i}, event)" 
                        onclick="event.stopPropagation()">
                </div>
                <div class="fav-text-stack">
                    <span class="fav-alias">${fav.name}</span>
                    <div class="status-text ${statusClass}">${fav.statusText}</div>
                </div>
            </div>
            <button class="delete-btn" onclick="removeFavorite(${i}, event)">×</button>
        </div>
    `}).join('');
}

/* --- STRIIMIEN HALLINTA --- */
function openStream(name, platform) {
    const grid = document.getElementById('stream-grid');
    const id = `s-${platform}-${name.toLowerCase()}`;
    if (document.getElementById(id)) return;

	// Suljetaan sivupalkki automaattisesti mobiilissa, kun striimi avataan
    if (window.innerWidth <= 768) {
        toggleSidebar(); 
    }
	
    const wrapper = document.createElement('div');
    wrapper.className = 'stream-wrapper';
    wrapper.id = id;
    wrapper.draggable = true;
    
    // Tapahtumankuuntelijat raahausta varten
    wrapper.addEventListener('dragstart', handleDragStart);
    wrapper.addEventListener('dragover', handleDragOver);
    wrapper.addEventListener('dragenter', handleDragEnter);
    wrapper.addEventListener('dragleave', handleDragLeave);
    wrapper.addEventListener('dragend', handleDragEnd);
    wrapper.addEventListener('drop', handleDrop);

    wrapper.innerHTML = `
        <div class="stream-header" style="cursor: move;">
            <div class="stream-title-group">
                <img src="${platform === 'kick' ? 'https://kick.com/favicon.ico' : 'https://www.twitch.tv/favicon.ico'}" class="header-icon">
                <span class="fav-alias">${name}</span>
            </div>
            <div class="stream-header-btns">
                <button class="icon-btn" onclick="toggleChat('${id}', '${name}', '${platform}')" title="Chat">${svgIcons.chat}</button>
                <button class="icon-btn" id="mute-btn-${id}" onclick="toggleMute('${id}', '${name}', '${platform}')">${svgIcons.unmute}</button>
                <button class="icon-btn" onclick="refreshStream('${id}')">${svgIcons.refresh}</button>
                <button class="icon-btn close-btn" onclick="closeStream('${id}')">${svgIcons.close}</button>
            </div>
        </div>
        <div class="content-area">
            <div class="video-container" id="player-${id}"></div>
            <div class="chat-container" id="chat-${id}"></div>
        </div>
    `;
    grid.appendChild(wrapper);

    if (platform === 'twitch') {
        players[id] = new Twitch.Player(`player-${id}`, {
            channel: name, width: "100%", height: "100%", 
            parent: [window.location.hostname || 'localhost'], muted: true
        });
    } else {
        const ifr = document.createElement('iframe');
        ifr.src = `https://player.kick.com/${name}?autoplay=true&muted=true`;
        ifr.allow = "autoplay; fullscreen";
        document.getElementById(`player-${id}`).appendChild(ifr);
    }
}

function closeStream(id) { 
    if (players[id]) delete players[id]; 
    if (offlineTrackers[id]) delete offlineTrackers[id];
    const el = document.getElementById(id);
    if (el) el.remove(); 
}

function refreshStream(id) {
    const container = document.getElementById(`player-${id}`);
    const ifr = container.querySelector('iframe');
    if (ifr) { const s = ifr.src; ifr.src = ''; setTimeout(() => ifr.src = s, 10); }
    else if (players[id]) { players[id].pause(); players[id].play(); }
}

function toggleChat(id, name, platform) {
    const wrapper = document.getElementById(id);
    const chatContainer = document.getElementById(`chat-${id}`);
    const isOpening = !wrapper.classList.contains('chat-open');
    
    wrapper.classList.toggle('chat-open');

    if (isOpening && chatContainer.innerHTML === "") {
        const parent = window.location.hostname || 'localhost';
        const chatUrl = platform === 'kick' 
            ? `https://kick.com/popout/${name}/chat`
            : `https://www.twitch.tv/embed/${name}/chat?parent=${parent}&darkpopout`;
        
        chatContainer.innerHTML = `<iframe src="${chatUrl}" width="100%" height="100%" frameborder="0"></iframe>`;
    }
}

function toggleMute(id, name, platform) {
    const btn = document.getElementById(`mute-btn-${id}`);
    const active = btn.classList.toggle('is-active');
    if (platform === 'twitch' && players[id]) {
        players[id].setMuted(!active);
        btn.innerHTML = active ? svgIcons.mute : svgIcons.unmute;
    } else {
        const container = document.getElementById(`player-${id}`);
        container.innerHTML = `<iframe src="https://player.kick.com/${name}?autoplay=true&muted=${!active}" allow="autoplay; fullscreen"></iframe>`;
        btn.innerHTML = active ? svgIcons.mute : svgIcons.unmute;
    }
}

/* --- AUTOMAATTINEN AVAUS JA SUOSIKIT --- */
function toggleAutoOpen(index, event) {
    event.stopPropagation();
    favorites[index].autoOpen = event.target.checked;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
}

function checkAutoOpen(fav) {
    if (fav.isLive && fav.autoOpen) {
        if (!fav.alreadyOpened) { 
            openStream(fav.name, fav.platform);
            fav.alreadyOpened = true;
        }
    } else if (!fav.isLive) {
        fav.alreadyOpened = false;
    }
}

function saveFavorite() {
    const n = document.getElementById('channel-name').value.trim();
    const p = document.getElementById('platform-select').value;
    if (n && !favorites.find(f => f.name === n)) {
        favorites.push({ name: n, platform: p, isLive: false, viewers: 0, statusText: '...', autoOpen: false });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
        renderFavorites(); 
        updateAllStatuses();
        document.getElementById('channel-name').value = '';
    }
}

function removeFavorite(i, e) {
    e.stopPropagation(); favorites.splice(i, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites)); renderFavorites();
}

/* --- SIDEBAR JA RAAHAUS LOGIIKKA --- */
function toggleSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    const main = document.querySelector('main');
    const btn = sidebar.querySelector('.toggle-sidebar-btn');
    const isCollapsed = sidebar.classList.toggle('collapsed');
    
    if (main) main.classList.toggle('expanded');
    
    // Päivitetään nuoli (tämä toimii nyt molemmista napeista)
    if (btn) {
        btn.textContent = isCollapsed ? '▶' : '◀';
    }
    
    localStorage.setItem('sidebar-collapsed', isCollapsed);
}

let draggedElement = null;
let dragCounter = 0;

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add('dragging');
    document.body.classList.add('is-dragging'); 
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ''); 
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    return false;
}

function handleDragEnter(e) {
    e.preventDefault();
    dragCounter++; 
    if (this !== draggedElement) this.classList.add('drag-over');
}

function handleDragLeave(e) {
    dragCounter--;
    if (dragCounter === 0) this.classList.remove('drag-over');
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    document.body.classList.remove('is-dragging');
    document.querySelectorAll('.stream-wrapper').forEach(el => el.classList.remove('drag-over'));
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    dragCounter = 0;
    this.classList.remove('drag-over');
    
    if (draggedElement !== this) {
        const grid = document.getElementById('stream-grid');
        const children = Array.from(grid.children);
        const fromIndex = children.indexOf(draggedElement);
        const toIndex = children.indexOf(this);

        if (fromIndex < toIndex) this.after(draggedElement);
        else this.before(draggedElement);
    }
    return false;
}

/* --- AJASTIMET --- */
loadInitialData();
setInterval(updateAllStatuses, 60000);