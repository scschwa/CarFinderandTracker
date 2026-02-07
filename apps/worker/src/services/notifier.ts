import { Resend } from 'resend';
import { supabase } from '../db/client';

const resend = new Resend(process.env.RESEND_API_KEY);

interface PriceDropAlert {
  listingTitle: string;
  oldPrice: number;
  newPrice: number;
  dropPct: number;
  url: string;
}

interface NewListingAlert {
  title: string;
  price: number;
  sourceSite: string;
  url: string;
}

interface SoldAlert {
  title: string;
  salePrice: number;
  sourceSite: string;
  url: string;
}

interface UserAlerts {
  email: string;
  searchLabel: string;
  priceDrops: PriceDropAlert[];
  newListings: NewListingAlert[];
  soldVehicles: SoldAlert[];
}

export async function sendNotifications(
  searchId: string,
  alerts: {
    priceDrops: PriceDropAlert[];
    newListings: NewListingAlert[];
    soldVehicles: SoldAlert[];
  }
): Promise<void> {
  // Get notification settings for this search
  const { data: settings } = await supabase
    .from('notification_settings')
    .select('*, saved_searches(make, model, year_min, year_max)')
    .eq('search_id', searchId);

  if (!settings?.length) return;

  for (const setting of settings) {
    const userAlerts: UserAlerts = {
      email: setting.email || '',
      searchLabel: `${setting.saved_searches?.make} ${setting.saved_searches?.model} (${setting.saved_searches?.year_min}-${setting.saved_searches?.year_max})`,
      priceDrops: setting.price_drop_enabled
        ? alerts.priceDrops.filter((a) => a.dropPct >= (setting.price_drop_pct || 5))
        : [],
      newListings: setting.new_listing_enabled ? alerts.newListings : [],
      soldVehicles: setting.sold_alert_enabled ? alerts.soldVehicles : [],
    };

    // Skip if no alerts to send
    const totalAlerts =
      userAlerts.priceDrops.length +
      userAlerts.newListings.length +
      userAlerts.soldVehicles.length;
    if (totalAlerts === 0) continue;

    // Get user email if no override email set
    if (!userAlerts.email) {
      const { data: user } = await supabase.auth.admin.getUserById(
        (await supabase.from('notification_settings').select('user_id').eq('id', setting.id).single()).data?.user_id || ''
      );
      userAlerts.email = user?.user?.email || '';
    }

    if (!userAlerts.email) continue;

    await sendAlertEmail(userAlerts);
  }
}

async function sendAlertEmail(alerts: UserAlerts): Promise<void> {
  const formatPrice = (cents: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(cents / 100);

  let html = `<h2>Car Finder & Tracker: ${alerts.searchLabel}</h2>`;

  if (alerts.newListings.length > 0) {
    html += `<h3>New Listings (${alerts.newListings.length})</h3><ul>`;
    for (const l of alerts.newListings) {
      html += `<li><a href="${l.url}">${l.title}</a> - ${formatPrice(l.price)} on ${l.sourceSite}</li>`;
    }
    html += '</ul>';
  }

  if (alerts.priceDrops.length > 0) {
    html += `<h3>Price Drops (${alerts.priceDrops.length})</h3><ul>`;
    for (const d of alerts.priceDrops) {
      html += `<li><a href="${d.url}">${d.listingTitle}</a>: ${formatPrice(d.oldPrice)} → ${formatPrice(d.newPrice)} (-${d.dropPct.toFixed(1)}%)</li>`;
    }
    html += '</ul>';
  }

  if (alerts.soldVehicles.length > 0) {
    html += `<h3>Sold (${alerts.soldVehicles.length})</h3><ul>`;
    for (const s of alerts.soldVehicles) {
      html += `<li><a href="${s.url}">${s.title}</a> sold for ${formatPrice(s.salePrice)} on ${s.sourceSite}</li>`;
    }
    html += '</ul>';
  }

  try {
    await resend.emails.send({
      from: 'Car Finder & Tracker <alerts@carfinder.app>',
      to: alerts.email,
      subject: `Car Tracker: ${alerts.searchLabel} - ${alerts.newListings.length + alerts.priceDrops.length + alerts.soldVehicles.length} updates`,
      html,
    });
    console.log(`[Notifier] Sent email to ${alerts.email}`);
  } catch (err) {
    console.error(`[Notifier] Failed to send email to ${alerts.email}:`, err);
  }
}
