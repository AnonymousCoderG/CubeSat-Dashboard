/*
  Nova CubeSat Ground Station - NodeMCU Firmware v2.0
  This code replaces Blynk and sends data directly to your custom ground station.
  
  REQUIRED LIBRARIES:
  - ESP8266WiFi
  - ESP8266HTTPClient
  - ArduinoJson (Install via Library Manager)
  - DHT Sensor Library
  - MPU6050
  - Wire
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <MPU6050.h>
#include <DHT.h>

// ---------- WIFI CONFIG ----------
const char* ssid = "Myphone";
const char* pass = "Gouri@1997g";

// ---------- SERVER CONFIG ----------
// REPLACE WITH YOUR ACTUAL CLOUD RUN URL (e.g., https://your-app-id.a.run.app)
const char* serverUrl = "https://REPLACE_WITH_YOUR_APP_URL/api/telemetry";

// ---------- DHT11 ----------
#define DHTPIN D5
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);

// ---------- MQ SENSOR ----------
#define MQ_PIN A0

// ---------- MPU6050 ----------
MPU6050 mpu;

unsigned long lastTime = 0;
unsigned long timerDelay = 2000; // Send data every 2 seconds

void setup() {
  Serial.begin(115200);
  delay(1000);

  Serial.println("CubeSat System Starting (v2.0)...");

  // ---------- WIFI CONNECT ----------
  WiFi.begin(ssid, pass);
  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi Connected!");
  Serial.print("IP Address: ");
  Serial.println(WiFi.localIP());

  // ---------- I2C ----------
  Wire.begin(D2, D1); // SDA, SCL

  // ---------- MPU6050 ----------
  mpu.initialize();
  if (mpu.testConnection()) {
    Serial.println("MPU6050 Connected Successfully");
  } else {
    Serial.println("MPU6050 Connection Failed");
  }

  // ---------- DHT ----------
  dht.begin();

  Serial.println("System Ready - Direct Uplink Enabled");
}

void loop() {
  // Send data at intervals
  if ((millis() - lastTime) > timerDelay) {
    if (WiFi.status() == WL_CONNECTED) {
      sendTelemetry();
    } else {
      Serial.println("WiFi Disconnected!");
    }
    lastTime = millis();
  }
}

void sendTelemetry() {
  WiFiClientSecure client;
  client.setInsecure(); // Needed for HTTPS if you don't want to manage fingerprints
  HTTPClient http;

  // Read Sensors
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int mqv = analogRead(MQ_PIN);
  int gas = map(mqv, 0, 1023, 0, 100);

  int16_t ax, ay, az, gx, gy, gz;
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);
  int xAxis = gx / 100;
  int yAxis = gy / 100;
  int zAxis = gz / 100;

  // Check if readings are valid
  if (isnan(t) || isnan(h)) {
    Serial.println("Failed to read from DHT sensor!");
    return;
  }

  // Create JSON Payload
  StaticJsonDocument<200> doc;
  doc["temperature"] = t;
  doc["humidity"] = h;
  doc["gasPercent"] = gas;
  doc["xAxis"] = xAxis;
  doc["yAxis"] = yAxis;
  doc["zAxis"] = zAxis;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  // START HTTP POST
  http.begin(client, serverUrl);
  http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS); // Follow 302/301 redirects
  http.addHeader("Content-Type", "application/json");

  Serial.print("Sending Telemetry: ");
  Serial.println(jsonPayload);

  int httpResponseCode = http.POST(jsonPayload);

  if (httpResponseCode > 0) {
    Serial.print("HTTP Response code: ");
    Serial.println(httpResponseCode);
    String response = http.getString();
    Serial.println(response);
  } else {
    Serial.print("Error code: ");
    Serial.println(httpResponseCode);
  }

  http.end();
}
