/**
 * RTK Tracker — ESP32 Firmware
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves two things on the same device:
 *
 *   Port 80  — HTTP static file server (LittleFS)
 *              Serves the built React PWA so the user can open
 *              http://192.168.4.1 and get live data with no mixed-content issue.
 *
 *   Port 81  — WebSocket server
 *              Pushes a JSON GPS frame every second:
 *              {"lat":55.6647,"lon":13.07736,"fix":4,"sats":31,"bat":87}
 *
 * ── Setup ────────────────────────────────────────────────────────────────────
 *  1. Install libraries (Arduino IDE → Library Manager):
 *       - ESPAsyncWebServer  (me-no-dev)
 *       - AsyncTCP           (me-no-dev)
 *       - WebSockets         (Markus Sattler / Links2004)
 *       - ArduinoJson        (Benoit Blanchon)
 *
 *  2. Build the React app and copy files to the data/ folder:
 *       cd <project root>
 *       npm run build:esp32
 *     (This runs `vite build` then copies dist/ → esp32/data/)
 *
 *  3. Upload the data/ folder to LittleFS:
 *       Arduino IDE → Tools → ESP32 LittleFS Data Upload
 *       (Requires: https://github.com/lorol/LITTLEFS/releases — data upload plugin)
 *
 *  4. Flash this sketch.
 *
 * ── WiFi ─────────────────────────────────────────────────────────────────────
 *  The ESP32 runs as a WiFi Access Point (AP).
 *  Connect your phone/laptop to the RTK network, then open http://192.168.4.1
 *
 *  Modify WIFI_SSID / WIFI_PASSWORD below to match your setup.
 * ─────────────────────────────────────────────────────────────────────────────
 */

#include <Arduino.h>
#include <WiFi.h>
#include <LittleFS.h>
#include <ESPAsyncWebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// ── WiFi Access Point credentials ────────────────────────────────────────────
static const char* WIFI_SSID     = "RTK-Tracker";
static const char* WIFI_PASSWORD = "rtkrtkrtk";        // min 8 chars; "" for open

// ── Server instances ──────────────────────────────────────────────────────────
AsyncWebServer   httpServer(80);
WebSocketsServer wsServer(81);

// ── GPS data (replace with your real GPS library reads) ──────────────────────
struct GpsData {
  double  lat  = 0.0;
  double  lon  = 0.0;
  uint8_t fix  = 0;
  uint8_t sats = 0;
  uint8_t bat  = 0;
};

GpsData gps;

// ── Timing ────────────────────────────────────────────────────────────────────
static uint32_t lastBroadcast = 0;
static const uint32_t BROADCAST_INTERVAL_MS = 1000;

// ─────────────────────────────────────────────────────────────────────────────
// MIME type helper
// ─────────────────────────────────────────────────────────────────────────────
static String mimeType(const String& path) {
  if (path.endsWith(".html"))    return "text/html";
  if (path.endsWith(".js"))      return "application/javascript";
  if (path.endsWith(".css"))     return "text/css";
  if (path.endsWith(".json"))    return "application/json";
  if (path.endsWith(".webmanifest")) return "application/manifest+json";
  if (path.endsWith(".png"))     return "image/png";
  if (path.endsWith(".svg"))     return "image/svg+xml";
  if (path.endsWith(".ico"))     return "image/x-icon";
  if (path.endsWith(".woff2"))   return "font/woff2";
  if (path.endsWith(".woff"))    return "font/woff";
  return "application/octet-stream";
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP server setup
// ─────────────────────────────────────────────────────────────────────────────
void setupHttpServer() {
  // Serve every request by looking up the path in LittleFS.
  // If the file exists, serve it with the correct MIME type.
  // Unknown paths → send index.html (SPA client-side routing).
  httpServer.onNotFound([](AsyncWebServerRequest* req) {
    String path = req->url();

    // Normalise: strip query string
    int qmark = path.indexOf('?');
    if (qmark >= 0) path = path.substring(0, qmark);

    // Try the exact path first
    if (LittleFS.exists(path)) {
      // Check for pre-compressed .gz sibling
      String gzPath = path + ".gz";
      if (LittleFS.exists(gzPath)) {
        AsyncWebServerResponse* r = req->beginResponse(LittleFS, gzPath, mimeType(path));
        r->addHeader("Content-Encoding", "gzip");
        r->addHeader("Cache-Control", "public, max-age=31536000, immutable");
        req->send(r);
        return;
      }
      req->send(LittleFS, path, mimeType(path));
      return;
    }

    // SPA fallback: serve index.html for any unrecognised path
    if (LittleFS.exists("/index.html")) {
      req->send(LittleFS, "/index.html", "text/html");
    } else {
      req->send(404, "text/plain", "Not found — upload LittleFS data first");
    }
  });

  // Cache-control headers for hashed assets (they have content hash in filename)
  httpServer.on("/*", HTTP_GET, [](AsyncWebServerRequest* req) {
    String path = req->url();
    // Assets folder uses content-hash filenames → long cache
    if (path.startsWith("/assets/")) {
      AsyncWebServerResponse* r = req->beginResponse(LittleFS, path, mimeType(path));
      r->addHeader("Cache-Control", "public, max-age=31536000, immutable");
      req->send(r);
    } else {
      req->send(LittleFS, path, mimeType(path));
    }
  });

  httpServer.begin();
  Serial.println("[HTTP] Server started on port 80");
}

// ─────────────────────────────────────────────────────────────────────────────
// WebSocket event handler
// ─────────────────────────────────────────────────────────────────────────────
void onWsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[WS] Client #%u connected\n", num);
      break;
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u disconnected\n", num);
      break;
    case WStype_TEXT:
      // We don't expect incoming text from the client, but handle gracefully
      Serial.printf("[WS] Client #%u sent: %s\n", num, payload);
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast GPS frame to all connected WebSocket clients
// ─────────────────────────────────────────────────────────────────────────────
void broadcastGps() {
  StaticJsonDocument<128> doc;
  doc["lat"]  = serialized(String(gps.lat,  7));
  doc["lon"]  = serialized(String(gps.lon,  7));
  doc["fix"]  = gps.fix;
  doc["sats"] = gps.sats;
  doc["bat"]  = gps.bat;

  char buf[128];
  size_t n = serializeJson(doc, buf);
  wsServer.broadcastTXT(buf, n);
}

// ─────────────────────────────────────────────────────────────────────────────
// Update GPS fields — replace with your real GPS library
// ─────────────────────────────────────────────────────────────────────────────
void readGps() {
  // ── Replace this block with your GPS library calls ──────────────────────
  // Example (TinyGPS++):
  //   while (gpsSerial.available()) gpsParser.encode(gpsSerial.read());
  //   if (gpsParser.location.isValid()) {
  //     gps.lat  = gpsParser.location.lat();
  //     gps.lon  = gpsParser.location.lng();
  //     gps.fix  = (uint8_t)gpsParser.hdop.value(); // or your NMEA fix quality
  //     gps.sats = gpsParser.satellites.value();
  //   }
  // ────────────────────────────────────────────────────────────────────────

  // Placeholder — remove when integrating real GPS
  gps.lat  = 55.6647000 + (millis() % 1000) * 0.000001;
  gps.lon  = 13.0773600 + (millis() % 500)  * 0.000001;
  gps.fix  = 4;
  gps.sats = 31;
  gps.bat  = 87;
}

// ─────────────────────────────────────────────────────────────────────────────
// Read battery voltage from ADC (adjust pin / divider for your hardware)
// ─────────────────────────────────────────────────────────────────────────────
void readBattery() {
  // Example: 100k/100k divider on GPIO34, 3.7V LiPo (3.0–4.2V range)
  // const float raw    = analogRead(34) * (3.3f / 4095.0f) * 2.0f; // ×2 for divider
  // const float pct    = (raw - 3.0f) / (4.2f - 3.0f) * 100.0f;
  // gps.bat = (uint8_t)constrain(pct, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
// setup()
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[RTK Tracker] Booting…");

  // ── LittleFS ──────────────────────────────────────────────────────────────
  if (!LittleFS.begin(true)) {
    Serial.println("[FS] LittleFS mount failed — upload data folder first!");
  } else {
    Serial.println("[FS] LittleFS mounted OK");
  }

  // ── WiFi AP ───────────────────────────────────────────────────────────────
  WiFi.mode(WIFI_AP);
  WiFi.softAP(WIFI_SSID, strlen(WIFI_PASSWORD) ? WIFI_PASSWORD : nullptr);
  Serial.printf("[WiFi] AP: %s  IP: %s\n", WIFI_SSID,
                WiFi.softAPIP().toString().c_str());

  // ── HTTP server (port 80) ─────────────────────────────────────────────────
  setupHttpServer();

  // ── WebSocket server (port 81) ────────────────────────────────────────────
  wsServer.begin();
  wsServer.onEvent(onWsEvent);
  Serial.println("[WS] Server started on port 81");

  Serial.println("[RTK Tracker] Ready — open http://192.168.4.1 on the RTK network");
}

// ─────────────────────────────────────────────────────────────────────────────
// loop()
// ─────────────────────────────────────────────────────────────────────────────
void loop() {
  wsServer.loop();

  uint32_t now = millis();
  if (now - lastBroadcast >= BROADCAST_INTERVAL_MS) {
    lastBroadcast = now;
    readGps();
    readBattery();
    broadcastGps();
  }
}
