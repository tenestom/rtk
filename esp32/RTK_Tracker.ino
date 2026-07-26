/**
 * RTK Tracker — ESP32 Firmware (self-contained, no LittleFS)
 * ─────────────────────────────────────────────────────────────────────────────
 * Port 80  — HTTP: serves a single-page app hardcoded in PROGMEM.
 *            Open http://192.168.4.1 on any device connected to the RTK WiFi.
 *
 * Port 81  — WebSocket: pushes a GPS JSON frame every second:
 *            {"lat":55.6647,"lon":13.07736,"fix":4,"sats":31,"bat":87}
 *
 * ── Required libraries (Arduino IDE → Library Manager) ───────────────────────
 *   • WebSockets  by Markus Sattler / Links2004   (WebSocketsServer)
 *   • ArduinoJson by Benoit Blanchon
 *   WebServer and WiFi are part of the ESP32 Arduino core — no extra install.
 *
 * ── No file upload needed — flash the sketch and you're done. ───────────────
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WebServer.h>
#include <WebSocketsServer.h>
#include <ArduinoJson.h>

// ── WiFi Access Point credentials ────────────────────────────────────────────
static const char* WIFI_SSID     = "RTK-Tracker";
static const char* WIFI_PASSWORD = "rtkrtkrtk";   // min 8 chars; use "" for open

// ── Server instances ──────────────────────────────────────────────────────────
WebServer        httpServer(80);
WebSocketsServer wsServer(81);

// ── GPS state ─────────────────────────────────────────────────────────────────
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
//  The entire web UI — stored in flash, not RAM
// ─────────────────────────────────────────────────────────────────────────────
const char INDEX_HTML[] PROGMEM = R"rawliteral(
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="theme-color" content="#080d1a">
<title>RTK Tracker</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{font-size:16px;-webkit-tap-highlight-color:transparent}
body{
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
  background:#080d1a;color:#e2e8f0;min-height:100dvh;overflow-x:hidden;
}
.app{display:flex;flex-direction:column;min-height:100dvh;max-width:480px;margin:0 auto}

/* ── Header ── */
.hdr{
  display:flex;align-items:center;justify-content:space-between;
  padding:18px 20px 14px;
  background:linear-gradient(180deg,#0a1020,transparent);
  position:sticky;top:0;z-index:10;
  backdrop-filter:blur(12px);
  border-bottom:1px solid rgba(99,179,237,.12);
}
.hdr-left{display:flex;align-items:center;gap:12px}
.logo{font-size:1.8rem}
.title{
  font-size:1.25rem;font-weight:800;letter-spacing:-.5px;
  background:linear-gradient(135deg,#60a5fa,#a78bfa);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.subtitle{font-size:.7rem;color:#64748b;font-weight:500;letter-spacing:.5px;text-transform:uppercase}

/* ── Connection badge ── */
.badge{
  display:flex;align-items:center;gap:7px;padding:6px 12px;
  border-radius:999px;font-size:.72rem;font-weight:600;
  border:1px solid transparent;transition:all .3s;
}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.con{background:rgba(34,197,94,.12);border-color:rgba(34,197,94,.3);color:#22c55e}
.con .dot{background:#22c55e;animation:pg 2s infinite}
.ing{background:rgba(245,158,11,.12);border-color:rgba(245,158,11,.3);color:#f59e0b}
.ing .dot{background:#f59e0b;animation:bl .9s step-end infinite}
.dis{background:rgba(239,68,68,.12);border-color:rgba(239,68,68,.3);color:#ef4444}
.dis .dot{background:#ef4444}
@keyframes pg{0%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}70%{box-shadow:0 0 0 8px transparent}100%{box-shadow:0 0 0 0 transparent}}
@keyframes bl{0%,100%{opacity:1}50%{opacity:.2}}

/* ── Cards ── */
.main{flex:1;display:flex;flex-direction:column;gap:14px;padding:20px 16px 8px}
.card{
  background:#0f1829;border:1px solid rgba(99,179,237,.12);border-radius:16px;
  padding:18px 20px;box-shadow:0 4px 32px rgba(0,0,0,.5);
  position:relative;overflow:hidden;transition:border-color .25s,transform .2s;
}
.card::before{
  content:'';position:absolute;inset:0;pointer-events:none;
  background:linear-gradient(135deg,rgba(59,130,246,.03),transparent 60%);
}
.card:active{transform:translateY(-1px);border-color:rgba(99,179,237,.28)}
.ch{display:flex;align-items:center;gap:8px;margin-bottom:14px}
.ci{font-size:1.1rem}
.ct{font-size:.72rem;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#64748b;flex:1}
.hint{font-size:.65rem;color:#64748b;font-weight:500}
.row{display:grid;grid-template-columns:1fr 1fr;gap:14px}

/* ── Coordinates ── */
.cg{display:flex;align-items:center}
.ci2{flex:1;display:flex;flex-direction:column;gap:4px}
.cl{font-size:.68rem;font-weight:600;color:#64748b;text-transform:uppercase;letter-spacing:.5px}
.cv{font-size:1.35rem;font-weight:700;letter-spacing:-.5px;font-variant-numeric:tabular-nums}
.cu{font-size:.7rem;color:#3b82f6;font-weight:600}
.cd{width:1px;height:50px;background:rgba(99,179,237,.12);margin:0 18px;flex-shrink:0}

/* ── Fix quality ── */
.fb{display:flex;flex-direction:column;align-items:center;gap:6px}
.fn{font-size:3rem;font-weight:900;line-height:1;letter-spacing:-2px;transition:color .4s,text-shadow .4s;color:#94a3b8}
.fl{font-size:.78rem;font-weight:700;transition:color .4s;color:#94a3b8}

/* ── Satellites ── */
.sb{display:flex;flex-direction:column;align-items:center;gap:8px}
.sn{
  font-size:3rem;font-weight:900;line-height:1;letter-spacing:-2px;
  background:linear-gradient(135deg,#60a5fa,#a78bfa);
  -webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;
}
.sd-wrap{display:flex;flex-wrap:wrap;gap:5px;justify-content:center;max-width:120px}
.sd{
  width:8px;height:8px;border-radius:50%;
  background:#162035;border:1px solid rgba(99,179,237,.12);
  transition:background .3s,box-shadow .3s;
}
.sd.on{background:#60a5fa;border-color:#60a5fa;box-shadow:0 0 6px rgba(96,165,250,.7)}
.su{font-size:.68rem;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:.5px}

/* ── Battery ── */
.bb{display:flex;flex-direction:column;align-items:center;gap:14px}
.bsvg-wrap{width:100%;max-width:260px}
.bsvg{width:100%;height:auto;display:block}
.br{display:flex;flex-direction:column;align-items:center;gap:4px}
.bp{font-size:2rem;font-weight:900;letter-spacing:-1px;color:#94a3b8;transition:color .5s}
.bs{font-size:.72rem;font-weight:600;letter-spacing:.5px;text-transform:uppercase;color:#64748b;transition:color .5s}

/* ── Footer ── */
.footer{padding:14px 20px 20px;text-align:center;font-size:.68rem;color:#64748b;letter-spacing:.3px}
</style>
</head>
<body>
<div class="app">

  <header class="hdr">
    <div class="hdr-left">
      <span class="logo">&#128225;</span>
      <div>
        <div class="title">RTK Tracker</div>
        <div class="subtitle">Real-time GPS Monitor</div>
      </div>
    </div>
    <div id="badge" class="badge dis">
      <span id="dot" class="dot"></span>
      <span id="blabel">Disconnected</span>
    </div>
  </header>

  <main class="main">

    <!-- Coordinates -->
    <div class="card" id="coord-card" onclick="copyCoords()" style="cursor:pointer" title="Tap to copy">
      <div class="ch">
        <span class="ci">&#127760;</span>
        <span class="ct">Coordinates</span>
        <span id="chint" class="hint"></span>
      </div>
      <div class="cg">
        <div class="ci2">
          <span class="cl">Latitude</span>
          <span id="lat" class="cv">&#8212;</span>
          <span class="cu">&#176;N</span>
        </div>
        <div class="cd"></div>
        <div class="ci2">
          <span class="cl">Longitude</span>
          <span id="lon" class="cv">&#8212;</span>
          <span class="cu">&#176;E</span>
        </div>
      </div>
    </div>

    <!-- Fix + Satellites -->
    <div class="row">
      <div class="card">
        <div class="ch">
          <span class="ci">&#127919;</span>
          <span class="ct">Fix Quality</span>
        </div>
        <div class="fb">
          <span id="fn" class="fn">&#8212;</span>
          <span id="fl" class="fl">No data</span>
        </div>
      </div>
      <div class="card">
        <div class="ch">
          <span class="ci">&#128752;</span>
          <span class="ct">Satellites</span>
        </div>
        <div class="sb">
          <span id="sn" class="sn">&#8212;</span>
          <div id="sdots" class="sd-wrap"></div>
          <span class="su">in view</span>
        </div>
      </div>
    </div>

    <!-- Battery -->
    <div class="card">
      <div class="ch">
        <span class="ci">&#9889;</span>
        <span class="ct">Battery</span>
      </div>
      <div class="bb">
        <div class="bsvg-wrap">
          <svg id="bsvg" viewBox="0 0 220 100" class="bsvg">
            <rect id="bshell" x="4" y="14" width="196" height="72" rx="10"
                  fill="none" stroke="#94a3b8" stroke-width="4"/>
            <rect id="bterm" x="200" y="36" width="16" height="28" rx="4" fill="#94a3b8"/>
            <rect id="bfill" x="10" y="20" width="0" height="60" rx="6" fill="#94a3b8"
                  style="transition:width .6s ease,fill .6s ease"/>
            <text id="bpctsvg" x="102" y="63" text-anchor="middle"
                  font-size="28" font-weight="700"
                  font-family="-apple-system,BlinkMacSystemFont,sans-serif"
                  fill="#e2e8f0"></text>
          </svg>
        </div>
        <div class="br">
          <span id="bpct" class="bp">&#8212;</span>
          <span id="bstat" class="bs">No data</span>
        </div>
      </div>
    </div>

  </main>
  <footer id="footer" class="footer">Connecting to ws://192.168.4.1:81 &#8230;</footer>
</div>

<script>
// Build satellite dots
(function(){
  var w = document.getElementById('sdots');
  for (var i = 0; i < 12; i++) {
    var d = document.createElement('span');
    d.className = 'sd';
    d.id = 'sd' + i;
    w.appendChild(d);
  }
})();

var FIX = {
  0:['No Fix','#ef4444'], 1:['GPS','#f59e0b'], 2:['DGPS','#eab308'],
  3:['PPS','#84cc16'],    4:['RTK Fixed','#22c55e'], 5:['RTK Float','#10b981'],
  6:['Dead Reckoning','#6366f1']
};

var lastLat = null, lastLon = null;
var ws, retryDelay = 1000, retryTimer;

function connect() {
  clearTimeout(retryTimer);
  setBadge('ing', 'Connecting\u2026');
  ws = new WebSocket('ws://192.168.4.1:81');
  ws.onopen    = function() { setBadge('con', 'Connected'); retryDelay = 1000; };
  ws.onmessage = function(e) { try { render(JSON.parse(e.data)); } catch(_) {} };
  ws.onerror   = function() {};
  ws.onclose   = function() {
    setBadge('dis', 'Disconnected');
    document.getElementById('footer').textContent =
      'Reconnecting in ' + (retryDelay / 1000).toFixed(0) + ' s\u2026';
    retryTimer = setTimeout(function() {
      retryDelay = Math.min(retryDelay * 2, 10000);
      connect();
    }, retryDelay);
  };
}

function setBadge(cls, label) {
  document.getElementById('badge').className = 'badge ' + cls;
  document.getElementById('blabel').textContent = label;
}

function render(d) {
  // Coordinates
  lastLat = d.lat; lastLon = d.lon;
  document.getElementById('lat').textContent = (d.lat != null) ? d.lat.toFixed(7) : '\u2014';
  document.getElementById('lon').textContent = (d.lon != null) ? d.lon.toFixed(7) : '\u2014';
  if (d.lat != null) document.getElementById('chint').textContent = 'tap to copy';

  // Fix quality
  var fi = FIX[d.fix] || ['\u2014', '#94a3b8'];
  var fn = document.getElementById('fn'), fl = document.getElementById('fl');
  fn.textContent = (d.fix != null) ? d.fix : '\u2014';
  fn.style.color = fi[1];
  fn.style.textShadow = '0 0 20px ' + fi[1] + '55';
  fl.textContent = fi[0]; fl.style.color = fi[1];

  // Satellites
  var sats = d.sats || 0;
  document.getElementById('sn').textContent = (d.sats != null) ? d.sats : '\u2014';
  for (var i = 0; i < 12; i++) {
    var dot = document.getElementById('sd' + i);
    if (dot) dot.className = 'sd' + (i < sats ? ' on' : '');
  }

  // Battery
  var pct = d.bat;
  var col = (pct == null) ? '#94a3b8' : (pct < 20) ? '#ef4444' : (pct < 40) ? '#f59e0b' : '#22c55e';
  var fillW = (pct != null) ? (Math.max(2, pct) / 100 * 184) : 0;
  document.getElementById('bfill').setAttribute('width', fillW);
  document.getElementById('bfill').style.fill  = col;
  document.getElementById('bshell').style.stroke = col;
  document.getElementById('bterm').style.fill  = col;
  var svgT = document.getElementById('bpctsvg');
  svgT.textContent = (pct != null) ? pct + '%' : '';
  svgT.style.fill  = (pct != null && pct < 30) ? col : '#0f172a';
  document.getElementById('bpct').textContent  = (pct != null) ? pct + '%' : '\u2014';
  document.getElementById('bpct').style.color  = col;
  var st = (pct == null) ? 'No data' : (pct < 20) ? 'Low \u2014 charge soon' :
           (pct < 40) ? 'Moderate' : (pct < 75) ? 'Good' : 'Excellent';
  document.getElementById('bstat').textContent = st;
  document.getElementById('bstat').style.color = col;

  document.getElementById('footer').textContent =
    'Last update: ' + new Date().toLocaleTimeString();
}

function copyCoords() {
  if (lastLat == null) return;
  var t = lastLat.toFixed(7) + ', ' + lastLon.toFixed(7);
  if (navigator.clipboard) {
    navigator.clipboard.writeText(t).then(function() {
      document.getElementById('chint').textContent = '\u2713 Copied!';
      setTimeout(function() {
        document.getElementById('chint').textContent = 'tap to copy';
      }, 1500);
    });
  }
}

connect();
</script>
</body>
</html>
)rawliteral";

// ─────────────────────────────────────────────────────────────────────────────
//  WebSocket event handler
// ─────────────────────────────────────────────────────────────────────────────
void onWsEvent(uint8_t num, WStype_t type, uint8_t* payload, size_t length) {
  switch (type) {
    case WStype_CONNECTED:
      Serial.printf("[WS] Client #%u connected\n", num);
      break;
    case WStype_DISCONNECTED:
      Serial.printf("[WS] Client #%u disconnected\n", num);
      break;
    default:
      break;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Broadcast one GPS JSON frame to all WebSocket clients
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
//  Read GPS — replace with your real GPS library calls
// ─────────────────────────────────────────────────────────────────────────────
void readGps() {
  // ── Replace this block with your GPS library ─────────────────────────────
  // Example using TinyGPS++:
  //   while (gpsSerial.available()) gpsParser.encode(gpsSerial.read());
  //   if (gpsParser.location.isUpdated()) {
  //     gps.lat  = gpsParser.location.lat();
  //     gps.lon  = gpsParser.location.lng();
  //     gps.fix  = ...; // NMEA GGA fix quality field
  //     gps.sats = gpsParser.satellites.value();
  //   }
  // ─────────────────────────────────────────────────────────────────────────

  // Placeholder — remove when integrating real GPS
  gps.lat  = 55.6647000;
  gps.lon  = 13.0773600;
  gps.fix  = 4;
  gps.sats = 31;
  gps.bat  = 87;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Read battery percentage — adjust pin / voltage divider for your hardware
// ─────────────────────────────────────────────────────────────────────────────
void readBattery() {
  // Example: 100k/100k divider on GPIO34, 3.7 V LiPo (3.0–4.2 V)
  // const float v   = analogRead(34) * (3.3f / 4095.0f) * 2.0f;
  // gps.bat = (uint8_t)constrain((v - 3.0f) / (4.2f - 3.0f) * 100.0f, 0, 100);
}

// ─────────────────────────────────────────────────────────────────────────────
//  setup()
// ─────────────────────────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  delay(300);
  Serial.println("\n[RTK Tracker] Starting…");

  // ── WiFi Access Point ──────────────────────────────────────────────────────
  WiFi.mode(WIFI_AP);
  WiFi.softAP(WIFI_SSID, strlen(WIFI_PASSWORD) ? WIFI_PASSWORD : nullptr);
  Serial.printf("[WiFi] AP \"%s\" up — http://%s\n",
                WIFI_SSID, WiFi.softAPIP().toString().c_str());

  // ── HTTP server (port 80) ──────────────────────────────────────────────────
  // Serve the embedded page for every request (single-page app).
  httpServer.onNotFound([]() {
    httpServer.send_P(200, "text/html", INDEX_HTML);
  });
  httpServer.on("/", []() {
    httpServer.send_P(200, "text/html", INDEX_HTML);
  });
  httpServer.begin();
  Serial.println("[HTTP] Server started on port 80");

  // ── WebSocket server (port 81) ─────────────────────────────────────────────
  wsServer.begin();
  wsServer.onEvent(onWsEvent);
  Serial.println("[WS]   Server started on port 81");

  Serial.println("[RTK Tracker] Ready — connect to \"" + String(WIFI_SSID) +
                 "\" and open http://192.168.4.1");
}

// ─────────────────────────────────────────────────────────────────────────────
//  loop()
// ─────────────────────────────────────────────────────────────────────────────
void loop() {
  httpServer.handleClient();
  wsServer.loop();

  uint32_t now = millis();
  if (now - lastBroadcast >= BROADCAST_INTERVAL_MS) {
    lastBroadcast = now;
    readGps();
    readBattery();
    broadcastGps();
  }
}
