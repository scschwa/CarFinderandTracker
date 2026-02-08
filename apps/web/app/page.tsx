import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Car, Search, TrendingDown, Bell } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Car className="h-6 w-6 text-blue-500" />
            <span className="text-lg font-semibold">Car Finder & Tracker</span>
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost">Log in</Button>
            </Link>
            <Link href="/signup">
              <Button>Sign up</Button>
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4">
        <section className="py-24 text-center">
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-6">
            Track car listings across
            <span className="text-blue-500"> every marketplace</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10">
            Search Autotrader, Bring a Trailer, Hagerty, Hemmings, AutoHunter, 
            and Cars & Bids in one place. Get daily updates, price drop alerts, 
            and market analytics for the cars you care about.
          </p>
          <Link href="/signup">
            <Button size="lg" className="text-base px-8">
              Get started free with push on demand and daily 7am updates!
            </Button>
          </Link>
        </section>

        <section className="grid md:grid-cols-3 gap-8 pb-24">
          <div className="rounded-lg border border-border p-6">
            <Search className="h-8 w-8 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Multi-site search</h3>
            <p className="text-muted-foreground text-sm">
              Search by make, model, trim, year range, and location (not presently working). 
              We check Autotrader, AutoHunter, BaT, Cars & Bids, Hagerty, Hemmings,
              and PCarMarket daily (subject to rate limits and bot detection).
            </p>
          </div>
          <div className="rounded-lg border border-border p-6">
            <TrendingDown className="h-8 w-8 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Price tracking</h3>
            <p className="text-muted-foreground text-sm">
              See price history charts, market averages, and identify the best
              deals. Know when a price drops before anyone else.
            </p>
          </div>
          <div className="rounded-lg border border-border p-6">
            <Bell className="h-8 w-8 text-blue-500 mb-4" />
            <h3 className="text-lg font-semibold mb-2">Email alerts</h3>
            <p className="text-muted-foreground text-sm">
              Get notified about new listings, price drops, and when vehicles
              sell. Customize alerts per search.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
