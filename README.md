# Le Grand Fromage – Osten på ön

*Arbetsnamn. Prototyp v0.4 – spelbar i webbläsaren på dator, 1–8 spelare, tre banor.*

En ostrullartävling som gått alldeles för långt. Åtta fransmän i randiga tröjor står på en liten ö (eller på ett torg i Paris med Seine runt om, eller på fyra öar med kanaler och broar) med **en enda ost** i mitten.
Den som **bär osten längst tid totalt** under de fem minuterna vinner. Du kan tackla, skjuta, spränga och blåsa bort alla andra – men aldrig osten. **Den som bär osten kan varken tackla eller slåss**, bara springa (och är lite långsammare).
Blir du träffad tappar du osten och börjar om från kanten. Vapnet väljer du i lobbyn – ångrar du dig kan du **låsa upp och byta** så länge matchen inte har startat – och har det sedan med dig vid varje återuppstånd.
Värden väljer **bana**, matchlängd och hur många **botar** som ska vara med.

Spelet är ren HTML + JavaScript (canvas). Ingen byggprocess, inga beroenden att installera, all grafik och allt ljud skapas i kod.

---

## 1. Spela direkt

| Sätt | Gör så här |
| --- | --- |
| Dubbelklicka | Öppna `index.html` i Chrome, Edge eller Firefox. Fungerar för **Spela själv mot bottar**. Länkar till rum går inte att dela från en lokal fil. |
| Lokal server | `node tools/serve.js` (eller `npm start`) och öppna `http://localhost:8080/` (kräver Node 18+). |
| Webbadress | Lägg ut filerna på GitHub Pages (se nedan) – det är så du spelar med kompisar. |

## 2. Lägg ut spelet och spela med kompisar (GitHub Pages)

1. Skapa ett repo på GitHub. Använd **publikt** repo – gratis GitHub Pages kräver det (privata repon kräver betalplan).
2. Lägg in hela innehållet i den här mappen i repot, på grenen `main` (via Claude Code, GitHub Desktop eller `git push`).
3. På GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a branch → Branch: `main` och mapp `/ (root)` → Save.**
4. Efter någon minut finns spelet på `https://<ditt-användarnamn>.github.io/<repo-namn>/`.
5. Öppna länken, skriv ditt namn och tryck **Skapa rum**. Kopiera rumslänken i lobbyn och skicka den till kompisarna. De klickar på länken, skriver sitt namn och är med.
   Länken ser ut som `…/le-grand-fromage/#ABCD` – de fyra bokstäverna är rumskoden. Kompisar kan också skriva koden manuellt under **Gå med i rum**.
6. Alla väljer vapen i lobbyn och trycker **Lås**. Värden väljer bana (Osten på ön, Torget i Paris eller Fyra öar), matchlängd och antal botar (0–7, en ensam spelare får alltid minst en motståndare) och trycker **Starta**. De andra ser valen men kan inte ändra dem.

Filen `.nojekyll` gör att GitHub Pages serverar filerna precis som de är.

### Flytta till Claude Code

Packa upp mappen, öppna en terminal i den och starta Claude Code (`claude`). Den läser `CLAUDE.md` automatiskt och vet då hur spelet är byggt. Exempel på första uppdrag:

> Läs CLAUDE.md. Initiera ett git-repo, skapa ett publikt GitHub-repo som heter `le-grand-fromage`, pusha och aktivera GitHub Pages (grenen main, rotmappen). Ge mig länken när den är uppe.

Vill du göra det för hand:

```sh
git init -b main
git add .
git commit -m "Le Grand Fromage: första prototypen"
gh repo create le-grand-fromage --public --source=. --push   # kräver GitHub CLI: gh auth login
```

---

## 3. Kontroller (dator)

| Tangent / mus | Gör |
| --- | --- |
| `W` `A` `S` `D` eller piltangenter | Gå |
| Mus | Sikta (kameran tittar lite åt det hållet) |
| Vänsterklick eller `E` / `J` | Använd vapnet (håll inne för t.ex. stekpannans skydd och lövblåsaren) |
| `Mellanslag`, `Shift` eller högerklick | Tackla (kort sprint som slår ut den du träffar, tar en stund att ladda om). Går inte medan du bär osten |
| `M` | Ljud av/på |
| `Esc` | Meny. Pausar matchen i sololäge – i flerspelarläge går den vidare för de andra |

På skärmen: tid och poängtavla uppe, **minikarta** nere till vänster som visar var osten är (och du), en pil i kanten när osten är utanför bild, och två rundlar nere i mitten som visar när vapnet och tacklingen är laddade (båda tonas ned och märks "Bär osten" medan du bär osten). Siktet vid musen är svart med en tunn ljus kant, så att det syns på både gräs, sten och vatten.

## 4. Reglerna

- **Poäng = sekunder du bär osten.** Högst summa efter fem minuter vinner (lobbyn kan också ställas på 1 eller 2 minuter). Vinnaren hyllas på ett prispall med krona och konfetti, och tabellen bredvid visar alla tider.
- Osten kan inte förstöras. Allt annat kan det: hus, tornet, caféborden, träden, tunnorna – och på torget marknadsstånden, kolonnerna, karusellen och bouquinisternas lådor.
- **Varje träff är en KO**: du tappar osten, ligger ner en kort stund och återuppstår vid kusten längst bort från osten, med några sekunders skydd.
- **Ostbäraren kan varken tackla eller använda sitt vapen** (från 0.3) – bara springa, väja och hoppas. Det är det som gör att osten går att ta. En tackling som pågår när man kör över osten avbryts. Vill du ha tillbaka den gamla regeln: `carrierTackle: true` i `js/cfg.js`.
- **Vapnet kan bytas i lobbyn** tills matchen startar: efter "Lås in" finns en knapp "Lås upp och byt vapen". Värden kan inte starta förrän alla människor har låst igen. Efter start ligger vapnet fast.
- Till fots kan man aldrig gå ut i vattnet (man glider längs kanten), men blir man knuffad, blåst eller studsad ut drunknar man efter någon sekund – i havet, i Seine eller i en kanal. Hamnar osten i vattnet dyker den upp igen på kullen efter fem sekunder (på Fyra öar på mitten-ön).
- Ostkullen i mitten (på torget ett stenpodium) lutar: osten rullar sakta utåt om ingen håller i den. På Fyra öar finns ingen kulle: osten ligger stilla på mitten-ön.
- Den som hållit osten länge får besök av **Parisduvan**.

### Banorna

| Bana | Så här är den |
| --- | --- |
| **Osten på ön** (`ile`) | Blobformad ö med by (boulangeri, café, fromagerie, maison), Eiffeltorn, damm, brygga och platanträd. Hindren slumpas ut från ett frö (alla ser samma ö). |
| **Torget i Paris** (`place`) | Kullerstenstorg (avrundad fyrkant) med trikolorkant och Seine runt om. Marknadsstånd (ost, frukt, bröd, blommor), Morris-kolonner, café, karusell, Eiffeltorn, bouquinister, bassäng med leksaksbåtar och en pétanquebana. Spegelsymmetrisk så att ingen startplats har fördel; bara tunnorna slumpas. |
| **Fyra öar** (`canal`) | Fyra likadana öar (kullersten och park omväxlande) åtskilda av 100 enheter breda kanaler, och en liten **mitten-ö** där osten startar och landar. Från varje ö går en bro in mot mitten (fyra ekerbroar) och en över kanalen till varje granne (fyra ringbroar). Man kan alltså inte bara springa rakt in i mitten och på bäraren – broarna är trånga passager, och den som bär osten kan fly över dem. Helt spegelsymmetrisk (alla öar och startplatser är lika långt från osten) och helt fast: hus, platanträd, marknadsstånd, kolonner, caféer, kiosker och tunnor ligger likadant varje gång. Botarna hittar över broarna med ett rutnät. |

### De tolv vapnen

| Vapen | Typ |
| --- | --- |
| Baguetten | Närstrid, snabb och bred |
| Gummituppen | Närstrid, snabb. Kacklet får andra att tveka |
| Stekpannan | Närstrid. Håll in för att skicka tillbaka skott, släpp för en smäll |
| Purjolöken | Närstrid, lång och oförutsägbar båge |
| Potatiskanonen | Skjuter potatis |
| Pétanque-kulorna | Två kulor som studsar på allt (också på dig) |
| Brevduvan | Målsökande duva |
| Fyrverkeriraketen | Lobbad raket med fördröjd explosion |
| Stinkosten | Lobbad burk som blir ett gasmoln – den som stannar i det blir långsam och svimmar |
| Champagneminan | Mina som ploppar när någon kliver nära (även du) |
| Lövblåsaren | Håll in och rikta vinden: den som står i den för länge blåses bort (KO), gärna ut i vattnet. Du ser en vindmätare när du själv blir blåst på – gå åt sidan eller ta skydd. Överhettas |
| Studsmattan | Lägg ut en matta med pil – den som kliver på flyger |

---

## 5. Så fungerar flerspelarläget (och vad man ska veta)

- **Spelare till spelare (WebRTC).** Den som skapar rummet är *värd* och kör hela spelsimuleringen; de andra skickar sina knapptryckningar och får tillbaka läget. Det finns ingen spelserver att hyra eller drifta.
- För att para ihop webbläsarna används PeerJS gratis molntjänst för signalering. Efter att anslutningen är etablerad går trafiken direkt mellan spelarna. Rumskoden blir ett id som `osten-ABCD`.
- **Värden måste ha fliken öppen och synlig.** Webbläsare saktar ner bakgrundsflikar. Spelet försöker hålla igång värdsimuleringen ändå, men det är bäst effort – be värden lägga spelet i ett eget fönster.
- Upp till 8 spelare. Värden väljer hur många botar som fyller upp (0–7). Går någon ur mitt i en match tar en bot över. Går värden ur återvänder alla till startskärmen. Man kan ansluta till en pågående match som åskådare.
- Version 0.4 använder nätprotokoll 4 (nya banan Fyra öar; sedan 3 följer bana och botantal med i matchstarten, man kan låsa upp och byta vapen i lobbyn och bäraren får inte tackla). Alla i ett rum måste ha laddat om sidan efter en uppdatering – annars blir det ett versionsfel vid anslutningen.
- Anslutningen använder bara STUN, vilket räcker för de flesta hemnät. Bakom strikta företagsnät (symmetrisk NAT, vissa VPN) behövs en TURN-server – instruktion i `js/net.js` (`iceServers`).
- Skriver någon fel rumskod, eller når inte värden, får hen ett felmeddelande efter några sekunder (som längst 20). Det går inte att ansluta? Prova att alla sitter på samma nät eller en mobil-hotspot, uppdatera sidan och skapa ett nytt rum. Om PeerJS gratistjänst ligger nere kan du köra en egen signalserver:

```sh
npm i -g peer
peerjs --port 9000 --path /
# öppna sedan spelet med: ?peerhost=<adress>&peerport=9000&peerpath=/&peersecure=0
```

Obs: spelet är byggt och testat mot en lokal signalserver (riktig WebRTC-anslutning mellan två webbläsare fungerade, svarstid ~35 ms). PeerJS molntjänst gick inte att nå från byggmiljön, så den *riktiga* första anslutningen över internet är fortfarande oprovad – testa den först.

### Adressparametrar (för test)

| Parameter | Effekt |
| --- | --- |
| `?net=local` | Flera flikar på samma dator hittar varandra utan internet (BroadcastChannel) |
| `?lag=80` | Simulerar 80 ms fördröjning åt båda håll |
| `?debug=1` | Visar nätverksinfo |
| `?peerhost=…&peerport=…&peerpath=…&peersecure=0` | Egen signalserver |
| `#ABCD` eller `?room=ABCD` | Går direkt med i rum ABCD |

---

## 6. Justera spelkänslan

All balans ligger som siffror i **`js/cfg.js`**: `CFG` (fart, tackling – och `carrierTackle` som styr om bäraren får tackla –, respawn, kullens lutning, Parisduvan …) och `WEAPONS` (tid mellan skott, räckvidd, knuff, antal kulor …). Efter varje ändring:

```sh
node tools/test-core.js            # logiktester + 24 botmatcher med statistik (banorna växlar)
node tools/test-core.js 60 --stats # fler matcher, mer detaljer
node tools/test-core.js 24 --maps=ile,place   # botmatcherna bara på vissa banor
```

Bottarna spelar riktiga matcher mot varandra, så du ser direkt om något vapen blivit för starkt (KO-orsaker per match, vem som fäller ostbäraren, hur länge osten bärs i snitt). Riktig balans kräver ändå människor – spela, anteckna, justera.

Webbläsartester (kräver `npm i -D playwright`, och `peer` för `pw-peer.js`): `tools/pw-smoke.js` (titel → lobby → match + skärmdumpar), `tools/pw-weapons.js` (varje vapen och effekt), `tools/pw-multi.js [utmapp] [lagMs] [bana]` (två flikar, lokalt läge, inkl. banval, botantal och att den egna spelaren aldrig hamnar i vattnet), `tools/pw-peer.js` (riktig WebRTC mot lokal signalserver, inkl. byte av vapen i lobbyn), `tools/pw-maps.js` (banväljaren och skärmdumpar av torget), `tools/pw-canal.js` (Fyra öar: bankort, match, gå med riktiga tangenter över broar och mot kanter, ost som flyter tillbaka, drunkning, skärmdumpar), `tools/pw-results.js` (slutskärmen i flera fönsterstorlekar), `tools/pw-latejoin.js` (anslutning mitt i en match som åskådare), `tools/pw-relock.js` (lås upp och byt vapen i lobbyn, solo och värd + gäst, samt HUD:en som ostbärare), `tools/pw-gallery.js` (alla figurer och föremål).

## 7. Filer

```
index.html            alla skärmar och HUD
css/style.css         serietidningsstil
js/cfg.js             konfiguration, vapendata, banorna (ön, torget och fyra öar, ingen DOM)
js/sim.js             spelsimuleringen, 60 Hz, kodek för tillståndsbilder (ingen DOM)
js/bots.js            bot-AI, med rutnätsnavigering över broar på Fyra öar (ingen DOM)
js/net.js             värd- och klientsession, PeerJS och lokalt läge
js/audio.js           ljud och musik (WebAudio, inga ljudfiler)
js/art.js             all grafik som kod: figurer, vapen, hus, träd, ost
js/render.js          canvas-renderare, markbilder per bana, kamera, effekter, minikarta
js/ui.js              menyer, lobby (banväljare, botantal), HUD, resultat med prispall
js/main.js            indata och huvudloop
vendor/peerjs.min.js  PeerJS 1.5.5 (MIT-licens, se vendor/PEERJS-LICENSE.txt)
tools/                server, tester, skärmdumpsskript
CLAUDE.md             överblick för Claude Code
DESIGN.md             spelidén och designbeslut
```

## 8. Känt och oprovat

- **Bara dator** (tangentbord + mus). Mobil/pekskärm är medvetet skjutet på framtiden.
- Anslutning över internet via PeerJS molntjänst är inte provad från byggmiljön (se ovan). Strikta nät kan kräva TURN.
- Värden måste hålla fliken synlig.
- Ingen återanslutning efter tappad förbindelse – en bot tar över platsen.
- Balansen är byggd på botmatcher och mina egna antaganden, inte på riktiga spelare. Det gäller särskilt den nya lövblåsaren (nu en riktig KO-blåsare), skillnaden mellan banorna och om broarna på Fyra öar är lagom trånga (botmatcherna ger fler ägarbyten och kortare bärningar där än på de andra banorna).
- Ljudet (musette-vals och effekter) syntetiseras i webbläsaren och är ett första utkast.
- Ingen Steam-/mobilpaketering ännu (se CLAUDE.md för förslag).

## Ändringar

- **0.4** – Ny bana **Fyra öar** (kanaler, broar och en liten mitten-ö där osten ligger; spegelsymmetrisk, fast, botarna navigerar över broarna). Banväljaren har tre kort. Nätprotokoll 4. Rättat: i nätspel kunde den egna spelaren på sin skärm gå en bit ut över vattnet när man tryckte mot en kaj- eller kanalkant (förutsägelsen håller sig nu på land när värden har spelaren på land).
- **0.3** – Ostbäraren kan inte längre tackla (växel `CFG.carrierTackle`). Vapnet kan låsas upp och bytas i lobbyn tills matchen startar. Nätprotokoll 3.
- **0.2** – Två banor (ön och Torget i Paris) med banväljare, valbart antal botar (0–7), lövblåsaren som riktig KO-blåsare, svart sikte, slutskärm med prispall.

## Licens

PeerJS (`vendor/`) är MIT-licensierat. I övrigt har du fria händer med prototypen.
