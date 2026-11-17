# CLAUDE.md – Le Grand Fromage (arbetsnamn)

Svara Patrik på svenska. Spelets text och kommentarer i koden är på svenska; identifierare på engelska/franska.

## Vad det här är

Ett multiplayerspel för webben (dator först, sedan Steam och mobil): åtta spelare på en liten ö eller ett torg i Paris, **en ost** på kullen i mitten.
Den som **bär osten längst total tid** under en 5-minutersmatch vinner. Alla kan tacklas, skjutas och sprängas – allt utom osten.
Blir man träffad tappar man osten och börjar om vid kusten. Vapnet väljs **en gång per match** i lobbyn och används vid varje återuppståndelse.
Humor går före realism: "mjuka vapen" (baguett, stekpanna, purjolök …), fula-roliga figurer, franskt tema (marinière-tröjor, boulangeri, Eiffeltorn, Parisduva).
Inspiration: ostrullartävlingen på Cooper's Hill, Fortnite, "How to Fish". Vy: tredje person uppifrån, liten minikarta som visar osten.

Utvecklare: Patrik, Resolution Games. Detta är en prototyp (v0.2) för att känna på idén med kompisar, inte en färdig produkt.
v0.2 lade till: två banor (ön och Torget i Paris) med banväljare i lobbyn, valbart botantal (0–7), lövblåsaren som riktig KO-blåsare ("gale"-mätare), svart sikte och slutskärm med prispall.

## Designpelare (ändra inte utan att fråga)

1. **Ett vapen per match**, valt i lobbyn, hemligt tills "avslöjandet" precis före start. Inget byte under matchen.
2. **Varje träff är en KO**: tappa osten, kort respawn vid kusten längst från osten, kort skydd. Ingen hälsa, inga mellanlägen.
3. **Osten är oförstörbar** och poängen är bara sekunder som bärare. Bäraren är lite långsammare, kan tackla men inte använda vapnet.
4. **Allt annat går sönder** (hus, torn, träd, tunnor, caféer) – förstörelse är en del av kaoset.
5. **Skratt före polish**: tydliga, överdrivna effekter och onomatopoetiska texter (BAGUETTE!, SPLOTCH!, COUIC!). Figurerna får gärna se hemsnickrade ut.
6. **Kort och läsbart**: 5 minuter, ön korsas på ~6–7 sekunder, alla ser osten på minikartan.
7. **Skrivbord först**: tangentbord + mus. Pekstyrning är medvetet uppskjuten – bygg inte in mobilantaganden än, men håll UI skalbart.

## Arkitektur i korthet

Statisk webbsida, **ingen byggprocess**. Vanliga `<script>`-taggar (ingen modul-/bundler-setup, fungerar även via `file://` och GitHub Pages).
Laddningsordning i `index.html`: `vendor/peerjs.min.js`, `cfg`, `sim`, `bots`, `net`, `audio`, `art`, `render`, `ui`, `main`.

| Fil | Ansvar |
| --- | --- |
| `js/cfg.js` | `CFG` (alla balansvred), `WEAPONS`/`WEAPON_ORDER`, `SKINS`, `MAPS`/`MAP_ORDER`, `makeMap(seed, kind)` (deterministiska banor: `ile` och `place`), `botCount`, hjälpfunktioner. **Ingen DOM.** |
| `js/sim.js` | `Sim`: 60 Hz fast steg, rörelse/kollision, tackling, vapenlogik, ost, poäng, faser (reveal 5 s → count 3 s → play → end), snapshot-kodek `encode/decode/lerpView`. **Ingen DOM.** |
| `js/bots.js` | Bot-AI (ingen DOM). Används för solo, fyllnad och när en klient lämnar mitt i matchen. |
| `js/net.js` | `HostSession` (värd eller solo) och `ClientSession`. Värd-auktoritativt över WebRTC (PeerJS), plus `?net=local` via BroadcastChannel för tester. |
| `js/audio.js` | WebAudio: syntetiserade effekter och musette-vals. Inga ljudfiler. `SFX.play(name, vol)`. |
| `js/art.js` | All grafik som kod: figurer (`drawCharacter`), vapenikoner, ost, projektiler, hus, torn, träd, tunnor, caféer samt torgets stånd, kolonner, karusell och kiosker. |
| `js/render.js` | `Renderer`: canvas 2D, cachad markbild per bana (`buildGround` → `buildIslandGround`/`buildPlaceGround`; bara den aktuella banans bild hålls i minnet), `SEA_THEME`, sorterade stående sprites, hav, partiklar, flytande texter, kameraskak, minikarta och banförhandsbilder (`drawMapShapes`/`drawMapThumb`), pil till osten, krona/porträtt till slutskärmen. |
| `js/ui.js` | DOM-UI: titel, lobby (banväljare, botantal), vapenkort, HUD, händelseflöde, resultat (prispall, konfetti, tabell), paus. Liten `Store` (localStorage bara i toppfönster, med try/catch). |
| `js/main.js` | `Input` (tangentbord/mus → edge-räknare), `App` (tillstånd, huvudloop, hash/rumskod). |

### Regler som håller ihop det

- **`cfg.js`, `sim.js`, `bots.js` får aldrig röra DOM/`window`.** De laddas i Node via `vm` av `tools/test-core.js`.
- **Värden är auktoritativ.** Klienter skickar indata (~30 Hz) och får snapshots (30 Hz); klienten interpolerar ~100 ms bakåt och förutsäger bara sin egen spelare med samma `motionStep`/`collideObstacles` som simen, med mjuk rekonciliering.
- Indata är `{mx,my,a,ad,tk,wp,wr,wd}`: rörelse, siktvinkel/avstånd, och *edge-räknare* (`tk` tackla, `wp` vapen tryckt, `wr` släppt) plus hållflagga `wd`. Räknare är kumulativa; simen sätter baslinje vid `startPlay`.
- Banan är **deterministisk** från ett frö och en bansort: `makeMap(seed, kind)`. Värd och klienter bygger samma bana (på torget är allt fast utom tunnorna). Matchstarten (`startInfo`) bär `{seed, map, matchSec, players}`; inställningarna är `{matchSec, bots, map}`.
- Varje banobjekt har samma gränssnitt: `kind, seed, obstacles, spawns, coastR(th), fleeMargin, pond, onLand(x,y), inPond(x,y,pad)`; ön har dessutom `pier`/`village`, torget `court` (och `pier: null`, `village: null`). Sim, bottar och renderare använder `map.coastR`, aldrig den globala `coastR` (som bara är öns kustfunktion).
- Renderaren tar ett *view*-objekt: `{t, phase, pt, mt, players:[{id,x,y,vx,vy,a,st,inv,carry,guard,blow,dash,daze,slow,over,sw,e1,wcd,m,stink,score,kos,hits,best,tk}], cheese:{x,y,vx,vy,st,by,air,rot}, proj:[…], areas:[…], dead:Set}`. För KO:ade spelare är `e1` kvarvarande KO-tid; för luftburna är `e1` progress 0..1.
- Händelser (`ev`) är små arrayer som `['ko',victim,by,cause,x,y,kx100,ky100]`, `['shoot',…]`, `['boom',kind,x,y,r]`, `['crash',obId,x,y,type]` med flera – se `Sim.ev(...)` och `Renderer.onEvents`. Nya effekter läggs till i `onEvents`.
- Ändrar du snapshot-format, indataformat eller matchstart/inställningar: höj `PROTO_VERSION` i `cfg.js` (nu 2) så att gamla och nya klienter inte blandas. Snapshot-kodekens spelararray har index 18 = lövblåsarens `gale`×100.
- Delad kod mellan värd och klient (rörelse, kollision) ligger i `sim.js`; duplicera den inte.

## Kör, testa, felsök

```sh
node tools/serve.js              # http://localhost:8080/
node tools/test-core.js          # logiktester + 24 botmatcher (KO-statistik, bärtider)
node tools/test-core.js 60 --stats
```

Webbläsartester (Playwright + Chromium, `npm i playwright`): `tools/pw-smoke.js` (hela flödet + skärmdumpar), `tools/pw-weapons.js` (varje vapen), `tools/pw-multi.js` (två flikar, `?net=local`, inkl. banval och botantal), `tools/pw-peer.js` (riktig WebRTC mot lokal signalserver: `npm i peer`, bind till `127.0.0.1`), `tools/pw-maps.js` (banväljare + skärmdumpar av torget), `tools/pw-results.js` (slutskärmen i flera storlekar), `tools/pw-latejoin.js` (sen anslutning som åskådare), `tools/pw-gallery.js` (konstgalleri).
Kör minst `test-core.js` och `pw-smoke.js` innan du säger att något fungerar. Titta på skärmdumparna – renderingsfel syns inte i konsolen.

Adressparametrar: `?net=local`, `?lag=ms`, `?debug=1`, `?peerhost=…&peerport=…&peerpath=…&peersecure=0`, `#ABCD`/`?room=ABCD` för att gå med direkt.

## Konventioner

- Ingen ny beroendehantering utan att fråga. `vendor/peerjs.min.js` (1.5.5, MIT) är det enda externa. Ingen build, ingen transpilering.
- `'use strict'`, vanlig ES2020-syntax, inga moduler. UI-text på svenska, korta och roliga.
- **Ingen `localStorage` direkt** – gå via `Store` i `ui.js` (den är skyddad när sidan körs i en iframe/förhandsvisning).
- Balans är **data**: sifferändringar görs i `CFG`/`WEAPONS`, inte i logiken. Kör botmatcherna efter ändring och läs KO-orsaker/ostbärare-statistiken.
- Vill du lägga till en **bana**: lägg den i `MAPS`/`MAP_ORDER` och bygg den i `cfg.js` (följ gränssnittet ovan, kontrollera överlapp, kulle, startplatser och `onLand`), nya hindertyper i `OB_TYPES` + `art.js` (`drawObstacle`, `obstacleBase`, `drawRubble`), markbild i `render.js` (`buildGround`-dispatch), vattenfärg i `SEA_THEME`, form för minikarta/banväljare i `drawMapShapes`, sprites i `buildSprites`, kraschfärger i `onEvents`, och en test i `test-core.js` (se avsnittet "Karta: Torget i Paris") samt `pw-maps.js`.
- Vill du lägga till ett vapen: data i `WEAPONS` (+ `WEAPON_ORDER`), beteende i `Sim` (se `weaponLogic`/`fireShots`/…), ikon och animation i `art.js` (`drawWeaponIcon`, `drawCharacter`), effekter i `render.js` (`onEvents`), ljud i `audio.js`, bot-användning i `bots.js`, test i `test-core.js`.
- Små, tydliga commits. Pusha aldrig till GitHub utan att Patrik bett om det.

## Driftsättning

GitHub Pages: publikt repo, grenen `main`, rotmappen (Settings → Pages). `.nojekyll` finns. Adress: `https://<användare>.github.io/<repo>/`.
Ingen server behövs; PeerJS gratis molntjänst används för signalering (peer-id `osten-<KOD>`).

## Kända begränsningar (läs innan du felsöker)

- **Riktig anslutning över internet via PeerJS molntjänst är inte provad** (byggmiljön kunde bara nå en lokal signalserver, där WebRTC fungerade). Första verkliga test med kompisar: kolla konsolen (`?debug=1`).
- Bara STUN. Strikta nät/symmetrisk NAT kräver en TURN-server (se `iceServers` i `net.js`).
- Värden måste ha fliken synlig. Bakgrundsflikar strypas av webbläsaren; en Web Worker-ticker (`App.startTicker`/`bgTick`) försöker hålla värdsimen igång men är bäst effort och används inte i sololäge.
- Ingen återanslutning: lämnar en klient mitt i matchen tar en bot över; lämnar värden går alla till startskärmen.
- Esc-menyn pausar bara sololäge.
- Balansen är kalibrerad mot botmatcher, inte människor.

## Nästa steg (förslag, i ungefärlig ordning)

1. **Spela med riktiga människor** (Patrik + kompisar) och anteckna: vilka vapen är för bra/dåliga, är ön lagom stor, är 5 minuter rätt, blir det kul eller bara kaos? Justera `CFG`/`WEAPONS`.
2. Härda nätverket: egen signalserver eller TURN-fallback, tydligare felmeddelanden, återanslutning.
3. Rundor/matchinställningar (poäng över flera matcher, lagläge, fler banor än ön och torget, väder).
4. Mer innehåll: fler vapen, fler franska landmärken och kartor, kosmetika (hattar, tröjor), ljud som riktiga filer.
5. Pekstyrning + skalbar UI för mobil (virtuell joystick, siktknapp, automatisk sikt).
6. Steam: paketera som skrivbordsapp (t.ex. Electron/Tauri) eller bygg om i spelmotor; dedikerade servrar istället för värd-i-webbläsare.
