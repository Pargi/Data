import fetch from 'node-fetch';
import { Record, String, Array, Number, Literal, Partial, Static } from 'runtypes';
import fs from 'fs';

const EUROPARK_API_ENDPOINT = 'https://europark.ee/parkopedia_et.json';
// Europark from the provider list in Data.json
const PROVIDER_ID = 11;

const SECONDS_IN_MINUTES = 60;
const SECONDS_IN_HOURS = 3600;
const SECONDS_IN_DAYS = 86400;

const ZoneListRuntype = Record({
  paringzones: Array(Record({
    id: Number,
    parking_code: String,
    price_list: Array(
      Record({
        amount_w_vat: Number,
        period: String,
        restrictions_text: Array(String),
        restrictions: Array(
          Record({
            start_time: String,
            end_time: String,
            weekdays: String,
          })
        ),
      })
    ),
    geojson: Record({
      features: Array(Record({
        properties: Partial({ type: String }),
        geometry: Record({ type: Literal('Point'), coordinates: Array(Number).withConstraint((val) => val.length === 2)})
          .Or(Record({ type: Literal('Polygon'), coordinates: Array(Array(Array(Number).withConstraint((val) => val.length === 2))) }))
      }))
    })
  }))
});
type ZoneList = Static<typeof ZoneListRuntype>;

function convertGeometryToPoints(geometry: ZoneList['paringzones'][number]['geojson']['features'][number]['geometry']): [number, number][] {
  if (geometry.type === 'Point') {
    return [[geometry.coordinates[1]!, geometry.coordinates[0]!]];
  }

  return geometry.coordinates[0]?.map((coordinate) => [coordinate[1]!, coordinate[0]!]) ?? [];
}

function convertPeriodToSeconds(period: string): number | undefined {
  const minutes = /(?<minutes>\d+) MINUTES?/;
  const hours = /(?<hours>\d+) HOURS?/;
  const days = /(?<days>\d+) DAYS?/;

  const minutesMatch = minutes.exec(period);
  if (minutesMatch !== null) {
    return parseInt(minutesMatch.groups!.minutes!, 10) * SECONDS_IN_MINUTES;
  }

  const hoursMatch = hours.exec(period);
  if (hoursMatch !== null) {
    return parseInt(hoursMatch.groups!.hours!, 10) * SECONDS_IN_HOURS;
  }

  const daysMatch = days.exec(period);
  if (daysMatch !== null) {
    return parseInt(daysMatch.groups!.days!, 10) * SECONDS_IN_DAYS;
  }

  if (period === '1 MONTH' || period === '1 YEAR') {
    // TODO: Figure out how to handle these, although unlikely anyone needs this from the app
    return undefined;
  }

  console.error(`Unknown period: "${period}"`);
  return undefined;
}

function convertTimestamp(timestamp: string): number | undefined {
  const match = /(?<hours>\d{1,2}):(?<minutes>\d{2}):(?<seconds>\d{2})/.exec(timestamp);
  if (match === null) {
    return undefined;
  }

  return parseInt(match.groups!.hours!, 10) * SECONDS_IN_HOURS + parseInt(match.groups!.minutes!, 10) * SECONDS_IN_MINUTES + parseInt(match.groups!.seconds!, 10);
}

async function main() {
  const response = await fetch(EUROPARK_API_ENDPOINT);
  const zones = ZoneListRuntype.check(await response.json()).paringzones;
  const results: unknown[] = [];

  for (const zone of zones) {
    const outlineFeature = zone.geojson.features.find((feature) => feature.properties.type === 'outline');

    if (zone.parking_code.length === 0) {
      // Not valid for mobile parking
      continue;
    }

    const fallbackTariff: { days: number[], periods: { [seconds: string]: number } } = {
      days: [1, 2, 3, 4, 5, 6, 7],
      periods: {},
    };

    const specialTariffs = zone.price_list.flatMap((tariff) => {
      const period = convertPeriodToSeconds(tariff.period);

      if (period === undefined) {
        return undefined;
      }

      if (tariff.restrictions.length === 0) {
        fallbackTariff.periods[period] = tariff.amount_w_vat;
        return [];
      }


      return tariff.restrictions.map((restriction) => {
        return {
          days: restriction.weekdays.split('').map((val) => parseInt(val)),
          periods: {
            [period]: tariff.amount_w_vat,
          },
          start: convertTimestamp(restriction.start_time),
          end: convertTimestamp(restriction.end_time),
        };
      });
    }).filter((a): a is { days: number[], periods: { [key: string]: number }, start: number, end: number } => a !== undefined);

    results.push({
      "beacon-minor": zone.id,
      provider: PROVIDER_ID,
      code: zone.parking_code,
      regions: outlineFeature === undefined ? zone.geojson.features.map((feature) => ({
        points: convertGeometryToPoints(feature.geometry),
      })) : convertGeometryToPoints(outlineFeature.geometry),
      tariffs: [fallbackTariff].concat(specialTariffs),
    })
  }

  return results;
}

main().then((result) => fs.writeFileSync('europark.json', JSON.stringify(result, null, 2))).catch(console.error);