/**
 * "Scraper" parkimine.ee parklate nimistu tirimiseks ja sobivasse formaati muutmiseks
 *
 * Kood on paras spagett, aga genereerib faili, millest edasi on liikuda lihtsam kui faili manuaalselt ehitada
 */
import fetch from "node-fetch";
import { Record, String, Array, Number } from "runtypes";
import { parse } from "node-html-parser";
import fs from "fs";

const ZONE_LIST_ENDPOINT = "https://www.parkimine.ee/en/_ajax/map/permit-types";
const ZONE_DETAILS_ENDPOINT =
  "https://www.parkimine.ee/en/_ajax/map/permit-types/{id}";

// Ühisteenused from the provider list in Data.json
const PROVIDER_ID = 10;

const SECONDS_IN_MINUTES = 60;
const SECONDS_IN_HOURS = 3600;
const SECONDS_IN_DAYS = 86400;

const ZoneListRuntype = Record({
  items: Array(
    Record({
      id: Number,
      title: String,
      opened: String,
      areas: Array(
        Record({ points: Array(Record({ lat: Number, lng: Number })) })
      ),
    })
  ),
});

function convertPeriodToSeconds(period: string): number | undefined {
  const minutes = /(?<minutes>\d+) min?/;
  const hours = /(?<hours>\d+) hours?/;
  const startedMinutes = /Every (started )?(?<minutes>\d+) min/;
  const days = /(?<days>\d+) days?/;

  const startedMinutesMatch = startedMinutes.exec(period);
  if (startedMinutesMatch !== null) {
    return (
      parseInt(startedMinutesMatch.groups!.minutes!, 10) * SECONDS_IN_MINUTES
    );
  }

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

  if (period === "1 month" || period === "1 year") {
    // TODO: Figure out how to handle these, although unlikely anyone needs this from the app
    return undefined;
  }

  if (period === "hour") {
    return SECONDS_IN_HOURS;
  }

  console.error(`Unknown period: "${period}"`);
  return undefined;
}

function convertPriceToCents(price: string): number {
  const match = /(?<euros>\d+) ((&euro;)|€)/.exec(price);

  if (match !== null) {
    return parseFloat(match.groups!.euros!) * 100;
  }

  throw new Error(`Unknown price: "${price}"`);
}

function convertTitleToCode(title: string): string {
  const result = title.split(/\s+/).pop();
  return result!.replace(/\W/, "");
}

function convertDayToNumber(day: string): number {
  switch (day) {
    case "E":
    case "Mon":
      return 1;
    case "T":
    case "Tue":
      return 2;
    case "K":
    case "Wed":
      return 3;
    case "N":
    case "Thu":
      return 4;
    case "R":
    case "Fri":
      return 5;
    case "L":
    case "Sat":
      return 6;
    case "P":
    case "Sun":
      return 7;
  }

  throw new Error(`Unknown day: ${day}`);
}

function convertOpeningTimes(
  times: string,
  periodInfo?: { start: number; end: number }
): { days: number[]; start?: number; end?: number }[] {
  // Ignore these seasonal zones
  if (
    times === "15. mai - 15. september 10:00-22:00" ||
    times === "1. juuni - 31. august iga päev 10:00-18:00"
  ) {
    return [];
  }

  // Many anomalies in the way the opening times are written
  if (
    times === "24/7" ||
    times === "24h" ||
    times === "24 h" ||
    times === "7/24" ||
    times === "E/P 24h" ||
    times === "E-P 24" ||
    times === "E-P 24h" ||
    times === ""
  ) {
    return [
      {
        days: [1, 2, 3, 4, 5, 6, 7],
        start: periodInfo?.start,
        end: periodInfo?.end,
      },
    ];
  }

  if (
    times === "Open 24/7. Parking is paid from 8AM to6 PM." ||
    times === "Parking is paid 8AM to 6 PM"
  ) {
    return [
      {
        days: [1, 2, 3, 4, 5, 6, 7],
        start: 8 * SECONDS_IN_HOURS,
        end: 18 * SECONDS_IN_HOURS,
      },
    ];
  }

  if (times === "Parking is paid on business days from 7 AM to 6 PM.") {
    return [
      {
        days: [1, 2, 3, 4, 5],
        start: 7 * SECONDS_IN_HOURS,
        end: 18 * SECONDS_IN_HOURS,
      },
    ];
  }

  if (
    times === "24/7, parking is paid 22:00 - 08:00." ||
    times === "Parking is paid 22 PM to 8 AM"
  ) {
    return [
      {
        days: [1, 2, 3, 4, 5, 6, 7],
        start: 22 * SECONDS_IN_HOURS,
        end: 8 * SECONDS_IN_HOURS,
      },
    ];
  }

  if (times === "Parking is paid 7AM to 10PM") {
    return [
      {
        days: [1, 2, 3, 4, 5, 6, 7],
        start: 7 * SECONDS_IN_HOURS,
        end: 22 * SECONDS_IN_HOURS,
      },
    ];
  }

  if (times === "Parking is paid 7AM to 7PM") {
    return [
      {
        days: [1, 2, 3, 4, 5, 6, 7],
        start: 7 * SECONDS_IN_HOURS,
        end: 19 * SECONDS_IN_HOURS,
      },
    ];
  }

  if (times === "From 7 AM to 9 PM") {
    return [
      {
        days: [1, 2, 3, 4, 5, 6, 7],
        start: 7 * SECONDS_IN_HOURS,
        end: 21 * SECONDS_IN_HOURS,
      },
    ];
  }

  if (times === "5:00-22:00") {
    return [
      {
        days: [1, 2, 3, 4, 5, 6, 7],
        start: 5 * SECONDS_IN_HOURS,
        end: 22 * SECONDS_IN_HOURS,
      },
    ];
  }

  const parts = times.split(",").map((part) => part.trim());
  return parts.flatMap((part) => {
    if (part === "Mon-Fri 08:00-19:00 Sat 11:00-17:00") {
      return [
        {
          days: [1, 2, 3, 4, 5],
          start: 8 * SECONDS_IN_HOURS,
          end: 19 * SECONDS_IN_HOURS,
        },
        { days: [6], start: 11 * SECONDS_IN_HOURS, end: 17 * SECONDS_IN_HOURS },
      ];
    }

    // And as fallback, trying to parse the string as day range + time range
    const [days, hours] = part.split(/(\s|&nbsp;)+/);
    const [startDay, endDay] = days!.split("-");
    const startDayIndex = convertDayToNumber(startDay!);
    const endDayIndex =
      endDay !== undefined ? convertDayToNumber(endDay) : startDayIndex;

    const hoursMatch =
      hours !== undefined &&
      /(?<startHour>\d{1,2}):(?<startMinute>\d\d)-(?<endHour>\d{1,2}):(?<endMinute>\d\d)/.exec(
        hours
      );
    let start: number | undefined = undefined;
    let end: number | undefined = undefined;

    if (hoursMatch) {
      start =
        parseInt(hoursMatch.groups!.startHour!, 10) * SECONDS_IN_HOURS +
        parseInt(hoursMatch.groups!.startMinute!, 10) * SECONDS_IN_MINUTES;
      end =
        parseInt(hoursMatch.groups!.endHour!, 10) * SECONDS_IN_HOURS +
        parseInt(hoursMatch.groups!.endMinute!, 10) * SECONDS_IN_MINUTES;
    }

    return {
      days: [1, 2, 3, 4, 5, 6, 7].filter(
        (val) => val >= startDayIndex && val <= endDayIndex
      ),
      start,
      end,
    };
  });
}

function convertImportantMessage(message: string | undefined):
  | {
      ignoreZone: boolean;
      pricingPeriod?: { start: number; end: number };
      freeTime?: number;
    }
  | undefined {
  if (message === undefined) {
    return undefined;
  }

  if (
    message.startsWith(
      "Barriers only open when calling the number on the barrier:"
    )
  ) {
    return { ignoreZone: true };
  }

  if (message === "Paid parking 23:00 &#8211; 07:00") {
    return {
      ignoreZone: false,
      pricingPeriod: {
        start: 23 * SECONDS_IN_HOURS,
        end: 7 * SECONDS_IN_HOURS,
      },
    };
  }

  if (message === "Parking is paid 22:00 &#8211; 8:00.") {
    return {
      ignoreZone: false,
      pricingPeriod: {
        start: 22 * SECONDS_IN_HOURS,
        end: 8 * SECONDS_IN_HOURS,
      },
    };
  }

  if (message.includes("First hour of free parking if using parking clock")) {
    return { ignoreZone: false, freeTime: SECONDS_IN_HOURS };
  }

  const freePeriodMatch =
    /(Free parking (first )?(?<period1>.*?) when)|((?<period2>.*?) (of )?free parking)|(First (?<period3>.*?) of parking free)|(for the first (?<period4>.*?) free of charge)|(fixed start time parking is free for (?<period5>.*?)\.)|(Free parking during first (?<period6>.*?) with parking clock)|(First (?<period7>.*?) of parking free if using parking clock)|(is free for (?<period8>.*?))/.exec(
      message
    );
  if (freePeriodMatch !== null) {
    const period =
      freePeriodMatch.groups!.period1 ??
      freePeriodMatch.groups!.period2 ??
      freePeriodMatch.groups!.period3 ??
      freePeriodMatch.groups!.period4 ??
      freePeriodMatch.groups!.period5 ??
      freePeriodMatch.groups!.period6 ??
      freePeriodMatch.groups!.period7 ??
      freePeriodMatch.groups!.period8!;
    const converted = convertPeriodToSeconds(period);

    if (converted !== undefined) {
      return { ignoreZone: false, freeTime: converted };
    }
  }

  return undefined;
}

async function main() {
  const response = await fetch(ZONE_LIST_ENDPOINT);
  const data = await response.json();
  const zones = ZoneListRuntype.check(data).items;
  const results: unknown[] = [];

  // For each of the zones, we also need to fetch the details and parse out the pricing from the HTML
  for (const item of zones) {
    try {
      if (item.title.startsWith("Parking machine")) {
        continue;
      }

      const detailsUrl = ZONE_DETAILS_ENDPOINT.replace(
        "{id}",
        item.id.toString()
      );
      const detailsResponse = await fetch(detailsUrl);
      const details = await detailsResponse.text();
      const html = parse(details);

      const code = convertTitleToCode(
        html
          .querySelector("[href='#add-info-1']")
          ?.innerText.trim()
          .split(/\s/)
          .pop() ?? item.title
      );
      const rows = html
        .querySelectorAll("table.parking-table tr")
        ?.map((row) => {
          const cells = row.querySelectorAll("td");
          return cells.map((cell) => cell.innerText.trim());
        });

      const importantMessage = html
        .querySelector(".important-message")
        ?.innerText.trim();
      const importantModifiers = convertImportantMessage(importantMessage);

      if (importantModifiers?.ignoreZone === true) {
        continue;
      }

      console.log("\nParsing zone", code, detailsUrl);
      if (
        importantMessage !== undefined &&
        importantMessage.length > 0 &&
        importantModifiers === undefined
      ) {
        console.warn("Important message\n", importantMessage);
      }

      const pricing = rows.reduce((memo, row) => {
        const [period, price] = row.filter(
          (value) => value !== "Buy" && value !== ""
        );
        const seconds = convertPeriodToSeconds(period!);

        if (seconds === undefined) {
          return memo;
        }

        memo[seconds.toString()] = convertPriceToCents(price!);
        return memo;
      }, {} as { [period: string]: number });
      const tariffs = convertOpeningTimes(
        item.opened.trim(),
        importantModifiers?.pricingPeriod
      ).map((value) => ({
        ...value,
        periods: pricing,
        "free-period": importantModifiers?.freeTime,
      }));

      results.push({
        "beacon-minor": item.id,
        provider: PROVIDER_ID,
        code,
        regions: item.areas.map((area) => ({
          points: area.points.map(({ lat, lng }) => [lat, lng]),
        })),
        tariffs,
      });
    } catch (err) {
      console.error("Failed parsing of zone", item);
      throw err;
    }
  }

  console.log(`Parsed ${results.length} zones`);
  return results;
}

main()
  .then((result) =>
    fs.writeFileSync("parkimine-ee.json", JSON.stringify(result, null, 2))
  )
  .catch(console.error);
