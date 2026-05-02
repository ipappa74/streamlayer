// =============================================================================
// STREAMLAYER — Sovelluslogiikka
// =============================================================================

/* --- METATIEDOT --- */
const APP_META = {
    name: "StreamLayer",
    version: "1.2.1",
    buildDate: "2026-05-02",
    author: "Toni",
    kick: "https://kick.com/ipappa/",
    repo: "https://github.com/ipappa74/streamlayer",
    homepage: "https://ipappa74.github.io/streamlayer/"
};

/* --- GLOBAALIT MUUTTUJAT --- */
const STORAGE_KEY = 'streamlayer';
const STORAGE_ACTIVE = 'streamlayer_active_v1';
const OFFLINE_DELAY = 1 * 60 * 1000; // 1 minuutti ennen kuin offline-striimi suljetaan

let favorites = [];
const players = {};
const offlineTrackers = {};

/* --- SVG-KUVAKKEET --- */
const svgIcons = {
    mute:   `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"/></svg>`,
    unmute: `<svg viewBox="0 0 24 24"><path d="M3.63 3.63L2.36 4.91 7.45 10H3v4h4l5 5v-6.03l4.29 4.29c-.39.24-.81.44-1.29.56v2.02c1.01-.21 1.94-.62 2.75-1.17l2.35 2.35 1.27-1.27L3.63 3.63zM10 15.17L7.83 13H5v-2h2.83l.88-.88L10 11.41v3.76zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-7-8l-2.04 2.04L12 8.08V4zM14 7.97v2.06c.48.24.9.59 1.22.99l1.45-1.45c-.71-.84-1.63-1.46-2.67-1.6z"/></svg>`,
    refresh:`<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
    close:  `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    chat:   `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>`
};

// =============================================================================
// ALUSTUS
// =============================================================================

function loadInitialData() {
    // Tulostetaan sovellustiedot tyylitettynä konsoliin
    console.log(
        `%c ${APP_META.name} v${APP_META.version} %c ${APP_META.buildDate} `,
        'background: #007aff; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;',
        'background: #1c1c1e; color: #007aff; padding: 4px 8px; border-radius: 0 4px 4px 0; border: 1px solid #007aff;'
    );

    // Ladataan suosikit localStoragesta
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try { favorites = JSON.parse(raw); } catch (e) { favorites = []; }
    }

    // Palautetaan sivupalkin tila edelliseltä sessiolta
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        const sidebar = document.getElementById('main-sidebar');
        const main = document.querySelector('main');
        const btn = sidebar.querySelector('.toggle-sidebar-btn');
        sidebar.classList.add('collapsed');
        if (main) main.classList.add('expanded');
        if (btn) btn.textContent = '▶';
    }

    renderFavorites();
    updateAllStatuses();
    restoreActiveStreams();
}

// =============================================================================
// TILAN TALLENNUS
// =============================================================================

function updateActiveStreamsStorage() {
    const active = [];
    document.querySelectorAll('.stream-wrapper').forEach(wrapper => {
        const name = wrapper.querySelector('.fav-alias').textContent;
        // Alusta selviää id:n toisesta osasta (esim. "s-kick-pelaaja")
        const platform = wrapper.id.split('-')[1];
        const muteBtn = document.getElementById('mute-btn-' + wrapper.id);
        const isUnmuted = muteBtn ? muteBtn.classList.contains('is-active') : false;
        active.push({
            name,
            platform,
            chatOpen: wrapper.classList.contains('chat-open'),
            unmuted: isUnmuted
        });
    });
    localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(active));
}

// =============================================================================
// LIVE-TILANNE JA API-KUTSUT
// =============================================================================

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
                } else {
                    f.viewers = 0;
                    f.statusText = 'Offline';
                }
            }

            // Seurataan offline-aikaa automaattista sulkemista varten
            const streamId = `s-${f.platform}-${f.name.toLowerCase()}`;
            const wrapper = document.getElementById(streamId);

            if (wrapper) {
                if (!f.isLive) {
                    if (!offlineTrackers[streamId]) {
                        offlineTrackers[streamId] = Date.now();
                    } else if (Date.now() - offlineTrackers[streamId] >= OFFLINE_DELAY) {
                        closeStream(streamId);
                        delete offlineTrackers[streamId];
                    }
                } else {
                    delete offlineTrackers[streamId];
                }
            }

            checkAutoOpen(f);

        } catch (e) {
            f.isLive = false;
            f.viewers = 0;
            f.statusText = 'Virhe';
        }
    }));

    // Livenä olevat ensin, sen jälkeen katsojamäärän mukaan
    favorites.sort((a, b) => {
        if (a.isLive !== b.isLive) return b.isLive ? 1 : -1;
        return b.viewers - a.viewers;
    });

    renderFavorites();
}

// =============================================================================
// KÄYTTÖLIITTYMÄN RENDERÖINTI
// =============================================================================

function renderFavorites() {
    const list = document.getElementById('favorites-list');
    list.innerHTML = favorites.map((fav, i) => {
        const iconSrc = fav.platform === 'kick'
            ? 'https://kick.com/favicon.ico'
            : 'https://www.twitch.tv/favicon.ico';

        return `
        <div class="favorite-item">
            <div class="fav-info" onclick="openStream('${fav.name}', '${fav.platform}')">
                <div class="icon-group">
                    <div class="platform-icon-wrapper">
                        <span class="status-dot ${fav.isLive ? 'live' : ''}"></span>
                        <img src="${iconSrc}" class="platform-icon">
                    </div>
                    <input type="checkbox" class="fav-auto" title="Avaa automaattisesti kun livessä"
                        ${fav.autoOpen ? 'checked' : ''}
                        onchange="toggleAutoOpen(${i}, event)"
                        onclick="event.stopPropagation()">
                </div>
                <div class="fav-text-stack">
                    <span class="fav-alias">${fav.name}</span>
                    <div class="status-text">${fav.statusText}</div>
                </div>
            </div>
            <button class="delete-btn" onclick="removeFavorite(${i}, event)">×</button>
        </div>`;
    }).join('');
}

// =============================================================================
// STRIIMIEN HALLINTA
// =============================================================================

function openStream(name, platform, defaultChatOpen = false, defaultUnmuted = false, skipStorage = false) {
    const grid = document.getElementById('stream-grid');
    const id = `s-${platform}-${name.toLowerCase()}`;

    // Ei avata uudelleen jos jo auki
    if (document.getElementById(id)) return;

    // Mobiilissa suljetaan sivupalkki automaattisesti
    if (window.innerWidth <= 768) toggleSidebar();

    const wrapper = document.createElement('div');
    wrapper.className = 'stream-wrapper';
    wrapper.id = id;
    wrapper.draggable = true;

    if (defaultChatOpen) wrapper.classList.add('chat-open');

    // Raahaustapahtumien kuuntelijat
    wrapper.addEventListener('dragstart',  handleDragStart);
    wrapper.addEventListener('dragover',   handleDragOver);
    wrapper.addEventListener('dragenter',  handleDragEnter);
    wrapper.addEventListener('dragleave',  handleDragLeave);
    wrapper.addEventListener('dragend',    handleDragEnd);
    wrapper.addEventListener('drop',       handleDrop);

    const iconSrc = platform === 'kick'
        ? 'https://kick.com/favicon.ico'
        : 'https://www.twitch.tv/favicon.ico';

    wrapper.innerHTML = `
        <div class="stream-header" style="cursor: move;">
            <div class="stream-title-group">
                <img src="${iconSrc}" class="header-icon">
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
        </div>`;

    grid.appendChild(wrapper);

    // Ladataan chat heti jos palautetaan tallennetusta tilasta
    if (defaultChatOpen) {
        _loadChatIframe(id, name, platform);
    }

    // Luodaan videosoitin
    if (platform === 'twitch') {
        players[id] = new Twitch.Player(`player-${id}`, {
            channel: name,
            width: "100%",
            height: "100%",
            parent: [window.location.hostname || 'localhost'],
            muted: true  // Aina muted alussa
        });
        // Varmistetaan että soitin jatkaa toistoa
        setTimeout(() => {
            if (players[id]) {
                players[id].play();
            }
        }, 500);
    } else {
        const ifr = document.createElement('iframe');
        ifr.src = `https://player.kick.com/${name}?autoplay=true&muted=true`;
        ifr.allow = "autoplay; fullscreen";
        document.getElementById(`player-${id}`).appendChild(ifr);
    }

    // Päivitetään nappien tilat (viiveellä että DOM on valmis)
    // HUOM: Koska selain pakottaa mute-tilan refreshin jälkeen, 
    // näytetään aina muted-tila. Käyttäjä voi aktivoida äänen klikkaamalla.
    setTimeout(() => {
        const muteBtn = document.getElementById(`mute-btn-${id}`);
        if (muteBtn) {
            // Aina muted-tila refreshin jälkeen (selaimen rajoitus)
            muteBtn.classList.remove('is-active');
            muteBtn.innerHTML = svgIcons.unmute;
        }

        if (defaultChatOpen) {
            const chatBtn = wrapper.querySelector('button[onclick*="toggleChat"]');
            if (chatBtn) {
                chatBtn.classList.add('is-active');
            }
        }
    }, 0);

    // Lisätään neighbor-has-chat luokka jos jollain muulla on chat auki
    const anyChatOpen = document.querySelector('.stream-wrapper.chat-open') !== null;
    if (anyChatOpen && !defaultChatOpen) {
        wrapper.classList.add('neighbor-has-chat');
    }

    // Tallennetaan tila vain jos ei olla palauttamassa (skipStorage = false)
    if (!skipStorage) {
        updateActiveStreamsStorage();
    }
}

function closeStream(id) {
    if (players[id]) delete players[id];
    if (offlineTrackers[id]) delete offlineTrackers[id];

    const el = document.getElementById(id);
    if (el) el.remove();

    // Päivitetään neighbor-has-chat luokat
    const allWrappers = document.querySelectorAll('.stream-wrapper');
    const anyChatOpen = document.querySelector('.stream-wrapper.chat-open') !== null;
    
    allWrappers.forEach(w => {
        if (anyChatOpen && !w.classList.contains('chat-open')) {
            w.classList.add('neighbor-has-chat');
        } else {
            w.classList.remove('neighbor-has-chat');
        }
    });

    updateActiveStreamsStorage();
}

function refreshStream(id) {
    const container = document.getElementById(`player-${id}`);
    const ifr = container.querySelector('iframe');

    if (ifr) {
        // Reload pakottamalla src tyhjäksi hetkeksi
        const src = ifr.src;
        ifr.src = '';
        setTimeout(() => ifr.src = src, 10);
    } else if (players[id]) {
        players[id].pause();
        players[id].play();
    }
}

function toggleChat(id, name, platform) {
    const wrapper = document.getElementById(id);
    const chatContainer = document.getElementById(`chat-${id}`);
    const isOpening = !wrapper.classList.contains('chat-open');

    // Mobiilissa: sulje kaikki muut chatit ennen uuden avaamista
    if (window.innerWidth <= 768 && isOpening) {
        document.querySelectorAll('.stream-wrapper.chat-open').forEach(openWrapper => {
            if (openWrapper.id !== id) {
                openWrapper.classList.remove('chat-open');
                // Poista vihreä väri myös napista
                const otherChatBtn = openWrapper.querySelector('button[onclick*="toggleChat"]');
                if (otherChatBtn) {
                    otherChatBtn.classList.remove('is-active');
                }
            }
        });
    }

    wrapper.classList.toggle('chat-open');

    // Päivitetään chat-napin tila
    const chatBtn = wrapper.querySelector('button[onclick*="toggleChat"]');
    if (chatBtn) {
        chatBtn.classList.toggle('is-active', isOpening);
    }

    // Iframe ladataan vasta ensimmäisellä avauksella
    if (isOpening && chatContainer.innerHTML === '') {
        _loadChatIframe(id, name, platform);
    }

    // Lisätään/poistetaan luokka muille streameille keskitystä varten
    const allWrappers = document.querySelectorAll('.stream-wrapper');
    const anyChatOpen = document.querySelector('.stream-wrapper.chat-open') !== null;
    
    allWrappers.forEach(w => {
        if (anyChatOpen && !w.classList.contains('chat-open')) {
            w.classList.add('neighbor-has-chat');
        } else {
            w.classList.remove('neighbor-has-chat');
        }
    });

    updateActiveStreamsStorage();
}

// Sisäinen apufunktio -- ei kutsuta suoraan HTML:stä
function _loadChatIframe(id, name, platform) {
    const chatContainer = document.getElementById(`chat-${id}`);
    const parent = window.location.hostname || 'localhost';
    const url = platform === 'kick'
        ? `https://kick.com/popout/${name}/chat`
        : `https://www.twitch.tv/embed/${name}/chat?parent=${parent}&darkpopout`;
    
    if (platform === 'kick') {
        chatContainer.innerHTML = `
            <div style="position:relative;height:100%;">
                <iframe src="${url}" width="100%" height="100%" frameborder="0"></iframe>
                <button onclick="window.open('https://kick.com/${name}/chat', '_blank')"
                        title="Avaa chatti Kickissä"
                        style="position:absolute;bottom:10px;right:5px;width:120px;height:35px;background:#53fc18;color:#000;border:none;border-radius:5px;font-weight:600;cursor:pointer;font-size:12px;z-index:10;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:transform 0.2s,box-shadow 0.2s;"
                        onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.4)';"
                        onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.3)';">
                    Avaa Kickissä
                </button>
            </div>
        `;
    } else {
        chatContainer.innerHTML = `<iframe src="${url}" width="100%" height="100%" frameborder="0"></iframe>`;
    }
}

function toggleMute(id, name, platform) {
    const btn = document.getElementById(`mute-btn-${id}`);
    const muted = btn.classList.toggle('is-active');

    if (platform === 'twitch' && players[id]) {
        players[id].setMuted(!muted);
    } else {
        // Kick ei tue mute-APIa -- uudelleenladataan soitin eri muted-arvolla
        const container = document.getElementById(`player-${id}`);
        container.innerHTML = `<iframe src="https://player.kick.com/${name}?autoplay=true&muted=${!muted}" allow="autoplay; fullscreen"></iframe>`;
    }

    btn.innerHTML = muted ? svgIcons.mute : svgIcons.unmute;
    updateActiveStreamsStorage();
}

// =============================================================================
// SUOSIKIT
// =============================================================================

function saveFavorite() {
    const n = document.getElementById('channel-name').value.trim();
    const p = document.getElementById('platform-select').value;

    if (!n) return;
    if (favorites.find(f => f.name.toLowerCase() === n.toLowerCase())) return;

    favorites.push({ name: n, platform: p, isLive: false, viewers: 0, statusText: '...', autoOpen: false });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    document.getElementById('channel-name').value = '';
    renderFavorites();
    updateAllStatuses();
}

function removeFavorite(i, e) {
    e.stopPropagation();
    favorites.splice(i, 1);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    renderFavorites();
}

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
        // Nollataan lippu jotta seuraava livetulo avautuu uudelleen
        fav.alreadyOpened = false;
    }
}

function restoreActiveStreams() {
    const saved = localStorage.getItem(STORAGE_ACTIVE);
    if (!saved) return;
    try {
        const streams = JSON.parse(saved);
        // skipStorage = true estää tallentamasta uudestaan (säilyttää unmuted-tilan)
        streams.forEach(s => openStream(s.name, s.platform, s.chatOpen, s.unmuted || false, true));
        
        // Päivitetään neighbor-has-chat luokat palautuksen jälkeen
        const anyChatOpen = document.querySelector('.stream-wrapper.chat-open') !== null;
        if (anyChatOpen) {
            document.querySelectorAll('.stream-wrapper:not(.chat-open)').forEach(w => {
                w.classList.add('neighbor-has-chat');
            });
        }
    } catch (e) {
        console.error("Virhe striimien palautuksessa:", e);
    }
}

// =============================================================================
// SIVUPALKKI
// =============================================================================

function toggleSidebar() {
    const sidebar = document.getElementById('main-sidebar');
    const main = document.querySelector('main');
    const btn = sidebar.querySelector('.toggle-sidebar-btn');
    const isCollapsed = sidebar.classList.toggle('collapsed');

    if (main) main.classList.toggle('expanded');
    if (btn) btn.textContent = isCollapsed ? '▶' : '◀';

    localStorage.setItem('sidebar-collapsed', isCollapsed);
}

// =============================================================================
// TIETOA-MODAL
// =============================================================================

function openAbout() {
    document.getElementById('app-name').textContent    = APP_META.name;
    document.getElementById('app-version').textContent = `Versio ${APP_META.version}`;
    document.getElementById('app-author').textContent  = `Tekijä: ${APP_META.author}`;
    document.getElementById('app-date').textContent    = `Päivitetty: ${APP_META.buildDate}`;
    document.getElementById('app-kick').href           = APP_META.kick;
    document.getElementById('app-repo').href           = APP_META.repo;
    document.getElementById('about-modal').style.display = 'flex';
}

function closeAbout(event) {
    const modal = document.getElementById('about-modal');
    // Suljetaan taustaa klikatessa tai sulkupainikkeesta
    if (event.target === modal || event.target.classList.contains('modal-close')) {
        modal.style.display = 'none';
    }
}

// =============================================================================
// RAAHAUS (DRAG & DROP)
// =============================================================================

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

function handleDragLeave() {
    dragCounter--;
    if (dragCounter === 0) this.classList.remove('drag-over');
}

function handleDragEnd() {
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

// =============================================================================
// KÄYNNISTYS JA AJASTIMET
// =============================================================================

loadInitialData();
setInterval(updateAllStatuses, 60000);
