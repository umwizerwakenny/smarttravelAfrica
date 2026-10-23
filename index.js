
const express = require("express");
const cors = require("cors");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 5000;
const API_KEY = process.env.OPENTRIPMAP_API_KEY;

app.use(cors());
app.use(express.json());

const demoPlaces = [
  {
    xid: "demo-kigali",
    name: "Kigali",
    country: "Rwanda",
    kinds: "cultural,urban",
    dist: 0,
    point: { lat: -1.9441, lon: 30.0619 },
    demo: true,
  },
  {
    xid: "demo-akagera",
    name: "Akagera National Park",
    country: "Rwanda",
    kinds: "natural,animals",
    dist: 0,
    point: { lat: -1.9, lon: 30.75 },
    demo: true,
  },
  {
    xid: "demo-serengeti",
    name: "Serengeti National Park",
    country: "Tanzania",
    kinds: "natural,animals",
    dist: 0,
    point: { lat: -2.3333, lon: 34.8333 },
    demo: true,
  },
  {
    xid: "demo-cape-town",
    name: "Cape Town",
    country: "South Africa",
    kinds: "cultural,urban",
    dist: 0,
    point: { lat: -33.9249, lon: 18.4241 },
    demo: true,
  },
  {
    xid: "demo-marrakech",
    name: "Marrakech",
    country: "Morocco",
    kinds: "historic,cultural",
    dist: 0,
    point: { lat: 31.6295, lon: -7.9811 },
    demo: true,
  },
  {
    xid: "demo-nairobi",
    name: "Nairobi",
    country: "Kenya",
    kinds: "cultural,urban",
    dist: 0,
    point: { lat: -1.2921, lon: 36.8219 },
    demo: true,
  },
];

function safeText(value, maxLength = 100) {
  return String(value || "").trim().slice(0, maxLength);
}

async function apiGet(path, params = {}) {
  const url = new URL(
    `https://api.opentripmap.com/0.1/en/${path}`
  );

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  url.searchParams.set("apikey", API_KEY);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OpenTripMap returned ${response.status}`);
  }

  return response.json();
}

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    apiKeyConfigured: Boolean(API_KEY),
  });
});

// Search destinations by city, place or country name.
app.get("/api/destinations/search", async (req, res) => {
  const name = safeText(req.query.name, 100);
  const country = safeText(req.query.country, 2).toUpperCase();
  const category = safeText(req.query.category, 30).toLowerCase();

  if (!name) {
    return res.status(400).json({
      message: "Please enter a destination to search.",
    });
  }

  // Works before you receive the API key.
  if (!API_KEY) {
    const matches = demoPlaces.filter((place) => {
      const text = `${place.name} ${place.country} ${place.kinds}`
        .toLowerCase();

      const categoryMatch =
        category === "all" ||
        !category ||
        place.kinds.includes(category);

      return text.includes(name.toLowerCase()) && categoryMatch;
    });

    return res.json({
      mode: "demo",
      message:
        "Sample results only. Add your OpenTripMap API key for live results.",
      count: matches.length,
      places: matches,
    });
  }

  try {
    const geo = await apiGet("places/geoname", {
      name,
      country: country || undefined,
    });

    if (
      !geo ||
      !Number.isFinite(Number(geo.lat)) ||
      !Number.isFinite(Number(geo.lon))
    ) {
      return res.json({
        mode: "live",
        count: 0,
        places: [],
        message: "No matching location was found.",
      });
    }

    const kindsByCategory = {
      nature: "natural",
      culture: "cultural",
      historic: "historic",
      museums: "museums",
    };

    const kinds =
      kindsByCategory[category] || undefined;

    const result = await apiGet("places/radius", {
      radius: 20000,
      lon: geo.lon,
      lat: geo.lat,
      limit: 30,
      rate: "1",
      kinds,
    });

    const places = (Array.isArray(result) ? result : [])
      .filter((place) => place.name && place.xid)
      .map((place) => ({
        xid: place.xid,
        name: place.name,
        kinds: place.kinds || "",
        dist: place.dist,
        point: place.point || null,
      }));

    return res.json({
      mode: "live",
      location: {
        name: geo.name || name,
        country: geo.country || "",
        lat: geo.lat,
        lon: geo.lon,
      },
      count: places.length,
      places,
    });
  } catch (error) {
    console.error("Destination search failed:", error.message);

    return res.status(502).json({
      message:
        "Could not retrieve destinations. Check your API key and try again.",
    });
  }
});

// Retrieve details for one place.
app.get("/api/destinations/details/:xid", async (req, res) => {
  const xid = safeText(req.params.xid, 100);

  if (!xid || xid.startsWith("demo-")) {
    const place = demoPlaces.find((item) => item.xid === xid);

    if (!place) {
      return res.status(404).json({ message: "Place not found." });
    }

    return res.json({
      mode: "demo",
      place,
      message: "These are sample details, not live API data.",
    });
  }

  if (!API_KEY) {
    return res.status(503).json({
      message: "Add your OpenTripMap API key to view live details.",
    });
  }

  try {
    const place = await apiGet(`places/xid/${encodeURIComponent(xid)}`);

    return res.json({
      mode: "live",
      place,
    });
  } catch (error) {
    console.error("Place details failed:", error.message);

    return res.status(502).json({
      message: "Could not retrieve place details.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`SmartTravel API running at http://localhost:${PORT}`);
});
