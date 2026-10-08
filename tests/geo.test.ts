import test from "node:test";
import assert from "node:assert/strict";
import { detectCountry, detectRegion, findCityInText } from "../src/lib/geo";

test("detectCountry resolves worldwide venue and city strings", () => {
  assert.equal(detectCountry("Vikrant University , Gwalior"), "India");
  assert.equal(detectCountry("AITR Indore"), "India");
  assert.equal(detectCountry("Kupittaa Campus, Turku"), "Finland");
  assert.equal(detectCountry("Tec de Monterrey - Arena Borregos"), "Mexico");
  assert.equal(detectCountry("Fort Worth"), "United States");
  assert.equal(detectCountry("Georgia Tech Klaus Atrium, Klaus 1116"), "United States");
  assert.equal(detectCountry("Student Center East Ballroom GSU"), "United States");
  assert.equal(detectCountry("QMUL - Bancroft Building 1.13"), "United Kingdom");
  assert.equal(detectCountry("Sheridan College Hazel McCallion Campus"), "Canada");
  assert.equal(detectCountry("McMaster University - PGCLL"), "Canada");
  assert.equal(detectCountry("IDEA Spaces Saldanha"), "Portugal");
  assert.equal(detectCountry("Santa Clara Convention Center + Online"), "United States");
  assert.equal(detectCountry("Kigali, Rwanda"), "Rwanda");
  assert.equal(detectCountry("São Paulo, Brazil"), "Brazil");
  assert.equal(detectCountry("Freshworks"), "India");
  assert.equal(detectCountry("The Link"), "United States");
  assert.equal(detectCountry("Galaxy Innovation Park"), "Vietnam");
  assert.equal(detectCountry("lablab.ai"), "United States");
});

test("online and empty locations stay unlocated", () => {
  assert.equal(detectCountry("Online"), undefined);
  assert.equal(detectCountry(""), undefined);
  assert.equal(detectCountry(undefined), undefined);
  assert.equal(detectCountry("Grand Finals 2027"), undefined);
});

test("detectRegion maps resolved countries to regions", () => {
  assert.equal(detectRegion("Kupittaa Campus, Turku"), "Europe");
  assert.equal(detectRegion("Vikrant University , Gwalior"), "Asia Pacific");
  assert.equal(detectRegion("Online"), undefined);
});

test("findCityInText returns the recognised venue city", () => {
  assert.equal(findCityInText("Welcome to Fort Worth"), "Fort Worth");
  assert.equal(findCityInText("Online event"), undefined);
});