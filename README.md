# Dünya Satranç Şampiyonası 2026 · canlı takip

Gukesh Dommaraju – Javokhir Sindarov maçını Türkçe yayınla yan yana izlemek için hazırlanmış,
bağımsız bir hayran sitesi.

- **Canlı tahta:** hamleler Lichess yayınının push akışından gelir (anahtar ve sunucu gerekmez).
- **Yayın paneli:** Chess.com Türkçe, SatranChess, Chess.com (EN) ve FIDE YouTube yayınları hazır; YouTube, Twitch ya da Kick bağlantısı da yapıştırılabilir.
- **Yayına eşitleme:** video tahtadan gerideyse tahtayı saniye saniye geciktirir, yorumculardan önce hamleyi görmezsin.
- **Motor:** önce Lichess bulut değerlendirmesi, bulunamazsa tarayıcıda Stockfish.
- **Türkçe notasyon:** Ş V K F A (İngilizce notasyona geçilebilir).
- **Spoilersız izleme:** tahtayı duraklat, sonra hamle hamle ya da otomatik oynatarak yetiş; sonuç, skor ve yayın gizli kalır.
- **Benzer partiler:** pozisyonun usta partilerinde kaç kez oynandığı, yenilik hamlesi ve önceki partilerin devamını tahtada önizleme.
- **Grafikler:** değerlendirme grafiği, kritik anlar ve hamle başına düşünme süresi.
- **Kim kazanır?** motor değerlendirmesinden kazanma/beraberlik tahmini ve hamle kalitesi (yanlışlık, hata, büyük hata).

- **Hamleyi tahmin et:** tahmin modunda sıradaki hamleyi tahtada yap ya da yaz; hamle oynanınca tuttu mu görürsün. Tahmin edene kadar motor önerileri gizlenir. Yanında iki ayrı bilgi durur: usta partilerinde o pozisyonda neyin kaç kez oynandığı ve motorun en güçlü bulduğu hamleler. İkisi de olasılık değildir; sayfada insan hamlesi tahmin eden bir model yoktur.
- **Bulmaca köşesi:** Lichess bulmacaları (günün bulmacası, karışık, 1 ve 2 hamlede mat, kısa, oyun sonu). Yalnızca kurallı hamleler oynanır; ipucu, çözümü göster, baştan ve skor vardır. Lichess'e ulaşılamazsa hazır bulmacalar gösterilir.
- **Paylaş:** tahtanın altındaki düğme, ekrandaki partinin o hamlesine giden bağlantıyı kopyalar (`?parti=3&hamle=24`). Bulmaca köşesinin bağlantısı `#bulmaca` ile biter. Bağlantıda bunlardan başka hiçbir şey olmaz. Tarayıcı kopyalamaya izin vermezse bağlantı seçili olarak gösterilir, elle kopyalarsın.
- **Maçı kendi takip eder:** yeni parti başlayınca kısa bir duyurudan sonra o partiye geçer; her günün yayınını kanalın canlı yayın listesinden kendi bulur.

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
Tahmin panelinin ne gösterip ne göstermediği ve insan hamlesi tahmini için araştırma planı: [docs/PREDICTION.md](docs/PREDICTION.md).
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
