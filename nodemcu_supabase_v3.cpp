/*
  Nova CubeSat Ground Station - NodeMCU Firmware v3.0 (Supabase Edition)
  This code sends data directly to YOUR Supabase database.
  
  REQUIRED LIBRARIES:
  - ESP8266WiFi
  - ESP8266HTTPClient
  - ArduinoJson
  - DHT Sensor Library
  - MPU6050
*/

#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClientSecure.h>
#include <ArduinoJson.h>
#include <Wire.h>
#include <MPU6050.h>
#include <DHT.h>

// ---------- CONFIG ----------
const char* ssid = "Myphone";
const char* pass = "Gouri@1997g";

// Get these from Supabase Project Settings -> API
const char* supabaseUrl = "https://tjlbooodjgbyxyktdgnv.supabase.co/rest/v1/telemetry";
const char* supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRqbGJvb29kamdieXh5a3RkZ252Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2NTM5NzEsImV4cCI6MjA5NDIyOTk3MX0.vOZ4k3xPL3vFYRipPgYQ6dE5TN6tmU0U2sfjqf7foOs";

// ---------- SENSORS ----------
#define DHTPIN D5
#define DHTTYPE DHT11
DHT dht(DHTPIN, DHTTYPE);
#define MQ_PIN A0
MPU6050 mpu;

unsigned long lastTime = 0;
unsigned long timerDelay = 2000;

void setup() {
  Serial.begin(115200);
  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println("\nWiFi Connected");
  Wire.begin(D2, D1);
  mpu.initialize();
  dht.begin();
}

void loop() {
  if ((millis() - lastTime) > timerDelay) {
    if (WiFi.status() == WL_CONNECTED) sendToSupabase();
    lastTime = millis();
  }
}

void sendToSupabase() {
  WiFiClientSecure client;
  client.setInsecure(); // Supabase uses HTTPS
  HTTPClient http;

  // Read Sensors
  float t = dht.readTemperature();
  float h = dht.readHumidity();
  int gas = map(analogRead(MQ_PIN), 0, 1023, 0, 100);
  int16_t ax, ay, az, gx, gy, gz;
  mpu.getMotion6(&ax, &ay, &az, &gx, &gy, &gz);

  StaticJsonDocument<200> doc;
  doc["temperature"] = t;
  doc["humidity"] = h;
  doc["gas_percent"] = gas;
  doc["x_axis"] = gx / 100;
  doc["y_axis"] = gy / 100;
  doc["z_axis"] = gz / 100;

  String json;
  serializeJson(doc, json);

  http.begin(client, supabaseUrl);
  http.addHeader("apikey", supabaseAnonKey);
  http.addHeader("Authorization", String("Bearer ") + supabaseAnonKey);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("Prefer", "return=minimal");

  int httpCode = http.POST(json);
  Serial.printf("[Supabase] POST Status: %d\n", httpCode);
  http.end();
}
