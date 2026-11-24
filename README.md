# Dünya Satranç Şampiyonası 2026 · canlı takip

Gukesh Dommaraju – Javokhir Sindarov maçını Türkçe yayınla yan yana izlemek için hazırlanmış,
bağımsız bir hayran sitesi.

- **Canlı tahta:** hamleler Lichess yayınının push akışından gelir (anahtar ve sunucu gerekmez).
- **Yayın paneli:** Chess.com Türkçe (YouTube, Twitch, Kick) hazır seçenekleri veya yapıştırılan herhangi bir bağlantı.
- **Yayına eşitleme:** video tahtadan gerideyse tahtayı saniye saniye geciktirir, yorumculardan önce hamleyi görmezsin.
- **Motor:** önce Lichess bulut değerlendirmesi, bulunamazsa tarayıcıda Stockfish.
- **Türkçe notasyon:** Ş V K F A (İngilizce notasyona geçilebilir).

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
