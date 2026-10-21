# Yalan Hattı

Yalan Hattı #1'i izlerken aklıma geldi. Oyuncular ayrı odalarda oturuyor, birbirine sadece telefonla ulaşabiliyor, puanları da sunucu tutuyor. Böyle bir çekimde tabletlerin, hatların ve kayıtların saatlerce sorunsuz çalışması lazım. Ben de çekim günü kullanılabilecek bir yönetim sistemi yazdım.

Her odada bir tablet var. Oyuncu görevini tabletten görüyor, aramalarını da tabletten yapıyor. Sunucu oyunu tek panelden yönetiyor, yapım ekibi de hatları ve kayıtları kendi ekranından takip ediyor.

11 etabın 4'ünü ekledim. Fikri göstermek için bu kadarı yeterliydi, gerisi de eklenebilir.

## Çalıştırma

Node 22.18 veya üstü gerekiyor.

```bash
npm run setup
npm run build
npm start
```

Bilgisayarda `http://localhost:3000` açılıyor. Tabletlerin gireceği adresi terminal yazıyor, mesela `https://192.168.1.121:3443`. Uygulama kurmaya gerek yok, tarayıcı yetiyor.

Tablet tarayıcıları mikrofonu sadece https'te açtığı için `start.ts` ilk açılışta `certs/` klasörüne bir sertifika üretiyor (openssl gerekiyor, Git for Windows ile geliyor). Sertifika kendinden imzalı, o yüzden her cihazda ilk seferde bir kez "Gelişmiş > Devam et" demek gerekiyor. Bilgisayarın IP'si değişirse `certs/` klasörünü silip tekrar başlatman yeterli.

## Ekranlar

| Ekran | Kim kullanıyor | Adres |
| --- | --- | --- |
| Yönetim | Sunucu | `/yeni` ile oda açılıyor |
| Tablet | Oyuncular | QR kod ya da ana sayfadan oda kodu |
| Hat durumu | Yapım ekibi | `/oda/KOD/hat` |
| Uyarılar | Kayıt sorumlusu | `/oda/KOD/uyarilar` |
| Sahne | Salondaki TV | `/oda/KOD/sahne` |
| Hat afişi | Oda duvarları | `/oda/KOD/afis` (yazdırılıyor) |

Yönetim panelinde beş sekme var: Etap, Kurulum, Hat durumu, Puan ve Kayıt. Etap sekmesi o an ne gerekiyorsa onu gösteriyor: etap seçimi, kurallar, süre ya da sonuç.

## Oyun nasıl ilerliyor

1. Kadroyu giriyorsun. Herkese iki numara veriliyor. Oda numarası gizli, bölüm boyunca değişmiyor ve duvarda yazıyor (11, 12, 13…). Hat numarası aramak için kullanılıyor, 3 ya da 4 haneli. Afişte hat numaraları isimsiz duruyor.
2. Oyuncular tabletten QR'ı okutup listeden ismini seçiyor. Bir isim tek tablete bağlanıyor. Tablet bozulursa panelden "Ayır" deyip yenisine geçebiliyorsun.
3. Oyunu başlatınca oda numaraları kilitleniyor.
4. Etabı açınca kurallar hem panelde hem tabletlerde çıkıyor. Kayıt kontrol listesi onaylanmadan etap başlamıyor.
5. Süre boyunca hatlar açık. Duraklatabilir, süre ekleyebilir ya da erken bitirebilirsin.
6. Etap bitince oyun puanına göre sıralama çıkıyor, eşit olanlar aynı sırayı paylaşıyor. Genel tabloya 2-1-1 mi yoksa 3-2-1 mi yazılacağını etap başında seçiyorsun. Sonuç ekranında herkesin puanını elle değiştirebiliyorsun, gerekirse eksi de verebiliyorsun.

## Hazır etaplar

| Etap | Nasıl oynanıyor |
| --- | --- |
| Tahmin Oyunu | Hatları arayıp kimin hangi odada olduğunu bulmaya çalışıyorsun. Her doğru oda 1 puan, yanlış cevap puan götürmüyor. Herkes listesini kilitlerse etap erken bitiyor. |
| Yeşil Buton Kırmızı Buton | Rastgele biriyle eşleşiyorsun, ikiniz de gizlice yeşil ya da kırmızı basıyorsunuz. İkiniz de yeşil basarsanız +1/+1, biriniz kırmızı basarsa kırmızı basan +2 alıyor, ikiniz de kırmızı basarsanız iki taraf da 0. Sonra daha önce eşleşmediğin biriyle eşleşiyorsun. Eşin 40 saniye içinde basmazsa sen yeşil basmış gibi puan alıyorsun, o 0 alıyor. |
| Bomba Patlama | Salonda oynanıyor. Tablette sadece genel puan görünüyor, puanları sunucu elle giriyor. |
| Sevgi Oyu | Kendin hariç birine oy veriyorsun, süre bitene kadar değiştirebiliyorsun. Aldığın her oy 1 puan. Kimin kime oy verdiği sonda açıklanıyor. |

## Telefon

- Tabletler birbirini yerel ağ üzerinden arıyor (WebRTC), internet gerekmiyor.
- Numarayı tuşluyorsun, karşı tarafta çalıyor. Konuşan birini ararsan meşgul sesi geliyor, kullanılmayan bir numarayı ararsan uyarı sesi duyuyorsun.
- Her oyuncunun sesi kendi tonuyla değiştiriliyor. Panelden kapatılabiliyor.
- Arayanın numarası varsayılan olarak görünmüyor, panelden açılabiliyor. İsim hiçbir zaman görünmüyor.
- Her görüşme kaydediliyor ve panelden dinlenebiliyor.

Mikrofon yoksa tablet test sesiyle çalışıyor, böylece kurulumu ahize olmadan da deneyebilirsin.

## Çekimde bir şey kaçmasın diye

- **Kontrol listesi:** kameralar, kart, ses, klaket ve tablet şarjı onaylanmadan etap başlamıyor.
- **Klaket:** panelden işaret verince bütün ekranlarda 3 saniye boyunca etiket ve saat çıkıyor. Kurguda görüntüyü günlükle eşlemek için.
- **Olay günlüğü:** kim kimi aradı, ne kadar konuştu, kim ne zaman kilitledi, puanlar, kopmalar... hepsi saniyesiyle kaydediliyor. CSV ya da JSON olarak indirilebiliyor.
- **Hat durumu:** kim boşta, kim kiminle kaç saniyedir konuşuyor, kimin tableti koptu, hepsi canlı görünüyor.

## Uyarılar

Sistem odayı yarım saniyede bir kontrol ediyor. Uyarı ekranı sesli ve titreşimli haber veriyor, izin verilirse tarayıcı bildirimi de gönderiyor.

| Durum | Önem |
| --- | --- |
| Tablet 4 saniyeden uzun süredir bağlı değil | Kritik |
| Pil %10'un altında ve şarjda değil | Kritik |
| Oyun başladı ama oyuncu tablete bağlanmadı | Uyarı |
| Pil %20'nin altında | Uyarı |
| 12 saniyedir sinyal yok ya da gecikme 800 ms'nin üstünde | Uyarı |
| Etabın son 30 saniyesi ve listesini kilitlemeyen var | Uyarı |
| Yönetim paneli kapalı | Uyarı |
| Etap duraklatıldı, sahne ekranı koptu ya da son klaketin üstünden 20 dakika geçti | Bilgi |

## Bir şey çökerse

- Sunucu her değişiklikte durumu diske yazıyor (`server/data/rooms/KOD/`). Önce geçici bir dosyaya yazıp sonra yerine taşıyor, yarım dosya kalmıyor.
- Sunucu kapanıp açılırsa oyun kaldığı yerden devam ediyor.
- Tablet koparsa kendisi tekrar bağlanıyor ve aynı oyuncu olarak dönüyor.
- Bağlantı yokken yapılan işlem 90 saniye bekletiliyor, bağlantı gelince gidiyor.
- Aynı komut iki kez gelirse bir kez işleniyor, sunucu çökse bile bu bilgi kaybolmuyor.

## Yapı

```
server/   NestJS, socket.io, zod
  src/game/domain/        kurallar, etaplar, puanlama, uyarılar
  src/game/persistence/   durum kaydı, olay günlüğü, görüşme kayıtları
  src/game/transport/     soket ve HTTP uçları
web/      Next.js, Tailwind
  src/lib/phone.ts        telefon: WebRTC, ses değiştirici, tonlar, kayıt
  src/lib/voice-worklet.ts ses değiştirici
scripts/  start.ts, https-gateway.ts
```

## Testler

```bash
npm test
npm run typecheck
```

Sunucuda 51, web'de 4 test var. Puanlama, eşleştirme, telefon ve uyarı kuralları birim testleriyle, tablet bağlantısı, ses aktarımı, kayıt yükleme ve sunucunun çöküp açılması da gerçek soketle test ediliyor.

## Eksikler

- Ses sadece aynı Wi-Fi'de çalışıyor.
- iPhone'da pil bilgisi alınamıyor ve ekranın açık kalması garanti değil. Tabletlerde otomatik kilidi elle kapatmak gerekiyor, kontrol listesinde bu da var.
- Bildirimler sadece sayfa açıkken geliyor.
- Yönetim anahtarı bazı bağlantılarda adreste taşınıyor. Yerel ağda sorun değil ama internete açılacaksa değişmesi lazım.
- Tek sunucuda çalışacak şekilde yazıldı.
