// =============================================================================
// STREAMLAYER — Sovelluslogiikka
// =============================================================================

/* --- METATIEDOT --- */
const APP_META = {
    name: "StreamLayer",
    version: "1.8.20",
    buildDate: "2026-09-03",
    author: "Toni",
    kick: "https://kick.com/ipappa/",
    repo: "https://github.com/ipappa74/streamlayer",
    homepage: "https://ipappa74.github.io/streamlayer/",
};

/* --- GLOBAALIT MUUTTUJAT --- */
const STORAGE_KEY = "streamlayer";
const STORAGE_ACTIVE = "streamlayer_active_v1";
const STORAGE_SETTINGS = "streamlayer_settings_v1";
const OFFLINE_DELAY = 1 * 60 * 1000; // 1 minuutti ennen kuin offline-striimi suljetaan
const STATUS_TIMEOUT_MS = 8000;
const STATUS_RETRIES = 1;
const BACKUP_SCHEMA_VERSION = 1;

let favorites = [];
let autoCloseOffline = false;
const players = {};
const offlineTrackers = {};
const CHANNEL_NAME_PATTERN = /^[A-Za-z0-9_-]{1,50}$/;
let playerLayoutFrame = null;
let twitchSdkPromise = null;

function isCompactMobileLayout() {
    return window.innerWidth <= 932 && window.innerHeight <= 600 && window.innerWidth > window.innerHeight;
}

function syncViewportHeight() {
    const viewportHeight = Math.round(window.visualViewport?.height || window.innerHeight);
    document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
}

function alignCurrentLandscapeStream() {
    if (!isCompactMobileLayout()) return;

    const main = document.querySelector("main");
    const streams = Array.from(document.querySelectorAll(".stream-wrapper"));
    if (!main || streams.length === 0) return;

    const mainTop = main.getBoundingClientRect().top;
    const closestStream = streams.reduce((closest, stream) => {
        const distance = Math.abs(stream.getBoundingClientRect().top - mainTop - 8);
        return distance < closest.distance ? { stream, distance } : closest;
    }, { stream: streams[0], distance: Number.POSITIVE_INFINITY });
    const offset = closestStream.stream.getBoundingClientRect().top - mainTop - 8;

    if (Math.abs(offset) > 1) main.scrollTop += offset;
}

function schedulePlayerLayoutRefresh() {
    if (playerLayoutFrame !== null) cancelAnimationFrame(playerLayoutFrame);

    playerLayoutFrame = requestAnimationFrame(() => {
        playerLayoutFrame = requestAnimationFrame(() => {
            document.querySelectorAll(".video-container iframe").forEach((iframe) => {
                const container = iframe.parentElement;
                const width = Math.round(container?.clientWidth || 0);
                const height = Math.round(container?.clientHeight || 0);
                if (width === 0 || height === 0) return;

                // Kickin upotus tarvitsee nimenomaisen mitoituksen layout-muutoksen
                // jälkeen. Mittojen palautus säilyttää käynnissä olevan toiston.
                iframe.style.width = `${width}px`;
                iframe.style.height = `${height}px`;
                requestAnimationFrame(() => {
                    iframe.style.removeProperty("width");
                    iframe.style.removeProperty("height");
                });
            });
            playerLayoutFrame = null;
        });
    });
}

function refreshViewportAfterRotation() {
    syncViewportHeight();
    requestAnimationFrame(() => {
        syncViewportHeight();
        alignCurrentLandscapeStream();
        schedulePlayerLayoutRefresh();
    });
    window.setTimeout(() => {
        syncViewportHeight();
        alignCurrentLandscapeStream();
        schedulePlayerLayoutRefresh();
    }, 180);
}

/* --- SVG-KUVAKKEET --- */
const svgIcons = {
    mute: `<svg viewBox="0 0 24 24"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zM3 9v6h4l5 5V4L7 9H3z"/></svg>`,
    unmute: `<svg viewBox="0 0 24 24"><path d="M3.63 3.63L2.36 4.91 7.45 10H3v4h4l5 5v-6.03l4.29 4.29c-.39.24-.81.44-1.29.56v2.02c1.01-.21 1.94-.62 2.75-1.17l2.35 2.35 1.27-1.27L3.63 3.63zM10 15.17L7.83 13H5v-2h2.83l.88-.88L10 11.41v3.76zM19 12c0 .82-.15 1.61-.41 2.34l1.53 1.53c.56-1.17.88-2.48.88-3.87 0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zm-7-8l-2.04 2.04L12 8.08V4zM14 7.97v2.06c.48.24.9.59 1.22.99l1.45-1.45c-.71-.84-1.63-1.46-2.67-1.6z"/></svg>`,
    refresh: `<svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>`,
    close: `<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>`,
    chat: `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z"/></svg>`,
};

// =============================================================================
// ALUSTUS
// =============================================================================

function loadInitialData() {
    // Tulostetaan sovellustiedot tyylitettynä konsoliin
    console.log(
        `%c ${APP_META.name} v${APP_META.version} %c ${APP_META.buildDate} `,
        "background: #007aff; color: #ffffff; font-weight: bold; padding: 4px 8px; border-radius: 4px 0 0 4px;",
        "background: #1c1c1e; color: #007aff; padding: 4px 8px; border-radius: 0 4px 4px 0; border: 1px solid #007aff;",
    );

    // Ladataan suosikit localStoragesta
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
        try {
            favorites = JSON.parse(raw)
                .filter((favorite) =>
                    favorite &&
                    ["kick", "twitch"].includes(favorite.platform) &&
                    typeof favorite.name === "string" &&
                    CHANNEL_NAME_PATTERN.test(favorite.name),
                )
                .map((favorite) => ({
                    ...favorite,
                    name: favorite.name.trim(),
                    isLive: Boolean(favorite.isLive),
                    viewers: Number(favorite.viewers) || 0,
                    statusText: typeof favorite.statusText === "string" ? favorite.statusText : "Offline",
                    statusError: false,
                    title: typeof favorite.title === "string" ? favorite.title : "",
                    autoOpen: Boolean(favorite.autoOpen),
                }));
        } catch (e) {
            favorites = [];
        }
    }

    try {
        const settings = JSON.parse(localStorage.getItem(STORAGE_SETTINGS) || "{}");
        autoCloseOffline = settings.autoCloseOffline === true;
    } catch (e) {
        autoCloseOffline = false;
    }
    document.getElementById("auto-close-offline").checked = autoCloseOffline;

    // Palautetaan sivupalkin tila edelliseltä sessiolta
    applySidebarState(isCompactMobileLayout() || localStorage.getItem("sidebar-collapsed") === "true");

    renderFavorites();
    updateAllStatuses();
    restoreActiveStreams();
}

// =============================================================================
// TILAN TALLENNUS
// =============================================================================

function updateActiveStreamsStorage() {
    const active = [];
    document.querySelectorAll(".stream-wrapper").forEach((wrapper) => {
        const name = wrapper.querySelector(".fav-alias").textContent;
        // Alusta selviää id:n toisesta osasta (esim. "s-kick-pelaaja")
        const platform = wrapper.id.split("-")[1];
        const muteBtn = document.getElementById("mute-btn-" + wrapper.id);
        const isUnmuted = muteBtn ? muteBtn.classList.contains("is-active") : false;
        active.push({
            name,
            platform,
            chatOpen: wrapper.classList.contains("chat-open"),
            unmuted: isUnmuted,
        });
    });
    localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(active));
}

// =============================================================================
// LIVE-TILANNE JA API-KUTSUT
// =============================================================================

async function fetchWithRetry(url, options = {}, retries = STATUS_RETRIES) {
    let lastError;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), STATUS_TIMEOUT_MS);

        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            if (!response.ok && response.status >= 500) {
                throw new Error(`Palvelinvirhe ${response.status}`);
            }
            return response;
        } catch (error) {
            lastError = error;
            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
            }
        } finally {
            clearTimeout(timeout);
        }
    }

    throw lastError;
}

async function updateAllStatuses() {
    await Promise.all(
        favorites.map(async (f) => {
            try {
                if (f.platform === "kick") {
                    const res = await fetchWithRetry(
                        `https://kick.com/api/v1/channels/${f.name.toLowerCase()}`,
                    );
                    if (!res.ok) {
                        f.isLive = false;
                        f.viewers = 0;
                        f.statusText = res.status === 404 ? "Kanavaa ei löydy" : "Virhe";
                        f.statusError = res.status !== 404;
                        f.title = "";
                    } else {
                        const d = await res.json();
                        f.isLive = !!d.livestream;
                        f.viewers = f.isLive ? d.livestream.viewer_count : 0;
                        f.statusText = f.isLive
                            ? `${f.viewers.toLocaleString()} katsojaa`
                            : "Offline";
                        f.title = f.isLive ? d.livestream.session_title || "" : "";
                        f.statusError = false;
                    }
                } else {
                    const res = await fetchWithRetry(`https://decapi.me/twitch/uptime/${f.name}`);
                    if (!res.ok) throw new Error(`DecAPI-virhe ${res.status}`);
                    const ut = await res.text();
                    f.isLive = !ut.includes("offline");

                    if (f.isLive) {
                        const vRes = await fetchWithRetry(`https://decapi.me/twitch/viewercount/${f.name}`);
                        if (!vRes.ok) throw new Error(`DecAPI-virhe ${vRes.status}`);
                        const vText = await vRes.text();
                        f.viewers = parseInt(vText.replace(/,/g, "")) || 0;
                        f.statusText = `${f.viewers.toLocaleString()} katsojaa`;

                        const tRes = await fetchWithRetry(`https://decapi.me/twitch/title/${f.name}`);
                        if (!tRes.ok) throw new Error(`DecAPI-virhe ${tRes.status}`);
                        f.title = (await tRes.text()).trim();
                    } else {
                        f.viewers = 0;
                        f.statusText = "Offline";
                        f.title = "";
                        f.statusError = false;
                    }
                }

                // Offline-striimejä suljetaan vain käyttäjän erikseen valitsemalla asetuksella.
                const streamId = `s-${f.platform}-${f.name.toLowerCase()}`;
                const wrapper = document.getElementById(streamId);

                if (wrapper && autoCloseOffline) {
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
                } else {
                    delete offlineTrackers[streamId];
                }

                checkAutoOpen(f);
            } catch (e) {
                f.isLive = false;
                f.viewers = 0;
                f.statusText = "Virhe";
                f.statusError = true;
                f.title = "";
            }
        }),
    );

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

function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
}

function renderFavorites() {
    const list = document.getElementById("favorites-list");
    if (favorites.length === 0) {
        list.innerHTML = `
            <div class="favorite-empty-state">
                <strong>Ei vielä suosikkeja</strong>
                <span>Valitse alusta ja lisää ensimmäinen kanava.</span>
            </div>`;
        return;
    }

    list.innerHTML = favorites
        .map((fav, i) => {
            const iconSrc =
                fav.platform === "kick"
                    ? "https://kick.com/favicon.ico"
                    : "https://www.twitch.tv/favicon.ico";

            return `
        <div class="favorite-item">
            <div class="fav-info" onclick="openStream('${fav.name}', '${fav.platform}')">
                <div class="icon-group">
                    <div class="platform-icon-wrapper">
                        <span class="status-dot ${fav.isLive ? "live" : ""}"></span>
                        <img src="${iconSrc}" class="platform-icon">
                    </div>
                    <input type="checkbox" class="fav-auto" title="Avaa automaattisesti kun livessä"
                        ${fav.autoOpen ? "checked" : ""}
                        onchange="toggleAutoOpen(${i}, event)"
                        onclick="event.stopPropagation()">
                </div>
                    <div class="fav-text-stack">
                        <span class="fav-alias">${fav.name}</span>
                        ${fav.isLive && fav.title ? `<div class="fav-title" title="${escapeHtml(fav.title)}">${escapeHtml(fav.title)}</div>` : ""}
                        ${fav.statusError
                            ? `<div class="status-text status-error">Tilaa ei saatu haettua <span aria-hidden="true">·</span> <button class="status-refresh" type="button" onclick="refreshFavoriteStatus(${i}, event)" aria-label="Yritä hakea kanavan live-tila uudelleen">Päivitä</button></div>`
                            : `<div class="status-text">${escapeHtml(fav.statusText || "")}</div>`}
                    </div>
            </div>
            <button class="delete-btn" onclick="removeFavorite(${i}, event)">×</button>
        </div>`;
        })
        .join("");
}

function updateStreamEmptyState() {
    const grid = document.getElementById("stream-grid");
    const emptyState = document.getElementById("stream-empty-state");
    emptyState.hidden = grid.querySelector(".stream-wrapper") !== null;
}

function showPlayerError(id, message) {
    const container = document.getElementById(`player-${id}`);
    if (container) {
        container.innerHTML = `<div class="player-error" role="alert">${message}</div>`;
    }
}

function createKickPlayerIframe(name, unmuted = false) {
    const iframe = document.createElement("iframe");
    const needsDirectPlay = unmuted && window.matchMedia("(max-width: 768px)").matches;

    // Uusi lähetys käynnistyy mykistettynä. Mobiilissa äänen käyttöönotto
    // siirtää toiston Kickin omaan käyttäjän kosketuksella käynnistettävään tilaan.
    iframe.src = `https://player.kick.com/${name}?autoplay=${!needsDirectPlay}&muted=${!unmuted}`;
    iframe.allow = "autoplay; fullscreen; picture-in-picture; encrypted-media";
    iframe.allowFullscreen = true;
    iframe.title = `Kick-striimi: ${name}`;
    return iframe;
}

function waitForTwitchSdk() {
    if (window.Twitch?.Player) return Promise.resolve();
    if (twitchSdkPromise) return twitchSdkPromise;

    const sdkScript = document.getElementById("twitch-embed-sdk");
    if (!sdkScript) {
        return Promise.reject(new Error("Twitch-kirjaston latausskripti puuttuu."));
    }

    twitchSdkPromise = new Promise((resolve, reject) => {
        const timeoutId = window.setTimeout(() => {
            reject(new Error("Twitch-kirjaston lataus aikakatkaistiin."));
        }, 10000);

        const finish = () => {
            window.clearTimeout(timeoutId);
            if (window.Twitch?.Player) {
                resolve();
            } else {
                reject(new Error("Twitch-kirjasto latautui puutteellisesti."));
            }
        };

        sdkScript.addEventListener("load", finish, { once: true });
        sdkScript.addEventListener(
            "error",
            () => {
                window.clearTimeout(timeoutId);
                reject(new Error("Twitch-kirjastoa ei voitu ladata."));
            },
            { once: true },
        );
    }).finally(() => {
        twitchSdkPromise = null;
    });

    return twitchSdkPromise;
}

function createTwitchPlayer(id, name, unmuted) {
    const container = document.getElementById(`player-${id}`);
    if (!container) return;

    container.innerHTML = '<div class="player-loading" role="status">Ladataan Twitch-soitinta…</div>';

    waitForTwitchSdk()
        .then(() => {
            if (document.getElementById(`player-${id}`) !== container || !document.getElementById(id)) return;

            container.replaceChildren();
            players[id] = new window.Twitch.Player(`player-${id}`, {
                channel: name,
                width: "100%",
                height: "100%",
                parent: [window.location.hostname || "localhost"],
                muted: !unmuted,
                volume: 0.8,
            });
        })
        .catch(() => {
            if (document.getElementById(`player-${id}`) === container) {
                showPlayerError(
                    id,
                    "Twitch-soitinta ei voitu ladata. Tarkista verkkoyhteys ja yritä sivun lataamista uudelleen.",
                );
            }
        });
}

// =============================================================================
// STRIIMIEN HALLINTA
// =============================================================================

function openStream(
    name,
    platform,
    defaultChatOpen = false,
    defaultUnmuted = false,
    skipStorage = false,
) {
    const grid = document.getElementById("stream-grid");
    const id = `s-${platform}-${name.toLowerCase()}`;

    // Ei avata uudelleen jos jo auki
    if (document.getElementById(id)) return;

    // Mobiilissa suljetaan sivupalkki automaattisesti
    const sidebar = document.getElementById("main-sidebar");
    if ((window.innerWidth <= 768 || isCompactMobileLayout()) && !skipStorage && !sidebar.classList.contains("collapsed")) {
        toggleSidebar();
    }

    const wrapper = document.createElement("div");
    wrapper.className = "stream-wrapper";
    wrapper.id = id;
    wrapper.dataset.platform = platform;
    wrapper.draggable = true;

    if (defaultChatOpen) wrapper.classList.add("chat-open");

    // Raahaustapahtumien kuuntelijat
    wrapper.addEventListener("dragstart", handleDragStart);
    wrapper.addEventListener("dragover", handleDragOver);
    wrapper.addEventListener("dragenter", handleDragEnter);
    wrapper.addEventListener("dragleave", handleDragLeave);
    wrapper.addEventListener("dragend", handleDragEnd);
    wrapper.addEventListener("drop", handleDrop);

    const iconSrc =
        platform === "kick" ? "https://kick.com/favicon.ico" : "https://www.twitch.tv/favicon.ico";

    wrapper.innerHTML = `
        <div class="stream-header" style="cursor: move;">
            <div class="stream-title-group">
                <img src="${iconSrc}" class="header-icon">
                <span class="fav-alias">${name}</span>
            </div>
            <div class="stream-header-btns">
                <button class="icon-btn" aria-label="Avaa tai sulje chat" onclick="toggleChat('${id}', '${name}', '${platform}')" title="Avaa tai sulje chat">${svgIcons.chat}</button>
                <button class="icon-btn mute-btn" id="mute-btn-${id}" aria-label="Poista mykistys" onclick="toggleMute('${id}', '${name}', '${platform}')" title="Poista mykistys">${svgIcons.unmute}</button>
                <button class="icon-btn" aria-label="Lataa striimi uudelleen" onclick="refreshStream('${id}')" title="Lataa striimi uudelleen">${svgIcons.refresh}</button>
                <button class="icon-btn close-btn" aria-label="Sulje striimi" onclick="closeStream('${id}')" title="Sulje striimi">${svgIcons.close}</button>
            </div>
        </div>
        <div class="content-area">
            <div class="video-container" id="player-${id}"></div>
            <div class="chat-container" id="chat-${id}"></div>
        </div>`;

    const header = wrapper.querySelector(".stream-header");
    header.addEventListener("touchstart", handleTouchStart, { passive: false });
    header.addEventListener("touchmove", handleTouchMove, { passive: false });
    header.addEventListener("touchend", handleTouchEnd);
    header.addEventListener("touchcancel", handleTouchEnd);

    // Tallennetaan olemassa olevien striimien mute-tilat ennen layout-muutosta
    const savedMuteStates = {};
    document.querySelectorAll(".stream-wrapper").forEach((w) => {
        if (w.id === id) return;
        const muteBtn = document.getElementById("mute-btn-" + w.id);
        savedMuteStates[w.id] = muteBtn ? muteBtn.classList.contains("is-active") : false;
    });

    grid.appendChild(wrapper);
    updateStreamEmptyState();

    // Palautetaan mute-tilat heti layout-muutoksen jälkeen
    Object.entries(savedMuteStates).forEach(([streamId, wasUnmuted]) => {
        const platform = streamId.split("-")[1];
        const streamName = streamId.split("-").slice(2).join("-");
        if (platform === "kick" && !wasUnmuted) {
            // Kick ei tue mute-APIa -- ladataan uudelleen heti oikealla muted-arvolla
            const container = document.getElementById(`player-${streamId}`);
            if (container) {
                container.replaceChildren(createKickPlayerIframe(streamName));
            }
        }
    });

    // Twitchin mute-palautus viiveellä (API vaatii aikaa)
    setTimeout(() => {
        Object.entries(savedMuteStates).forEach(([streamId, wasUnmuted]) => {
            const platform = streamId.split("-")[1];
            if (platform === "twitch" && players[streamId]) {
                players[streamId].setMuted(!wasUnmuted);
            }
        });
    }, 300);

    // Ladataan chat heti jos palautetaan tallennetusta tilasta
    if (defaultChatOpen) {
        _loadChatIframe(id, name, platform);
    }

    // Luodaan videosoitin
    if (platform === "twitch") {
        createTwitchPlayer(id, name, defaultUnmuted);
    } else if (platform === "kick") {
        document.getElementById(`player-${id}`).appendChild(createKickPlayerIframe(name, defaultUnmuted));
    } else {
        showPlayerError(id, "Twitch-soitinta ei voitu ladata. Tarkista verkkoyhteys ja yritä sivun lataamista uudelleen.");
    }

    // Päivitetään nappien tilat (viiveellä että DOM on valmis)
    // HUOM: Koska selain pakottaa mute-tilan refreshin jälkeen,
    // näytetään aina muted-tila. Käyttäjä voi aktivoida äänen klikkaamalla.
    setTimeout(() => {
        const muteBtn = document.getElementById(`mute-btn-${id}`);
        if (muteBtn) {
            muteBtn.classList.toggle("is-active", defaultUnmuted);
            muteBtn.innerHTML = defaultUnmuted ? svgIcons.mute : svgIcons.unmute;
            muteBtn.setAttribute("aria-label", defaultUnmuted ? "Mykistä striimi" : "Poista mykistys");
            muteBtn.title = muteBtn.getAttribute("aria-label");
        }

        if (defaultChatOpen) {
            const chatBtn = wrapper.querySelector('button[onclick*="toggleChat"]');
            if (chatBtn) {
                chatBtn.classList.add("is-active");
            }
        }
    }, 0);

    // Lisätään neighbor-has-chat luokka jos jollain muulla on chat auki
    const anyChatOpen = document.querySelector(".stream-wrapper.chat-open") !== null;
    if (anyChatOpen && !defaultChatOpen) {
        wrapper.classList.add("neighbor-has-chat");
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
    updateStreamEmptyState();

    // Päivitetään neighbor-has-chat luokat
    const allWrappers = document.querySelectorAll(".stream-wrapper");
    const anyChatOpen = document.querySelector(".stream-wrapper.chat-open") !== null;

    allWrappers.forEach((w) => {
        if (anyChatOpen && !w.classList.contains("chat-open")) {
            w.classList.add("neighbor-has-chat");
        } else {
            w.classList.remove("neighbor-has-chat");
        }
    });

    updateActiveStreamsStorage();
}

function refreshStream(id) {
    const container = document.getElementById(`player-${id}`);
    const ifr = container.querySelector("iframe");

    if (ifr) {
        // Reload pakottamalla src tyhjäksi hetkeksi
        const src = ifr.src;
        ifr.src = "";
        setTimeout(() => (ifr.src = src), 10);
    } else if (players[id]) {
        players[id].pause();
        players[id].play();
    }
}

function toggleChat(id, name, platform) {
    const wrapper = document.getElementById(id);
    const chatContainer = document.getElementById(`chat-${id}`);
    const isOpening = !wrapper.classList.contains("chat-open");

    // Mobiilissa: sulje kaikki muut chatit ennen uuden avaamista
    if ((window.innerWidth <= 768 || isCompactMobileLayout()) && isOpening) {
        document.querySelectorAll(".stream-wrapper.chat-open").forEach((openWrapper) => {
            if (openWrapper.id !== id) {
                openWrapper.classList.remove("chat-open");
                // Poista vihreä väri myös napista
                const otherChatBtn = openWrapper.querySelector('button[onclick*="toggleChat"]');
                if (otherChatBtn) {
                    otherChatBtn.classList.remove("is-active");
                }
            }
        });
    }

    wrapper.classList.toggle("chat-open");
    schedulePlayerLayoutRefresh();
    window.setTimeout(schedulePlayerLayoutRefresh, 180);

    // Päivitetään chat-napin tila
    const chatBtn = wrapper.querySelector('button[onclick*="toggleChat"]');
    if (chatBtn) {
        chatBtn.classList.toggle("is-active", isOpening);
        chatBtn.setAttribute("aria-label", isOpening ? "Sulje chat" : "Avaa chat");
        chatBtn.title = chatBtn.getAttribute("aria-label");
    }

    // Iframe ladataan vasta ensimmäisellä avauksella
    if (isOpening && chatContainer.innerHTML === "") {
        _loadChatIframe(id, name, platform);
    }

    // Lisätään/poistetaan luokka muille streameille keskitystä varten
    const allWrappers = document.querySelectorAll(".stream-wrapper");
    const anyChatOpen = document.querySelector(".stream-wrapper.chat-open") !== null;

    allWrappers.forEach((w) => {
        if (anyChatOpen && !w.classList.contains("chat-open")) {
            w.classList.add("neighbor-has-chat");
        } else {
            w.classList.remove("neighbor-has-chat");
        }
    });

    updateActiveStreamsStorage();
}

// Sisäinen apufunktio -- ei kutsuta suoraan HTML:stä
function _loadChatIframe(id, name, platform) {
    const chatContainer = document.getElementById(`chat-${id}`);
    const parent = window.location.hostname || "localhost";
    const url =
        platform === "kick"
            ? `https://kick.com/popout/${name}/chat`
            : `https://www.twitch.tv/embed/${name}/chat?parent=${parent}&darkpopout`;

    if (platform === "kick") {
        chatContainer.innerHTML = `
                <div style="position:relative;height:100%;overflow:hidden;">
                    <iframe src="${url}" width="100%" height="100%" frameborder="0"></iframe>
                    <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:#0e0e10;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:center;z-index:5;">
                        <button onclick="window.open('https://kick.com/${name}/chat', '_blank')"
                                title="Avaa chatti Kickissä"
                                style="width:160px;height:38px;background:#53fc18;color:#000;border:none;border-radius:6px;font-weight:600;cursor:pointer;font-size:13px;white-space:nowrap;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:transform 0.2s,box-shadow 0.2s;"
                                onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 4px 12px rgba(0,0,0,0.4)';"
                                onmouseout="this.style.transform='translateY(0)';this.style.boxShadow='0 2px 8px rgba(0,0,0,0.3)';">
                            Avaa Kickissä
                        </button>
                    </div>
                </div>
            `;
    } else {
        chatContainer.innerHTML = `<iframe src="${url}" width="100%" height="100%" frameborder="0"></iframe>`;
    }
}

function toggleMute(id, name, platform) {
    const btn = document.getElementById(`mute-btn-${id}`);
    const muted = btn.classList.toggle("is-active");

    if (platform === "twitch" && players[id]) {
        players[id].setMuted(!muted);
        if (muted && window.matchMedia("(max-width: 768px)").matches) {
            const playback = players[id].play();
            if (playback && typeof playback.catch === "function") {
                playback.catch(() => {});
            }
        }
    } else {
        // Kick ei tue mute-APIa -- uudelleenladataan soitin eri muted-arvolla.
        const container = document.getElementById(`player-${id}`);
        container.replaceChildren(createKickPlayerIframe(name, muted));
    }

    btn.innerHTML = muted ? svgIcons.mute : svgIcons.unmute;
    btn.setAttribute("aria-label", muted ? "Mykistä striimi" : "Poista mykistys");
    btn.title = btn.getAttribute("aria-label");
    updateActiveStreamsStorage();
}

// =============================================================================
// SUOSIKIT
// =============================================================================

function setFormFeedback(message) {
    document.getElementById("form-feedback").textContent = message;
}

function setSettingsFeedback(message) {
    document.getElementById("settings-feedback").textContent = message;
}

function getValidFavorites(items) {
    if (!Array.isArray(items)) return [];

    const seen = new Set();
    return items.reduce((validFavorites, favorite) => {
        if (
            !favorite ||
            !["kick", "twitch"].includes(favorite.platform) ||
            typeof favorite.name !== "string" ||
            !CHANNEL_NAME_PATTERN.test(favorite.name)
        ) {
            return validFavorites;
        }

        const key = `${favorite.platform}:${favorite.name.toLowerCase()}`;
        if (seen.has(key)) return validFavorites;
        seen.add(key);

        validFavorites.push({
            name: favorite.name,
            platform: favorite.platform,
            isLive: false,
            viewers: 0,
            statusText: "...",
            title: "",
            statusError: false,
            autoOpen: favorite.autoOpen === true,
        });
        return validFavorites;
    }, []);
}

function getValidActiveStreams(streams) {
    if (!Array.isArray(streams)) return [];

    const seen = new Set();
    return streams.reduce((validStreams, stream) => {
        if (
            !stream ||
            !["kick", "twitch"].includes(stream.platform) ||
            typeof stream.name !== "string" ||
            !CHANNEL_NAME_PATTERN.test(stream.name)
        ) {
            return validStreams;
        }

        const key = `${stream.platform}:${stream.name.toLowerCase()}`;
        if (seen.has(key)) return validStreams;
        seen.add(key);
        validStreams.push({
            name: stream.name,
            platform: stream.platform,
            chatOpen: stream.chatOpen === true,
            unmuted: stream.unmuted === true,
        });
        return validStreams;
    }, []);
}

function getStoredActiveStreams() {
    try {
        return getValidActiveStreams(JSON.parse(localStorage.getItem(STORAGE_ACTIVE) || "[]"));
    } catch (e) {
        return [];
    }
}

function exportBackup() {
    const backup = {
        schemaVersion: BACKUP_SCHEMA_VERSION,
        app: APP_META.name,
        exportedAt: new Date().toISOString(),
        favorites: favorites.map(({ name, platform, autoOpen }) => ({ name, platform, autoOpen })),
        settings: {
            autoCloseOffline,
            sidebarCollapsed: localStorage.getItem("sidebar-collapsed") === "true",
        },
        activeStreams: getStoredActiveStreams(),
    };
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = `streamlayer-varmuuskopio-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setSettingsFeedback("Varmuuskopio ladattiin laitteellesi.");
}

async function importBackup(event) {
    const input = event.target;
    const file = input.files && input.files[0];
    if (!file) return;

    try {
        const backup = JSON.parse(await file.text());
        if (backup.schemaVersion !== BACKUP_SCHEMA_VERSION || !Array.isArray(backup.favorites)) {
            throw new Error("Tuntematon varmuuskopion muoto");
        }

        const importedFavorites = getValidFavorites(backup.favorites);
        const importedStreams = getValidActiveStreams(backup.activeStreams);
        const importedAutoCloseOffline = backup.settings?.autoCloseOffline === true;
        const importedSidebarCollapsed = backup.settings?.sidebarCollapsed === true;

        if (!window.confirm("Palautus korvaa nykyiset suosikit ja asetukset. Jatketaanko?")) return;

        favorites = importedFavorites;
        autoCloseOffline = importedAutoCloseOffline;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
        localStorage.setItem(STORAGE_SETTINGS, JSON.stringify({ autoCloseOffline }));
        localStorage.setItem(STORAGE_ACTIVE, JSON.stringify(importedStreams));
        localStorage.setItem("sidebar-collapsed", String(importedSidebarCollapsed));

        document.getElementById("auto-close-offline").checked = autoCloseOffline;
        applySidebarState(importedSidebarCollapsed);
        Object.keys(players).forEach((id) => delete players[id]);
        document.querySelectorAll(".stream-wrapper").forEach((wrapper) => wrapper.remove());
        updateStreamEmptyState();
        renderFavorites();
        restoreActiveStreams();
        updateAllStatuses();
        setSettingsFeedback("Varmuuskopio palautettiin.");
    } catch (error) {
        setSettingsFeedback("Varmuuskopiota ei voitu palauttaa. Valitse StreamLayerin JSON-tiedosto.");
    } finally {
        input.value = "";
    }
}

function saveFavorite(event) {
    if (event) event.preventDefault();
    const n = document.getElementById("channel-name").value.trim();
    const p = document.getElementById("platform-select").value;
    if (!CHANNEL_NAME_PATTERN.test(n)) {
        setFormFeedback("Käytä 1–50 kirjainta, numeroa, alaviivaa tai yhdysmerkkiä.");
        return;
    }
    if (favorites.find((f) => f.platform === p && f.name.toLowerCase() === n.toLowerCase())) {
        setFormFeedback("Kanava on jo suosikeissa tällä alustalla.");
        return;
    }

    favorites.push({
        name: n,
        platform: p,
        isLive: false,
        viewers: 0,
        statusText: "...",
        statusError: false,
        autoOpen: false,
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    document.getElementById("channel-name").value = "";
    setFormFeedback(`${n} lisättiin suosikkeihin.`);
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

function refreshFavoriteStatus(index, event) {
    event.stopPropagation();
    if (!favorites[index]) return;

    favorites[index].statusError = false;
    favorites[index].statusText = "Päivitetään…";
    renderFavorites();
    updateAllStatuses();
}

function toggleAutoCloseOffline(event) {
    autoCloseOffline = event.target.checked;
    localStorage.setItem(STORAGE_SETTINGS, JSON.stringify({ autoCloseOffline }));

    if (!autoCloseOffline) {
        Object.keys(offlineTrackers).forEach((id) => delete offlineTrackers[id]);
    }
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
        const isMobile = window.matchMedia("(max-width: 768px)").matches;
        streams.forEach((s) => {
            // Kick avataan mobiilissa aina ensin mykistettynä. Näin video käynnistyy
            // luotettavasti, ja äänen käyttöönotto palauttaa aiemman kaksivaiheisen
            // toiston: äänipainike avaa soittimen ääntä varten, sitten video käynnistetään.
            const restoreUnmuted = isMobile && s.platform === "kick" ? false : s.unmuted === true;
            openStream(s.name, s.platform, s.chatOpen, restoreUnmuted, true);
        });

        // Päivitetään neighbor-has-chat luokat palautuksen jälkeen
        const anyChatOpen = document.querySelector(".stream-wrapper.chat-open") !== null;
        if (anyChatOpen) {
            document.querySelectorAll(".stream-wrapper:not(.chat-open)").forEach((w) => {
                w.classList.add("neighbor-has-chat");
            });
        }
    } catch (e) {
        console.error("Virhe striimien palautuksessa:", e);
    }
}

// =============================================================================
// SIVUPALKKI
// =============================================================================

function applySidebarState(isCollapsed) {
    const sidebar = document.getElementById("main-sidebar");
    const main = document.querySelector("main");
    const btn = sidebar.querySelector(".toggle-sidebar-btn");

    sidebar.classList.toggle("collapsed", isCollapsed);
    sidebar.classList.toggle("landscape-open", isCompactMobileLayout() && !isCollapsed);
    if (main) main.classList.toggle("expanded", isCollapsed);
    if (btn) btn.textContent = isCollapsed ? "▶" : "◀";
}

window.addEventListener("resize", () => {
    refreshViewportAfterRotation();
    if (isCompactMobileLayout()) applySidebarState(true);
});
window.addEventListener("orientationchange", refreshViewportAfterRotation);
window.visualViewport?.addEventListener("resize", refreshViewportAfterRotation);

function toggleSidebar() {
    const sidebar = document.getElementById("main-sidebar");
    const main = document.querySelector("main");
    const btn = sidebar.querySelector(".toggle-sidebar-btn");

    // Tallennetaan mute-tilat ennen layout-muutosta
    const savedMuteStates = {};
    document.querySelectorAll(".stream-wrapper").forEach((w) => {
        const muteBtn = document.getElementById("mute-btn-" + w.id);
        savedMuteStates[w.id] = muteBtn ? muteBtn.classList.contains("is-active") : false;
    });

    let isCollapsed;
    if (isCompactMobileLayout()) {
        const isOpening = !sidebar.classList.contains("landscape-open");
        sidebar.classList.toggle("landscape-open", isOpening);
        sidebar.classList.toggle("collapsed", !isOpening);
        isCollapsed = !isOpening;
    } else {
        isCollapsed = sidebar.classList.toggle("collapsed");
    }

    if (main) main.classList.toggle("expanded", isCollapsed);
    if (btn) btn.textContent = isCollapsed ? "▶" : "◀";

    localStorage.setItem("sidebar-collapsed", isCollapsed);

    // Palautetaan mute-tilat layout-muutoksen jälkeen
    setTimeout(() => {
        Object.entries(savedMuteStates).forEach(([streamId, wasUnmuted]) => {
            const platform = streamId.split("-")[1];
            const streamName = streamId.split("-").slice(2).join("-");
            if (platform === "twitch" && players[streamId]) {
                players[streamId].setMuted(!wasUnmuted);
            } else if (platform === "kick" && !wasUnmuted) {
                const container = document.getElementById(`player-${streamId}`);
                if (container) {
                    container.replaceChildren(createKickPlayerIframe(streamName));
                }
            }
        });
    }, 200);
}

// =============================================================================
// TIETOA-MODAL
// =============================================================================

function openSettings() {
    document.getElementById("settings-modal").style.display = "flex";
}

function closeSettings(event) {
    const modal = document.getElementById("settings-modal");
    if (event.target === modal || event.target.classList.contains("modal-close")) {
        modal.style.display = "none";
    }
}

function openAbout() {
    document.getElementById("app-name").textContent = APP_META.name;
    document.getElementById("app-version").textContent = `Versio ${APP_META.version}`;
    document.getElementById("app-author").textContent = `Tekijä: ${APP_META.author}`;
    document.getElementById("app-date").textContent = `Päivitetty: ${APP_META.buildDate}`;
    document.getElementById("app-kick").href = APP_META.kick;
    document.getElementById("app-repo").href = APP_META.repo;
    document.getElementById("about-modal").style.display = "flex";
}

function closeAbout(event) {
    const modal = document.getElementById("about-modal");
    // Suljetaan taustaa klikatessa tai sulkupainikkeesta
    if (event.target === modal || event.target.classList.contains("modal-close")) {
        modal.style.display = "none";
    }
}

// =============================================================================
// RAAHAUS (DRAG & DROP)
// =============================================================================

let draggedElement = null;
let dragCounter = 0;
let touchDraggedElement = null;
let touchDragStarted = false;
let touchStartY = 0;

function handleTouchStart(event) {
    if (event.touches.length !== 1 || event.target.closest("button")) return;

    touchDraggedElement = this.closest(".stream-wrapper");
    touchStartY = event.touches[0].clientY;
    touchDragStarted = false;
}

function handleTouchMove(event) {
    if (!touchDraggedElement || event.touches.length !== 1) return;

    const touch = event.touches[0];
    if (!touchDragStarted && Math.abs(touch.clientY - touchStartY) < 8) return;

    touchDragStarted = true;
    event.preventDefault();
    touchDraggedElement.classList.add("dragging");

    const target = document.elementFromPoint(touch.clientX, touch.clientY)?.closest(".stream-wrapper");
    if (!target || target === touchDraggedElement) return;

    const targetBounds = target.getBoundingClientRect();
    if (touch.clientY < targetBounds.top + targetBounds.height / 2) {
        target.before(touchDraggedElement);
    } else {
        target.after(touchDraggedElement);
    }
}

function handleTouchEnd() {
    if (!touchDraggedElement) return;

    touchDraggedElement.classList.remove("dragging");
    if (touchDragStarted) updateActiveStreamsStorage();
    touchDraggedElement = null;
    touchDragStarted = false;
}

function handleDragStart(e) {
    draggedElement = this;
    this.classList.add("dragging");
    document.body.classList.add("is-dragging");
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", "");
}

function handleDragOver(e) {
    if (e.preventDefault) e.preventDefault();
    return false;
}

function handleDragEnter(e) {
    e.preventDefault();
    dragCounter++;
    if (this !== draggedElement) this.classList.add("drag-over");
}

function handleDragLeave() {
    dragCounter--;
    if (dragCounter === 0) this.classList.remove("drag-over");
}

function handleDragEnd() {
    this.classList.remove("dragging");
    document.body.classList.remove("is-dragging");
    document.querySelectorAll(".stream-wrapper").forEach((el) => el.classList.remove("drag-over"));
}

function handleDrop(e) {
    e.stopPropagation();
    e.preventDefault();
    dragCounter = 0;
    this.classList.remove("drag-over");

    if (draggedElement !== this) {
        const grid = document.getElementById("stream-grid");
        const children = Array.from(grid.children);
        const fromIndex = children.indexOf(draggedElement);
        const toIndex = children.indexOf(this);

        if (fromIndex < toIndex) this.after(draggedElement);
        else this.before(draggedElement);
        updateActiveStreamsStorage();
    }
    return false;
}

// =============================================================================
// KÄYNNISTYS JA AJASTIMET
// =============================================================================

syncViewportHeight();
loadInitialData();
setInterval(updateAllStatuses, 60000);
