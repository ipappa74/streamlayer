<p align="right">
  <img src="https://img.shields.io/badge/License-CC_BY--NC--SA_4.0-007aff" />
  <img src="https://img.shields.io/badge/UI-StreamLayer_Blue-007aff?logo=airplayvideo&logoColor=white" />
</p>

---

# StreamLayer

Nykyinen versio: **1.8.4** · Päivitetty: **2026-08-21**

## 🎯 Yleiskuvaus

**StreamLayer** on kevyt ja responsiivinen monistriimaussovellus Twitch- ja Kick-lähetysten seuraamiseen. Lisää kanavat suosikeiksi, avaa useita lähetyksiä rinnakkain ja hallitse chattia sekä ääntä striimikohtaisesti ilman erillistä palvelinsovellusta.

Projekti on toteutettu staattisena HTML-, CSS- ja JavaScript-sovelluksena. Suosikit ja asetukset säilyvät selaimessa, ja niistä voi tehdä ladattavan varmuuskopion.

---

## 🚀 Ominaisuudet

### 🎥 Monialustatuki ja hallinta

- **Twitch ja Kick:** Lisää saman niminen kanava kummaltakin alustalta omaksi suosikikseen.
- **Mukautuva asettelu:** Yksi avoin striimi käyttää koko pääalueen. Useat striimit asettuvat ruudukoksi.
- **Raahaus:** Järjestä avoimia striimejä vetämällä. Avoimien striimien järjestys säilyy selaimessa.
- **Tyhjät näkymät:** Sovellus opastaa, kun suosikkeja tai avoimia striimejä ei vielä ole.

### 📱 Mobiilikäyttö

- Striimit asettuvat mobiilissa allekkain ja chatti avautuu videon alapuolelle.
- Sivupalkki sulkeutuu, kun avaat striimin.
- Mobiiliselaimet voivat rajoittaa äänekästä automaattista toistoa. Kickin ja Twitchin ääntä hallitaan striimikortin äänipainikkeesta myös mobiilissa.

### 🔇 Ääni ja chat

- Jokaisella striimillä on oma chat- ja äänensäätönsä.
- Uusi striimi alkaa mykistettynä.
- Avoimien striimien chat- ja äänitilat palautetaan selaimen muistista.
- Kuvakepainikkeilla on selitteet ja ruudunlukijanimet.

### ⭐ Suosikit, automaatio ja asetukset

- LIVE-tilassa olevat suosikit nousevat listan alkuun katsojamäärän mukaan.
- Auto-open avaa valitun kanavan, kun se on livenä.
- **Asetukset**-ikkunasta voi ottaa käyttöön offline-striimin automaattisen sulkemisen minuutin kuluttua. Asetus on oletuksena pois päältä.
- Asetukset-ikkunasta voi viedä ja palauttaa JSON-varmuuskopion.

### 🟢 Live-tilanne

- Live-merkintä, lähetyksen otsikko ja katsojaluku päivittyvät minuutin välein.
- Kickin tiedot haetaan Kickin kanavarajapinnasta ja Twitchin tiedot DecAPI-palvelusta.
- Haku keskeytyy kahdeksan sekunnin kuluttua ja sitä yritetään kerran uudelleen, jos verkkopyyntö epäonnistuu.

---

## 🧩 Tekninen rakenne

### Käytetyt teknologiat

- **HTML5 ja CSS3:** Tumma StreamLayer Blue -teema, responsiivinen ruudukko ja popup-ikkunat.
- **Vanilla JavaScript:** Sovelluslogiikka ilman rakennusvaihetta tai npm-riippuvuuksia.
- **Upotukset ja rajapinnat:** Twitch Embed SDK, Kick Player, DecAPI ja Kickin kanavarajapinta.

### Tallennus ja varmuuskopiointi

- Sovellus tallentaa suosikit, asetukset, avoimet striimit, järjestyksen, chatin ja äänen tilat selaimen `localStorage`-muistiin.
- Selaindatan tyhjennys poistaa nämä tiedot. Vie ensin JSON-varmuuskopio **Asetukset**-ikkunasta.
- Varmuuskopio sisältää suosikit, auto-open-valinnat, asetukset ja avoimet striimit. Palautus korvaa nykyiset tiedot vahvistuksen jälkeen.

---

## 🛠 Käyttö

### 1. Lisää suosikki

- Valitse Kick tai Twitch.
- Syötä kanavan käyttäjänimi ja valitse **Lisää listalle**.
- Avaa kanava klikkaamalla suosikkia.
- Poista suosikki punaisesta sulkupainikkeesta.

### 2. Hallitse striimiä

- Käytä striimikortin painikkeita chatin avaamiseen, äänen säätämiseen, lataamiseen uudelleen ja sulkemiseen.
- Vedä striimikortteja haluamaasi järjestykseen. Mobiilissa raahaus aloitetaan striimikortin otsikkopalkista, ei videosta tai painikkeista.

### 3. Muuta asetuksia ja tee varmuuskopio

- Avaa sivupalkin alareunasta **Asetukset**.
- Valitse halutessasi offline-striimien automaattinen sulkeminen.
- Vie JSON-varmuuskopio ennen selaindatan tyhjentämistä ja palauta se tarvittaessa samasta ikkunasta.

## Käynnistys

- Avaa [index.html](index.html) selaimessa tai julkaise projektin tiedostot staattisena sivustona.
- Twitch-upotus tarvitsee tuotannossa HTTPS-osoitteen ja oikean verkkotunnuksen `parent`-asetukseksi.

## Huomioitavaa

- DecAPI on ulkoinen palvelu. Jos se ei vastaa, Twitchin live-tiedot voivat näkyä virhetilana.
- Kickin ja Twitchin upotusten toiminta, erityisesti mobiiliääni, riippuu myös selaimen autoplay-säännöistä ja palveluiden omista rajoituksista.
