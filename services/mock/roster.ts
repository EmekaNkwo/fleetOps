import { REGIONS } from "@/data/geography"
import {
  CUSTOMER_PREFIXES,
  CUSTOMER_SUFFIXES,
  GIVEN_NAMES,
  SURNAMES,
} from "@/data/people"
import type { Rng } from "@/lib/random"
import type { Customer, Driver, DriverStatus, RegionId } from "@/types"
import { customerId, driverId } from "./ids"

const DRIVER_STATUS_WEIGHTS: readonly { status: DriverStatus; weight: number }[] =
  [
    { status: "ON_DUTY", weight: 72 },
    { status: "ON_BREAK", weight: 12 },
    { status: "OFF_DUTY", weight: 13 },
    { status: "UNREACHABLE", weight: 3 },
  ]

/** "Chukwuemeka Nwachukwu" → "Chukwuemeka N." */
function toShortName(given: string, surname: string): string {
  return `${given} ${surname.charAt(0)}.`
}

function nigerianPhone(rng: Rng): string {
  const networks = ["0803", "0806", "0810", "0813", "0814", "0703", "0706", "0903", "0906", "0708"]
  const prefix = rng.pick(networks)
  const body = String(rng.int(1_000_000, 9_999_999))
  return `${prefix} ${body.slice(0, 3)} ${body.slice(3)}`
}

export function generateDrivers(rng: Rng, count: number): Driver[] {
  const drivers: Driver[] = []

  for (let index = 0; index < count; index += 1) {
    const given = rng.pick(GIVEN_NAMES)
    const surname = rng.pick(SURNAMES)
    const statusIndex = rng.weighted(
      DRIVER_STATUS_WEIGHTS.map((entry) => entry.weight)
    )

    drivers.push({
      id: driverId(index),
      name: `${given} ${surname}`,
      shortName: toShortName(given, surname),
      phone: nigerianPhone(rng),
      rating: Number(rng.float(3.4, 5).toFixed(1)),
      deliveriesCompleted: rng.int(24, 1_480),
      status: DRIVER_STATUS_WEIGHTS[statusIndex]?.status ?? "ON_DUTY",
      homeRegion: rng.pick(REGIONS).id,
      yearsOfService: rng.int(1, 14),
    })
  }

  return drivers
}

export function generateCustomers(rng: Rng, count: number): Customer[] {
  const customers: Customer[] = []
  const used = new Set<string>()

  for (let index = 0; index < count; index += 1) {
    let name = ""
    // Retry a handful of times to avoid duplicate trading names in the list.
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const candidate = `${rng.pick(CUSTOMER_PREFIXES)} ${rng.pick(CUSTOMER_SUFFIXES)}`
      if (!used.has(candidate)) {
        name = candidate
        break
      }
      name = `${candidate} (${rng.pick(REGIONS).name})`
    }
    used.add(name)

    const given = rng.pick(GIVEN_NAMES)
    const surname = rng.pick(SURNAMES)
    const region: RegionId = rng.pick(REGIONS).id

    customers.push({
      id: customerId(index),
      name,
      contact: `${given} ${surname}`,
      phone: nigerianPhone(rng),
      region,
    })
  }

  return customers
}
