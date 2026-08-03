# Telegram Gider Takip Botu

## 1. Projenin Amacı

Bu proje tek kişinin Telegram üzerinden doğal dil ile kişisel gider kaydı tutması için hazırlanmıştır. Gelir, banka, yatırım, web dashboard veya çok kullanıcılı özellik içermez.

## 2. Özellikler

Gider ekleme, onaylı pending kayıt akışı, günlük/haftalık/aylık raporlar, son gider listesi, kategori özetleri, CSV export, SQLite backup, soft delete, doğal dil ile güncelleme ve duplicate Telegram update koruması bulunur.

## 3. Kullanılan Teknolojiler

Node.js, TypeScript strict mode, grammY, SQLite, Drizzle ORM, Zod, OpenAI resmi Node.js SDK, OpenAI Responses API, Docker, Docker Compose, pnpm, Pino, Vitest, ESLint ve Prettier kullanılır.

## 4. Mimari

Bot katmanı Telegram komutlarını ve callback akışını yönetir. Parsing katmanı önce kural tabanlı parser, gerekirse OpenAI Structured Outputs kullanır. Database katmanı SQLite migration ve repository sınıflarından oluşur. Servis katmanları gider, pending kayıt, rapor ve update akışlarını taşır.

## 5. Klasör Yapısı

```text
src/
  index.ts
  bot/
  config/
  database/
  expenses/
  parsing/
  reports/
  shared/
tests/
scripts/
```

## 6. Telegram BotFather ile Bot Oluşturma

Telegram’da `@BotFather` ile `/newbot` komutunu çalıştırın, bot adını seçin ve verilen token’ı `.env` içindeki `TELEGRAM_BOT_TOKEN` alanına yazın.

## 7. Telegram Kullanıcı ID'sini Bulma

Telegram kullanıcı ID’nizi `@userinfobot` gibi bir yardımcı bot ile öğrenin ve `.env` içinde `ALLOWED_TELEGRAM_USER_ID` alanına yazın. Bot yalnızca bu ID’ye yanıt verir.

## 8. OpenAI API Anahtarı Tanımlama

OpenAI API anahtarınızı `OPENAI_API_KEY` alanına, Structured Outputs destekleyen model adını `OPENAI_MODEL` alanına yazın. Model adı kodda hard-code edilmez.

## 9. Environment Variables

```env
NODE_ENV=production
LOG_LEVEL=info
TELEGRAM_BOT_TOKEN=
ALLOWED_TELEGRAM_USER_ID=
OPENAI_API_KEY=
OPENAI_MODEL=
DATABASE_PATH=/app/data/expenses.db
DEFAULT_TIMEZONE=Europe/Istanbul
PENDING_EXPENSE_TTL_MINUTES=30
MAX_MESSAGE_LENGTH=2000
```

## 10. Lokal Geliştirme Kurulumu

```bash
cp .env.example .env
nano .env
corepack enable
pnpm install
pnpm dev
```

## 11. Migration Çalıştırma

```bash
pnpm db:migrate
```

Migration parent database dizinini oluşturur, WAL ve foreign key ayarlarını uygular.

## 12. Testleri Çalıştırma

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm format:check
```

Testler geçici SQLite dosyaları kullanır; production database dosyasına yazmaz.

## 13. Docker ile Lokal Çalıştırma

```bash
cp .env.example .env
nano .env
mkdir -p data backups
docker compose up -d --build
docker compose logs -f expense-bot
```

## 14. Linux VPS Hazırlama

```bash
sudo apt update
sudo apt install -y git docker.io docker-compose-plugin
sudo systemctl enable --now docker
```

## 15. Projeyi VPS'ye Aktarma

Projeyi Git ile VPS’ye alın veya `rsync` ile kopyalayın. Ardından proje dizinine girin.

```bash
cd tracker_bot
```

## 16. Docker Compose ile Başlatma

```bash
cp .env.example .env
nano .env
mkdir -p data backups
docker compose up -d --build
```

## 17. Logları Görüntüleme

```bash
docker compose logs -f expense-bot
```

Loglarda token, API key, tam kullanıcı mesajı veya raw OpenAI cevabı tutulmaz.

## 18. Uygulamayı Güncelleme

```bash
git pull
docker compose up -d --build
docker image prune -f
```

## 19. SQLite Veritabanının Kalıcı Tutulması

Compose dosyası `./data:/app/data` bind mount kullanır. Container yeniden oluşturulsa bile `./data/expenses.db` korunur.

## 20. Manuel Backup Alma

Telegram’da `/backup` komutunu kullanabilir veya VPS üzerinde script çalıştırabilirsiniz.

```bash
chmod +x scripts/backup.sh
./scripts/backup.sh
```

## 21. Otomatik Günlük Backup için Cron Örneği

```cron
0 3 * * * cd /opt/tracker_bot && KEEP_DAYS=30 ./scripts/backup.sh >> backups/backup.log 2>&1
```

## 22. Restore İşlemi

```bash
chmod +x scripts/restore.sh
./scripts/restore.sh backups/expenses-2026-08-03-235900.db
```

Restore öncesi container durdurulur, seçilen backup `data/expenses.db` olarak yerleştirilir ve servis yeniden başlatılır.

## 23. CSV Export

Telegram’da `/export` komutu silinmemiş giderleri UTF-8 BOM içeren CSV olarak gönderir. Kolonlar Tarih, Tutar, Para birimi, Kategori, İşletme ve Açıklama alanlarıdır.

## 24. Güvenlik Notları

Bot yalnızca tek Telegram kullanıcı ID’sine hizmet verir. Yetkisiz istekler kısa mesajla reddedilir. SQL sorguları prepared statement kullanır. Callback verisi doğrulanır. Geçici export ve backup dosyaları gönderimden sonra silinir. Docker container root olmayan kullanıcı ile çalışır. SIGINT ve SIGTERM ile graceful shutdown uygulanır.

## 25. Sık Karşılaşılan Hatalar

Bot başlamıyorsa `.env` değerlerini kontrol edin. SQLite yazamıyorsa `data/` dizini izinlerini düzeltin. OpenAI çağrısı başarısız olursa basit gider mesajları kural tabanlı parser ile çalışmaya devam eder.
