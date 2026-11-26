# Dünya Satranç Şampiyonası 2026 · canlı takip

Gukesh Dommaraju – Javokhir Sindarov maçını Türkçe yayınla yan yana izlemek için hazırlanmış,
bağımsız bir hayran sitesi.

- **Canlı tahta:** hamleler Lichess yayınının push akışından gelir (anahtar ve sunucu gerekmez).
- **Yayın paneli:** Chess.com Türkçe, SatranChess, Chess.com (EN) ve FIDE YouTube yayınları açılır listeden seçilir; YouTube, Twitch ya da Kick bağlantısı da yapıştırılabilir.
- **Stockfish:** önce Lichess bulut değerlendirmesi, bulunamazsa tarayıcıda çalışan Stockfish. Tahtanın solunda kazanma şansı ve Stockfish'in hatları durur; her hatta puan, oynayacağı hamle ve devamı görünür. İyi hamle sayısı bire ya da ikiye indiğinde hangileri olduğunu ve sıradaki seçeneğin neye mal olacağını söyler.
- **Türkçe notasyon:** Ş V K F A (İngilizce notasyona geçilebilir).
- **Spoilersız izleme:** tahtayı duraklat, sonra hamle hamle ya da otomatik oynatarak yetiş; sonuç, skor ve yayın gizli kalır.
- **Benzer oyunlar:** pozisyonun usta oyunlarında kaç kez oynandığı, yenilik hamlesi ve önceki oyunların devamını tahtada önizleme.
- **Grafikler:** değerlendirme grafiği, kritik anlar ve hamle süreleri. Hamle süreleri yayındaki gerçek saat verisinden hesaplanır; süresi bilinmeyen hamle için çubuk çizilmez, tahmin de yürütülmez.
- **Kim kazanır?** kazanma, beraberlik ve kaybetme yüzdeleri bir formülden değil, gerçek oyunlardan gelir: 2600 ve üstü oyuncuların 8.754 klasik oyununda aynı değerlendirmedeki konumların nasıl bittiğine bakılır. Dört piyon öndeki taraf bu yüzden yüzde 100 değil, yüzde 93 civarında görünür ([docs/WIN-CHANCE.md](docs/WIN-CHANCE.md)). Bir taraf kazanıyorsa Stockfish kartı bunu oyuncunun adıyla söyler. Hamle kalitesi (yanlışlık, hata, büyük hata) de gösterilir.

- **Tahtada kendi hamlelerin:** ana tahtada, canlı konumdan ya da önceki bir hamleden, kurallı her hamleyi deneyebilirsin. Motor senin konumunu izler, oyun arkada devam eder. "Canlı konuma dön", son hamle düğmesi ya da yukarı ok seni canlı konuma geri getirir.
- **Hamleyi tahmin et:** tahmin yalnızca Tahmin sekmesinde yapılır: sıradaki hamleyi listeden seç ya da yaz; hamle oynanınca tuttu mu görürsün. Tahtada yaptığın hamleler analizdir, tahmin sayılmaz. Tahmin edene kadar o sekmedeki usta ve motor bilgileri gizlenir. Bu bilgiler iki ayrı şeydir: usta oyunlarında o pozisyonda neyin kaç kez oynandığı ve motorun en güçlü bulduğu hamleler. İkisi de olasılık değildir.
- **Model tahmini (deneysel):** Ana sayfada, tahtanın altında sitenin kendi modeli, sıradaki oyuncunun en olası bulduğu üç hamleyi yüzdeleriyle, geri kalanını "Diğer hamleler" olarak gösterir; dördü birlikte 100 eder. Payı yüzde birin altında kalan hamle "0" değil "<1 %" olarak yazılır. Model üç şeye bakar: hamlenin tahtadaki özellikleri, 2600 ve üstü oyuncuların 10.761 klasik oyununda o konumda ne oynandığı (açılış teorisi, ilk 12 hamle) ve oyuncunun kendi oyunları; bu maçın önceki oyunları da hesaba katılır. Stockfish kullanmaz. 2026'nın ilk sekiz ayındaki 83 oyunun 4.240 hamlesinde ilk tercihi yüzde 37, ilk üç tercihi yüzde 61 tuttu; bir önceki sürümde yüzde 35 ve yüzde 59 idi. Maçta geride ya da önde olmanın hamlelere etkisi Dünya Kupası'nın iki oyunluk eşleşmelerinden ölçüldü; çok küçük çıktı. Tahmin modu açıkken, sen tahmin edene ya da "Tahmin etmeden göster" diyene kadar gizli kalır.
- **Bulmaca köşesi:** Lichess bulmacaları (günün bulmacası, karışık, 1 ve 2 hamlede mat, kısa, oyun sonu). Yalnızca kurallı hamleler oynanır; ipucu, çözümü göster, baştan ve skor vardır. Lichess'e ulaşılamazsa hazır bulmacalar gösterilir.
- **Paylaş:** tahtanın altındaki düğme, ekrandaki oyunun o hamlesine giden bağlantıyı kopyalar (`?parti=3&hamle=24`; adresteki `parti` adı eski bağlantılar çalışsın diye aynı kalır). Bulmaca köşesinin bağlantısı `#bulmaca` ile biter. Bağlantıda bunlardan başka hiçbir şey olmaz. Tarayıcı kopyalamaya izin vermezse bağlantı seçili olarak gösterilir, elle kopyalarsın. Aynı turda birden çok tahta olan günlerde (eşitlik bozma) bağlantı hangi tahtayı gösterdiğini söyleyemeyeceği için düğme gösterilmez.
- **Maçı kendi takip eder:** yeni oyun başlayınca kısa bir duyurudan sonra o oyuna geçer (sen tahtada kendi hamlelerine bakarken geçmez); her günün yayınını kanalın canlı yayın listesinden kendi bulur. Üstteki şeritte maç skoru ve her oyun için bir kare vardır; tüm oyunların listesi bir düğme uzaklıktadır.
- **Klavye:** ← ve → hamle hamle ilerler, ↑ ya da End canlı konuma döner, Home ilk konuma gider, F tahtayı çevirir.

## İstatistik

Site, hangi özelliklerin kullanıldığını görmek için çerezsiz ve anonim istatistik tutabilir (PostHog, AB sunucuları).
`VITE_POSTHOG_KEY` tanımlı değilse hiçbir şey yüklenmez ve gönderilmez. Kurulum, gönderilen olaylar ve gizlilik ayrıntıları:
[docs/ANALYTICS.md](docs/ANALYTICS.md).

## Testler

```bash
npm test
```

Tarayıcıda elle çalıştırılan denemeler `tests/e2e/` altında, sonuçları [docs/TEST-EVIDENCE.md](docs/TEST-EVIDENCE.md) içinde.
Barındırma ve `ozgurakanay.com/satranc/` sayfası: [docs/INTEGRATION.md](docs/INTEGRATION.md).
Tahmin panelinin ne gösterip ne göstermediği: [docs/PREDICTION.md](docs/PREDICTION.md).
Model tahmini, verisi, yöntemi ve sınırları: [docs/PREDICTOR.md](docs/PREDICTOR.md); ölçümlerin tamamı: [docs/PREDICTOR-V3-REPORT.md](docs/PREDICTOR-V3-REPORT.md) ve bir önceki sürüm için [docs/PREDICTOR-REPORT.md](docs/PREDICTOR-REPORT.md); ölçümden önce yazılan plan: [docs/PREDICTOR-V2-PROTOCOL.md](docs/PREDICTOR-V2-PROTOCOL.md). Modeli yeniden kurmak için önce `node scripts/train-predictor.mjs`, sonra `node scripts/train-predictor.mjs --final` (ikisi yaklaşık 16 dakika). Yalnızca kayıtlı seçimden ölçmek için `node scripts/train-predictor.mjs --measure-frozen` (bir dakikadan az).
Tasarım yönü: [.impeccable.md](.impeccable.md).
Canlı akış, Lichess'in istek sınırları ve reddedilen bağlantılar için öneri: [docs/LIVE-FEED.md](docs/LIVE-FEED.md).

## Geliştirme

```bash
npm install
npm run dev
```

```bash
npm run build
```

Başka bir Lichess yayınında denemek için adrese `?tour=<turnuvaId>&round=<turId>` eklenebilir.

## Veri ve lisans

Hamleler ve saatler [Lichess Broadcast API](https://lichess.org/api#tag/Broadcasts) üzerinden gelir.
Tahta [chessground](https://github.com/lichess-org/chessground), kurallar
[chessops](https://github.com/niklasf/chessops), motor [Stockfish.js](https://github.com/nmrugg/stockfish.js).
Bu bileşenler GPL-3.0 lisanslı olduğu için proje de GPL-3.0-or-later ile yayımlanır.

FIDE, Chess.com veya Lichess ile bir bağlantısı yoktur.
