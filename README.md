# StreamLayer - Multistream

<p align="center">
  <img src="https://img.shields.io/github/stars/ipappa74/streamlayer?style=flat&color=007aff&label=Stars" />
  <img src="https://img.shields.io/github/issues/ipappa74/streamlayer?color=007aff&label=Issues" />
  <img src="https://img.shields.io/github/last-commit/ipappa74/streamlayer?color=007aff&label=Last%20Commit" />
  <img src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-007aff" />
  <img src="https://img.shields.io/badge/UI-StreamLayer_Blue-007aff?logo=airplayvideo&logoColor=white" />
</p>

## 🎯 Yleiskuvaus

**StreamLayer** on moderni, nopea ja täysin responsiivinen monistriimaustyökalu, joka on suunniteltu erityisesti Twitch- ja Kick.com-alustojen käyttäjille. Se tarjoaa minimalistisen ja tehokkaan käyttöliittymän useiden lähetysten samanaikaiseen seuraamiseen ilman raskaita sovellusasennuksia.

Projekti on toteutettu **Zero Backend** -periaatteella – se hyödyntää vain puhdasta HTML5, CSS3 ja Vanilla JavaScript -teknologiaa.

---

## 🚀 Ominaisuudet

### 🎥 Monialustatuki & Hallinta
- **Twitch & Kick Integraatio:** Lisää ja seuraa molempien alustojen striimejä saumattomasti rinnakkain. 
- **Automaattinen Grid-asettelu:** Älykäs asettelu, joka optimoi tilankäytön striimien määrän mukaan.  
- **Drag & Drop:** Järjestele striimi-ikkunoita raahaamalla ne haluamaasi järjestykseen.

### 📱 Täysi Mobiilioptimointi
- **Responsiivinen UI:** Mobiililaitteilla striimit asettuvat automaattisesti allekkain parhaan katselukokemuksen takaamiseksi.
- **Mobiilivalikko:** Erillinen, helppokäyttöinen sivupalkki ja sulkemispainikkeet, jotka on optimoitu kosketuskäyttöön. 
- **Älykäs Chat:** Chatti on mobiilissa oletuksena piilotettu ja se aukeaa videon alapuolelle viemättä tilaa leveyssuunnassa.

### 🔇 Mute / Unmute – tila säilyy
- Jokaisella slotilla oma mute‑tila  
- Tallentuu localStorageen  
- Uusi striimi aloittaa aina mutella (oletus)

### ⭐ Suosikit & Automaatio
- **Älykäs suosikkilista:** Tallenna usein katsomasi kanavat. LIVE-tilassa olevat kanavat nousevat listan kärkeen.
- **Auto-Open:** Mahdollisuus asettaa kanava avautumaan automaattisesti heti, kun se aloittaa lähetyksen.  
- **Pilleripainikkeet:** Modernit ja selkeät kytkimet auto-open-toiminnallisuuden hallintaan.

### 🟢 Reaaliaikainen Status
- **LIVE-indikaattorit:** Punainen status-piste ja animoidut tekstit ilmoittavat heti, kun striimaaja on livenä.  
- **Katsojamäärät:** Reaaliaikaiset katsojatiedot haetaan suoraan APIn kautta ja päivitetään säännöllisesti.

---

## 🧩 Tekninen rakenne

### Käytetyt teknologiat
- **HTML5 & CSS3:** StreamLayer Blue -teema, jossa hyödynnetään Glassmorphism-efektejä ja neon-korostuksia.
- **Vanilla JavaScript:** Kevyt ja nopea toiminnallisuus ilman ulkoisia kirjastoriippuvuuksia.
- **API-integraatiot:** Twitch Embed SDK, Kick Player, DecAPI ja Kick API live-tietojen hakuun.

### Tallennus (localStorage)
- Sovellus tallentaa suosikkisi, kanavien järjestyksen, mute-tilat ja chat-asetukset suoraan selaimen muistiin.

---

## 🛠 Käyttö

### 1. Lisää striimi
- Valitse alusta (Kick, Twitch) 
- Syötä käyttäjän/kanavan nimi  
- Klikkaa **Lisää listalle**
- Listan päällimäiseksi tulee livenä olevat katsojamäärän mukaan
- Punaisesta "ruksista" voit poistaa suosikin

### 2. Avaa striimi
- Klikkaa tallentamaasi **Suosikkia**  
- Striimi avautuu oikealle  

### 3. Chat
- Klikkaa **Chat**-nappia
- Chat avautuu oikealle (mobiilissa alas)
  
### 4. Mute / Unmute
- Paina **Mute / Unmute**  
- Tila tallentuu ja säilyy reloadissa

### 5. Drag & Drop
- Vedä slottia → järjestä uudelleen  
- Kaikki tilat siirtyvät mukana
