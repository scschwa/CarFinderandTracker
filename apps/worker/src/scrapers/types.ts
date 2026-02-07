export type ScrapedListing = {
  vin: string | null;
  title: string;
  price: number; // in cents
  url: string;
  sourceSite: 'autotrader' | 'bat' | 'carsandbids';
  location: string;
  mileage: number | null;
  status: 'active' | 'sold';
  salePrice: number | null;
  imageUrl: string | null;
};

export type SearchParams = {
  make: string;
  model: string;
  trim: string | null;
  year_min: number;
  year_max: number;
  zip_code: string;
  search_radius: number;
};
