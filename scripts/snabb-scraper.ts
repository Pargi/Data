import fetch from "node-fetch";
import {
  Array as RtArray,
  Literal,
  Number as RtNumber,
  Record as RtRecord,
  Static,
  String as RtString,
  Union,
} from "runtypes";
import fs from "fs";

// Snabb admin endpoints
const LIST_ENDPOINT = "http://admin.barking.ee/locations?type=PARKING&zone=B";
const DETAILS_ENDPOINT = "https://admin.barking.ee/locations/{id}";

// Snabb from the provider list in Data.json
const PROVIDER_ID = 12;

// Runtype for the list endpoint items
const SnabbListItem = RtRecord({
  ID: RtNumber,
  Name: RtString,
  AddressText: RtString,
  Latitude: RtNumber,
  Longitude: RtNumber,
  Zone: RtString,
  Type: RtString,
  RentView: RtString,
  Code: RtString.optional(),
});
const SnabbListRuntype = RtArray(SnabbListItem);

// Attempt to define a permissive details schema; we only rely on geometry if present
const LatLng = RtRecord({ lat: RtNumber, lng: RtNumber });
const GeometryPoint = RtRecord({
  type: Literal("Point"),
  coordinates: RtArray(RtNumber).withConstraint((val) => val.length === 2),
});
const GeometryPolygon = RtRecord({
  type: Literal("Polygon"),
  coordinates: RtArray(
    RtArray(RtArray(RtNumber).withConstraint((val) => val.length === 2))
  ),
});
const Geometry = Union(GeometryPoint, GeometryPolygon);
const SnabbDetails = RtRecord({
  // Some deployments expose legacy shapes
  areas: RtArray(RtRecord({ points: RtArray(LatLng) })).optional(),
  geojson: RtRecord({ geometry: Geometry }).optional(),
  // Snabb details schema (per https://admin.barking.ee/locations/{id})
  Price24h: RtNumber.optional(),
  HalfHourPrice: RtNumber.optional(),
  FreeMinutes: RtNumber.optional(),
  Polygons: RtArray(
    RtRecord({
      path: RtArray(RtRecord({ latitude: RtNumber, longitude: RtNumber })),
    })
  ).optional(),
});
type Details = Static<typeof SnabbDetails>;

function convertGeometryToRegions(
  geometry: Static<typeof Geometry>
): { points: [number, number][] }[] {
  if (geometry.type === "Point") {
    // GeoJSON order is [lng, lat]; convert to [lat, lng]
    return [
      {
        points: [[geometry.coordinates[1]!, geometry.coordinates[0]!]],
      },
    ];
  }
  // Polygon: take first ring; coordinates are [lng, lat]
  const ring = geometry.coordinates[0] ?? [];
  return [
    {
      points: ring.map(([lng, lat]) => [lat!, lng!]),
    },
  ];
}

async function fetchDetails(id: number): Promise<Details | undefined> {
  try {
    const url = DETAILS_ENDPOINT.replace("{id}", id.toString());
    const response = await fetch(url);
    const text = await response.text();
    // Try JSON first
    try {
      return SnabbDetails.check(JSON.parse(text));
    } catch {
      // Not JSON or unexpected shape; ignore gracefully
      return undefined;
    }
  } catch (err) {
    console.error("Failed to fetch details for", id, err);
    return undefined;
  }
}

async function main() {
  const listResponse = await fetch(LIST_ENDPOINT);
  const list = SnabbListRuntype.check(await listResponse.json());

  const results: unknown[] = [];

  for (const item of list) {
    const details = await fetchDetails(item.ID);

    let regions = [
      {
        points: [[item.Latitude, item.Longitude]],
      },
    ];

    if (details?.areas && details.areas.length > 0) {
      regions.push(
        ...details.areas.map((area) => ({
          points: area.points.map(({ lat, lng }) => [lat, lng]),
        }))
      );
    } else if (details?.Polygons && details.Polygons.length > 0) {
      regions.push(
        ...details.Polygons.map((poly) => ({
          points: poly.path.map(({ latitude, longitude }) => [
            latitude,
            longitude,
          ]),
        }))
      );
    } else if ((details as any)?.geojson?.geometry) {
      regions.push(
        ...convertGeometryToRegions((details as any).geojson.geometry)
      );
    }

    // Determine code, fallback to first token of Name or ID
    const code =
      item.Code ??
      (item.Name.split(/\s+/)[0]?.replace(/\W/g, "") || String(item.ID));

    // Build tariffs from details if available
    const periods: { [seconds: string]: number } = {};
    if (details?.HalfHourPrice !== undefined) {
      periods["1800"] = Math.round(details.HalfHourPrice * 100);
    }
    if (details?.Price24h !== undefined) {
      periods["86400"] = Math.round(details.Price24h * 100);
    }

    const tariff: any = {
      days: [1, 2, 3, 4, 5, 6, 7],
      periods,
    };
    if (details?.FreeMinutes && details.FreeMinutes > 0) {
      tariff["free-period"] = details.FreeMinutes * 60;
    }
    const tariffs = [tariff];

    results.push({
      "beacon-minor": item.ID,
      provider: PROVIDER_ID,
      code,
      regions,
      tariffs,
    });
  }

  return results;
}

main()
  .then((result) =>
    fs.writeFileSync("snabb.json", JSON.stringify(result, null, 2))
  )
  .catch(console.error);
