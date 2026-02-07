import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(
  _request: Request,
  { params }: { params: { vin: string } }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const vin = params.vin.toUpperCase();

  // Check if we have cached VIN data
  const { data: vehicle } = await supabase
    .from('vehicles')
    .select('*')
    .eq('vin', vin)
    .single();

  if (vehicle?.vin_data) {
    return NextResponse.json({ vehicle, vin_data: vehicle.vin_data });
  }

  // Fetch from NHTSA
  const response = await fetch(
    `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
  );

  if (!response.ok) {
    return NextResponse.json({ error: 'Failed to decode VIN' }, { status: 502 });
  }

  const nhtsaData = await response.json();
  const result = nhtsaData.Results?.[0];

  if (!result) {
    return NextResponse.json({ error: 'No VIN data found' }, { status: 404 });
  }

  const vinData = {
    make: result.Make,
    model: result.Model,
    year: result.ModelYear,
    bodyClass: result.BodyClass,
    doors: result.Doors,
    driveType: result.DriveType,
    engineCylinders: result.EngineCylinders,
    engineDisplacement: result.DisplacementL,
    engineHP: result.EngineHP,
    fuelType: result.FuelTypePrimary,
    transmission: result.TransmissionStyle,
    plantCity: result.PlantCity,
    plantCountry: result.PlantCountry,
    plantState: result.PlantState,
    vehicleType: result.VehicleType,
    gvwr: result.GVWR,
    trim: result.Trim,
    series: result.Series,
  };

  // Cache the VIN data
  if (vehicle) {
    await supabase
      .from('vehicles')
      .update({ vin_data: vinData })
      .eq('id', vehicle.id);
  }

  // Get all listings for this vehicle
  const { data: listings } = vehicle
    ? await supabase
        .from('listings')
        .select('*')
        .eq('vehicle_id', vehicle.id)
    : { data: [] };

  // Get price history
  const listingIds = (listings || []).map(l => l.id);
  let priceHistory: { listing_id: string; price: number; recorded_at: string }[] = [];

  if (listingIds.length > 0) {
    const { data: ph } = await supabase
      .from('price_history')
      .select('*')
      .in('listing_id', listingIds)
      .order('recorded_at', { ascending: true });
    priceHistory = ph || [];
  }

  return NextResponse.json({
    vehicle: vehicle || { vin },
    vin_data: vinData,
    listings: listings || [],
    price_history: priceHistory,
  });
}
