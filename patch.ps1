$file = "C:\Users\johan\.gemini\antigravity\scratch\rtk\esp32\RTK_Tracker.ino"
$content = [System.IO.File]::ReadAllText($file)

$matches = 0

# PATCH 1
$f1 = "struct GpsData {`r`n  double  lat  = 0.0;`r`n  double  lon  = 0.0;`r`n  uint8_t fix  = 0;`r`n  uint8_t sats = 0;`r`n  uint8_t bat  = 0;`r`n  float   hdop = 99.9;`r`n};"
$r1 = "struct GpsData {`r`n  double  lat  = 0.0;`r`n  double  lon  = 0.0;`r`n  uint8_t fix  = 0;`r`n  uint8_t sats = 0;`r`n  float   hdop = 99.9;`r`n};"
if ($content.Contains($f1)) { $content = $content.Replace($f1, $r1); $matches++ } else { Write-Host "P1 missing" }

# PATCH 2 is already applied, so skip it. Wait, the prompt says "Apply ALL patches". I should include it and if it's missing, it's missing. But wait! Since it's partially applied, maybe I should revert it? No, if it's applied, I'll just skip it. But let's check if it exists:
$f2 = "String nmeaBuffer = `"`";"
$r2 = "String nmeaBuffer = `"`";`r`nbool    nmeaErrorBuf[60] = {false};`r`nuint8_t nmeaErrorIdx     = 0;`r`nuint8_t nmeaErrorPct     = 0;"
if ($content.Contains($f2)) { $content = $content.Replace($f2, $r2); $matches++ } else { Write-Host "P2 missing (already applied?)" }

# PATCH 3
$f3 = "void parseGNGGA(String sentence) {`r`n  int field = 0;`r`n  String fields[15];`r`n  for (int i = 0; i < sentence.length(); i++) {`r`n    if (sentence[i] == ',' || sentence[i] == '*') {`r`n      field++;`r`n    } else {`r`n      if (field < 15) fields[field] += sentence[i];`r`n    }`r`n  }`r`n  if (fields[0] != `"`$GNGGA`") return;`r`n  if (fields[2].length() > 0) {`r`n    float rawLat = fields[2].toFloat();`r`n    int deg = (int)(rawLat / 100);`r`n    float min = rawLat - deg * 100;`r`n    gps.lat = deg + min / 60.0;`r`n    if (fields[3] == `"S`") gps.lat = -gps.lat;`r`n  }`r`n  if (fields[4].length() > 0) {`r`n    float rawLon = fields[4].toFloat();`r`n    int deg = (int)(rawLon / 100);`r`n    float min = rawLon - deg * 100;`r`n    gps.lon = deg + min / 60.0;`r`n    if (fields[5] == `"W`") gps.lon = -gps.lon;`r`n  }`r`n  gps.fix  = fields[6].toInt();`r`n  gps.sats = fields[7].toInt();`r`n  // Field 8 = HDOP (horizontal dilution of precision)`r`n  if (fields[8].length() > 0) gps.hdop = fields[8].toFloat();`r`n}"
$r3 = "// ─────────────────────────────────────────────────────────────────────────────`r`n//  NMEA checksum validator`r`n// ─────────────────────────────────────────────────────────────────────────────`r`nbool isValidNMEA(const String& s) {`r`n  if (s.length() < 4 || s[0] != '`$') return false;`r`n  int star = s.lastIndexOf('*');`r`n  if (star < 0 || (int)s.length() < star + 3) return false;`r`n  uint8_t calc = 0;`r`n  for (int i = 1; i < star; i++) calc ^= (uint8_t)s[i];`r`n  String hex = s.substring(star + 1, star + 3);`r`n  hex.toUpperCase();`r`n  char expected[3];`r`n  snprintf(expected, sizeof(expected), `"%02X`", calc);`r`n  return hex == String(expected);`r`n}`r`n`r`n// ─────────────────────────────────────────────────────────────────────────────`r`n//  NMEA GNGGA sentence parser — populates the global gps struct`r`n// ─────────────────────────────────────────────────────────────────────────────`r`nvoid parseGNGGA(String sentence) {`r`n  if (!isValidNMEA(sentence)) return;`r`n  int field = 0;`r`n  String fields[15];`r`n  for (int i = 0; i < sentence.length(); i++) {`r`n    if (sentence[i] == ',' || sentence[i] == '*') {`r`n      field++;`r`n    } else {`r`n      if (field < 15) fields[field] += sentence[i];`r`n    }`r`n  }`r`n  if (fields[0] != `"`$GNGGA`") return;`r`n  if (fields[2].length() > 0) {`r`n    double rawLat = fields[2].toDouble();`r`n    double deg    = (double)((int)(rawLat / 100.0));`r`n    double mn     = rawLat - deg * 100.0;`r`n    gps.lat = deg + mn / 60.0;`r`n    if (fields[3] == `"S`") gps.lat = -gps.lat;`r`n  }`r`n  if (fields[4].length() > 0) {`r`n    double rawLon = fields[4].toDouble();`r`n    double deg    = (double)((int)(rawLon / 100.0));`r`n    double mn     = rawLon - deg * 100.0;`r`n    gps.lon = deg + mn / 60.0;`r`n    if (fields[5] == `"W`") gps.lon = -gps.lon;`r`n  }`r`n  gps.fix  = fields[6].toInt();`r`n  gps.sats = fields[7].toInt();`r`n  // Field 8 = HDOP (horizontal dilution of precision)`r`n  if (fields[8].length() > 0) gps.hdop = (float)fields[8].toDouble();`r`n}"
if ($content.Contains($f3)) { $content = $content.Replace($f3, $r3); $matches++ } else { Write-Host "P3 missing" }

# PATCH 4
$f4 = "void rtkCallback(char* data, uint8_t len) {`r`n  for (uint8_t i = 0; i < len; i++) {`r`n    char c = data[i];`r`n    if (c == '\n') {`r`n      parseGNGGA(nmeaBuffer);`r`n      nmeaBuffer = `"`";`r`n    } else {`r`n      nmeaBuffer += c;`r`n    }`r`n  }`r`n}"
$r4 = "void rtkCallback(char* data, uint8_t len) {`r`n  for (uint8_t i = 0; i < len; i++) {`r`n    char c = data[i];`r`n    if (c == '\n') {`r`n      nmeaBuffer.trim();`r`n      // Record checksum pass/fail in circular buffer`r`n      bool ok = isValidNMEA(nmeaBuffer);`r`n      nmeaErrorBuf[nmeaErrorIdx] = !ok;   // true = error`r`n      nmeaErrorIdx = (nmeaErrorIdx + 1) % 60;`r`n      // Recalculate error percentage`r`n      uint8_t errs = 0;`r`n      for (uint8_t j = 0; j < 60; j++) if (nmeaErrorBuf[j]) errs++;`r`n      nmeaErrorPct = (uint8_t)((errs * 100u) / 60u);`r`n      // Parse (isValidNMEA is called again inside, cheap repeated check)`r`n      parseGNGGA(nmeaBuffer);`r`n      nmeaBuffer = `"`";`r`n    } else {`r`n      nmeaBuffer += c;`r`n    }`r`n  }`r`n}"
if ($content.Contains($f4)) { $content = $content.Replace($f4, $r4); $matches++ } else { Write-Host "P4 missing" }

# PATCH 5
$f5 = "void broadcastGps() {`r`n  StaticJsonDocument<160> doc;`r`n  doc[`"lat`"]  = serialized(String(gps.lat,  7));`r`n  doc[`"lon`"]  = serialized(String(gps.lon,  7));`r`n  doc[`"fix`"]  = gps.fix;`r`n  doc[`"sats`"] = gps.sats;`r`n  doc[`"bat`"]  = gps.bat;`r`n  doc[`"hdop`"] = serialized(String(gps.hdop, 2));`r`n`r`n  char buf[160];`r`n  size_t n = serializeJson(doc, buf);`r`n  wsServer.broadcastTXT(buf, n);`r`n}"
$r5 = "void broadcastGps() {`r`n  StaticJsonDocument<200> doc;`r`n  doc[`"lat`"]  = serialized(String(gps.lat,  9));`r`n  doc[`"lon`"]  = serialized(String(gps.lon,  9));`r`n  doc[`"fix`"]  = gps.fix;`r`n  doc[`"sats`"] = gps.sats;`r`n  doc[`"hdop`"] = serialized(String(gps.hdop, 2));`r`n  doc[`"err`"]  = nmeaErrorPct;`r`n`r`n  char buf[200];`r`n  size_t n = serializeJson(doc, buf);`r`n  wsServer.broadcastTXT(buf, n);`r`n}"
if ($content.Contains($f5)) { $content = $content.Replace($f5, $r5); $matches++ } else { Write-Host "P5 missing" }

# PATCH 6
$f6 = "// ─────────────────────────────────────────────────────────────────────────────`r`n//  Read battery percentage from ADC on GPIO35 (2× voltage divider assumed)`r`n// ─────────────────────────────────────────────────────────────────────────────`r`nvoid readBattery() {`r`n  int raw = analogRead(35);`r`n  float voltage = raw / 4095.0 * 3.3 * 2.0;`r`n  float percent = (voltage - 3.5) / (4.2 - 3.5) * 100.0;`r`n  gps.bat = (uint8_t)constrain(percent, 0, 100);`r`n}"
$r6 = ""
if ($content.Contains($f6)) { $content = $content.Replace($f6, $r6); $matches++ } else { Write-Host "P6 missing" }

# PATCH 7
$f7 = "    readBattery();`r`n    broadcastGps();"
$r7 = "    broadcastGps();"
if ($content.Contains($f7)) { $content = $content.Replace($f7, $r7); $matches++ } else { Write-Host "P7 missing" }

# PATCH 8
$f8 = "*            {`"lat`":55.6647,`"lon`":13.07736,`"fix`":4,`"sats`":31,`"bat`":87,`"hdop`":0.51}"
$r8 = "*            {`"lat`":55.664700000,`"lon`":13.077360000,`"fix`":4,`"sats`":31,`"hdop`":0.51,`"err`":0}"
if ($content.Contains($f8)) { $content = $content.Replace($f8, $r8); $matches++ } else { Write-Host "P8 missing" }

[System.IO.File]::WriteAllText($file, $content)
$lines = ($content -split "`r`n").Count
Write-Host "Matched $matches patches. Final line count: $lines"
