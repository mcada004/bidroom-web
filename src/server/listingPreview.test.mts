import test from "node:test";
import assert from "node:assert/strict";
import {
  extractAirbnbPreviewFromResponse,
  extractVrboPreviewFromResponse,
  parseListingUrl,
} from "./listingPreview.ts";

test("parseListingUrl detects Airbnb room IDs", () => {
  const parsed = parseListingUrl("https://www.airbnb.com/rooms/12345678?check_in=2026-03-01");
  assert.equal(parsed.platform, "airbnb");
  assert.equal(parsed.listingId, "12345678");
  assert.match(parsed.canonicalUrl, /airbnb\.com\/rooms\/12345678/);
});

test("parseListingUrl detects Vrbo IDs from .ha path", () => {
  const parsed = parseListingUrl("https://www.vrbo.com/41404137ha");
  assert.equal(parsed.platform, "vrbo");
  assert.equal(parsed.listingId, "41404137");
});

test("extractAirbnbPreviewFromResponse maps beds/baths/bedrooms/photo", () => {
  const parsed = parseListingUrl("https://www.airbnb.com/rooms/78945612");
  const preview = extractAirbnbPreviewFromResponse(
    {
      property_details: {
        name: "Oceanfront Home",
        number_of_bedrooms: 4,
        number_of_beds: 5,
        number_of_bathrooms: 3.5,
        images: ["https://img.example/primary.jpg", "https://img.example/secondary.jpg"],
        link: "https://www.airbnb.com/rooms/78945612",
      },
    },
    parsed
  );

  assert.equal(preview.platform, "airbnb");
  assert.equal(preview.bedrooms, 4);
  assert.equal(preview.beds, 5);
  assert.equal(preview.bathrooms, 3.5);
  assert.equal(preview.primaryPhotoUrl, "https://img.example/primary.jpg");
});

test("extractVrboPreviewFromResponse picks matching listing and maps fields", () => {
  const parsed = parseListingUrl("https://www.vrbo.com/41404137ha");
  const preview = extractVrboPreviewFromResponse(
    {
      properties: [
        {
          name: "Wrong Listing",
          link: "https://www.vrbo.com/99999999ha",
          bedrooms: 1,
          bathrooms: 1,
          beds: 1,
          image: "https://img.example/wrong.jpg",
        },
        {
          name: "Beach House",
          link: "https://www.vrbo.com/41404137ha",
          bedrooms: 3,
          bathrooms: "2.5 bathrooms",
          beds: 4,
          image: "https://img.example/beach.jpg",
        },
      ],
    },
    parsed
  );

  assert.equal(preview.platform, "vrbo");
  assert.equal(preview.title, "Beach House");
  assert.equal(preview.bedrooms, 3);
  assert.equal(preview.bathrooms, 2.5);
  assert.equal(preview.beds, 4);
  assert.equal(preview.primaryPhotoUrl, "https://img.example/beach.jpg");
});
