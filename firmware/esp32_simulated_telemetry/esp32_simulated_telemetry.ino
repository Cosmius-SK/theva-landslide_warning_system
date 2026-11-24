#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <time.h>
#include <string.h>

#include "secrets.h"

static constexpr char kTestLabel[] = "SIMULATED TEST ONLY";
static constexpr uint32_t kSampleIntervalMs = 10'000;
static constexpr uint32_t kMaxRetryDelayMs = 30'000;
static constexpr uint32_t kWifiRetryLimit = 5;
static constexpr uint32_t kWifiCooldownMs = 60'000;
static constexpr size_t kPayloadCapacity = 512;

Preferences preferences;
uint64_t lastSequence = 0;
uint64_t pendingSequence = 0;
uint32_t retryDelayMs = 2'000;
uint32_t nextAttemptAt = 0;
bool clockReady = false;
uint8_t wifiRetryCount = 0;
uint32_t nextWifiRetryAt = 0;
uint32_t wifiRetryDelayMs = 1'000;

bool telemetryUrlIsHttps() {
  return strncmp(THEVA_TELEMETRY_URL, "https://", 8) == 0 && strlen(THEVA_TELEMETRY_URL) > 8;
}

void maintainWifiConnection() {
  if (WiFi.status() == WL_CONNECTED) {
    wifiRetryCount = 0;
    wifiRetryDelayMs = 1'000;
    return;
  }
  if (static_cast<int32_t>(millis() - nextWifiRetryAt) < 0) return;
  if (wifiRetryCount >= kWifiRetryLimit) {
    Serial.println("Wi-Fi reconnect retry limit reached; waiting before another bounded retry batch.");
    wifiRetryCount = 0;
    nextWifiRetryAt = millis() + kWifiCooldownMs;
    return;
  }
  wifiRetryCount++;
  WiFi.reconnect();
  Serial.printf("Wi-Fi reconnect attempt %u of %u.\n", wifiRetryCount, kWifiRetryLimit);
  nextWifiRetryAt = millis() + wifiRetryDelayMs;
  wifiRetryDelayMs = min(wifiRetryDelayMs * 2, kMaxRetryDelayMs);
}

struct SimulatedReadings {
  uint8_t moisture;
  uint8_t rainfall;
  uint8_t movement;
};

SimulatedReadings pendingReadings{};

SimulatedReadings nextSimulatedReadings() {
  return {
    static_cast<uint8_t>(20 + esp_random() % 61),
    static_cast<uint8_t>(10 + esp_random() % 81),
    static_cast<uint8_t>(esp_random() % 41)
  };
}

bool waitForClock() {
  configTime(0, 0, "pool.ntp.org", "time.google.com");
  const uint32_t startedAt = millis();
  time_t now = 0;
  while (millis() - startedAt < 20'000) {
    time(&now);
    if (now > 1'700'000'000) return true;
    delay(250);
  }
  return false;
}

bool makePayload(char *buffer, size_t capacity, uint64_t sequence, const SimulatedReadings &readings) {
  time_t now;
  time(&now);
  struct tm utc;
  gmtime_r(&now, &utc);
  char sentAt[25];
  if (strftime(sentAt, sizeof(sentAt), "%Y-%m-%dT%H:%M:%SZ", &utc) == 0) return false;

  const int length = snprintf(
    buffer,
    capacity,
    "{\"deviceId\":\"%s\",\"sequence\":%llu,\"sentAt\":\"%s\",\"label\":\"%s\",\"readings\":{\"moisture\":%u,\"rainfall\":%u,\"movement\":%u}}",
    THEVA_DEVICE_ID,
    static_cast<unsigned long long>(sequence),
    sentAt,
    kTestLabel,
    readings.moisture,
    readings.rainfall,
    readings.movement
  );
  return length > 0 && static_cast<size_t>(length) < capacity;
}

uint64_t readLastSequenceFromConflict(const String &responseBody) {
  const String key = "\"lastSequence\":";
  const int start = responseBody.indexOf(key);
  if (start < 0) return 0;
  int cursor = start + key.length();
  while (cursor < responseBody.length() && responseBody[cursor] == ' ') cursor++;
  uint64_t value = 0;
  bool foundDigit = false;
  while (cursor < responseBody.length() && responseBody[cursor] >= '0' && responseBody[cursor] <= '9') {
    foundDigit = true;
    value = value * 10 + static_cast<uint8_t>(responseBody[cursor] - '0');
    cursor++;
  }
  return foundDigit ? value : 0;
}

void scheduleRetry() {
  nextAttemptAt = millis() + retryDelayMs;
  retryDelayMs = min(retryDelayMs * 2, kMaxRetryDelayMs);
}

void sendSimulatedTelemetry() {
  if (!telemetryUrlIsHttps()) {
    Serial.println("Telemetry URL must use HTTPS; request suppressed.");
    scheduleRetry();
    return;
  }
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Wi-Fi unavailable; telemetry send postponed.");
    scheduleRetry();
    return;
  }
  if (!clockReady) {
    clockReady = waitForClock();
    if (!clockReady) {
      Serial.println("UTC clock unavailable; telemetry send postponed.");
      scheduleRetry();
      return;
    }
  }

  if (pendingSequence == 0) {
    pendingSequence = lastSequence + 1;
    lastSequence = pendingSequence;
    pendingReadings = nextSimulatedReadings();
    preferences.putULong64("lastSequence", lastSequence);
  }
  char payload[kPayloadCapacity];
  if (!makePayload(payload, sizeof(payload), pendingSequence, pendingReadings)) {
    Serial.println("Telemetry payload could not be prepared.");
    scheduleRetry();
    return;
  }

  Serial.printf("%s | moisture=%u rainfall=%u movement=%u sequence=%llu\n",
    kTestLabel, pendingReadings.moisture, pendingReadings.rainfall, pendingReadings.movement,
    static_cast<unsigned long long>(pendingSequence));

  WiFiClientSecure tlsClient;
  tlsClient.setCACert(THEVA_ROOT_CA);
  HTTPClient http;
  if (!http.begin(tlsClient, THEVA_TELEMETRY_URL)) {
    Serial.println("HTTPS request setup failed; credentials were not printed.");
    scheduleRetry();
    return;
  }
  http.setTimeout(8'000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + THEVA_DEVICE_TOKEN);
  const int status = http.POST(reinterpret_cast<uint8_t *>(payload), strlen(payload));

  if (status == 200) {
    pendingSequence = 0;
    retryDelayMs = 2'000;
    nextAttemptAt = millis() + kSampleIntervalMs;
    Serial.println("HTTPS telemetry accepted.");
  } else if (status == 409) {
    const uint64_t acceptedSequence = readLastSequenceFromConflict(http.getString());
    if (acceptedSequence > lastSequence) {
      lastSequence = acceptedSequence;
      preferences.putULong64("lastSequence", lastSequence);
    }
    pendingSequence = 0;
    retryDelayMs = 2'000;
    nextAttemptAt = millis() + 1'000;
    Serial.printf("Sequence conflict; synchronized to server sequence %llu.\n", static_cast<unsigned long long>(lastSequence));
  } else if (status < 0) {
    Serial.printf("HTTPS transport failed (code %d); retrying with backoff.\n", status);
    scheduleRetry();
  } else {
    Serial.printf("Telemetry API returned HTTP %d; response body and credentials suppressed.\n", status);
    scheduleRetry();
  }
  http.end();
}

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("Theva ESP32-S3 telemetry test firmware");
  Serial.println("SIMULATED TEST ONLY — readings are generated values, not potentiometer measurements.");

  preferences.begin("theva-telemetry", false);
  lastSequence = preferences.getULong64("lastSequence", 0);
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(THEVA_WIFI_SSID, THEVA_WIFI_PASSWORD);
  Serial.println("Connecting to configured Wi-Fi; credentials are not printed.");
  const uint32_t startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - startedAt < 30'000) delay(250);
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("Wi-Fi connected.");
    clockReady = waitForClock();
    if (clockReady) Serial.println("UTC clock synchronized.");
    else Serial.println("UTC clock not ready; sends will retry safely.");
  } else {
    Serial.println("Wi-Fi connection timed out; background retries will continue.");
  }
  nextAttemptAt = millis();
}

void loop() {
  maintainWifiConnection();
  if (static_cast<int32_t>(millis() - nextAttemptAt) >= 0) sendSimulatedTelemetry();
  delay(20);
}
