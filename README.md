# Yalan Hattı

Gerçek mekânda, her oyuncunun ayrı bir odada oturduğu ve birbirini telefonla aradığı aldatma oyunu için yönetim sistemi. Her odada bir tablet ve ona bağlı bir ahize durur. Görevler tablete gelir, aramalar tabletten yapılır, puanı sunucu tutar. Sunucu (yönetici) oyunu tek panelden yönetir, yapım ekibi hatları ve kayıtları ayrı ekranlardan izler.

## Çalıştırma

Node 22.18 veya üstü gerekir.

```bash
npm run setup
npm run build
npm start
```

Bilgisayarda `http://localhost:3000` açılır. Tabletler açılışta yazılan güvenli adresi kullanır, örneğin `https://192.168.1.121:3443`. Kurulum ya da uygulama mağazası gerekmez.

Tablet tarayıcıları adresi kendiliğinden `https`'e çevirir ve mikrofon yalnız güvenli adreste çalışır. `start.ts` ilk açılışta `certs/` altına yerel bir sertifika üretir (openssl gerekir, Git for Windows ile gelir) ve 3443'te tek bir güvenli kapı açar. Sertifika kendinden imzalı olduğu için her cihazda ilk açılışta bir kez "Gelişmiş > Devam et" denir. Bilgisayarın IP'si değişirse `certs/` klasörünü silip yeniden başlat.

## Ekranlar

| Ekran | Kim kullanır | Adres |
| --- | --- | --- |
| Yönetim | Sunucu | `/yeni` ile oda açılır |
| Tablet | Her oyuncu | QR kod ya da ana sayfa + oda kodu |
| Hat durumu | Yapım ekibi | `/oda/KOD/hat` |
| Uyarılar | Kayıt sorumlusu | `/oda/KOD/uyarilar` |
| Sahne | Salondaki TV | `/oda/KOD/sahne` |
| Hat afişi | Her odanın duvarı | `/oda/KOD/afis` (yazdırılır) |

Yönetim panelinin beş sekmesi var: Etap, Kurulum, Hat durumu, Puan, Kayıt. Etap sekmesi o anki aşamaya göre kendi ekranını açar: etap seçimi, kurallar, süre, sonuç.

## Akış

1. **Kurulum.** Kadro girilir. Her oyuncuya iki numara verilir:
   - **Oda numarası** gizlidir, bütün bölüm boyunca sabittir, duvarda yazar (varsayılan 11, 12, 13…).
   - **Hat numarası** aramak için kullanılır, 3 hanelidir (ayarla 4). Afişte isimsiz listelenir.
   Tabletler QR'ı okutup listeden ismini seçer. Bir isim tek tablete bağlanır; tablet bozulursa yönetim "Ayır" der, yeni tablet aynı ismi alır.
2. **Oyunu başlat.** Oda numaraları kilitlenir.
3. **Etap aç.** Kurallar hem panelde (sunucu okur) hem tabletlerde görünür. Kayıt kontrolü onaylanmadan etap başlamaz.
4. **Etap süresi.** Hatlar kendiliğinden açılır. Duraklatılabilir, süre eklenebilir, erken bitirilebilir.
5. **Sonuç.** Her mini oyunun kendi oyun puanı vardır. Oyun puanına göre sıralama çıkar; eşitler sırayı paylaşır (iki 1. varsa ikisi de 1.'nin puanını alır, sonraki 3. sayılır). Sunucu etap başında genel tabloya yazılacak puanı seçer: 2-1-1 (varsayılan) ya da 3-2-1. Oyun puanı sıfır olan tablo puanı almaz. Sonuç ekranında sunucu herkesin puanını +/− ile elle değiştirebilir, eksi de verebilir. "Puanları tabloya yaz" ile kesinleşir.

Toplam 11 etap planlanıyor. Şu an hazır olanlar:

| Etap | Kural |
| --- | --- |
| Tahmin Oyunu · Odada Kim Var? | Hatları arayıp kimin hangi odada kaldığını öğren. Listeye her oyuncunun oda numarasını yaz. Her doğru oda 1 oyun puanı. Yanlış ya da boş puan götürmez. Herkes listesini kilitlerse etap erken biter. Varsayılan 60 sn. |
| Yeşil Buton Kırmızı Buton | Rastgele bir eşle eşleşirsin, eşinin adı ve hattı tablette görünür. İkiniz gizlice yeşil ya da kırmızı basarsınız. İkiniz yeşil +1/+1, kırmızı +2 yeşil 0, ikiniz kırmızı 0/0. Sonuç anında açıklanır, daha önce eşleşmediğin biriyle yeniden eşleşirsin; herkesle eşleştiysen en az karşılaştığınla. Eş 40 sn içinde basmazsa (ayarlanabilir) basmayan 0 alır, basan eşi yeşil basmış gibi alır. Süre bitince yarım kalan eşleşmeler puansız kapanır. Varsayılan 5 dk. |
| Bomba Patlama | Salonda fiziksel oynanır. Tabletlerde "Bu oyun salonda oynanıyor" ve genel puan görünür. Puanları sunucu sonuç ekranında artı ya da eksi girer. |
| Sevgi Oyu | Tablette diğer oyuncuların isimleri çıkar, bir kişiye oy verilir. Kendine oy verilemez, süre bitene kadar oy değişebilir. Aldığın her oy 1 oyun puanı. Kimin kime oy verdiği sonuçta tabletlerde ve sahnede açıklanır. Varsayılan 2 dk. |

## Telefon

- Aramalar tabletler arasında doğrudan, yerel ağ üzerinden gider (WebRTC). İnternet gerekmez.
- Numara tuşlanır, karşı tarafta çalar, açılır, kapatılır. Görüşmedeki kişiyi arayan **meşgul** sesi duyar. Kullanılmayan numara üç tonlu uyarı verir. Açılmayan arama çalma süresi dolunca cevapsız kalır.
- **Ses değiştirici:** her oyuncunun kendi ses tonu var, ses tablette gerçek zamanlı değiştirilir. Panelden kapatılabilir.
- **Arayan numarası:** varsayılan kapalı, telefon yalnız çalar. Panelden açılırsa arayanın hattı görünür, ismi asla görünmez.
- **Kayıt:** her görüşme arayan tablette iki taraflı kaydedilir ve görüşme bitince sunucuya yüklenir (`server/data/rooms/KOD/recordings/`). Yönetim panelinde dinlenir.
- Kim kimi, ne zaman, kaç saniye aradı: hepsi olay günlüğünde. Sonraki etaplar bu kaydı puanlamada kullanabilir.

Mikrofon yoksa ya da izin verilmezse tablet "test sesi" ile çalışır; böylece kurulum ahizesiz de denenebilir.

## Çekimde kayıp yaşanmasın diye

- **Kayıt kontrol listesi.** Liste onaylanmadan etap başlamaz: kameralar, kart yeri, ses, klaket, tablet şarjı.
- **Klaket.** Yönetimden işaret konunca bütün ekranlar 3 saniye beyaz zemin üstünde etiket ve saat gösterir. Kurgu, görüntüyü bu saatle günlüğe eşler.
- **Olay günlüğü.** Katılım, arama, görüşme süresi, liste, kilit, puan, kopma: hepsi saniyesiyle yazılır. CSV ya da JSON indirilir.
- **Hat durumu.** Her oda için kim boşta, kim kimi arıyor, kim kiminle kaç saniyedir konuşuyor, kimin tableti koptu: canlı.

## Uyarılar

Sunucu her yarım saniyede odayı denetler. Uyarı ekranı sesli ve titreşimli haber verir, izin verilirse tarayıcı bildirimi gönderir. Yönetim panelinde aynı uyarılar sağ üstte kısa süreli görünür.

| Durum | Önem |
| --- | --- |
| Oyuncunun tableti 4 sn'den uzun süredir bağlı değil | Kritik |
| Pil %10'un altında, şarjda değil | Kritik |
| Oyun başladı ama oyuncu tablete bağlanmadı | Uyarı |
| Pil %20'nin altında | Uyarı |
| 12 sn'dir sinyal yok ya da gecikme 800 ms üstünde | Uyarı |
| Etabın son 30 sn'si, listesi eksik ve kilitsiz olan var | Uyarı |
| Yönetim paneli kapalı | Uyarı |
| Etap duraklatıldı, sahne ekranı koptu, son klaketten 20 dk geçti | Bilgi |

## Çökmeye dayanıklılık

- Sunucu her değişiklikte durumu diske yazar (`server/data/rooms/KOD/`). Önce geçici dosyaya yazar, sonra yerine taşır; yarım dosya kalmaz.
- Sunucu kapanıp açılırsa oyun kaldığı yerden sürer: etap, süre, listeler, hatlar.
- Tablet koparsa kendiliğinden yeniden bağlanır, aynı oyuncu olarak döner.
- Bağlantı yokken gönderilen işlem 90 saniye bekletilir, bağlantı gelince gider.
- Her komutun bir kimliği var. Aynı komut iki kez gelirse bir kez işlenir; sunucu çökse bile bu bilgi diskte kalır.

## Yapı

```
server/   NestJS 12, socket.io, zod
  src/game/domain/        kurallar, etaplar, puanlama, uyarılar, ekran görünümleri (saf fonksiyonlar)
  src/game/persistence/   anlık görüntü, olay günlüğü, görüşme kayıtları
  src/game/transport/     soket kapısı (komutlar + WebRTC sinyal aktarımı), HTTP uçları
web/      Next.js 16, Tailwind 4
  src/lib/phone.ts        telefon motoru: WebRTC, ses değiştirici, tonlar, kayıt
  src/lib/voice-worklet.ts ses değiştirici (AudioWorklet)
scripts/  start.ts (servisleri ve güvenli kapıyı açar), https-gateway.ts
```

## Doğrulama

```bash
npm test
npm run typecheck
```

Sunucuda 51 test var. Kurulum, numara doğrulama, tablet eşleme, etap akışı, dört etabın puanlaması (paylaşılan sıra, 3-2-1 ve 2-1-1 dağılımı, elle puan, buton eşleştirme döngüsü ve zaman aşımı, oy sayımı ve açıklanması, bombada eksi puan), telefon (çalma, meşgul, kullanılmayan numara, arayan numarası, süre), uyarı kuralları birim testleriyle; tablet eşleme, sesin yalnız karşı tarafa aktarılması, kayıt yükleme, sunucunun çöküp açılması, tekrar gelen komut, uyarının açılıp kapanması ve CSV gerçek soketle sınanır.

## Bilinen sınırlar

- Ses yalnız aynı yerel ağda çalışır; tabletler ve bilgisayar aynı Wi‑Fi'de olmalı.
- Pil bilgisi ve ekranı açık tutma iPhone'da sınırlıdır. Tabletlerde otomatik kilit elle kapatılmalı; kontrol listesinde bu madde var.
- Bildirimler sayfa açıkken çalışır; uygulama kapalıyken bildirim (push) yok.
- Yönetim anahtarı dışa aktarma ve kayıt bağlantılarında adreste taşınır. Yerel ağ için yeterli, internete açılacaksa değişmeli.
- Tek sunucu süreci için yazıldı.
